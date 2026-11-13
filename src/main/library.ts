import { BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { join, parse } from 'node:path'
import type { SQLInputValue } from 'node:sqlite'
import type { CopyOptions, LibraryFilter, LibrarySort, Photo } from '../shared/types'
import type { DB } from './db'
import { like, withPilots, withTags } from './ipc'
import { originalPath, type LocalStorage } from './storage'

const ORDER: Record<LibrarySort, string> = {
  date_desc: 'COALESCE(p.taken_at, s.date, p.created_at) DESC, p.id DESC',
  date_asc: 'COALESCE(p.taken_at, s.date, p.created_at) ASC, p.id ASC',
  rating: 'p.rating DESC, COALESCE(p.taken_at, p.created_at) DESC, p.id DESC',
  session: 's.date IS NULL, s.date DESC, s.id DESC, p.taken_at, p.file_name',
  name: 'p.file_name COLLATE NOCASE, p.id'
}

/** Icono que acompaña al cursor al arrastrar fotos fuera de la app. */
let dragIcon: Electron.NativeImage | null = null
const DRAG_ICON_URL = ('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAACmElEQVR4nO2aQWsTQRTH96QfQpBW6MYeQlN1xVS6nQnUKnqQpjkInjwo2mz9AFXPtfUikoiXUp05+TGMbe2pHjzM9Gj9ApLeR95iShBJs7uzmZnN+8MflkCW937z3szs7ngeCoVCoVDWSjJyV3DyS3KqBllweix47Y5XNAlOj89K/hQCoz+9okkOmXzPXtEkEQBFANIkgKO3t89LTtYEp98kJydJAxq9yUkcK6MRxJ4peblTuyA4+W4+qXQWjB5CDqlHXjicfD+EVJUgOVkzHbw2f6o1EwMQjBwYD1xXFXC6n7wCGO2aDlybGe0mB8AtCFyjEUBSyRyC6LTm1etmoJYXy2ru2rTyfT82XMNvm1GgOq2weAB226F62qioyUu+ujgxNdATk756eG9GfXkXFgPA9npVlfyzE//X8J+dFzfcBrCxGsQjmjT5/mqAezgJYHu9min5fgg6KmGkAL62w1RlP6gd9tqhOwAeL1e0Jd/zk/qMGwA6rfmhZvukhntCZVkPYGM10J58z1vN6/YDqC+WcwOwslS2H0D1ynRuAGDHaD2AksbZ/3+rwVgDuFwq2Q9g7mp+LXAzcKAF6uM+CW5G+S2Db6LAfgCdVpjTRmjKjY2QhK3wiv6t8LNGJXU8Iwewq/lhCGb//fcL7gCQnCr+qqqlFZx8HJYaX4jAO0QdsRgBIDmNRy9NO0DZf3xZ1RKDUQCSU3XwYUE9fzAbz+TDjPqj+5XMPW8VAPnXsIzBI239Vjne1UFlgOEaNjlbUZBpqbMegDRoBDDOH0cFJ78TAxD4eZxGpgM3ekDiCI7IwBkb10ef0cMfnxvnEgM4PSTlMIRMh6R6AnpQQtBHTkyMjHYFI3sQc+qRR6FQKBQKhUKhUF7R9Qf3qW38AEth/gAAAABJRU5ErkJggg==')

function where(f: LibraryFilter): { sql: string; params: SQLInputValue[] } {
  const w: string[] = []
  const params: SQLInputValue[] = []
  const ids = (f.sessionIds ?? []).filter((n) => Number.isInteger(n))
  if (ids.length) { w.push(`p.session_id IN (${ids.map(() => '?').join(',')})`); params.push(...ids) }
  if (f.clientId) { w.push('s.client_id = ?'); params.push(f.clientId) }
  if (f.pilotId) { w.push('EXISTS (SELECT 1 FROM photo_pilots pp WHERE pp.photo_id = p.id AND pp.client_id = ?)'); params.push(f.pilotId) }
  if (f.flag === 'pick') w.push("p.flag = 'pick'")
  else if (f.flag === 'reject') w.push("p.flag = 'reject'")
  else if (f.flag === 'none') w.push('p.flag IS NULL')
  else if (f.flag === 'client') w.push('p.client_pick = 1')
  if (f.minRating) { w.push('p.rating >= ?'); params.push(f.minRating) }
  if (f.ext === 'raw') w.push('p.is_raw = 1')
  else if (f.ext) { w.push('p.ext = ?'); params.push(f.ext) }
  if (f.tag) { w.push('EXISTS (SELECT 1 FROM photo_tags t WHERE t.photo_id = p.id AND t.tag = ?)'); params.push(f.tag) }
  if (f.q?.trim()) {
    const q = like(f.q.trim())
    w.push(`(p.file_name LIKE ? ESCAPE '\\' OR p.camera LIKE ? ESCAPE '\\' OR p.lens LIKE ? ESCAPE '\\' OR s.title LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM photo_tags t WHERE t.photo_id = p.id AND t.tag LIKE ? ESCAPE '\\'))`)
    params.push(q, q, q, q, q)
  }
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', params }
}

const FROM = 'FROM photos p JOIN sessions s ON s.id = p.session_id LEFT JOIN clients c ON c.id = s.client_id'

/** Nombre libre en la carpeta de destino: IMG_1.jpg, IMG_1 (2).jpg… */
async function freeName(folder: string, name: string, taken: Set<string>): Promise<string> {
  const { name: base, ext } = parse(name)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : `${base} (${n})${ext}`
    if (taken.has(candidate.toLowerCase())) continue
    const exists = await stat(join(folder, candidate)).then(() => true, () => false)
    if (!exists) { taken.add(candidate.toLowerCase()); return candidate }
  }
}
const safeFolderName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'Sesión'

