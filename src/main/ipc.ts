import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SQLInputValue } from 'node:sqlite'
import type { ClientInput, Photo, PhotoPatch, SessionInput, SessionStatus } from '../shared/types'
import { SESSION_STATUSES } from '../shared/types'
import { transaction, type DB } from './db'
import { registerGalleryIpc } from './gallery'
import { collectFiles, importPhotos, SUPPORTED_EXT } from './importer'
import { registerInvoiceIpc } from './invoices'
import { registerLibraryIpc } from './library'
import { registerSettingsIpc } from './settings'
import { LocalStorage, sessionKey } from './storage'

const SEP = String.fromCharCode(31) // separador para group_concat de etiquetas

export const SESSION_SELECT = `
  SELECT s.*, c.name AS client_name,
    (SELECT COUNT(*) FROM photos p WHERE p.session_id = s.id) AS photo_count,
    (SELECT COUNT(*) FROM photos p WHERE p.session_id = s.id AND p.flag = 'pick') AS pick_count,
    (SELECT COUNT(*) FROM photos p WHERE p.session_id = s.id AND p.client_pick = 1) AS client_pick_count,
    (SELECT p.thumb_key FROM photos p WHERE p.session_id = s.id
       ORDER BY (p.flag = 'pick') DESC, p.rating DESC, p.id LIMIT 1) AS cover_key,
    (SELECT group_concat(t.tag, char(31)) FROM session_tags t WHERE t.session_id = s.id) AS tags_raw
  FROM sessions s LEFT JOIN clients c ON c.id = s.client_id`

export const PHOTO_SELECT = `
  SELECT p.*, (SELECT group_concat(t.tag, char(31)) FROM photo_tags t WHERE t.photo_id = p.id) AS tags_raw
  FROM photos p`

type Row = Record<string, unknown>
/** Convierte la columna tags_raw en un array ordenado. */
export function withTags<T>(row: Row | undefined): T {
  if (!row) return row as T
  const { tags_raw, ...rest } = row
  return { ...rest, tags: tags_raw ? String(tags_raw).split(SEP).sort((a, b) => a.localeCompare(b)) : [] } as T
}

