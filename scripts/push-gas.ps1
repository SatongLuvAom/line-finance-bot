$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$claspConfig = Join-Path $projectRoot ".clasp.json"

if (-not (Test-Path $claspConfig)) {
  throw "Missing .clasp.json. Run scripts\setup-clasp.ps1 -ScriptId YOUR_SCRIPT_ID first."
}

Push-Location $projectRoot
try {
  Write-Host "Checking clasp project status..." -ForegroundColor Cyan
  clasp status

  Write-Host ""
  Write-Host "Pushing src to Google Apps Script..." -ForegroundColor Cyan
  clasp push
} finally {
  Pop-Location
}
