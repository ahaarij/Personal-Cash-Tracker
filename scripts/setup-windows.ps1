# setup-windows.ps1
# Run this once on the Windows server (as Administrator) to install
# PocketBase, Caddy, and Cloudflare Tunnel as auto-starting Windows services.
#
# Cloudflare Tunnel gives you a secure public URL (e.g. cashflow.yourdomain.com)
# without opening any ports on your router. No Docker needed.
#
# Usage:
#   1. Copy the whole project to C:\cashflow
#   2. Get your Cloudflare Tunnel token from:
#      dash.cloudflare.com -> Zero Trust -> Networks -> Tunnels -> Create a tunnel
#      (choose "Cloudflared", name it "cashflow", copy the token)
#   3. Open PowerShell as Administrator
#   4. Set-ExecutionPolicy RemoteSigned -Scope Process
#   5. .\scripts\setup-windows.ps1 -TunnelToken "YOUR_TOKEN_HERE"
#
# After running, services start automatically on every Windows reboot.

param(
    [Parameter(Mandatory=$false)]
    [string]$TunnelToken = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Config ────────────────────────────────────────────────────────────────────
$AppRoot    = "C:\cashflow"
$BinDir     = "$AppRoot\bin"
$PbData     = "$AppRoot\pocketbase\pb_data"
$FrontDist  = "$AppRoot\frontend\dist"
$CaddyFile  = "$AppRoot\nginx\Caddyfile.windows"
$EnvFile    = "$AppRoot\.env"

$PbVersion          = "0.22.20"
$CaddyVersion       = "2.8.4"
$NssmVersion        = "2.24"
$CloudflaredVersion = "2024.8.3"

$PbUrl          = "https://github.com/pocketbase/pocketbase/releases/download/v$PbVersion/pocketbase_${PbVersion}_windows_amd64.zip"
$CaddyUrl       = "https://github.com/caddyserver/caddy/releases/download/v$CaddyVersion/caddy_${CaddyVersion}_windows_amd64.zip"
$NssmUrl        = "https://nssm.cc/release/nssm-$NssmVersion.zip"
$CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/download/$CloudflaredVersion/cloudflared-windows-amd64.exe"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Banner($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)     { Write-Host "    OK: $msg" -ForegroundColor Green }
function Info($msg)   { Write-Host "    $msg" -ForegroundColor Gray }
function Warn($msg)   { Write-Host "    WARNING: $msg" -ForegroundColor Yellow }

function Download-And-Extract($url, $extractTo) {
    $tmp = "$env:TEMP\cf_setup_$(Get-Random).zip"
    Info "Downloading $(Split-Path $url -Leaf)"
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    Expand-Archive -Path $tmp -DestinationPath $extractTo -Force
    Remove-Item $tmp
}

function Remove-Service-If-Exists($name) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($svc) {
        Info "Removing existing $name service"
        & "$BinDir\nssm.exe" stop $name confirm 2>$null
        & "$BinDir\nssm.exe" remove $name confirm 2>$null
    }
}

# ── 0. Check admin ────────────────────────────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Please run this script as Administrator."
    exit 1
}

# ── 1. Resolve tunnel token ───────────────────────────────────────────────────
Banner "Cloudflare Tunnel token"

if (-not $TunnelToken) {
    # Try reading from .env file if it exists
    if (Test-Path $EnvFile) {
        $envContent = Get-Content $EnvFile -Raw
        if ($envContent -match 'CLOUDFLARE_TUNNEL_TOKEN=([^\r\n]+)') {
            $TunnelToken = $Matches[1].Trim()
            Info "Loaded tunnel token from $EnvFile"
        }
    }
}

if (-not $TunnelToken) {
    Warn "No tunnel token provided — Cloudflare Tunnel service will NOT be installed."
    Warn "To add it later, run: .\scripts\setup-windows.ps1 -TunnelToken YOUR_TOKEN"
    Warn "Without the tunnel, the app is only accessible on the local network."
    $InstallTunnel = $false
} else {
    # Save token to .env for future re-runs
    if (-not (Test-Path $EnvFile)) {
        "CLOUDFLARE_TUNNEL_TOKEN=$TunnelToken" | Set-Content $EnvFile
    } elseif ((Get-Content $EnvFile -Raw) -notmatch 'CLOUDFLARE_TUNNEL_TOKEN=') {
        "`nCLOUDFLARE_TUNNEL_TOKEN=$TunnelToken" | Add-Content $EnvFile
    }
    Ok "Tunnel token ready"
    $InstallTunnel = $true
}

