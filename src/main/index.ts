import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openDatabase } from './db'
import { registerIpc } from './ipc'
import { LocalStorage } from './storage'
import { setupUpdater } from './updater'
import { stopImageWorker } from './imageJobs'

// Esquema propio para servir miniaturas/previsualizaciones de la biblioteca de forma segura.
protocol.registerSchemesAsPrivileged([
  { scheme: 'foto', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

const dataDir = process.env.FOTOGESTOR_DATA_DIR ?? join(app.getPath('userData'), 'biblioteca')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'FotoGestor',
    backgroundColor: '#16171b',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  mkdirSync(dataDir, { recursive: true })
  const storage = new LocalStorage(dataDir)
  const db = openDatabase(join(dataDir, 'fotogestor.db'))

  protocol.handle('foto', (req) => {
    try {
      const key = decodeURIComponent(new URL(req.url).pathname.slice(1))
      return net.fetch(pathToFileURL(storage.resolve(key)).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  registerIpc(db, storage)
  setupUpdater()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
  app.on('will-quit', () => { stopImageWorker(); db.close() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
