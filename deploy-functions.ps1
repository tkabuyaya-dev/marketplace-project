# NUNULIA — Deploy Cloud Functions (PowerShell)
# Usage: .\deploy-functions.ps1

$ErrorActionPreference = "Stop"

# Step 1: Build
Write-Host "=== Building Cloud Functions ===" -ForegroundColor Cyan
Push-Location functions
npm run build
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Pop-Location

# Step 2: Deploy — increase discovery timeout for Node 24
# Node 24 loads firebase-admin/firebase-functions 3-5x slower than Node 22.
# The default 10s timeout is insufficient; 60s gives ample margin.
Write-Host "`n=== Deploying Cloud Functions ===" -ForegroundColor Cyan
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60000"

try {
    firebase deploy --only functions
} finally {
    Remove-Item Env:\FUNCTIONS_DISCOVERY_TIMEOUT -ErrorAction SilentlyContinue
}
