import { ipcMain } from 'electron'
import type { ContactInput, ContactKind } from '../shared/types'
import { CONTACT_KINDS } from '../shared/types'
import type { DB } from './db'
import { nullIfEmpty } from './ipc'

const FIELDS = ['name', 'locality', 'address', 'website', 'instagram', 'email', 'phone', 'contact_name', 'contact_role',
  'accred_name', 'accred_email', 'accred_phone', 'accred_deadline', 'accred_notes',
  'access_gate', 'parking', 'hours', 'wifi', 'track_notes', 'tax_id', 'tax_address', 'notes'] as const

export const CONTACT_SELECT = `
  SELECT c.*, (SELECT COUNT(*) FROM sessions s WHERE s.circuit_id = c.id OR s.organizer_id = c.id) AS session_count
  FROM contacts c`

/** Busca un circuito por su nombre (sin distinguir mayúsculas ni acentos). */
export function findCircuitByName(db: DB, name: string | null): number | null {
  const n = (name ?? '').trim()
  if (!n) return null
  const rows = db.prepare("SELECT id, name FROM contacts WHERE kind = 'circuito'").all() as { id: number; name: string }[]
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const target = fold(n)
  return rows.find((r) => fold(r.name) === target)?.id ?? null
}

export function registerContactsIpc(db: DB): void {
  ipcMain.handle('contacts:list', (_e, kind?: ContactKind) => {
    const where = kind ? 'WHERE c.kind = ?' : ''
    const params = kind ? [kind] : []
    return db.prepare(`${CONTACT_SELECT} ${where} ORDER BY c.kind, c.name COLLATE NOCASE`).all(...params)
  })
  ipcMain.handle('contacts:get', (_e, id: number) => db.prepare(`${CONTACT_SELECT} WHERE c.id = ?`).get(id) ?? null)
  ipcMain.handle('contacts:remove', (_e, id: number) => { db.prepare('DELETE FROM contacts WHERE id = ?').run(id) })
  ipcMain.handle('contacts:save', (_e, c: ContactInput) => {
    if (!CONTACT_KINDS.includes(c.kind)) throw new Error('Indica si es un circuito o un organizador')
    if (!c.name?.trim()) throw new Error('El nombre es obligatorio')
    const row: Record<string, string | null> = { kind: c.kind }
    for (const f of FIELDS) row[f] = nullIfEmpty(c[f] as string)
    row.name = c.name.trim()
    if (row.instagram) row.instagram = row.instagram.replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '') || null
    let id = c.id
    const cols = Object.keys(row)
    if (id) {
      db.prepare(`UPDATE contacts SET ${cols.map((k) => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...row, id })
    } else {
      id = Number(db.prepare(`INSERT INTO contacts (${cols.join(', ')}) VALUES (${cols.map((k) => '@' + k).join(', ')})`).run(row).lastInsertRowid)
    }
    return db.prepare(`${CONTACT_SELECT} WHERE c.id = ?`).get(id)
  })
}
