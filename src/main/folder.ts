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
const thumbPath = (file: string, mtimeMs: number, size: number) =>
  join(cacheDir, createHash('sha1').update(`${file}|${mtimeMs}|${size}`).digest('hex') + '.webp')

/** Fotos de una carpeta (sin entrar en subcarpetas), marcando las que ya están en el evento. */
async function listFolder(db: DB, folder: string, sessionId: number): Promise<FolderListing> {
  const entries = await readdir(folder, { withFileTypes: true })
  const rows = db.prepare('SELECT id, file_name, file_size, external_path FROM photos WHERE session_id = ?')
    .all(sessionId) as { id: number; file_name: string; file_size: number; external_path: string | null }[]
  const byPath = new Map(rows.filter((r) => r.external_path).map((r) => [r.external_path as string, r.id]))
  const byNameSize = new Map(rows.map((r) => [`${r.file_name.toLowerCase()}|${r.file_size}`, r.id]))

  const photos: FolderPhoto[] = []
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.')) continue
    const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase()
    if (!SUPPORTED_EXT.includes(ext)) continue
    const path = join(folder, e.name)
    const { size } = await stat(path)
    photos.push({
      path,
      name: e.name,
      size,
      photo_id: byPath.get(path) ?? byNameSize.get(`${e.name.toLowerCase()}|${size}`) ?? null
    })
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
      const file = decodeURIComponent(new URL(req.url).pathname.slice(1))
      const { mtimeMs, size } = await stat(file)
      const cached = thumbPath(file, mtimeMs, size)
      if (!existsSync(cached)) await imageJob({ op: 'thumb', src: file, dest: cached })
      return net.fetch(pathToFileURL(cached).toString())
    } catch {
      return new Response('No se pudo leer la miniatura', { status: 404 })
    }
  })

  ipcMain.handle('folder:choose', async (e, sessionId: number) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showOpenDialog(win, {
      title: 'Elegir la carpeta con las fotos',
      properties: ['openDirectory'],
      buttonLabel: 'Abrir carpeta'
    })
    if (res.canceled || !res.filePaths[0]) return null
    return listFolder(db, res.filePaths[0], sessionId)
  })

  ipcMain.handle('folder:reopen', (_e, folder: string, sessionId: number) => listFolder(db, folder, sessionId))

  ipcMain.handle('folder:add', async (e, opts: AddFromFolderOptions) => {
    if (!opts.paths?.length) throw new Error('No hay fotos seleccionadas')
    const invalid = opts.paths.find((p) => !existsSync(p))
    if (invalid) throw new Error(`No se encuentra el archivo ${basename(invalid)}`)
    return importPhotos(db, storage, opts.sessionId, opts.dayId, opts.paths,
      (p) => e.sender.send('folder:progress', p),
      { copy: opts.copy, runType: opts.runType, pilotId: opts.pilotId })
  })
}
