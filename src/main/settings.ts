import { BrowserWindow, dialog, ipcMain } from 'electron'
import { imageJob } from './imageJobs'
import type { Settings } from '../shared/types'
import { transaction, type DB } from './db'

export const DEFAULT_SETTINGS: Settings = {
  business_name: '',
  business_tax_id: '',
  business_address: '',
  business_email: '',
  business_phone: '',
  business_iban: '',
  logo_data_url: '',
  default_tax_rate: 21,
  default_irpf_rate: 0,
  invoice_footer: '',
  watermark_text: '',
  /** Última carpeta abierta en «Carpetas» (no se muestra en Ajustes). */
  last_folder: ''
}

const NUMERIC: (keyof Settings)[] = ['default_tax_rate', 'default_irpf_rate']

export function getSettings(db: DB): Settings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    const key = String(r.key) as keyof Settings
    if (!(key in DEFAULT_SETTINGS)) continue
    out[key] = NUMERIC.includes(key) ? Number(r.value) : String(r.value ?? '')
  }
  return out as unknown as Settings
}

export function registerSettingsIpc(db: DB): void {
  ipcMain.handle('settings:get', () => getSettings(db))
  ipcMain.handle('settings:save', (_e, patch: Partial<Settings>) => {
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    transaction(db, () => {
      for (const [k, v] of Object.entries(patch)) {
        if (!(k in DEFAULT_SETTINGS)) continue
        if (NUMERIC.includes(k as keyof Settings) && !Number.isFinite(Number(v))) throw new Error(`Valor no válido para ${k}`)
        stmt.run(k, String(v ?? ''))
      }
    })
    return getSettings(db)
  })
  ipcMain.handle('settings:chooseLogo', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showOpenDialog(win, {
      title: 'Elegir logotipo',
      properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return (await imageJob({ op: 'logo', src: res.filePaths[0] })).dataUrl
  })
}