const nullIfEmpty = (v: string | null | undefined): string | null => (v === '' || v === undefined ? null : v)
export const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`

export function normalizeTags(tags: string[]): string[] {
  const seen = new Map<string, string>()
  for (const t of tags) {
    const clean = t.trim().replace(/\s+/g, ' ').slice(0, 40)
    if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean)
  }
  return [...seen.values()]
}

export function registerIpc(db: DB, storage: LocalStorage): void {
  const getSession = (id: number) => withTags(db.prepare(`${SESSION_SELECT} WHERE s.id = ?`).get(id))

  // ---------- Clientes ----------
  ipcMain.handle('clients:list', () =>
    db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM sessions s WHERE s.client_id = c.id) AS session_count
                FROM clients c ORDER BY c.name COLLATE NOCASE`).all()
  )
  ipcMain.handle('clients:save', (_e, c: ClientInput) => {
    if (!c.name?.trim()) throw new Error('El nombre del cliente es obligatorio')
    const row = {
      name: c.name.trim(), email: nullIfEmpty(c.email), phone: nullIfEmpty(c.phone), notes: nullIfEmpty(c.notes),
      tax_id: nullIfEmpty(c.tax_id), address: nullIfEmpty(c.address)
    }
    let id = c.id
    if (id) db.prepare('UPDATE clients SET name=@name, email=@email, phone=@phone, notes=@notes, tax_id=@tax_id, address=@address WHERE id=@id').run({ ...row, id })
    else id = Number(db.prepare('INSERT INTO clients (name, email, phone, notes, tax_id, address) VALUES (@name, @email, @phone, @notes, @tax_id, @address)').run(row).lastInsertRowid)
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
    return db.prepare(sql).all(...params).map((r) => withTags(r))
  })
  ipcMain.handle('sessions:get', (_e, id: number) => getSession(id) ?? null)
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
    return transaction(db, () => {
      let id = s.id
      if (id) {
        db.prepare(`UPDATE sessions SET client_id=@client_id, title=@title, type=@type, date=@date, location=@location,
                    status=@status, price=@price, notes=@notes WHERE id=@id`).run({ ...row, id })
      } else {
        id = Number(db.prepare(`INSERT INTO sessions (client_id, title, type, date, location, status, price, notes)
                    VALUES (@client_id, @title, @type, @date, @location, @status, @price, @notes)`).run(row).lastInsertRowid)
      }
      db.prepare('DELETE FROM session_tags WHERE session_id = ?').run(id)
      const ins = db.prepare('INSERT INTO session_tags (session_id, tag) VALUES (?, ?)')
      for (const t of normalizeTags(s.tags ?? [])) ins.run(id, t)
      return getSession(id)
    })
  })
  ipcMain.handle('sessions:remove', async (_e, id: number) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    await storage.remove(sessionKey(id)).catch(() => undefined)
  })

  // ---------- Fotos ----------
  ipcMain.handle('photos:list', (_e, sessionId: number) =>
    db.prepare(`${PHOTO_SELECT} WHERE p.session_id = ? ORDER BY p.taken_at IS NULL, p.taken_at, p.file_name`).all(sessionId).map((r) => withTags(r))
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
    if (patch.client_pick !== undefined) {
      sets.push('client_pick = @client_pick'); params.client_pick = patch.client_pick ? 1 : 0
    }
    if (!sets.length || !ids.length) return
    const stmt = db.prepare(`UPDATE photos SET ${sets.join(', ')} WHERE id = @id`)
    transaction(db, () => ids.forEach((id) => stmt.run({ ...params, id })))
  })
  ipcMain.handle('photos:addTag', (_e, ids: number[], tag: string) => {
    const [clean] = normalizeTags([tag])
    if (!clean) throw new Error('Etiqueta vacía')
    const stmt = db.prepare('INSERT OR IGNORE INTO photo_tags (photo_id, tag) VALUES (?, ?)')
    transaction(db, () => ids.forEach((id) => stmt.run(id, clean)))
  })
  ipcMain.handle('photos:removeTag', (_e, ids: number[], tag: string) => {
    const stmt = db.prepare('DELETE FROM photo_tags WHERE photo_id = ? AND tag = ?')
    transaction(db, () => ids.forEach((id) => stmt.run(id, tag)))
  })
  ipcMain.handle('photos:remove', async (_e, ids: number[]) => {
    const get = db.prepare('SELECT * FROM photos WHERE id = ?')
    const del = db.prepare('DELETE FROM photos WHERE id = ?')
    for (const id of ids) {
      const p = get.get(id) as unknown as Photo | undefined
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
      filters: [
        { name: 'Imágenes y RAW', extensions: SUPPORTED_EXT.map((x) => x.slice(1)) },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
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
    const p = db.prepare('SELECT original_key FROM photos WHERE id = ?').get(id) as { original_key: string } | undefined
    if (p) shell.showItemInFolder(storage.resolve(p.original_key))
  })

  // ---------- Etiquetas y búsqueda ----------
  ipcMain.handle('tags', () =>
    db.prepare(`SELECT tag FROM (SELECT tag FROM photo_tags UNION SELECT tag FROM session_tags) ORDER BY tag COLLATE NOCASE`)
      .all().map((r) => String(r.tag))
  )
  ipcMain.handle('search', (_e, q: string) => {
    const term = q.trim()
    if (!term) return { clients: [], sessions: [], photos: [] }
    const p = like(term)
    const clients = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM sessions s WHERE s.client_id = c.id) AS session_count
      FROM clients c WHERE c.name LIKE ?1 ESCAPE '\\' OR c.email LIKE ?1 ESCAPE '\\' OR c.phone LIKE ?1 ESCAPE '\\'
        OR c.tax_id LIKE ?1 ESCAPE '\\' OR c.notes LIKE ?1 ESCAPE '\\'
      ORDER BY c.name COLLATE NOCASE LIMIT 30`).all(p)
    const sessions = db.prepare(`${SESSION_SELECT}
      WHERE s.title LIKE ?1 ESCAPE '\\' OR s.location LIKE ?1 ESCAPE '\\' OR s.type LIKE ?1 ESCAPE '\\' OR s.notes LIKE ?1 ESCAPE '\\'
        OR c.name LIKE ?1 ESCAPE '\\' OR EXISTS (SELECT 1 FROM session_tags t WHERE t.session_id = s.id AND t.tag LIKE ?1 ESCAPE '\\')
      ORDER BY s.date DESC LIMIT 30`).all(p).map((r) => withTags(r))
    const photos = db.prepare(`
      SELECT p.*, s.title AS session_title,
        (SELECT group_concat(t.tag, char(31)) FROM photo_tags t WHERE t.photo_id = p.id) AS tags_raw
      FROM photos p JOIN sessions s ON s.id = p.session_id
      WHERE p.file_name LIKE ?1 ESCAPE '\\' OR p.camera LIKE ?1 ESCAPE '\\' OR p.lens LIKE ?1 ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM photo_tags t WHERE t.photo_id = p.id AND t.tag LIKE ?1 ESCAPE '\\')
      ORDER BY p.rating DESC, p.id DESC LIMIT 120`).all(p).map((r) => withTags(r))
    return { clients, sessions, photos }
  })

  // ---------- Panel ----------
  ipcMain.handle('stats', () => {
    const num = (sql: string) => Number((db.prepare(sql).get() as { n: number | null }).n ?? 0)
    const invoiceTotal = `(SELECT COALESCE(SUM(it.quantity * it.unit_price), 0) FROM invoice_items it WHERE it.invoice_id = i.id)
                          * (1 + i.tax_rate / 100.0 - i.irpf_rate / 100.0)`
    return {
      clients: num('SELECT COUNT(*) AS n FROM clients'),
      sessions: num('SELECT COUNT(*) AS n FROM sessions'),
      photos: num('SELECT COUNT(*) AS n FROM photos'),
      pendingDelivery: num("SELECT COUNT(*) AS n FROM sessions WHERE status IN ('realizada','editando')"),
      upcoming: db.prepare(`${SESSION_SELECT} WHERE s.date >= date('now', 'localtime') ORDER BY s.date LIMIT 6`).all().map((r) => withTags(r)),
      pendingInvoices: num("SELECT COUNT(*) AS n FROM invoices WHERE kind = 'factura' AND status = 'enviada'"),
      pendingAmount: num(`SELECT SUM(${invoiceTotal}) AS n FROM invoices i WHERE kind = 'factura' AND status = 'enviada'`),
      invoicedThisYear: num(`SELECT SUM(${invoiceTotal}) AS n FROM invoices i WHERE kind = 'factura' AND status IN ('enviada','pagada')
                             AND strftime('%Y', issue_date) = strftime('%Y', 'now', 'localtime')`)
    }
  })

  registerSettingsIpc(db)
  registerInvoiceIpc(db)
  registerGalleryIpc(db, storage)
  registerLibraryIpc(db, storage)
}
