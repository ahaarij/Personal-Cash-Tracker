# ── Cash Flow App — Windows Deployment Script ────────────────────────────────
# Matches the NSSM + Task Scheduler + Cloudflare Tunnel pattern used by other
# MIS apps on this server (e.g. tb-dashboard on cred-desk.com).
#
# Run once for first deploy. For updates use: .\update.ps1
# Must be run as Administrator.
#
# Usage:
#   Right-click PowerShell -> "Run as Administrator"
#   cd C:\PCT
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\deploy.ps1 -AppSubdomain "cashflow.cred-desk.com"

param(
    [string]$RepoPath     = $PSScriptRoot,
    [string]$AppSubdomain = "",
    [int]$CaddyPort       = 8080,
    [int]$BackendPort     = 3000
)

$ErrorActionPreference = "Stop"

function Write-Info { Write-Host "[deploy] $args" -ForegroundColor Cyan }
function Write-Ok   { Write-Host "[deploy] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[deploy] $args" -ForegroundColor Yellow }
function Write-Fail { Write-Host "[deploy] $args" -ForegroundColor Red; exit 1 }

# ── Admin check ───────────────────────────────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Fail "Run this script as Administrator." }

Set-Location $RepoPath
Write-Info "Deploying from: $RepoPath"

# ── 1. Chocolatey + prerequisites ─────────────────────────────────────────────
Write-Info "Checking prerequisites..."

if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Info "Installing Chocolatey..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path += ";$env:ALLUSERSPROFILE\chocolatey\bin"
}

$pkgMap = @{ "nodejs" = "node"; "postgresql" = "psql"; "caddy" = "caddy"; "nssm" = "nssm" }
foreach ($pkg in $pkgMap.Keys) {
    if (-not (Get-Command $pkgMap[$pkg] -ErrorAction SilentlyContinue)) {
        Write-Info "Installing $pkg..."
        choco install $pkg -y --no-progress
    }
}

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
Write-Ok "Prerequisites ready"

# ── 2. Environment / .env ─────────────────────────────────────────────────────
$envFile = "$RepoPath\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item "$RepoPath\.env.example" $envFile
    Write-Host ""
    Write-Warn "============================================================"
    Write-Warn " ACTION REQUIRED: fill in .env before continuing"
    Write-Warn "============================================================"
    Write-Warn "  POSTGRES_PASSWORD  - run: openssl rand -hex 32"
    Write-Warn "  JWT_SECRET         - run: openssl rand -hex 64"
    Write-Warn "  APP_URL            - e.g. https://cashflow.cred-desk.com"
    Write-Warn "============================================================"
    Write-Host ""
    notepad $envFile
    Read-Host "Press Enter once .env is saved and closed"
}

Get-Content $envFile | Where-Object { $_ -match "^\s*[^#\s]" } | ForEach-Object {
    $parts = $_ -split "=", 2
    if ($parts.Count -eq 2) {
        [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
    }
}

$PG_PASS = [System.Environment]::GetEnvironmentVariable("POSTGRES_PASSWORD", "Process")
$JWT_SEC = [System.Environment]::GetEnvironmentVariable("JWT_SECRET", "Process")
$APP_URL = [System.Environment]::GetEnvironmentVariable("APP_URL", "Process")

if (-not $PG_PASS -or $PG_PASS -like "change_me*") { Write-Fail "POSTGRES_PASSWORD not set in .env" }
if (-not $JWT_SEC -or $JWT_SEC -like "change_me*")  { Write-Fail "JWT_SECRET not set in .env" }

# ── 3. PostgreSQL database ─────────────────────────────────────────────────────
Write-Info "Setting up PostgreSQL database..."

$pgDir = Get-ChildItem "C:\Program Files\PostgreSQL" -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if ($pgDir) { $env:Path += ";$($pgDir.FullName)\bin" }

# Start PostgreSQL service
$pgService = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "(?i)postgres" } | Select-Object -First 1
if ($pgService) {
    if ($pgService.Status -ne "Running") {
        Write-Info "Starting PostgreSQL service ($($pgService.Name))..."
        Start-Service $pgService.Name
        Start-Sleep -Seconds 3
    }
    Write-Ok "PostgreSQL service: $($pgService.Name) ($($pgService.Status))"
} else {
    Write-Host ""
    Write-Warn "Could not find a PostgreSQL Windows service."
    Write-Warn "Please start PostgreSQL manually, then press Enter to continue."
    Write-Warn "(If you installed it via pgAdmin/installer, open Services and start it there)"
    Read-Host "Press Enter once PostgreSQL is running"
}

# Prompt for the postgres superuser password (may differ by installation)
Write-Host ""
$pgSuperPass = Read-Host "Enter your PostgreSQL superuser (postgres) password"
$env:PGPASSWORD = $pgSuperPass

