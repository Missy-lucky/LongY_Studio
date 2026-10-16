/**
 * LongY Studio 桌面主进程。UI 与业务代码分别位于 frontend/ 与 backend/。
 */
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const net = require('net')
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
let allowClose = false
let sidecarProcess = null
let sidecarStartError = null
let backendPort = Number(process.env.LONGY_BACKEND_PORT || 8600)
const backendOrigin = () => `http://127.0.0.1:${backendPort}`
const projectRoots = [path.resolve(__dirname, '..'), path.resolve(__dirname, '..', '..')]
const firstExisting = (candidates) => candidates.find((item) => fs.existsSync(item))

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function backendHealth() {
  return new Promise(resolve => {
    const request = http.get(`${backendOrigin()}/api/health`, { timeout: 1200 }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        try {
          const value = JSON.parse(body)
          resolve(response.statusCode === 200 && value.service === 'longy-sidecar')
        } catch {
          resolve(false)
        }
      })
    })
    request.on('timeout', () => request.destroy())
    request.on('error', () => resolve(false))
  })
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(error => error ? reject(error) : resolve(port))
    })
  })
}

async function ensurePackagedSidecar() {
  if (await backendHealth()) return
  if (!process.env.LONGY_BACKEND_PORT) backendPort = await findAvailablePort()
  const executable = path.join(process.resourcesPath, 'sidecar', 'longy-sidecar.exe')
  const frontendDir = path.join(process.resourcesPath, 'web')
  if (!fs.existsSync(executable)) throw new Error(`后端程序不存在：${executable}`)
  if (!fs.existsSync(path.join(frontendDir, 'index.html'))) throw new Error(`前端资源不存在：${frontendDir}`)

  const dataDir = path.join(app.getPath('userData'), 'storage')
  const logDir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(logDir, { recursive: true })
  const logHandle = fs.openSync(path.join(logDir, 'sidecar.log'), 'a')
  sidecarStartError = null
  sidecarProcess = spawn(executable, [], {
    cwd: path.dirname(executable),
    windowsHide: true,
    env: {
      ...process.env,
      LONGY_BACKEND_PORT: String(backendPort),
      LONGY_DATA_DIR: dataDir,
      LONGY_FRONTEND_DIR: frontendDir,
      PYTHONUTF8: '1',
    },
    stdio: ['ignore', logHandle, logHandle],
  })
  fs.closeSync(logHandle)
  sidecarProcess.once('error', error => { sidecarStartError = error })
  sidecarProcess.once('exit', () => { sidecarProcess = null })

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (sidecarStartError) throw sidecarStartError
    if (await backendHealth()) return
    if (!sidecarProcess) throw new Error('后端程序启动后提前退出，请查看 sidecar.log')
    await delay(250)
  }
  sidecarProcess?.kill()
  sidecarProcess = null
  throw new Error('后端程序在 20 秒内未就绪，请查看 sidecar.log')
}

function stopOwnedSidecar() {
  if (!sidecarProcess) return
  sidecarProcess.kill()
  sidecarProcess = null
}

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

  if (app.isPackaged) {
    mainWindow.loadURL(`${backendOrigin()}/`)
  } else if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    if (process.env.LONGY_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    const indexCandidates = [
      path.join(app.getAppPath(), 'dist', 'index.html'),
      ...projectRoots.map((root) => path.join(root, 'frontend', 'dist', 'index.html')),
    ]
    const index = firstExisting(indexCandidates)
    if (index) mainWindow.loadFile(index)
    else mainWindow.loadURL('http://127.0.0.1:5173')
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.on('close', event => {
    if (allowClose || mainWindow?.isDestroyed()) return
    event.preventDefault()
    mainWindow.webContents.send('before-close')
  })
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

ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择导出目录',
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled || !result.filePaths.length ? null : result.filePaths[0]
})

ipcMain.handle('open-path', (_event, targetPath) => {
  if (typeof targetPath !== 'string' || !targetPath.trim()) return Promise.reject(new Error('路径为空'))
  return shell.openPath(targetPath)
})

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())
ipcMain.on('window-close-confirmed', () => {
  allowClose = true
  mainWindow?.close()
})
app.whenReady().then(async () => {
  try {
    if (app.isPackaged) {
      await ensurePackagedSidecar()
      // Packaging CI can verify the real Electron -> sidecar startup path
      // without opening a window or leaving background processes behind.
      const smokeFile = process.env.LONGY_STARTUP_CHECK_FILE
      if (smokeFile) {
        fs.writeFileSync(smokeFile, JSON.stringify({ ok: true, backendOrigin: backendOrigin() }), 'utf8')
        stopOwnedSidecar()
        app.quit()
        return
      }
    }
    createWindow()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('LongY Studio 启动失败', `${message}\n\n日志目录：${path.join(app.getPath('userData'), 'logs')}`)
    app.quit()
  }
})
app.on('before-quit', () => {
  allowClose = true
  stopOwnedSidecar()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
