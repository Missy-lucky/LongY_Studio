$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$temp = Join-Path $root "temp"
New-Item -ItemType Directory -Force -Path "$temp/cache/python", "$temp/cache/npm", "$temp/build/frontend" | Out-Null
$env:PYTHONPYCACHEPREFIX = "$temp/cache/python"
$env:npm_config_cache = "$temp/cache/npm"
& (Join-Path $root "backend/.venv/Scripts/python.exe") -m pytest (Join-Path $root "tests")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Push-Location (Join-Path $root "frontend")
npm run build
$code = $LASTEXITCODE
Pop-Location
exit $code
