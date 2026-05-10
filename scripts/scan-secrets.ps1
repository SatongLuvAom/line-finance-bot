param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$skipDirs = @(".git", "node_modules", "dist", "build", "coverage")
$binaryExtensions = @(".png", ".jpg", ".jpeg", ".gif", ".pdf", ".ico", ".zip", ".7z", ".exe")
$patterns = @(
  @{ Name = "Google API key"; Regex = "AIza[0-9A-Za-z_-]{20,}" },
  @{ Name = "Private key block"; Regex = "-----BEGIN (RSA |EC |OPENSSH |)?PRIVATE" + " KEY-----" },
  @{ Name = "Service account private_key"; Regex = '"private_key"\s*:\s*"-----BEGIN PRIVATE' + ' KEY-----' },
  @{ Name = "OAuth access token"; Regex = '"access_token"\s*:\s*"[^"]{20,}"' },
  @{ Name = "OAuth refresh token"; Regex = '"refresh_token"\s*:\s*"[^"]{20,}"' },
  @{ Name = "Hardcoded GAS secret assignment"; Regex = "(LINE_TOKEN|GEMINI_KEY|FIREBASE_PRIVATE_KEY|WEBHOOK_SECRET)\s*[:=]\s*[""'][^""']{8,}[""']" },
  @{ Name = "Long base64 token-like string"; Regex = "[A-Za-z0-9+/]{160,}={0,2}" }
)

$hits = New-Object System.Collections.Generic.List[object]
$files = Get-ChildItem -Path $Root -Force -Recurse -File | Where-Object {
  $full = $_.FullName
  foreach ($dir in $skipDirs) {
    if ($full -match "\\$([regex]::Escape($dir))\\") {
      return $false
    }
  }
  return -not ($binaryExtensions -contains $_.Extension.ToLowerInvariant())
}

foreach ($file in $files) {
  $relative = Resolve-Path -Path $file.FullName -Relative
  $lines = Get-Content -LiteralPath $file.FullName -ErrorAction SilentlyContinue
  for ($index = 0; $index -lt $lines.Count; $index++) {
    foreach ($pattern in $patterns) {
      if ($lines[$index] -match $pattern.Regex) {
        $hits.Add([pscustomobject]@{
          Rule = $pattern.Name
          File = $relative
          Line = $index + 1
        })
      }
    }
  }
}

if ($hits.Count -gt 0) {
  $hits | Format-Table -AutoSize
  throw "Secret scan failed. Remove secrets or move them to Apps Script Script Properties before git push."
}

Write-Host "Secret scan passed: no high-confidence secrets found."