export function registerLibraryIpc(db: DB, storage: LocalStorage): void {
  ipcMain.handle('library:query', (_e, f: LibraryFilter, offset: number, limit: number) => {
    const { sql, params } = where(f)
    const total = Number((db.prepare(`SELECT COUNT(*) AS n ${FROM} ${sql}`).get(...params) as { n: number }).n)
    const rows = db.prepare(`
      SELECT p.*, s.title AS session_title, s.date AS session_date, c.name AS client_name,
        (SELECT group_concat(t.tag, char(31)) FROM photo_tags t WHERE t.photo_id = p.id) AS tags_raw
      ${FROM} ${sql} ORDER BY ${ORDER[f.sort ?? 'date_desc'] ?? ORDER.date_desc}
      LIMIT ? OFFSET ?`).all(...params, Math.min(Math.max(1, limit), 1000), Math.max(0, offset))
    return { total, photos: withPilots(db, rows.map((r) => withTags(r)) as { id: number }[]) }
  })

  ipcMain.handle('library:ids', (_e, f: LibraryFilter) => {
    const { sql, params } = where(f)
    return db.prepare(`SELECT p.id ${FROM} ${sql} ORDER BY ${ORDER[f.sort ?? 'date_desc'] ?? ORDER.date_desc}`).all(...params).map((r) => Number(r.id))
  })

  const loadPhotos = (ids: number[]) => {
    const get = db.prepare('SELECT p.*, s.title AS session_title FROM photos p JOIN sessions s ON s.id = p.session_id WHERE p.id = ?')
    return ids.map((id) => get.get(id) as unknown as (Photo & { session_title: string }) | undefined).filter((p) => !!p)
  }

  ipcMain.handle('library:copyTo', async (e, ids: number[], opts: CopyOptions) => {
    const photos = loadPhotos(ids)
    if (!photos.length) throw new Error('No hay fotos seleccionadas')
    const win = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showOpenDialog(win, {
      title: `Copiar ${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'} a…`,
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    const folder = res.filePaths[0]
    const taken = new Map<string, Set<string>>()
    let done = 0
    for (const p of photos) {
      const dir = opts.bySession ? join(folder, safeFolderName(p.session_title)) : folder
      await mkdir(dir, { recursive: true })
      if (!taken.has(dir)) taken.set(dir, new Set())
      const name = await freeName(dir, p.file_name, taken.get(dir)!)
      await copyFile(originalPath(storage, p), join(dir, name))
      done++
      if (done % 5 === 0 || done === photos.length) e.sender.send('library:copy-progress', { done, total: photos.length })
    }
    return { copied: done, folder }
  })

  // Arrastrar fotos seleccionadas fuera de la app (Explorador, escritorio, correo…).
  ipcMain.on('library:startDrag', (e, ids: number[]) => {
    const files = loadPhotos(ids.slice(0, 500)).map((p) => originalPath(storage, p))
    if (!files.length) return
    dragIcon ??= nativeImage.createFromDataURL(DRAG_ICON_URL)
    e.sender.startDrag({ file: files[0], files, icon: dragIcon })
  })
}
