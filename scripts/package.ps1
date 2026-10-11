$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$temp = Join-Path $root "temp"
New-Item -ItemType Directory -Force -Path "$temp/cache/npm", "$temp/build/release" | Out-Null
$env:npm_config_cache = "$temp/cache/npm"
$env:PYTHONPYCACHEPREFIX = "$temp/cache/python"
$code = 0
try {
  Push-Location (Join-Path $root "frontend")
  npm run dist
  $code = $LASTEXITCODE
}
finally {
  if (Test-Path (Join-Path $root "frontend\scripts\cleanup-desktop.mjs")) {
    Push-Location (Join-Path $root "frontend")
    node scripts/cleanup-desktop.mjs
    Pop-Location
  }
  Pop-Location
}
exit $code
