import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ClientInput, Photo, PhotoPatch, SessionInput, SessionStatus } from '../shared/types'
import { SESSION_STATUSES } from '../shared/types'
import type { SQLInputValue } from 'node:sqlite'
import { transaction, type DB } from './db'
import { collectFiles, importPhotos, SUPPORTED_EXT } from './importer'
import { LocalStorage, sessionKey } from './storage'

const SESSION_SELECT = `
  SELECT s.*, c.name AS client_name,
    (SELECT COUNT(*) FROM photos p WHERE p.session_id = s.id) AS photo_count,
    (SELECT COUNT(*) FROM photos p WHERE p.session_id = s.id AND p.flag = 'pick') AS pick_count,
    (SELECT p.thumb_key FROM photos p WHERE p.session_id = s.id
       ORDER BY (p.flag = 'pick') DESC, p.rating DESC, p.id LIMIT 1) AS cover_key
  FROM sessions s LEFT JOIN clients c ON c.id = s.client_id`

const nullIfEmpty = (v: string | null | undefined): string | null => (v === '' || v === undefined ? null : v)

export function registerIpc(db: DB, storage: LocalStorage): void {
  // ---------- Clientes ----------
  ipcMain.handle('clients:list', () =>
    db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM sessions s WHERE s.client_id = c.id) AS session_count
                FROM clients c ORDER BY c.name COLLATE NOCASE`).all()
  )
  ipcMain.handle('clients:save', (_e, c: ClientInput) => {
    if (!c.name?.trim()) throw new Error('El nombre del cliente es obligatorio')
    const row = { name: c.name.trim(), email: nullIfEmpty(c.email), phone: nullIfEmpty(c.phone), notes: nullIfEmpty(c.notes) }
    let id = c.id
    if (id) db.prepare('UPDATE clients SET name=@name, email=@email, phone=@phone, notes=@notes WHERE id=@id').run({ ...row, id })
    else id = Number(db.prepare('INSERT INTO clients (name, email, phone, notes) VALUES (@name, @email, @phone, @notes)').run(row).lastInsertRowid)
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id)
  })
  ipcMain.handle('clients:remove', (_e, id: number) => {
    db.prepare('DELETE FROM clients WHERE id = ?').run(id)
  })

  // ---------- Sesiones ----------
  ipcMain.handle('sessions:list', (_e, filter: { clientId?: number; status?: SessionStatus } = {}) => {
    const where: string[] = []
    const params: SQLInputValue[] = []
    if (filter.clientId) { where.push('s.client_id = ?'); params.push(filter.clientId) }
    if (filter.status) { where.push('s.status = ?'); params.push(filter.status) }
    const sql = `${SESSION_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY s.date IS NULL, s.date DESC, s.id DESC`
    return db.prepare(sql).all(...params)
  })
  ipcMain.handle('sessions:get', (_e, id: number) => db.prepare(`${SESSION_SELECT} WHERE s.id = ?`).get(id) ?? null)
  ipcMain.handle('sessions:save', (_e, s: SessionInput) => {
    if (!s.title?.trim()) throw new Error('El título de la sesión es obligatorio')
    if (!SESSION_STATUSES.includes(s.status)) throw new Error(`Estado no válido: ${s.status}`)
    const row = {
      client_id: s.client_id || null,
      title: s.title.trim(),
      type: nullIfEmpty(s.type),
      date: nullIfEmpty(s.date),
      location: nullIfEmpty(s.location),
      status: s.status,
      price: s.price === null || s.price === undefined || Number.isNaN(s.price) ? null : Number(s.price),
      notes: nullIfEmpty(s.notes)
    }
    let id = s.id
    if (id) {
      db.prepare(`UPDATE sessions SET client_id=@client_id, title=@title, type=@type, date=@date, location=@location,
                  status=@status, price=@price, notes=@notes WHERE id=@id`).run({ ...row, id })
    } else {
      id = Number(db.prepare(`INSERT INTO sessions (client_id, title, type, date, location, status, price, notes)
                  VALUES (@client_id, @title, @type, @date, @location, @status, @price, @notes)`).run(row).lastInsertRowid)
    }
    return db.prepare(`${SESSION_SELECT} WHERE s.id = ?`).get(id)
  })
  ipcMain.handle('sessions:remove', async (_e, id: number) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    await storage.remove(sessionKey(id)).catch(() => undefined)
  })

  // ---------- Fotos ----------
  ipcMain.handle('photos:list', (_e, sessionId: number) =>
    db.prepare('SELECT * FROM photos WHERE session_id = ? ORDER BY taken_at IS NULL, taken_at, file_name').all(sessionId)
  )
  ipcMain.handle('photos:update', (_e, ids: number[], patch: PhotoPatch) => {
    const sets: string[] = []
    const params: Record<string, SQLInputValue> = {}
    if (patch.rating !== undefined) {
      if (!Number.isInteger(patch.rating) || patch.rating < 0 || patch.rating > 5) throw new Error('Valoración no válida')
      sets.push('rating = @rating'); params.rating = patch.rating
    }
    if (patch.flag !== undefined) {
      if (![null, 'pick', 'reject'].includes(patch.flag)) throw new Error('Marca no válida')
      sets.push('flag = @flag'); params.flag = patch.flag
    }
    if (!sets.length || !ids.length) return
    const stmt = db.prepare(`UPDATE photos SET ${sets.join(', ')} WHERE id = @id`)
    transaction(db, () => ids.forEach((id) => stmt.run({ ...params, id })))
  })
  ipcMain.handle('photos:remove', async (_e, ids: number[]) => {
    const get = db.prepare('SELECT * FROM photos WHERE id = ?')
    const del = db.prepare('DELETE FROM photos WHERE id = ?')
    for (const id of ids) {
      const p = get.get(id) as Photo | undefined
      if (!p) continue
      del.run(id)
      await Promise.all([p.original_key, p.thumb_key, p.preview_key].map((k) => storage.remove(k)))
    }
  })
  ipcMain.handle('photos:import', async (e, sessionId: number) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showOpenDialog(win, {
      title: 'Importar fotografías',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [{ name: 'Imágenes', extensions: SUPPORTED_EXT.map((x) => x.slice(1)) }]
    })
    if (res.canceled || !res.filePaths.length) return null
    const files = await collectFiles(res.filePaths)
    return importPhotos(db, storage, sessionId, files, (p) => e.sender.send('photos:import-progress', p))
  })
  ipcMain.handle('photos:exportPicks', async (e, sessionId: number) => {
    const picks = db.prepare("SELECT * FROM photos WHERE session_id = ? AND flag = 'pick' ORDER BY file_name").all(sessionId) as unknown as Photo[]
    if (!picks.length) throw new Error('No hay fotos seleccionadas (marca alguna con P)')
    const win = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showOpenDialog(win, { title: 'Carpeta de destino', properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    const folder = res.filePaths[0]
    await mkdir(folder, { recursive: true })
    for (const p of picks) await copyFile(storage.resolve(p.original_key), join(folder, p.original_key.split('/').pop()!))
    return { exported: picks.length, folder }
  })
  ipcMain.handle('photos:reveal', (_e, id: number) => {
    const p = db.prepare('SELECT original_key FROM photos WHERE id = ?').get(id) as Pick<Photo, 'original_key'> | undefined
    if (p) shell.showItemInFolder(storage.resolve(p.original_key))
  })

  // ---------- Panel ----------
  ipcMain.handle('stats', () => {
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n
    return {
      clients: count('SELECT COUNT(*) AS n FROM clients'),
      sessions: count('SELECT COUNT(*) AS n FROM sessions'),
      photos: count('SELECT COUNT(*) AS n FROM photos'),
      pendingDelivery: count("SELECT COUNT(*) AS n FROM sessions WHERE status IN ('realizada','editando')"),
      upcoming: db.prepare(`${SESSION_SELECT} WHERE s.date >= date('now') ORDER BY s.date LIMIT 5`).all()
    }
  })
}
