$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$python = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw "后端虚拟环境不存在，请先运行 python main.py --backend 完成依赖安装"
}

$sidecarRoot = [IO.Path]::GetFullPath((Join-Path $root "temp\build\sidecar"))
$workRoot = [IO.Path]::GetFullPath((Join-Path $root "temp\cache\pyinstaller"))
$rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
foreach ($target in @($sidecarRoot, $workRoot)) {
  if (-not $target.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝清理工程目录之外的构建路径：$target"
  }
}

& $python -m pip install --disable-pip-version-check -r (Join-Path $root "backend\requirements-build.txt")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (Test-Path -LiteralPath $sidecarRoot) {
  Remove-Item -LiteralPath $sidecarRoot -Recurse -Force
}
if (Test-Path -LiteralPath $workRoot) {
  Remove-Item -LiteralPath $workRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $sidecarRoot, $workRoot | Out-Null

$arguments = @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--onedir",
  "--name", "longy-sidecar",
  "--distpath", $sidecarRoot,
  "--workpath", (Join-Path $workRoot "work"),
  "--specpath", (Join-Path $workRoot "spec"),
  "--paths", $root,
  "--add-data", ((Join-Path $root "asset-library") + ";asset-library"),
  "--add-data", ((Join-Path $root "database\migrations") + ";database\migrations"),
  "--collect-all", "mediapipe",
  (Join-Path $root "backend\sidecar_main.py")
)
& $python @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$executable = Join-Path $sidecarRoot "longy-sidecar\longy-sidecar.exe"
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Sidecar 构建完成但未找到可执行文件：$executable"
}
Write-Output "Sidecar ready: $executable"
