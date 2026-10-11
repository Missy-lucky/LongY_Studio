# frontend/electron

这里只放 Electron 打包入口适配器，不承载桌面业务逻辑。

- `main.cjs`：开发模式加载 `desktop/electron/main.cjs`；打包模式加载由 `scripts/prepare-desktop.mjs` 临时复制出的 `frontend/desktop-electron/main.cjs`。
- 真正的主进程、窗口 IPC 和 preload 都在 `desktop/electron/`。
- `scripts/cleanup-desktop.mjs` 会在打包结束后清理临时复制的 `desktop-electron/` 和 `dist/`。
