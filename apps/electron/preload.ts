/**
 * Empire OS Electron Preload Script
 *
 * Runs in an isolated context inside the renderer (renderer cannot access Node).
 * Exposes a safe, minimal API to the renderer via contextBridge.
 *
 * Security:
 *   - contextIsolation: true (set in main.ts)
 *   - nodeIntegration: false (set in main.ts)
 *   - sandbox: true (set in main.ts)
 *   - Only exposes whitelisted IPC channels
 *   - Input types validated in main.ts handlers
 *
 * Usage in renderer:
 *   window.empireOS.notify('title', 'body')
 *   const isAutoStart = await window.empireOS.getAutoStart()
 *   await window.empireOS.setAutoStart(true)
 *   window.empireOS.minimizeToTray()
 *   const version = await window.empireOS.getVersion()
 *   window.empireOS.openExternal('https://...')
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('empireOS', {
  /** Show a native Windows notification (non-blocking) */
  notify: (title: string, body: string): void => {
    ipcRenderer.invoke('empire:notify', title, body)
  },

  /** Get current auto-start setting */
  getAutoStart: (): Promise<boolean> => {
    return ipcRenderer.invoke('empire:get-autostart')
  },

  /** Set auto-start on Windows login */
  setAutoStart: (enabled: boolean): Promise<void> => {
    return ipcRenderer.invoke('empire:set-autostart', enabled)
  },

  /** Hide window to system tray */
  minimizeToTray: (): void => {
    ipcRenderer.invoke('empire:minimize-to-tray')
  },

  /** Get Electron app version */
  getVersion: (): Promise<string> => {
    return ipcRenderer.invoke('empire:get-version')
  },

  /** Open a URL in the system default browser (localhost and https only) */
  openExternal: (url: string): void => {
    ipcRenderer.invoke('empire:open-external', url)
  },

  /** True when running inside Electron (renderer can check this to show desktop controls) */
  isDesktop: true,
})

// TypeScript global type declaration
// In the renderer, window.empireOS will be typed correctly
declare global {
  interface Window {
    empireOS?: {
      notify: (title: string, body: string) => void
      getAutoStart: () => Promise<boolean>
      setAutoStart: (enabled: boolean) => Promise<void>
      minimizeToTray: () => void
      getVersion: () => Promise<string>
      openExternal: (url: string) => void
      isDesktop: true
    }
  }
}
