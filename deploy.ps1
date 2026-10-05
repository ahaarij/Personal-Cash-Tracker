# ── Cash Flow App — Windows Deployment Script ────────────────────────────────
# Matches the NSSM + Task Scheduler + Cloudflare Tunnel pattern used by other
# MIS apps on this server (e.g. tb-dashboard on cred-desk.com).
#
# Run once for first deploy. For updates use: .\update.ps1
# Must be run as Administrator.
#
# Prerequisites installed automatically via Chocolatey:
#   Node.js, PostgreSQL, Caddy, NSSM
#
# Usage:
#   Right-click PowerShell → "Run as Administrator"
#   cd C:\CashFlow\repo
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\deploy.ps1

param(
    [string]$RepoPath    = $PSScriptRoot,
    [string]$AppSubdomain = "",          # e.g. cashflow  (will be cashflow.cred-desk.com)
    [int]$CaddyPort      = 8080,
    [int]$BackendPort    = 3000
)

$ErrorActionPreference = "Stop"

function Write-Info  { Write-Host "[deploy] $args" -ForegroundColor Cyan }
function Write-Ok    { Write-Host "[deploy] $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[deploy] $args" -ForegroundColor Yellow }
function Write-Fail  { Write-Host "[deploy] $args" -ForegroundColor Red; exit 1 }

# ── Admin check ───────────────────────────────────────────────────────────────
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Fail "Run this script as Administrator."
}

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

foreach ($pkg in @("nodejs", "postgresql", "caddy", "nssm")) {
    if (-not (Get-Command ($pkg -replace "postgresql","psql" -replace "nodejs","node") -ErrorAction SilentlyContinue)) {
        Write-Info "Installing $pkg..."
        choco install $pkg -y --no-progress
    }
}

# Refresh PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Ok "Prerequisites ready"

# ── 2. Environment / .env ─────────────────────────────────────────────────────
$envFile = "$RepoPath\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item "$RepoPath\.env.example" $envFile
    Write-Host ""
    Write-Warn "============================================================"
    Write-Warn " ACTION REQUIRED: fill in .env before continuing"
    Write-Warn "============================================================"
    Write-Warn "  POSTGRES_PASSWORD  — run: openssl rand -hex 32"
    Write-Warn "  JWT_SECRET         — run: openssl rand -hex 64"
    Write-Warn "  APP_URL            — e.g. https://cashflow.cred-desk.com"
    Write-Warn "  CLOUDFLARE_TUNNEL_TOKEN — not needed (config.yml is used)"
    Write-Warn "============================================================"
    Write-Host ""
    notepad $envFile
    Read-Host "Press Enter once .env is saved and closed"
}

