$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$base = Join-Path $root "temp/research/open-source"
New-Item -ItemType Directory -Force -Path $base | Out-Null
$repos = @(
  @("https://github.com/Comfy-Org/desktop.git", "comfy-desktop"),
  @("https://github.com/xyflow/xyflow.git", "xyflow"),
  @("https://github.com/langflow-ai/langflow.git", "langflow")
)
foreach ($repo in $repos) {
  $out = Join-Path $base $repo[1]
  if (-not (Test-Path $out)) { git clone --depth 1 --filter=blob:none --sparse $repo[0] $out }
}
