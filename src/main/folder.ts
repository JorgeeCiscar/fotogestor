import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AddFromFolderOptions, FolderListing, FolderPhoto } from '../shared/types'
import type { DB } from './db'
import { imageJob } from './imageJobs'
import { SUPPORTED_EXT, importPhotos } from './importer'
import type { LocalStorage } from './storage'

/** Caché de miniaturas de carpetas que aún no están en la biblioteca. */
let cacheDir = ''
const SIZES: Record<string, number> = { thumb: 420, preview: 2000 }
const cachePath = (file: string, mtimeMs: number, size: number, px: number) =>
  join(cacheDir, createHash('sha1').update(`${file}|${mtimeMs}|${size}|${px}`).digest('hex') + '.webp')

/** Fotos de una carpeta (sin entrar en subcarpetas), marcando las que ya están en el evento. */
async function listFolder(db: DB, folder: string, sessionId: number | null): Promise<FolderListing> {
  const entries = await readdir(folder, { withFileTypes: true })
  // Sin evento se mira en toda la biblioteca, para saber si una foto ya está en alguno.
  const rows = (sessionId
    ? db.prepare(`SELECT p.id, p.file_name, p.file_size, p.external_path, s.title AS session_title
                  FROM photos p JOIN sessions s ON s.id = p.session_id WHERE p.session_id = ?`).all(sessionId)
    : db.prepare(`SELECT p.id, p.file_name, p.file_size, p.external_path, s.title AS session_title
                  FROM photos p JOIN sessions s ON s.id = p.session_id`).all()) as
    { id: number; file_name: string; file_size: number; external_path: string | null; session_title: string }[]
  const byPath = new Map(rows.filter((r) => r.external_path).map((r) => [r.external_path as string, r]))
  const byNameSize = new Map(rows.map((r) => [`${r.file_name.toLowerCase()}|${r.file_size}`, r]))

  const photos: FolderPhoto[] = []
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.')) continue
    const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase()
    if (!SUPPORTED_EXT.includes(ext)) continue
    const path = join(folder, e.name)
    const { size } = await stat(path)
    const known = byPath.get(path) ?? byNameSize.get(`${e.name.toLowerCase()}|${size}`)
    photos.push({ path, name: e.name, size, photo_id: known?.id ?? null, session_title: known?.session_title ?? null })
  }
  photos.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
  return { folder, photos }
}

export function registerFolderIpc(db: DB, storage: LocalStorage): void {
  cacheDir = join(app.getPath('userData'), 'thumb-cache')
  mkdir(cacheDir, { recursive: true }).catch(() => undefined)

  // Miniaturas de archivos que todavía no están en la biblioteca, generadas a demanda.
  protocol.handle('fotodir', async (req) => {
    try {
      const url = new URL(req.url)
      const px = SIZES[url.host] ?? SIZES.thumb
      const file = decodeURIComponent(url.pathname.slice(1))
      const { mtimeMs, size } = await stat(file)
      const cached = cachePath(file, mtimeMs, size, px)
      if (!existsSync(cached)) await imageJob({ op: 'thumb', src: file, dest: cached, px })
      return net.fetch(pathToFileURL(cached).toString())
    } catch {
      return new Response('No se pudo leer la miniatura', { status: 404 })
    }
  })

  ipcMain.handle('folder:choose', async (e, sessionId: number | null) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showOpenDialog(win, {
      title: 'Elegir la carpeta con las fotos',
      properties: ['openDirectory'],
      buttonLabel: 'Abrir carpeta'
    })
    if (res.canceled || !res.filePaths[0]) return null
    return listFolder(db, res.filePaths[0], sessionId ?? null)
  })

  ipcMain.handle('folder:reopen', (_e, folder: string, sessionId: number | null) => listFolder(db, folder, sessionId))

  ipcMain.handle('folder:add', async (e, opts: AddFromFolderOptions) => {
    if (!opts.paths?.length) throw new Error('No hay fotos seleccionadas')
    const invalid = opts.paths.find((p) => !existsSync(p))
    if (invalid) throw new Error(`No se encuentra el archivo ${basename(invalid)}`)
    return importPhotos(db, storage, opts.sessionId, opts.dayId, opts.paths,
      (p) => e.sender.send('folder:progress', p),
      { copy: opts.copy, runType: opts.runType, pilotId: opts.pilotId })
  })
}