# Create user (ignore error if already exists)
$prev = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
& psql -U postgres -c "CREATE USER cashflow WITH PASSWORD '$PG_PASS';" 2>$null
$ErrorActionPreference = $prev
& psql -U postgres -c "ALTER USER cashflow WITH PASSWORD '$PG_PASS';" 2>$null

$prev2 = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
& psql -U postgres -c "CREATE DATABASE cashflow OWNER cashflow;" 2>$null
$ErrorActionPreference = $prev2
Write-Ok "Database ready"

# ── 4. Build frontend ──────────────────────────────────────────────────────────
Write-Info "Installing frontend dependencies..."
Set-Location "$RepoPath\frontend"
npm install --silent

Write-Info "Building frontend..."
npm run build
Write-Ok "Frontend built"

# ── 5. Build backend ───────────────────────────────────────────────────────────
Write-Info "Installing backend dependencies..."
Set-Location "$RepoPath\backend"
npm install --silent

Write-Info "Compiling backend TypeScript..."
npm run build
Write-Ok "Backend compiled"

$backendEnv = "DATABASE_URL=postgresql://cashflow:$PG_PASS@127.0.0.1:5432/cashflow`nJWT_SECRET=$JWT_SEC`nPORT=$BackendPort`nALLOWED_ORIGINS=$APP_URL`nNODE_ENV=production"
$backendEnv | Set-Content "$RepoPath\backend\.env"

Set-Location $RepoPath

# ── 6. Caddyfile ───────────────────────────────────────────────────────────────
Write-Info "Writing Caddyfile..."
$distPath    = "$RepoPath\frontend\dist"
$caddyDir    = "$env:ProgramData\caddy"
$caddyContent = Get-Content "$RepoPath\nginx\Caddyfile.windows" -Raw
$caddyContent = $caddyContent -replace [regex]::Escape("C:\cashflow\frontend\dist"), $distPath
$caddyContent = $caddyContent -replace "127\.0\.0\.1:3000", "127.0.0.1:$BackendPort"

New-Item -ItemType Directory -Force -Path $caddyDir | Out-Null
$caddyContent | Set-Content "$caddyDir\Caddyfile"
Write-Ok "Caddyfile written to $caddyDir\Caddyfile"

# ── 7. NSSM services ───────────────────────────────────────────────────────────
Write-Info "Installing NSSM services..."
New-Item -ItemType Directory -Force -Path "$RepoPath\logs" | Out-Null

$nodePath  = (Get-Command node).Source
$caddyPath = (Get-Command caddy).Source

# Find nssm.exe — check PATH first, then known locations on this server
$nssmCmd = Get-Command nssm -ErrorAction SilentlyContinue
$nssmExe = if ($nssmCmd) { $nssmCmd.Source } else { $null }
if (-not $nssmExe) {
    $nssmSearchPaths = @(
        "$env:USERPROFILE\OneDrive*\Desktop\CCI-MIS\nssm\nssm.exe",
        "C:\nssm\nssm.exe",
        "C:\tools\nssm\nssm.exe",
        "C:\ProgramData\chocolatey\bin\nssm.exe"
    )
    foreach ($p in $nssmSearchPaths) {
        $found = Resolve-Path $p -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { $nssmExe = $found.Path; break }
    }
}
if (-not $nssmExe) { Write-Fail "Cannot find nssm.exe. Add it to PATH or place it at C:\nssm\nssm.exe" }
Write-Info "Using nssm: $nssmExe"

function Invoke-Nssm { & $nssmExe @args }

# Backend service
try { Invoke-Nssm stop   cashflow-backend | Out-Null } catch {}
try { Invoke-Nssm remove cashflow-backend confirm | Out-Null } catch {}
Invoke-Nssm install cashflow-backend $nodePath "$RepoPath\backend\dist\index.js"
Invoke-Nssm set cashflow-backend AppDirectory "$RepoPath\backend"
Invoke-Nssm set cashflow-backend AppEnvironmentExtra "DATABASE_URL=postgresql://cashflow:$PG_PASS@127.0.0.1:5432/cashflow" "JWT_SECRET=$JWT_SEC" "PORT=$BackendPort" "ALLOWED_ORIGINS=$APP_URL" "NODE_ENV=production"
Invoke-Nssm set cashflow-backend Start SERVICE_AUTO_START
Invoke-Nssm set cashflow-backend AppStdout "$RepoPath\logs\backend.log"
Invoke-Nssm set cashflow-backend AppStderr "$RepoPath\logs\backend-error.log"
Invoke-Nssm set cashflow-backend AppRotateFiles 1
Invoke-Nssm set cashflow-backend AppRotateOnline 1

