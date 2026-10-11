$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$temp = Join-Path $root "temp"
New-Item -ItemType Directory -Force -Path "$temp/cache/python", "$temp/cache/npm", "$root/storage/logs" | Out-Null
$env:LONGY_DATA_DIR = Join-Path $root "storage"
$env:PYTHONPYCACHEPREFIX = "$temp/cache/python"
$env:npm_config_cache = "$temp/cache/npm"
$py = Join-Path $root "backend/.venv/Scripts/python.exe"
Start-Process -FilePath $py -ArgumentList @("-m", "uvicorn", "app.main:app", "--port", "8600") -WorkingDirectory (Join-Path $root "backend") -WindowStyle Hidden
Push-Location (Join-Path $root "frontend")
npm run dev
Pop-Location
