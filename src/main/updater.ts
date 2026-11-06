import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const { autoUpdater } = electronUpdater
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000 // cada 4 horas

let status: UpdateStatus = { state: 'idle' }

function broadcast(s: UpdateStatus): void {
  status = s
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:status', s)
}

/**
 * Actualizaciones automáticas desde GitHub Releases: se descargan en segundo plano
 * y se instalan al cerrar la app (o al pulsar «Reiniciar y actualizar»).
 */
export function setupUpdater(): void {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:check', () => check(true))
  ipcMain.handle('update:install', () => {
    if (status.state === 'downloaded') autoUpdater.quitAndInstall(true, true)
  })

  if (!app.isPackaged) {
    status = { state: 'disabled', message: 'Las actualizaciones solo funcionan en la app instalada' }
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => broadcast({ state: 'downloading', version: i.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', version: status.version, percent: Math.round(p.percent) }))
  autoUpdater.on('update-not-available', () => broadcast({ state: 'none' }))
  autoUpdater.on('update-downloaded', (i) => broadcast({ state: 'downloaded', version: i.version }))
  autoUpdater.on('error', (err) => broadcast({ state: 'error', message: err?.message ?? String(err) }))

  setTimeout(() => check(false), 10_000)
  setInterval(() => check(false), CHECK_EVERY_MS)
}

async function check(manual: boolean): Promise<UpdateStatus> {
  if (!app.isPackaged) return status
  // No interrumpir una descarga en curso ni volver a descargar lo ya descargado.
  if (status.state === 'downloading' || status.state === 'downloaded') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    // Sin conexión, etc.: solo se muestra si el usuario lo pidió.
    if (manual) broadcast({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  return status
}
