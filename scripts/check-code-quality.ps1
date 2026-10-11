$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }

$env:PYTHONPYCACHEPREFIX = Join-Path $root "temp\cache\python"
& $python (Join-Path $root "scripts\check_code_quality.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $python -m pytest (Join-Path $root "tests")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location (Join-Path $root "frontend")
npm run build
$code = $LASTEXITCODE
Pop-Location
exit $code
