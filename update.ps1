# ── Cash Flow App — Auto-Update Script ───────────────────────────────────────
# Called by Task Scheduler every 5 minutes (same pattern as tb-dashboard).
# Pulls latest code from GitHub; rebuilds and restarts services only if changed.

$ErrorActionPreference = "Stop"
$RepoPath = $PSScriptRoot

Set-Location $RepoPath

$before = git rev-parse HEAD 2>$null
git pull origin main --quiet 2>$null
$after  = git rev-parse HEAD 2>$null

if ($before -eq $after) { exit 0 }   # no changes — nothing to do

# Code changed — rebuild and restart
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content "$RepoPath\logs\update.log" "[$timestamp] Update detected ($before → $after), rebuilding..."

try {
    # Rebuild frontend
    Set-Location "$RepoPath\frontend"
    npm install --silent
    npm run build

    # Rebuild backend
    Set-Location "$RepoPath\backend"
    npm install --silent
    npm run build

    Set-Location $RepoPath

    # Restart services
    nssm restart cashflow-backend
    nssm restart cashflow-caddy

    Add-Content "$RepoPath\logs\update.log" "[$timestamp] Restart complete."
} catch {
    Add-Content "$RepoPath\logs\update.log" "[$timestamp] ERROR: $_"
}
