$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$temp = Join-Path $root "temp"
New-Item -ItemType Directory -Force -Path "$temp/cache/npm", "$temp/build/release" | Out-Null
$env:npm_config_cache = "$temp/cache/npm"
$env:PYTHONPYCACHEPREFIX = "$temp/cache/python"
$env:ELECTRON_BUILDER_CACHE = "$temp/cache/electron-builder"
$code = 0
try {
  & (Join-Path $PSScriptRoot "build-sidecar.ps1")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Push-Location (Join-Path $root "frontend")
  npm run dist
  $code = $LASTEXITCODE
  if ($code -eq 0) {
    & (Join-Path $PSScriptRoot "check-packaged-desktop.ps1")
    $code = $LASTEXITCODE
  }
  if ($code -eq 0) {
    $releaseDir = Join-Path $temp "build\release"
    $artifacts = @(
      Join-Path $releaseDir "LongY Studio Setup 0.1.0.exe"
      Join-Path $releaseDir "LongY Studio 0.1.0.exe"
    )
    $hashLines = Get-FileHash -LiteralPath $artifacts -Algorithm SHA256 | ForEach-Object {
      "$($_.Hash)  $([IO.Path]::GetFileName($_.Path))"
    }
    [IO.File]::WriteAllLines(
      (Join-Path $releaseDir "SHA256SUMS.txt"),
      $hashLines,
      [Text.UTF8Encoding]::new($false)
    )
  }
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
