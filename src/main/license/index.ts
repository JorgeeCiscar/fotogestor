import { app, BrowserWindow, ipcMain, net, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { deniedMessage, type LicenseState } from '../../shared/license'
import { getDevice } from './device'
import { LicenseManager } from './manager'
import { LicenseServer, type LicenseConfig } from './server'
import { SessionStore } from './store'
import { loadPublicKey } from './token'

export const APP_ID = 'fotogestor'

/**
 * Configuración del servidor de licencias. En la app instalada se fija al compilar con las
 * variables MAIN_VITE_LICENSE_URL, MAIN_VITE_LICENSE_ANON_KEY y MAIN_VITE_LICENSE_PUBLIC_KEY
 * (por ejemplo en un fichero .env.production). Sin ellas las licencias están desactivadas y la
 * app funciona como hasta ahora. Fuera de la app instalada se pueden dar en tiempo de ejecución
 * con FOTOGESTOR_LICENSE_URL, FOTOGESTOR_LICENSE_ANON_KEY y FOTOGESTOR_LICENSE_PUBLIC_KEY.
 */
export function licenseConfig(): LicenseConfig | null | { error: string } {
  const dev = !app.isPackaged && process.env.FOTOGESTOR_LICENSE_URL
  const url = dev ? process.env.FOTOGESTOR_LICENSE_URL : import.meta.env.MAIN_VITE_LICENSE_URL
  const anonKey = dev ? process.env.FOTOGESTOR_LICENSE_ANON_KEY : import.meta.env.MAIN_VITE_LICENSE_ANON_KEY
  const publicKey = dev ? process.env.FOTOGESTOR_LICENSE_PUBLIC_KEY : import.meta.env.MAIN_VITE_LICENSE_PUBLIC_KEY
  if (!url) return null
  if (!anonKey || !publicKey) return { error: 'La configuración del servidor de licencias está incompleta.' }
  if (app.isPackaged && !url.startsWith('https://')) return { error: 'El servidor de licencias debe usar https.' }
  return { url, anonKey, publicKey, appId: APP_ID }
}

function broadcast(s: LicenseState): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('license:state', s)
}

/**
 * Comprueba el nivel de acceso en cada llamada IPC (proceso principal), para que el modo solo
 * lectura o la falta de licencia no se puedan saltar desde la interfaz. Debe instalarse antes de
 * registrar cualquier otro manejador.
 */
function installIpcGuard(getAccess: () => ReturnType<LicenseManager['access']>): void {
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
    handle(channel, (e, ...args) => {
      const denied = deniedMessage(channel, getAccess())
      if (denied) throw new Error(denied)
      return listener(e, ...args)
    })) as typeof ipcMain.handle
}

function openExternalSafe(url: string | null): void {
  if (!url) return
  const ok = url.startsWith('https://') || (!app.isPackaged && url.startsWith('http://'))
  if (ok) void shell.openExternal(url)
}

/** Arranca las licencias. Devuelve null si están desactivadas. */
export function setupLicense(): LicenseManager | null {
  const cfg = licenseConfig()
  let state: LicenseState = { kind: 'disabled' }
  let manager: LicenseManager | null = null

  if (cfg && 'error' in cfg) {
    state = { kind: 'blocked', message: cfg.error }
  } else if (cfg) {
    const dir = (!app.isPackaged && process.env.FOTOGESTOR_LICENSE_DIR) || join(app.getPath('userData'), 'licencia')
    try {
      manager = new LicenseManager({
        appId: APP_ID,
        version: app.getVersion(),
        server: new LicenseServer(cfg, (url, init) => net.fetch(url, init)),
        publicKey: loadPublicKey(cfg.publicKey),
        store: new SessionStore(dir, {
          available: () => safeStorage.isEncryptionAvailable(),
          encrypt: (t) => safeStorage.encryptString(t),
          decrypt: (b) => safeStorage.decryptString(b)
        }),
        device: () => getDevice(dir, APP_ID, !app.isPackaged),
        onChange: broadcast,
        log: (m) => console.warn(m)
      })
    } catch (e) {
      state = { kind: 'blocked', message: `No se pudo iniciar el control de licencias: ${e instanceof Error ? e.message : e}` }
    }
  }

  const current = (): LicenseState => manager?.getState() ?? state
  installIpcGuard(() => manager?.access() ?? (state.kind === 'disabled' ? 'full' : 'none'))

  ipcMain.handle('license:state', () => current())
  ipcMain.handle('license:refresh', () => manager?.check() ?? current())
  ipcMain.handle('license:login', (_e, email: string, password: string) =>
    manager?.login(String(email ?? ''), String(password ?? '')) ?? { ok: false })
  ipcMain.handle('license:signup', (_e, email: string, password: string) =>
    manager?.signup(String(email ?? ''), String(password ?? '')) ?? { ok: false })
  ipcMain.handle('license:recover', (_e, email: string) => manager?.recover(String(email ?? '')) ?? { ok: false })
  ipcMain.handle('license:logout', () => manager?.logout())
  ipcMain.handle('license:deactivateDevice', (_e, id: string) => manager?.deactivateDevice(String(id)) ?? { ok: false })
  ipcMain.handle('license:openCheckout', () => {
    openExternalSafe(manager?.checkoutUrl() ?? null)
    manager?.watchForChanges()
  })
  ipcMain.handle('license:openPortal', async () => {
    openExternalSafe((await manager?.portalUrl()) ?? null)
    manager?.watchForChanges()
  })

  if (manager) void manager.start()
  return manager
}
