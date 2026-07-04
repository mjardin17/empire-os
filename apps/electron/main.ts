/**
 * Empire OS Desktop Wrapper - Electron Main Process
 *
 * Wraps CrossPost Enterprise (http://localhost:3000) in a native Windows app.
 *
 * Features:
 *   - System tray with show/hide, auto-start toggle, quit
 *   - Minimize to tray on close (does not quit the app)
 *   - Window state persistence (size + position saved across restarts)
 *   - Native Windows notifications
 *   - Auto-start on Windows login (optional, user-controlled)
 *   - IPC bridge via preload so renderer can trigger notifications etc.
 *   - Optimized for 8GB RAM: low memory flags, sandbox, no nodeIntegration
 *
 * Rules:
 *   - NEVER auto-install anything
 *   - Credentials never logged or exposed
 *   - All IPC calls are validated before execution
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

// ---- Constants -------------------------------------------------------

const CROSSPOST_URL  = 'http://localhost:3000'
const EMPIRE_OS_URL  = 'http://localhost:3001'
const APP_NAME       = 'Empire OS'
const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json')

// Memory flags - set before app ready
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512')
app.commandLine.appendSwitch('disable-http-cache')

// ---- Window state persistence ----------------------------------------

interface WindowState {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULT_STATE: WindowState = { x: 100, y: 100, width: 1280, height: 800, maximized: false }

function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(WINDOW_STATE_FILE, 'utf8')
    return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getBounds()
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: win.isMaximized(),
    }
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state, null, 2))
  } catch {
    // non-fatal
  }
}

// ---- Tray icon -------------------------------------------------------

function createTrayIcon(): Electron.NativeImage {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png')
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) return img
  }
  // Fallback: embedded 16x16 blue square PNG
  const FALLBACK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mOQc1hPEmIY1TCqYfhqAAByJQ0QIEyIVgAAAABJRU5ErkJggg=='
  return nativeImage.createFromDataURL(FALLBACK)
}

// ---- Main ------------------------------------------------------------

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
  const state = loadWindowState()

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Reduce memory: disable features not needed
      spellcheck: false,
    },
  })

  if (state.maximized) mainWindow.maximize()

  // Load CrossPost Enterprise
  mainWindow.loadURL(CROSSPOST_URL)

  // Show window once ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
    // Show connection error overlay if CrossPost is not running
    mainWindow!.webContents.on('did-fail-load', (_e, code, desc) => {
      if (code === -102 || code === -6) {
        // ERR_CONNECTION_REFUSED or ERR_NAME_NOT_RESOLVED
        showConnectionError()
      }
    })
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow!.hide()
      showTrayNotification('Empire OS is still running', 'Find it in your system tray.')
    }
  })

  // Save window state before it closes
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Save state on resize/move
  mainWindow.on('resize', () => { if (mainWindow) saveWindowState(mainWindow) })
  mainWindow.on('move',   () => { if (mainWindow) saveWindowState(mainWindow) })

  // Open external links in the default browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function showConnectionError(): void {
  if (!mainWindow) return
  const html = `
    <html>
    <head><title>Empire OS</title></head>
    <body style="margin:0;background:#0f172a;color:#94a3b8;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;">
      <div style="font-size:48px;">&#x26A1;</div>
      <h1 style="margin:0;color:#fff;font-size:24px;">Servers not running</h1>
      <p style="margin:0;text-align:center;">Start your servers first, then reload.</p>
      <div style="display:flex;gap:12px;margin-top:8px;">
        <button onclick="location.reload()" style="padding:10px 20px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;">Retry</button>
      </div>
      <p style="margin:0;font-size:12px;color:#475569;">CrossPost: http://localhost:3000 &nbsp;|&nbsp; Empire OS: http://localhost:3001</p>
    </body>
    </html>
  `
  mainWindow.webContents.executeJavaScript(
    `document.open(); document.write(${JSON.stringify(html)}); document.close();`
  ).catch(() => undefined)
}

function showTrayNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return
  new Notification({ title, body, silent: true }).show()
}

function getAutoStart(): boolean {
  const settings = app.getLoginItemSettings()
  return settings.openAtLogin
}

function setAutoStart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
    name: APP_NAME,
  })
}

function buildTrayMenu(): Electron.Menu {
  const autoStart = getAutoStart()
  return Menu.buildFromTemplate([
    {
      label: 'Show Empire OS',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      },
    },
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(CROSSPOST_URL),
    },
    {
      label: 'Open Empire OS Dashboard',
      click: () => shell.openExternal(EMPIRE_OS_URL + '/empire-dashboard/'),
    },
    { type: 'separator' },
    {
      label: autoStart ? 'Disable Auto-start' : 'Enable Auto-start',
      click: () => {
        setAutoStart(!autoStart)
        // Rebuild menu to reflect change
        if (tray) tray.setContextMenu(buildTrayMenu())
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Empire OS',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
}

function createTray(): void {
  tray = new Tray(createTrayIcon())
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(buildTrayMenu())

  // Double-click: show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
}

// ---- IPC handlers ----------------------------------------------------

ipcMain.handle('empire:notify', (_event, title: string, body: string) => {
  if (typeof title !== 'string' || typeof body !== 'string') return
  showTrayNotification(title.slice(0, 100), body.slice(0, 200))
})

ipcMain.handle('empire:get-autostart', () => getAutoStart())

ipcMain.handle('empire:set-autostart', (_event, enabled: boolean) => {
  if (typeof enabled !== 'boolean') return
  setAutoStart(enabled)
  if (tray) tray.setContextMenu(buildTrayMenu())
})

ipcMain.handle('empire:minimize-to-tray', () => {
  if (mainWindow) mainWindow.hide()
})

ipcMain.handle('empire:get-version', () => app.getVersion())

ipcMain.handle('empire:open-external', (_event, url: string) => {
  if (typeof url !== 'string') return
  if (!url.startsWith('http://localhost') && !url.startsWith('https://')) return
  shell.openExternal(url)
})

// ---- App lifecycle ---------------------------------------------------

// Single instance lock - prevent duplicate windows
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized() || !mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  // Reduce background activity
  app.setAppUserModelId(APP_NAME)

  createTray()
  createWindow()

  app.on('activate', () => {
    if (!mainWindow) createWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  if (mainWindow) saveWindowState(mainWindow)
})

// Prevent default quit on all windows closed - tray keeps it alive
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit()
  }
})

// Memory cleanup: release tray on quit
app.on('will-quit', () => {
  if (tray) {
    tray.destroy()
    tray = null
  }
})