# Load .env into current session
Get-Content $envFile | Where-Object { $_ -match "^\s*[^#]" } | ForEach-Object {
    $parts = $_ -split "=", 2
    if ($parts.Count -eq 2) {
        [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
    }
}

$PG_PASS   = [System.Environment]::GetEnvironmentVariable("POSTGRES_PASSWORD","Process")
$JWT_SEC   = [System.Environment]::GetEnvironmentVariable("JWT_SECRET","Process")
$APP_URL   = [System.Environment]::GetEnvironmentVariable("APP_URL","Process")

if (-not $PG_PASS -or $PG_PASS -like "change_me*") { Write-Fail "POSTGRES_PASSWORD not set in .env" }
if (-not $JWT_SEC -or $JWT_SEC -like "change_me*")  { Write-Fail "JWT_SECRET not set in .env" }

# ── 3. PostgreSQL database ─────────────────────────────────────────────────────
Write-Info "Setting up PostgreSQL database..."

$pgBin = (Get-ChildItem "C:\Program Files\PostgreSQL" -ErrorAction SilentlyContinue |
          Sort-Object Name -Descending | Select-Object -First 1).FullName + "\bin"
$env:Path += ";$pgBin"
$env:PGPASSWORD = "postgres"   # default superuser pass after choco install

# Create user and database if they don't exist
$createSQL = @"
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cashflow') THEN
    CREATE USER cashflow WITH PASSWORD '$PG_PASS';
  END IF;
END \$\$;
"@
& psql -U postgres -c $createSQL 2>$null

$dbExists = & psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='cashflow'" 2>$null
if ($dbExists -ne "1") {
    & psql -U postgres -c "CREATE DATABASE cashflow OWNER cashflow;"
}
Write-Ok "Database ready"

# ── 4. Build frontend ──────────────────────────────────────────────────────────
Write-Info "Installing frontend dependencies..."
Set-Location "$RepoPath\frontend"
npm install --silent

Write-Info "Building frontend..."
npm run build
Write-Ok "Frontend built → frontend\dist"

# ── 5. Build backend ───────────────────────────────────────────────────────────
Write-Info "Installing backend dependencies..."
Set-Location "$RepoPath\backend"
npm install --silent

Write-Info "Compiling backend TypeScript..."
npm run build
Write-Ok "Backend compiled → backend\dist"

# Write backend .env
@"
DATABASE_URL=postgresql://cashflow:$PG_PASS@127.0.0.1:5432/cashflow
JWT_SECRET=$JWT_SEC
PORT=$BackendPort
ALLOWED_ORIGINS=$APP_URL
"@ | Set-Content "$RepoPath\backend\.env"

Set-Location $RepoPath

# ── 6. Caddyfile ───────────────────────────────────────────────────────────────
Write-Info "Writing Caddyfile..."
$distPath = "$RepoPath\frontend\dist"
$caddyContent = Get-Content "$RepoPath\nginx\Caddyfile.windows" -Raw
$caddyContent = $caddyContent -replace "C:\\cashflow\\frontend\\dist", $distPath
$caddyContent = $caddyContent -replace "127\.0\.0\.1:3000", "127.0.0.1:$BackendPort"

$caddyDir = "$env:ProgramData\caddy"
New-Item -ItemType Directory -Force -Path $caddyDir | Out-Null
$caddyContent | Set-Content "$caddyDir\Caddyfile"
Write-Ok "Caddyfile written to $caddyDir\Caddyfile"

# ── 7. NSSM services ───────────────────────────────────────────────────────────
Write-Info "Installing NSSM services..."

$nodePath  = (Get-Command node).Source
$caddyPath = (Get-Command caddy).Source

# Backend service
nssm stop  cashflow-backend 2>$null
nssm remove cashflow-backend confirm 2>$null
nssm install cashflow-backend $nodePath "$RepoPath\backend\dist\index.js"
nssm set cashflow-backend AppDirectory "$RepoPath\backend"
nssm set cashflow-backend AppEnvironmentExtra `
    "DATABASE_URL=postgresql://cashflow:$PG_PASS@127.0.0.1:5432/cashflow" `
    "JWT_SECRET=$JWT_SEC" `
    "PORT=$BackendPort" `
    "ALLOWED_ORIGINS=$APP_URL" `
    "NODE_ENV=production"
nssm set cashflow-backend Start SERVICE_AUTO_START
nssm set cashflow-backend AppStdout "$RepoPath\logs\backend.log"
nssm set cashflow-backend AppStderr "$RepoPath\logs\backend-error.log"
nssm set cashflow-backend AppRotateFiles 1
nssm set cashflow-backend AppRotateOnline 1

# Caddy service
nssm stop  cashflow-caddy 2>$null
nssm remove cashflow-caddy confirm 2>$null
nssm install cashflow-caddy $caddyPath "run --config `"$caddyDir\Caddyfile`""
nssm set cashflow-caddy Start SERVICE_AUTO_START
nssm set cashflow-caddy AppStdout "$RepoPath\logs\caddy.log"
nssm set cashflow-caddy AppStderr "$RepoPath\logs\caddy-error.log"

New-Item -ItemType Directory -Force -Path "$RepoPath\logs" | Out-Null

nssm start cashflow-backend
nssm start cashflow-caddy

Write-Ok "Services installed and started"

# ── 8. Cloudflare config.yml ───────────────────────────────────────────────────
Write-Info "Updating Cloudflare Tunnel config..."

# Find the config.yml (same location used by your other MIS apps)
$cfConfigPaths = @(
    "$env:USERPROFILE\.cloudflared\config.yml",
    "$env:ProgramData\cloudflared\config.yml",
    "C:\cloudflared\config.yml"
)
$cfConfig = $cfConfigPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($cfConfig) {
    $content = Get-Content $cfConfig -Raw

    # Extract subdomain from APP_URL or use param
    if (-not $AppSubdomain -and $APP_URL) {
        $AppSubdomain = ([System.Uri]$APP_URL).Host
    }

    $newIngress = "  - hostname: $AppSubdomain`n    service: http://127.0.0.1:$CaddyPort"

    if ($content -notmatch [regex]::Escape($AppSubdomain)) {
        # Insert before the catch-all (last ingress line)
        $content = $content -replace "(- service: http_status:404)", "$newIngress`n  `$1"
        $content | Set-Content $cfConfig -NoNewline
        Write-Ok "Added ingress entry for $AppSubdomain → 127.0.0.1:$CaddyPort"

        # Add DNS route
        Write-Info "Adding DNS CNAME..."
        cloudflared tunnel route dns (Get-Content $cfConfig | Select-String "^tunnel:" | ForEach-Object { $_ -replace "tunnel:\s*","" }) $AppSubdomain 2>$null
        Write-Warn "Restarting cloudflared service..."
        Restart-Service cloudflared -ErrorAction SilentlyContinue
        Write-Ok "Cloudflare Tunnel updated"
    } else {
        Write-Warn "$AppSubdomain already in config.yml — skipping"
    }
} else {
    Write-Warn "Could not find cloudflared config.yml."
    Write-Warn "Manually add this to your config.yml ingress block (before the catch-all):"
    Write-Warn ""
    Write-Warn "  - hostname: $( if ($AppSubdomain) { $AppSubdomain } else { 'cashflow.cred-desk.com' } )"
    Write-Warn "    service: http://127.0.0.1:$CaddyPort"
    Write-Warn ""
    Write-Warn "Then run: Restart-Service cloudflared"
}

# ── 9. Task Scheduler auto-update job ─────────────────────────────────────────
Write-Info "Setting up Task Scheduler auto-update (every 5 minutes)..."

$taskName   = "CashFlow-AutoUpdate"
$scriptPath = "$RepoPath\update.ps1"
$action     = New-ScheduledTaskAction -Execute "powershell.exe" `
                  -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger    = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once `
                  -At (Get-Date)
$settings   = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 4) `
                  -MultipleInstances IgnoreNew
$principal  = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal | Out-Null

Write-Ok "Task Scheduler job '$taskName' registered (runs every 5 minutes)"

# ── 10. First-time user creation ───────────────────────────────────────────────
Write-Host ""
$createUser = Read-Host "Create the app user now? (y/N)"
if ($createUser -eq "y" -or $createUser -eq "Y") {
    $userEmail = Read-Host "  Email"
    $userPass  = Read-Host "  Password" -AsSecureString
    $userPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($userPass))
    $userName  = Read-Host "  Username"

    # Temporarily enable user creation
    Add-Content "$RepoPath\backend\.env" "`nALLOW_CREATE_USER=1"
    nssm restart cashflow-backend
    Start-Sleep -Seconds 3

    $body = "{`"email`":`"$userEmail`",`"password`":`"$userPassPlain`",`"username`":`"$userName`"}"
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/auth/create-user" `
            -Method POST -ContentType "application/json" `
            -Headers @{"X-CF-App-Request"="1"} -Body $body
        Write-Ok "User created: $($resp.email)"
    } catch {
        Write-Warn "User creation failed: $_"
        Write-Warn "You can retry manually — see PROJECT_CONTEXT.md"
    }

    # Remove the flag
    $envContent = Get-Content "$RepoPath\backend\.env" | Where-Object { $_ -notmatch "ALLOW_CREATE_USER" }
    $envContent | Set-Content "$RepoPath\backend\.env"
    nssm restart cashflow-backend
}

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Ok "============================================================"
Write-Ok " Deployment complete!"
Write-Ok " App: $APP_URL"
Write-Ok ""
Write-Ok " Services:   nssm status cashflow-backend"
Write-Ok "             nssm status cashflow-caddy"
Write-Ok " Logs:       $RepoPath\logs\"
Write-Ok " Auto-update: Task Scheduler → CashFlow-AutoUpdate (every 5 min)"
Write-Ok " Update now:  .\update.ps1"
Write-Ok "============================================================"