# Caddy service
try { Invoke-Nssm stop   cashflow-caddy | Out-Null } catch {}
try { Invoke-Nssm remove cashflow-caddy confirm | Out-Null } catch {}
Invoke-Nssm install cashflow-caddy $caddyPath "run --config `"$caddyDir\Caddyfile`""
Invoke-Nssm set cashflow-caddy Start SERVICE_AUTO_START
Invoke-Nssm set cashflow-caddy AppStdout "$RepoPath\logs\caddy.log"
Invoke-Nssm set cashflow-caddy AppStderr "$RepoPath\logs\caddy-error.log"

Invoke-Nssm start cashflow-backend
Invoke-Nssm start cashflow-caddy

Write-Ok "Services installed and started"

# ── 8. Cloudflare config.yml ───────────────────────────────────────────────────
Write-Info "Updating Cloudflare Tunnel config..."

$cfConfigPaths = @(
    "$env:USERPROFILE\.cloudflared\config.yml",
    "$env:ProgramData\cloudflared\config.yml",
    "C:\cloudflared\config.yml"
)
$cfConfig = $cfConfigPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $AppSubdomain -and $APP_URL) {
    $AppSubdomain = ([System.Uri]$APP_URL).Host
}

if ($cfConfig) {
    $content = Get-Content $cfConfig -Raw

    if ($content -notmatch [regex]::Escape($AppSubdomain)) {
        $newEntry = "  - hostname: $AppSubdomain`r`n    service: http://127.0.0.1:$CaddyPort`r`n"
        $content  = $content -replace "(?m)^(\s*- service: http_status:404)", "$newEntry`$1"
        [System.IO.File]::WriteAllText($cfConfig, $content)
        Write-Ok "Added ingress entry: $AppSubdomain -> 127.0.0.1:$CaddyPort"

        $tunnelId = (Get-Content $cfConfig | Select-String "^tunnel:").ToString() -replace "tunnel:\s*", ""
        if ($tunnelId) {
            Write-Info "Adding DNS CNAME..."
            cloudflared tunnel route dns $tunnelId.Trim() $AppSubdomain 2>$null
        }

        Restart-Service cloudflared -ErrorAction SilentlyContinue
        Write-Ok "Cloudflare Tunnel restarted"
    } else {
        Write-Warn "$AppSubdomain already in config.yml - skipping"
    }
} else {
    Write-Host ""
    Write-Warn "Could not find cloudflared config.yml automatically."
    Write-Warn "Add this to your config.yml ingress block (before the catch-all line):"
    Write-Host "  - hostname: $AppSubdomain" -ForegroundColor White
    Write-Host "    service: http://127.0.0.1:$CaddyPort" -ForegroundColor White
    Write-Warn "Then run: Restart-Service cloudflared"
    Write-Host ""
}

# ── 9. Task Scheduler auto-update ─────────────────────────────────────────────
Write-Info "Setting up Task Scheduler auto-update (every 5 minutes)..."

$taskName   = "CashFlow-AutoUpdate"
$scriptPath = "$RepoPath\update.ps1"
$action     = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger    = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once -At (Get-Date)
$settings   = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -MultipleInstances IgnoreNew
$principal  = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Ok "Task Scheduler job '$taskName' registered (every 5 minutes)"

# ── 10. Create app user ────────────────────────────────────────────────────────
Write-Host ""
$createUser = Read-Host "Create the app user now? (y/N)"
if ($createUser -eq "y" -or $createUser -eq "Y") {
    $userEmail     = Read-Host "  Email"
    $userPassSec   = Read-Host "  Password" -AsSecureString
    $userPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($userPassSec))
    $userName      = Read-Host "  Username"

    Add-Content "$RepoPath\backend\.env" "`nALLOW_CREATE_USER=1"
    nssm restart cashflow-backend
    Start-Sleep -Seconds 4

    $body = '{"email":"' + $userEmail + '","password":"' + $userPassPlain + '","username":"' + $userName + '"}'
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/auth/create-user" -Method POST -ContentType "application/json" -Headers @{"X-CF-App-Request"="1"} -Body $body
        Write-Ok "User created: $($resp.email)"
    } catch {
        Write-Warn "User creation failed: $_"
        Write-Warn "Retry manually - see PROJECT_CONTEXT.md"
    }

    $envContent = Get-Content "$RepoPath\backend\.env" | Where-Object { $_ -notmatch "ALLOW_CREATE_USER" }
    $envContent | Set-Content "$RepoPath\backend\.env"
    nssm restart cashflow-backend
}

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Ok "============================================================"
Write-Ok " Deployment complete! App: $APP_URL"
Write-Ok ""
Write-Ok " nssm status cashflow-backend"
Write-Ok " nssm status cashflow-caddy"
Write-Ok " Logs: $RepoPath\logs\"
Write-Ok " Auto-update: Task Scheduler -> CashFlow-AutoUpdate"
Write-Ok " Update now:  .\update.ps1"
Write-Ok "============================================================"