# ── 2. Create directories ─────────────────────────────────────────────────────
Banner "Creating directories"
foreach ($dir in @($BinDir, $PbData, "$AppRoot\logs")) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
}
Ok "Directories ready"

# ── 3. Download NSSM (Windows service wrapper) ───────────────────────────────
Banner "Downloading NSSM"
$nssmDir = "$env:TEMP\nssm_extract"
Download-And-Extract $NssmUrl $nssmDir
$nssmExe = Get-ChildItem -Path $nssmDir -Recurse -Filter "nssm.exe" |
    Where-Object { $_.FullName -like "*win64*" } | Select-Object -First 1
if (-not $nssmExe) {
    $nssmExe = Get-ChildItem -Path $nssmDir -Recurse -Filter "nssm.exe" | Select-Object -First 1
}
Copy-Item $nssmExe.FullName "$BinDir\nssm.exe" -Force
Remove-Item $nssmDir -Recurse -Force
Ok "NSSM ready"

# ── 4. Download PocketBase ────────────────────────────────────────────────────
Banner "Downloading PocketBase v$PbVersion"
$pbExtract = "$env:TEMP\pb_extract"
Download-And-Extract $PbUrl $pbExtract
Copy-Item "$pbExtract\pocketbase.exe" "$BinDir\pocketbase.exe" -Force
Remove-Item $pbExtract -Recurse -Force
Ok "PocketBase ready"

# ── 5. Download Caddy ─────────────────────────────────────────────────────────
Banner "Downloading Caddy v$CaddyVersion"
$caddyExtract = "$env:TEMP\caddy_extract"
Download-And-Extract $CaddyUrl $caddyExtract
Copy-Item "$caddyExtract\caddy.exe" "$BinDir\caddy.exe" -Force
Remove-Item $caddyExtract -Recurse -Force
Ok "Caddy ready"

# ── 6. Download cloudflared ───────────────────────────────────────────────────
if ($InstallTunnel) {
    Banner "Downloading cloudflared v$CloudflaredVersion"
    Info "Downloading cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $CloudflaredUrl -OutFile "$BinDir\cloudflared.exe" -UseBasicParsing
    Ok "cloudflared ready"
}

# ── 7. Check frontend dist ────────────────────────────────────────────────────
Banner "Checking frontend build"
if (-not (Test-Path "$FrontDist\index.html")) {
    Warn "$FrontDist\index.html not found."
    Warn "Build the frontend first (can do this on another machine then copy dist/):"
    Warn "  cd $AppRoot\frontend && npm ci && npm run build"
} else {
    Ok "Frontend dist found"
}

# ── 8. Check Caddyfile ────────────────────────────────────────────────────────
Banner "Checking Caddyfile"
if (-not (Test-Path $CaddyFile)) {
    Write-Error "Caddyfile not found at $CaddyFile — make sure the project is at C:\cashflow"
}
Ok "Caddyfile found"

# ── 9. Install PocketBase service ─────────────────────────────────────────────
Banner "Installing PocketBase service"
Remove-Service-If-Exists "CashflowPB"

$pbArgs = "serve --http=127.0.0.1:8090 --dir=`"$PbData`" --migrationsDir=`"$AppRoot\pocketbase\pb_migrations`" --hooksDir=`"$AppRoot\pocketbase\pb_hooks`""
& "$BinDir\nssm.exe" install CashflowPB "$BinDir\pocketbase.exe" $pbArgs
& "$BinDir\nssm.exe" set CashflowPB AppDirectory "$AppRoot\pocketbase"
& "$BinDir\nssm.exe" set CashflowPB DisplayName "Cashflow - PocketBase"
& "$BinDir\nssm.exe" set CashflowPB Description "PocketBase backend for Personal Cash Flow app"
& "$BinDir\nssm.exe" set CashflowPB Start SERVICE_AUTO_START
& "$BinDir\nssm.exe" set CashflowPB AppStdout "$AppRoot\logs\pocketbase.log"
& "$BinDir\nssm.exe" set CashflowPB AppStderr "$AppRoot\logs\pocketbase.log"
& "$BinDir\nssm.exe" set CashflowPB AppRotateFiles 1
& "$BinDir\nssm.exe" set CashflowPB AppRotateBytes 5242880
Ok "PocketBase service installed"

# ── 10. Install Caddy service ─────────────────────────────────────────────────
Banner "Installing Caddy service"
Remove-Service-If-Exists "CashflowCaddy"

