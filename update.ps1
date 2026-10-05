# ── Cash Flow App — Auto-Update Script ───────────────────────────────────────
# Called by Task Scheduler every 5 minutes (same pattern as tb-dashboard).
# Pulls latest code from GitHub; rebuilds and restarts services only if changed.

$ErrorActionPreference = "Stop"
$RepoPath = $PSScriptRoot

Set-Location $RepoPath

$before = git rev-parse HEAD 2>$null
git pull origin main --quiet 2>$null
$after  = git rev-parse HEAD 2>$null

if ($before -eq $after) { exit 0 }

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

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content "$RepoPath\logs\update.log" "[$timestamp] Update detected ($before -> $after), rebuilding..."

try {
    Set-Location "$RepoPath\frontend"
    npm install --silent
    npm run build

    Set-Location "$RepoPath\backend"
    npm install --silent
    npm run build

    Set-Location $RepoPath

    if ($nssmExe) {
        & $nssmExe restart cashflow-backend
        & $nssmExe restart cashflow-caddy
    }

    Add-Content "$RepoPath\logs\update.log" "[$timestamp] Restart complete."
} catch {
    Add-Content "$RepoPath\logs\update.log" "[$timestamp] ERROR: $_"
}
