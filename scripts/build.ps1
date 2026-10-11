$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$temp = Join-Path $root "temp"
New-Item -ItemType Directory -Force -Path "$temp/cache/python", "$temp/cache/npm", "$temp/build/frontend" | Out-Null
$env:PYTHONPYCACHEPREFIX = "$temp/cache/python"
$env:npm_config_cache = "$temp/cache/npm"
& (Join-Path $PSScriptRoot "check-code-quality.ps1")
exit $LASTEXITCODE
