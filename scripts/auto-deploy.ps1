# VSPAY PSP - Auto Deploy Script
# Commits local changes, pushes to GitHub, and deploys to production server
# Usage: .\scripts\auto-deploy.ps1 -Message "your commit message"
# Usage: .\scripts\auto-deploy.ps1 -Message "your commit message" -Deploy

param(
    [Parameter(Mandatory=$false)]
    [string]$Message = "update: sync changes $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
    
    [Parameter(Mandatory=$false)]
    [switch]$Deploy = $false
)

$ErrorActionPreference = "Stop"

# Color helpers
function Write-Step($text) { Write-Host "`n▶ $text" -ForegroundColor Cyan }
function Write-OK($text) { Write-Host "  ✅ $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  ⚠️ $text" -ForegroundColor Yellow }
function Write-Fail($text) { Write-Host "  ❌ $text" -ForegroundColor Red }

# Find git
$gitPath = $null
$possiblePaths = @(
    "git",
    "C:\Program Files\Git\bin\git.exe",
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\bin\git.exe"
)
foreach ($p in $possiblePaths) {
    try {
        $null = & $p --version 2>$null
        if ($LASTEXITCODE -eq 0) { $gitPath = $p; break }
    } catch { continue }
}
if (-not $gitPath) {
    Write-Fail "Git not found. Install it first: winget install --id Git.Git"
    exit 1
}

Write-Host "`n🚀 VSPAY PSP - Auto Deploy" -ForegroundColor Magenta
Write-Host "─────────────────────────────" -ForegroundColor DarkGray

# Step 1: Stage changes
Write-Step "Staging changes..."
& $gitPath add -A
Write-OK "All changes staged"

# Step 2: Check if there are changes to commit
$status = & $gitPath status --porcelain
if (-not $status) {
    Write-Warn "No changes to commit. Already up to date."
    exit 0
}

# Step 3: Commit
Write-Step "Committing: '$Message'"
& $gitPath commit -m "$Message"
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Commit failed"
    exit 1
}
Write-OK "Committed successfully"

# Step 4: Push
Write-Step "Pushing to GitHub (origin/main)..."
& $gitPath push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Push failed. Trying with --set-upstream..."
    & $gitPath push --set-upstream origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Push failed"
        exit 1
    }
}
Write-OK "Pushed to GitHub"

# Step 5: Deploy (optional)
if ($Deploy) {
    # Load .env to get server details
    $envFile = Join-Path $PSScriptRoot "..\.env"
    $serverHost = $null
    $serverUser = $null
    $serverPath = $null
    
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^DEPLOY_HOST=(.+)$') { $serverHost = $Matches[1].Trim() }
            if ($_ -match '^DEPLOY_USER=(.+)$') { $serverUser = $Matches[1].Trim() }
            if ($_ -match '^DEPLOY_PATH=(.+)$') { $serverPath = $Matches[1].Trim() }
        }
    }
    
    if (-not $serverHost -or -not $serverUser -or -not $serverPath) {
        Write-Warn "Deploy vars not set in .env (DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH)"
        Write-Warn "Add these to .env to enable auto-deploy:"
        Write-Host "  DEPLOY_HOST=your-server-ip"
        Write-Host "  DEPLOY_USER=root"
        Write-Host "  DEPLOY_PATH=/www/wwwroot/vspaypsp"
        exit 0
    }
    
    Write-Step "Deploying to $serverUser@$serverHost..."
    ssh "${serverUser}@${serverHost}" "cd $serverPath && ./deploy.sh"
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Remote deployment failed"
        exit 1
    }
    Write-OK "Deployed to production!"
}

Write-Host "`n✨ All done!" -ForegroundColor Green
Write-Host "─────────────────────────────`n" -ForegroundColor DarkGray
