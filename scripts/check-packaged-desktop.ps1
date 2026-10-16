$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$release = Join-Path $root "temp\build\release\win-unpacked"
$application = Join-Path $release "LongY Studio.exe"
$sidecar = Join-Path $release "resources\sidecar\longy-sidecar.exe"
$web = Join-Path $release "resources\web\index.html"
$sidecarInternal = Join-Path $release "resources\sidecar\_internal"
$fallbackManifest = Join-Path $sidecarInternal "asset-library\default-garments\manifest.json"
foreach ($path in @($application, $sidecar, $web, $fallbackManifest)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "桌面发行文件缺失：$path"
  }
}

$fallbackData = Get-Content -LiteralPath $fallbackManifest -Raw | ConvertFrom-Json
foreach ($item in $fallbackData.items) {
  $assetPath = Join-Path $sidecarInternal $item.path
  if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
    throw "默认补位素材未进入发行包：$assetPath"
  }
  $actualHash = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $item.sha256) {
    throw "发行包默认补位素材哈希不匹配：$assetPath"
  }
}

$portProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$portProbe.Start()
$port = ([Net.IPEndPoint]$portProbe.LocalEndpoint).Port
$portProbe.Stop()

$checkDir = Join-Path $root "temp\tests\packaged-desktop"
New-Item -ItemType Directory -Force -Path $checkDir | Out-Null
$marker = Join-Path $checkDir ("result-" + [Guid]::NewGuid().ToString("N") + ".json")
$env:LONGY_BACKEND_PORT = [string]$port
$env:LONGY_STARTUP_CHECK_FILE = $marker
$env:APPDATA = Join-Path $checkDir "userdata"

$process = Start-Process -FilePath $application -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) {
  throw "桌面启动自检失败，退出码：$($process.ExitCode)"
}
if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
  throw "桌面启动自检未写入成功标记"
}
$result = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
if ($result.ok -ne $true -or $result.backendOrigin -ne "http://127.0.0.1:$port") {
  throw "桌面启动自检返回内容无效"
}
Start-Sleep -Milliseconds 500
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  throw "桌面退出后 sidecar 仍监听端口 $port"
}
Write-Output "Packaged desktop smoke passed: assets -> Electron -> sidecar -> health -> shutdown (port $port)"
