# desktop 桌面壳层

本目录负责 Windows 桌面窗口、窗口 IPC、安装打包入口和 sidecar 生命周期，不放业务组件。

- `electron/`：Electron 主进程与 preload。
- 打包态从 `resources/sidecar/longy-sidecar.exe` 隐藏启动后端，轮询 `/api/health` 后加载 `resources/web/`。
- 数据写入 Electron `userData/storage`，日志写入 `userData/logs/sidecar.log`；只有本进程启动的 sidecar 才会在退出时被回收。
- `LONGY_STARTUP_CHECK_FILE` 仅用于发行包无窗口自检：验证 Electron → sidecar → 健康检查 → 退出回收。
- 后续如切换 Tauri：新增 `tauri/`，保持 UI 仍在 `frontend/`。
