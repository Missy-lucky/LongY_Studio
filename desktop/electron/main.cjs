/**
 * LongY Studio 桌面主进程。UI 与业务代码分别位于 frontend/ 与 backend/。
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const fs = require('fs')
const path = require('path')

const gotLock = app.requestSingleInstanceLock()

// 若确认是 GPU 驱动白屏，可用 LONGY_DISABLE_GPU=1 临时切换软件渲染；默认保留硬件加速以保证流畅度。
if (process.env.LONGY_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration()
}
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

let mainWindow = null
const projectRoots = [path.resolve(__dirname, '..'), path.resolve(__dirname, '..', '..')]
const firstExisting = (candidates) => candidates.find((item) => fs.existsSync(item))

function createWindow() {
  const icon = firstExisting(projectRoots.map((root) => path.join(root, 'frontend', 'build', 'icon.png')))
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1366,
    minHeight: 768,
    show: false,
    frame: false,
    backgroundColor: '#FAFAFA',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
    ...(icon ? { icon } : {}),
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    if (process.env.LONGY_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    const indexCandidates = projectRoots.map((root) => path.join(root, 'frontend', 'dist', 'index.html'))
    const index = firstExisting(indexCandidates)
    if (index) mainWindow.loadFile(index)
    else mainWindow.loadURL('http://127.0.0.1:5173')
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[LongY Studio] renderer gone:', details)
    if (!mainWindow.isDestroyed()) setTimeout(() => mainWindow?.reload(), 300)
  })
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false))
}

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())
app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
