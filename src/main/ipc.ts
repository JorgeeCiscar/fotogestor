import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SQLInputValue } from 'node:sqlite'
import type { ClientInput, EventDayInput, Photo, PhotoPatch, SessionInput, SessionStatus, TariffInput, TariffMode } from '../shared/types'
import { CLIENT_KINDS, PILOT_FIELDS, RACE_TYPE, SESSION_STATUSES, TEAM_FIELDS } from '../shared/types'
import { transaction, type DB } from './db'
import { CONTACT_SELECT, registerContactsIpc, findCircuitByName } from './contacts'
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
    (SELECT group_concat(t.tag, char(31)) FROM session_tags t WHERE t.session_id = s.id) AS tags_raw,
    (SELECT n.name FROM contacts n WHERE n.id = s.circuit_id) AS circuit_name,
    (SELECT n.name FROM contacts n WHERE n.id = s.organizer_id) AS organizer_name
  FROM sessions s LEFT JOIN clients c ON c.id = s.client_id`

export const PHOTO_SELECT = `
  SELECT p.*, (SELECT group_concat(t.tag, char(31)) FROM photo_tags t WHERE t.photo_id = p.id) AS tags_raw
  FROM photos p`

/** Pilotos asignados a cada foto, agrupados por foto. */
export function pilotsByPhoto(db: DB, photoIds: number[]): Map<number, { id: number; name: string; racing_number: string | null }[]> {
  const out = new Map<number, { id: number; name: string; racing_number: string | null }[]>()
  if (!photoIds.length) return out
  const rows = db.prepare(`SELECT pp.photo_id, c.id, c.name, c.racing_number
    FROM photo_pilots pp JOIN clients c ON c.id = pp.client_id
    WHERE pp.photo_id IN (${photoIds.map(() => '?').join(',')})
    ORDER BY CAST(c.racing_number AS INTEGER), c.name COLLATE NOCASE`).all(...photoIds) as
    { photo_id: number; id: number; name: string; racing_number: string | null }[]
  for (const r of rows) {
    const list = out.get(r.photo_id) ?? []
    list.push({ id: r.id, name: r.name, racing_number: r.racing_number })
    out.set(r.photo_id, list)
  }
  return out
}

/** Añade a cada foto sus pilotos (una sola consulta para todas). */
export function withPilots<T extends { id: number }>(db: DB, photos: T[]): (T & { pilots: unknown[] })[] {
  const map = pilotsByPhoto(db, photos.map((p) => p.id))
  return photos.map((p) => ({ ...p, pilots: map.get(p.id) ?? [] }))
}

type Row = Record<string, unknown>
/** Convierte la columna tags_raw en un array ordenado. */
export function withTags<T>(row: Row | undefined): T {
  if (!row) return row as T
  const { tags_raw, ...rest } = row
  return { ...rest, tags: tags_raw ? String(tags_raw).split(SEP).sort((a, b) => a.localeCompare(b)) : [] } as T
}

export const nullIfEmpty = (v: string | null | undefined): string | null => {
  if (v === undefined || v === null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

export const CLIENT_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM sessions s WHERE s.client_id = c.id) AS session_count,
    (SELECT t.name FROM clients t WHERE t.id = c.team_id) AS team_name,
    (SELECT COUNT(*) FROM clients p WHERE p.team_id = c.id) AS pilot_count,
    (SELECT group_concat(name, ', ') FROM (SELECT p.name FROM clients p WHERE p.team_id = c.id ORDER BY p.name COLLATE NOCASE)) AS pilot_names
  FROM clients c`

const COMMON_FIELDS = ['name', 'email', 'phone', 'instagram', 'notes', 'tax_id', 'address'] as const
const ALL_KIND_FIELDS = [...new Set<string>([...PILOT_FIELDS, ...TEAM_FIELDS])]

