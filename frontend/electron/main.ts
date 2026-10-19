import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let win: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null

function startBackend() {
  if (isDev) return  // 開発時は手動起動を想定

  const backendDir = join(process.resourcesPath, 'backend')
  backendProcess = spawn('python', ['-m', 'uvicorn', 'api.main:app', '--port', '8000'], {
    cwd: backendDir,
    env: { ...process.env, PYTHONPATH: backendDir },
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    title: 'Surrogate Manager',
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
  }

  // 外部リンクはブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  startBackend()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  backendProcess?.kill()
  if (process.platform !== 'darwin') app.quit()
})
