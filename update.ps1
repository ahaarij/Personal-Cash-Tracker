# Cash Flow App - Auto-Update Script
# Called by Task Scheduler every 5 minutes.
# Pulls latest code from GitHub; rebuilds and restarts services only if changed.

$RepoPath = $PSScriptRoot
if (-not $RepoPath) { $RepoPath = Split-Path -Parent $MyInvocation.MyCommand.Path }

# Ensure git and node are on PATH (Task Scheduler runs with a minimal environment)
$env:PATH = "C:\Program Files\Git\cmd;C:\Program Files\Git\bin;C:\Program Files\nodejs;$env:PATH"

# Ensure logs directory exists
$LogDir = "$RepoPath\logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory $LogDir | Out-Null }
$LogFile = "$LogDir\update.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content $LogFile "[$ts] $msg"
}

Set-Location $RepoPath

$before = git rev-parse HEAD 2>$null

git pull origin main --quiet 2>$null
$pullExit = $LASTEXITCODE

$after = git rev-parse HEAD 2>$null

if ($pullExit -ne 0) {
    Log "ERROR: git pull failed (exit $pullExit) - check credentials/network"
    exit 1
}

if ($before -eq $after) {
    # Heartbeat - confirms Task Scheduler is running even when there are no changes
    Log "No changes (HEAD=$after)"
    exit 0
}

Log "Update detected ($before -> $after), rebuilding..."

# Find nssm.exe
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

if (-not $nssmExe) {
    Log "WARNING: nssm.exe not found - services will NOT be restarted after this build"
}

try {
    Set-Location "$RepoPath\frontend"
    npm install --silent 2>$null
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
    Log "Frontend build OK."

    Set-Location "$RepoPath\backend"
    npm install --silent 2>$null
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }
    Log "Backend build OK."

    Set-Location $RepoPath

    if ($nssmExe) {
        & $nssmExe restart cashflow-backend
        & $nssmExe restart cashflow-caddy
        Log "Services restarted."
    }

    Log "Deploy complete."
} catch {
    Log "ERROR during build/restart: $_"
}