& "$BinDir\nssm.exe" install CashflowCaddy "$BinDir\caddy.exe" "run --config `"$CaddyFile`" --adapter caddyfile"
& "$BinDir\nssm.exe" set CashflowCaddy AppDirectory "$AppRoot"
& "$BinDir\nssm.exe" set CashflowCaddy DisplayName "Cashflow - Caddy"
& "$BinDir\nssm.exe" set CashflowCaddy Description "Caddy web server for Personal Cash Flow app"
& "$BinDir\nssm.exe" set CashflowCaddy Start SERVICE_AUTO_START
& "$BinDir\nssm.exe" set CashflowCaddy AppStdout "$AppRoot\logs\caddy.log"
& "$BinDir\nssm.exe" set CashflowCaddy AppStderr "$AppRoot\logs\caddy.log"
& "$BinDir\nssm.exe" set CashflowCaddy AppRotateFiles 1
& "$BinDir\nssm.exe" set CashflowCaddy AppRotateBytes 5242880
Ok "Caddy service installed"

# ── 11. Install Cloudflare Tunnel service ─────────────────────────────────────
if ($InstallTunnel) {
    Banner "Installing Cloudflare Tunnel service"
    Remove-Service-If-Exists "CashflowTunnel"

    & "$BinDir\nssm.exe" install CashflowTunnel "$BinDir\cloudflared.exe" "tunnel --no-autoupdate run"
    & "$BinDir\nssm.exe" set CashflowTunnel AppDirectory "$AppRoot"
    & "$BinDir\nssm.exe" set CashflowTunnel DisplayName "Cashflow - Cloudflare Tunnel"
    & "$BinDir\nssm.exe" set CashflowTunnel Description "Cloudflare Tunnel for remote access to Cash Flow app"
    & "$BinDir\nssm.exe" set CashflowTunnel Start SERVICE_AUTO_START
    # Pass tunnel token as environment variable
    & "$BinDir\nssm.exe" set CashflowTunnel AppEnvironmentExtra "TUNNEL_TOKEN=$TunnelToken"
    & "$BinDir\nssm.exe" set CashflowTunnel AppStdout "$AppRoot\logs\cloudflared.log"
    & "$BinDir\nssm.exe" set CashflowTunnel AppStderr "$AppRoot\logs\cloudflared.log"
    & "$BinDir\nssm.exe" set CashflowTunnel AppRotateFiles 1
    & "$BinDir\nssm.exe" set CashflowTunnel AppRotateBytes 5242880
    Ok "Cloudflare Tunnel service installed"
}

# ── 12. Start services ────────────────────────────────────────────────────────
Banner "Starting services"
Start-Service CashflowPB
Start-Sleep -Seconds 3
Start-Service CashflowCaddy
if ($InstallTunnel) {
    Start-Sleep -Seconds 2
    Start-Service CashflowTunnel
}
Ok "All services started"

# ── 13. Firewall — only needed for LAN access (tunnel bypasses this) ──────────
Banner "Windows Firewall"
$fwRule = Get-NetFirewallRule -DisplayName "Cashflow HTTP" -ErrorAction SilentlyContinue
if (-not $fwRule) {
    New-NetFirewallRule -DisplayName "Cashflow HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow | Out-Null
    Ok "Port 80 opened for LAN access"
} else {
    Ok "Firewall rule already exists"
}

# ── Done ──────────────────────────────────────────────────────────────────────
$localIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notmatch 'Loopback' } |
    Select-Object -First 1).IPAddress

Banner "Setup complete"
Write-Host ""
Write-Host "  Local access (same network):" -ForegroundColor White
Write-Host "    http://localhost" -ForegroundColor Gray
Write-Host "    http://$localIp" -ForegroundColor Gray
Write-Host ""

if ($InstallTunnel) {
    Write-Host "  Remote access (anywhere, any device):" -ForegroundColor White
    Write-Host "    Check your Cloudflare dashboard for the public URL." -ForegroundColor Gray
    Write-Host "    dash.cloudflare.com -> Zero Trust -> Networks -> Tunnels -> cashflow" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "  First-time PocketBase setup:" -ForegroundColor White
Write-Host "    http://localhost/_/   <- visit ONCE on this machine to create admin account" -ForegroundColor Gray
Write-Host ""
Write-Host "  Service management:" -ForegroundColor White
Write-Host "    Start all:  Start-Service CashflowPB, CashflowCaddy$(if ($InstallTunnel){', CashflowTunnel'})" -ForegroundColor Gray
Write-Host "    Stop all:   Stop-Service CashflowPB, CashflowCaddy$(if ($InstallTunnel){', CashflowTunnel'})" -ForegroundColor Gray
Write-Host "    Logs:       $AppRoot\logs\" -ForegroundColor Gray
Write-Host ""
