# desktop 桌面壳层

本目录负责 Windows 桌面窗口、窗口 IPC、安装打包入口和后续 sidecar 拉起，不放业务组件。

- `electron/`：Electron 主进程与 preload。
- 后续如切换 Tauri：新增 `tauri/`，保持 UI 仍在 `frontend/`。