export function saveClient(db: DB, c: ClientInput) {
  if (!CLIENT_KINDS.includes(c.kind)) throw new Error('Indica si el cliente es piloto, equipo o particular')
  if (!c.name?.trim()) throw new Error(c.kind === 'equipo' ? 'El nombre del equipo es obligatorio' : 'El nombre es obligatorio')
  if (c.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(c.birth_date)) throw new Error('Fecha de nacimiento no válida')
  const own: readonly string[] = c.kind === 'piloto' ? PILOT_FIELDS : c.kind === 'equipo' ? TEAM_FIELDS : []
  const row: Record<string, SQLInputValue> = { kind: c.kind }
  for (const f of COMMON_FIELDS) row[f] = nullIfEmpty(c[f])
  // Solo se guardan los datos propios del tipo; los de otros tipos se vacían.
  for (const f of ALL_KIND_FIELDS) row[f] = own.includes(f) ? (f === 'team_id' ? null : nullIfEmpty(c[f as keyof ClientInput] as string)) : null
  if (row.instagram) row.instagram = String(row.instagram).replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '') || null
  if (c.kind === 'piloto' && c.team_id) {
    const team = db.prepare('SELECT id, kind FROM clients WHERE id = ?').get(c.team_id) as { id: number; kind: string } | undefined
    if (!team || team.kind !== 'equipo') throw new Error('El equipo elegido no existe')
    if (c.id && team.id === c.id) throw new Error('Un piloto no puede ser su propio equipo')
    row.team_id = team.id
  }
  return transaction(db, () => {
    let id = c.id
    const cols = Object.keys(row)
    if (id) {
      db.prepare(`UPDATE clients SET ${cols.map((k) => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...row, id })
      // Si deja de ser equipo, sus pilotos se quedan sin equipo asignado.
      if (c.kind !== 'equipo') db.prepare('UPDATE clients SET team_id = NULL WHERE team_id = ?').run(id)
    } else {
      id = Number(db.prepare(`INSERT INTO clients (${cols.join(', ')}) VALUES (${cols.map((k) => '@' + k).join(', ')})`).run(row).lastInsertRowid)
    }
    return db.prepare(`${CLIENT_SELECT} WHERE c.id = ?`).get(id)
  })
}
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
  const getSession = (id: number) => {
    const row = db.prepare(`${SESSION_SELECT} WHERE s.id = ?`).get(id)
    if (!row) return row
    const items = db.prepare('SELECT id, description, quantity, unit_price FROM session_items WHERE session_id = ? ORDER BY position').all(id)
    return { ...(withTags(row) as object), items }
  }

  // ---------- Clientes ----------
  ipcMain.handle('clients:list', () => db.prepare(`${CLIENT_SELECT} ORDER BY c.name COLLATE NOCASE`).all())
  ipcMain.handle('clients:get', (_e, id: number) => {
    const client = db.prepare(`${CLIENT_SELECT} WHERE c.id = ?`).get(id)
    if (!client) return null
    const pilots = db.prepare(`SELECT id, name, racing_number FROM clients WHERE team_id = ?
                               ORDER BY CAST(racing_number AS INTEGER), name COLLATE NOCASE`).all(id)
    return { ...client, pilots }
  })
  ipcMain.handle('clients:save', (_e, c: ClientInput) => saveClient(db, c))
  ipcMain.handle('clients:remove', (_e, id: number) => {
    db.prepare('DELETE FROM clients WHERE id = ?').run(id)
  })

  // ---------- Sesiones ----------
  ipcMain.handle('championships', () =>
    db.prepare("SELECT DISTINCT championship FROM sessions WHERE championship IS NOT NULL AND championship <> '' ORDER BY championship COLLATE NOCASE")
      .all().map((r) => String(r.championship)))

  ipcMain.handle('sessions:list', (_e, filter: { clientId?: number; status?: SessionStatus; championship?: string } = {}) => {
    const where: string[] = []
    const params: SQLInputValue[] = []
    if (filter.clientId) { where.push('s.client_id = ?'); params.push(filter.clientId) }
    if (filter.status) { where.push('s.status = ?'); params.push(filter.status) }
    if (filter.championship) { where.push('s.championship = ?'); params.push(filter.championship) }
    const sql = `${SESSION_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY s.date IS NULL, s.date DESC, s.id DESC`
    return db.prepare(sql).all(...params).map((r) => ({ ...(withTags(r) as object), items: [] }))
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
      championship: s.type === RACE_TYPE ? nullIfEmpty(s.championship) : null,
      // El circuito se enlaza por el nombre escrito en «Lugar».
      circuit_id: findCircuitByName(db, s.location),
      organizer_id: s.organizer_id || null,
      price: s.price === null || s.price === undefined || Number.isNaN(s.price) ? null : Number(s.price),
      notes: nullIfEmpty(s.notes)
    }
    return transaction(db, () => {
      let id = s.id
      if (id) {
        db.prepare(`UPDATE sessions SET client_id=@client_id, title=@title, type=@type, date=@date, location=@location,
                    status=@status, championship=@championship, circuit_id=@circuit_id, organizer_id=@organizer_id,
                    price=@price, notes=@notes WHERE id=@id`).run({ ...row, id })
      } else {
        id = Number(db.prepare(`INSERT INTO sessions (client_id, title, type, date, location, status, championship, circuit_id, organizer_id, price, notes)
                    VALUES (@client_id, @title, @type, @date, @location, @status, @championship, @circuit_id, @organizer_id, @price, @notes)`).run(row).lastInsertRowid)
      }
      db.prepare('DELETE FROM session_tags WHERE session_id = ?').run(id)
      const ins = db.prepare('INSERT INTO session_tags (session_id, tag) VALUES (?, ?)')
      for (const t of normalizeTags(s.tags ?? [])) ins.run(id, t)

      db.prepare('DELETE FROM session_items WHERE session_id = ?').run(id)
      const insItem = db.prepare('INSERT INTO session_items (session_id, position, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)')
      ;(s.items ?? []).forEach((it, i) => {
        const description = it.description?.trim()
        if (!description) return
        const quantity = Number(it.quantity)
        const unitPrice = Number(it.unit_price)
        if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) throw new Error('Cantidad o precio no válidos en las partidas')
        insItem.run(id!, i, description, quantity, unitPrice)
      })
      return getSession(id)
    })
  })
  ipcMain.handle('sessions:remove', async (_e, id: number) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    await storage.remove(sessionKey(id)).catch(() => undefined)
  })

  // ---------- Fotos ----------
  ipcMain.handle('photos:list', (_e, sessionId: number) => {
    const rows = db.prepare(`${PHOTO_SELECT} WHERE p.session_id = ? ORDER BY p.taken_at IS NULL, p.taken_at, p.file_name`)
      .all(sessionId).map((r) => withTags(r)) as { id: number }[]
    return withPilots(db, rows)
  })

  // ---------- Días del evento ----------
  ipcMain.handle('days:list', (_e, sessionId: number) =>
    db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM photos p WHERE p.day_id = d.id) AS photo_count
                FROM event_days d WHERE d.session_id = ?
                ORDER BY d.date IS NULL, d.date, d.position, d.id`).all(sessionId))
  ipcMain.handle('days:save', (_e, d: EventDayInput) => {
    if (!d.session_id) throw new Error('Falta el evento')
    if (!d.date && !d.label?.trim()) throw new Error('Pon al menos la fecha o un nombre para el día')
    if (d.date && !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('Fecha no válida')
    const row = { session_id: d.session_id, date: nullIfEmpty(d.date), label: nullIfEmpty(d.label) }
    let id = d.id
    if (id) {
      db.prepare('UPDATE event_days SET date=@date, label=@label WHERE id=@id').run({ date: row.date, label: row.label, id })
    } else {
      const next = Number((db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM event_days WHERE session_id = ?').get(d.session_id) as { n: number }).n)
      id = Number(db.prepare('INSERT INTO event_days (session_id, date, label, position) VALUES (@session_id, @date, @label, @position)')
        .run({ ...row, position: next }).lastInsertRowid)
    }
    return db.prepare('SELECT * FROM event_days WHERE id = ?').get(id)
  })
  ipcMain.handle('days:remove', (_e, id: number) => {
    // Las fotos de ese día se quedan en el evento, sin día asignado.
    transaction(db, () => {
      db.prepare('UPDATE photos SET day_id = NULL WHERE day_id = ?').run(id)
      db.prepare('DELETE FROM event_days WHERE id = ?').run(id)
    })
  })

  // ---------- Fotos y pilotos ----------
  ipcMain.handle('photos:assign', (_e, ids: number[], clientId: number, assign: boolean) => {
    if (!ids.length || !clientId) return
    const client = db.prepare('SELECT kind FROM clients WHERE id = ?').get(clientId) as { kind: string } | undefined
    if (!client) throw new Error('El piloto no existe')
    const stmt = assign
      ? db.prepare('INSERT OR IGNORE INTO photo_pilots (photo_id, client_id) VALUES (?, ?)')
      : db.prepare('DELETE FROM photo_pilots WHERE photo_id = ? AND client_id = ?')
    transaction(db, () => ids.forEach((id) => stmt.run(id, clientId)))
  })
  ipcMain.handle('photos:setDay', (_e, ids: number[], dayId: number | null) => {
    if (!ids.length) return
    const stmt = db.prepare('UPDATE photos SET day_id = ? WHERE id = ?')
    transaction(db, () => ids.forEach((id) => stmt.run(dayId, id)))
  })
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
  ipcMain.handle('photos:import', async (e, sessionId: number, dayId?: number | null) => {
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
    return importPhotos(db, storage, sessionId, dayId ?? null, files, (p) => e.sender.send('photos:import-progress', p))
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

  // ---------- Tarifas ----------
  ipcMain.handle('tariffs:list', () =>
    db.prepare(`SELECT * FROM tariffs ORDER BY category, position, label COLLATE NOCASE`).all())
  ipcMain.handle('tariffs:save', (_e, t: TariffInput) => {
    if (!['sesion', 'extra'].includes(t.category)) throw new Error('Categoría de tarifa no válida')
    if (!t.label?.trim()) throw new Error('La tarifa necesita un nombre')
    const mode: TariffMode = t.mode === 'porcentaje' && t.category === 'extra' ? 'porcentaje' : 'fijo'
    const price = Number(t.price)
    if (!Number.isFinite(price)) throw new Error('Precio no válido')
    if (mode === 'fijo' && price < 0) throw new Error('El precio no puede ser negativo')
    if (mode === 'porcentaje' && (price < -100 || price > 200)) throw new Error('El porcentaje debe estar entre −100 y 200')
    const row = {
      category: t.category,
      mode,
      session_type: t.category === 'sesion' ? nullIfEmpty(t.session_type) : null,
      label: t.label.trim(),
      price,
      unit: nullIfEmpty(t.unit),
      notes: nullIfEmpty(t.notes)
    }
    let id = t.id
    if (id) {
      db.prepare('UPDATE tariffs SET category=@category, mode=@mode, session_type=@session_type, label=@label, price=@price, unit=@unit, notes=@notes WHERE id=@id')
        .run({ ...row, id })
    } else {
      const next = Number((db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM tariffs WHERE category = ?').get(t.category) as { n: number }).n)
      id = Number(db.prepare(`INSERT INTO tariffs (category, mode, session_type, label, price, unit, notes, position)
        VALUES (@category, @mode, @session_type, @label, @price, @unit, @notes, @position)`).run({ ...row, position: next }).lastInsertRowid)
    }
    return db.prepare('SELECT * FROM tariffs WHERE id = ?').get(id)
  })
  ipcMain.handle('tariffs:remove', (_e, id: number) => { db.prepare('DELETE FROM tariffs WHERE id = ?').run(id) })

  // ---------- Etiquetas y búsqueda ----------
  ipcMain.handle('tags', () =>
    db.prepare(`SELECT tag FROM (SELECT tag FROM photo_tags UNION SELECT tag FROM session_tags) ORDER BY tag COLLATE NOCASE`)
      .all().map((r) => String(r.tag))
  )
  ipcMain.handle('search', (_e, q: string) => {
    const term = q.trim()
    if (!term) return { clients: [], contacts: [], sessions: [], photos: [] }
    const p = like(term)
    const clients = db.prepare(`${CLIENT_SELECT}
      WHERE c.name LIKE ?1 ESCAPE '\\' OR c.email LIKE ?1 ESCAPE '\\' OR c.phone LIKE ?1 ESCAPE '\\'
        OR c.instagram LIKE ?1 ESCAPE '\\' OR c.racing_number = ?2 OR c.category LIKE ?1 ESCAPE '\\' OR c.vehicle LIKE ?1 ESCAPE '\\'
        OR c.contact_name LIKE ?1 ESCAPE '\\' OR c.brand LIKE ?1 ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM clients t WHERE t.id = c.team_id AND t.name LIKE ?1 ESCAPE '\\')
        OR c.tax_id LIKE ?1 ESCAPE '\\' OR c.notes LIKE ?1 ESCAPE '\\'
      ORDER BY c.name COLLATE NOCASE LIMIT 30`).all(p, term.replace(/^#/, ''))
    const sessions = db.prepare(`${SESSION_SELECT}
      WHERE s.title LIKE ?1 ESCAPE '\\' OR s.location LIKE ?1 ESCAPE '\\' OR s.type LIKE ?1 ESCAPE '\\' OR s.notes LIKE ?1 ESCAPE '\\'
        OR s.championship LIKE ?1 ESCAPE '\\'
        OR c.name LIKE ?1 ESCAPE '\\' OR EXISTS (SELECT 1 FROM session_tags t WHERE t.session_id = s.id AND t.tag LIKE ?1 ESCAPE '\\')
      ORDER BY s.date DESC LIMIT 30`).all(p).map((r) => withTags(r))
    const photos = db.prepare(`
      SELECT p.*, s.title AS session_title,
        (SELECT group_concat(t.tag, char(31)) FROM photo_tags t WHERE t.photo_id = p.id) AS tags_raw
      FROM photos p JOIN sessions s ON s.id = p.session_id
      WHERE p.file_name LIKE ?1 ESCAPE '\\' OR p.camera LIKE ?1 ESCAPE '\\' OR p.lens LIKE ?1 ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM photo_tags t WHERE t.photo_id = p.id AND t.tag LIKE ?1 ESCAPE '\\')
      ORDER BY p.rating DESC, p.id DESC LIMIT 120`).all(p).map((r) => withTags(r))
    const contacts = db.prepare(`${CONTACT_SELECT}
      WHERE c.name LIKE ?1 ESCAPE '\\' OR c.locality LIKE ?1 ESCAPE '\\' OR c.contact_name LIKE ?1 ESCAPE '\\'
        OR c.accred_name LIKE ?1 ESCAPE '\\' OR c.email LIKE ?1 ESCAPE '\\' OR c.notes LIKE ?1 ESCAPE '\\'
      ORDER BY c.name COLLATE NOCASE LIMIT 20`).all(p)
    return { clients, contacts, sessions, photos }
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
  registerContactsIpc(db)
}
