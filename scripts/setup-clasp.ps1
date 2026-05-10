param(
  [Parameter(Mandatory = $true)]
  [string]$ScriptId
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$srcDir = Join-Path $projectRoot "src"
$manifest = Join-Path $srcDir "appsscript.json"
$claspConfig = Join-Path $projectRoot ".clasp.json"

if (-not (Test-Path $srcDir)) {
  throw "Missing src directory: $srcDir"
}

if (-not (Test-Path $manifest)) {
  throw "Missing Apps Script manifest: $manifest"
}

$config = [ordered]@{
  scriptId = $ScriptId.Trim()
  rootDir = "src"
}

if (-not $config.scriptId -or $config.scriptId -eq "PASTE_APPS_SCRIPT_ID_HERE") {
  throw "Invalid Script ID."
}

($config | ConvertTo-Json -Depth 3) | Set-Content -Path $claspConfig -Encoding UTF8

Write-Host "Created .clasp.json for Apps Script project:" -ForegroundColor Green
Write-Host $config.scriptId
Write-Host ""
Write-Host "Next:"
Write-Host "  clasp login"
Write-Host "  clasp status"
Write-Host "  clasp push"
