/**
 * 桌面入口适配器。开发模式加载 desktop/electron/main.cjs；打包模式加载临时复制进 app.asar 的 desktop-electron/main.cjs。
 */
const { app } = require('electron')
const path = require('path')
const target = app.isPackaged
  ? path.join(__dirname, '..', 'desktop-electron', 'main.cjs')
  : path.join(__dirname, '..', '..', 'desktop', 'electron', 'main.cjs')
require(target)
