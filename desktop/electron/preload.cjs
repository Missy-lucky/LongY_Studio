/**
 * 预加载脚本：安全暴露窗口控制 API 给渲染进程
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  platform: process.platform,
  isElectron: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  confirmClose: () => ipcRenderer.send('window-close-confirmed'),
  onBeforeClose: (cb) => ipcRenderer.on('before-close', () => cb()),
  onMaximized: (cb) => ipcRenderer.on('window-maximized', (_, v) => cb(v)),
})
