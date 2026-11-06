import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SQLInputValue } from 'node:sqlite'
import type { Client, Invoice, InvoiceInput, InvoiceItem, InvoiceKind, Settings } from '../shared/types'
import { INVOICE_STATUSES } from '../shared/types'
import { transaction, type DB } from './db'
import { getSettings } from './settings'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function computeTotals(items: InvoiceItem[], taxRate: number, irpfRate: number) {
  const subtotal = round2(items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0))
  const tax = round2((subtotal * taxRate) / 100)
  const irpf = round2((subtotal * irpfRate) / 100)
  return { subtotal, tax, irpf, total: round2(subtotal + tax - irpf) }
}

const isDraftNumber = (n: string) => n.startsWith('BORRADOR-')

function nextNumber(db: DB, kind: InvoiceKind, issueDate: string): string {
  const prefix = `${kind === 'factura' ? 'F' : 'P'}-${issueDate.slice(0, 4)}-`
  const rows = db.prepare('SELECT number FROM invoices WHERE kind = ? AND number LIKE ?').all(kind, prefix + '%')
  const max = rows.reduce((m, r) => Math.max(m, Number(String(r.number).slice(prefix.length)) || 0), 0)
  return prefix + String(max + 1).padStart(3, '0')
}

function loadInvoice(db: DB, id: number): Invoice | null {
  const row = db.prepare(`SELECT i.*, c.name AS client_name, s.title AS session_title
    FROM invoices i LEFT JOIN clients c ON c.id = i.client_id LEFT JOIN sessions s ON s.id = i.session_id
    WHERE i.id = ?`).get(id) as Record<string, unknown> | undefined
  if (!row) return null
  const items = db.prepare('SELECT id, description, quantity, unit_price FROM invoice_items WHERE invoice_id = ? ORDER BY position')
    .all(id) as unknown as InvoiceItem[]
  const inv = { ...row, items } as unknown as Invoice
  return { ...inv, ...computeTotals(items, inv.tax_rate, inv.irpf_rate) }
}

function validate(input: InvoiceInput): void {
  if (!['presupuesto', 'factura'].includes(input.kind)) throw new Error('Tipo de documento no válido')
  if (!INVOICE_STATUSES[input.kind].includes(input.status)) throw new Error(`Estado no válido para ${input.kind}: ${input.status}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issue_date ?? '')) throw new Error('La fecha de emisión es obligatoria')
  if (!input.items?.length) throw new Error('Añade al menos una partida')
  for (const it of input.items) {
    if (!it.description?.trim()) throw new Error('Todas las partidas necesitan una descripción')
    if (!Number.isFinite(it.quantity) || !Number.isFinite(it.unit_price)) throw new Error('Cantidad o precio no válidos')
  }
  for (const r of [input.tax_rate, input.irpf_rate]) if (!Number.isFinite(r) || r < 0 || r > 100) throw new Error('Porcentaje no válido')
  if (input.kind === 'factura' && input.status !== 'borrador' && !input.client_id) {
    throw new Error('Una factura emitida necesita un cliente')
  }
}

export function saveInvoice(db: DB, input: InvoiceInput): Invoice {
  validate(input)
  return transaction(db, () => {
    const existing = input.id ? loadInvoice(db, input.id) : null
    if (input.id && !existing) throw new Error('El documento no existe')
    if (existing && existing.kind !== input.kind) throw new Error('No se puede cambiar el tipo de un documento')

    // Una factura emitida es inmutable: solo puede cambiar su estado.
    if (existing?.kind === 'factura' && existing.status !== 'borrador') {
      if (input.status === 'borrador') throw new Error('Una factura emitida no puede volver a borrador')
      db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(input.status, existing.id)
      return loadInvoice(db, existing.id)!
    }

    // Las facturas reciben número definitivo al emitirse; los presupuestos al crearse.
    let number = existing?.number
    const emitting = input.kind === 'factura' && input.status !== 'borrador'
    if (!number || (emitting && isDraftNumber(number))) {
      number = input.kind === 'factura' && !emitting ? `BORRADOR-${randomUUID().slice(0, 8)}` : nextNumber(db, input.kind, input.issue_date)
    }

    const row: Record<string, SQLInputValue> = {
      kind: input.kind, number, client_id: input.client_id || null, session_id: input.session_id || null,
      issue_date: input.issue_date, due_date: input.due_date || null, status: input.status,
      tax_rate: input.tax_rate, irpf_rate: input.irpf_rate, notes: input.notes?.trim() || null
    }
    const { kind: _kind, ...rest } = row // node:sqlite rechaza parámetros que la sentencia no usa
    let id = existing?.id
    if (id) {
      db.prepare(`UPDATE invoices SET number=@number, client_id=@client_id, session_id=@session_id, issue_date=@issue_date,
        due_date=@due_date, status=@status, tax_rate=@tax_rate, irpf_rate=@irpf_rate, notes=@notes WHERE id=@id`).run({ ...rest, id })
      db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id)
    } else {
      id = Number(db.prepare(`INSERT INTO invoices (kind, number, client_id, session_id, issue_date, due_date, status, tax_rate, irpf_rate, notes)
        VALUES (@kind, @number, @client_id, @session_id, @issue_date, @due_date, @status, @tax_rate, @irpf_rate, @notes)`).run(row).lastInsertRowid)
    }
    const ins = db.prepare('INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)')
    input.items.forEach((it, i) => ins.run(id!, i, it.description.trim(), it.quantity, it.unit_price))
    return loadInvoice(db, id)!
  })
}

// ---------- PDF ----------
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const money = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-ES') : '')
const nl2br = (s: string) => esc(s).replace(/\n/g, '<br>')

export function invoiceHtml(inv: Invoice, settings: Settings, client: Client | null): string {
  const title = inv.kind === 'factura' ? 'Factura' : 'Presupuesto'
  const number = isDraftNumber(inv.number) ? 'BORRADOR' : inv.number
  const rows = inv.items.map((it) => `<tr><td>${esc(it.description)}</td><td class="n">${it.quantity.toLocaleString('es-ES')}</td>
    <td class="n">${money(it.unit_price)}</td><td class="n">${money(round2(it.quantity * it.unit_price))}</td></tr>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)} ${esc(number)}</title><style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #222; font-size: 10.5pt; margin: 0; }
    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
    header img { max-height: 70px; max-width: 220px; }
    h1 { font-size: 22pt; margin: 0 0 6px; letter-spacing: .04em; text-transform: uppercase; color: #111; }
    .meta { text-align: right; } .meta div { margin: 2px 0; }
    .parties { display: flex; gap: 40px; margin-bottom: 26px; }
    .parties > div { flex: 1; } .label { font-size: 8pt; text-transform: uppercase; color: #888; letter-spacing: .08em; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 8.5pt; text-transform: uppercase; color: #666; border-bottom: 1.5px solid #222; padding: 6px 4px; }
    td { padding: 8px 4px; border-bottom: 1px solid #e4e4e4; vertical-align: top; }
    .n { text-align: right; white-space: nowrap; }
    .totals { margin-left: auto; width: 46%; margin-top: 16px; } .totals td { border: none; padding: 4px; }
    .totals .grand td { font-size: 13pt; font-weight: 700; border-top: 1.5px solid #222; padding-top: 8px; }
    .notes { margin-top: 30px; } footer { margin-top: 36px; font-size: 9pt; color: #666; border-top: 1px solid #e4e4e4; padding-top: 10px; }
    .draft { color: #c0392b; }
  </style></head><body>
  <header>
    <div>${settings.logo_data_url ? `<img src="${settings.logo_data_url}" alt="">` : `<strong style="font-size:15pt">${esc(settings.business_name)}</strong>`}</div>
    <div class="meta"><h1 class="${number === 'BORRADOR' ? 'draft' : ''}">${title}</h1>
      <div><strong>Nº ${esc(number)}</strong></div>
      <div>Fecha: ${fmtDate(inv.issue_date)}</div>
      ${inv.due_date ? `<div>${inv.kind === 'factura' ? 'Vencimiento' : 'Válido hasta'}: ${fmtDate(inv.due_date)}</div>` : ''}
    </div>
  </header>
  <div class="parties">
    <div><div class="label">Emisor</div><strong>${esc(settings.business_name)}</strong><br>
      ${settings.business_tax_id ? `NIF: ${esc(settings.business_tax_id)}<br>` : ''}${nl2br(settings.business_address)}<br>
      ${[settings.business_email, settings.business_phone].filter(Boolean).map(esc).join(' · ')}</div>
    <div><div class="label">Cliente</div>${client ? `<strong>${esc(client.name)}</strong><br>
      ${client.tax_id ? `NIF: ${esc(client.tax_id)}<br>` : ''}${nl2br(client.address ?? '')}<br>
      ${[client.email, client.phone].filter(Boolean).map(esc).join(' · ')}` : '—'}</div>
  </div>
  ${inv.session_title ? `<p><span class="label">Sesión:</span> ${esc(inv.session_title)}</p>` : ''}
  <table><thead><tr><th>Concepto</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Importe</th></tr></thead><tbody>${rows}</tbody></table>
  <table class="totals">
    <tr><td>Base imponible</td><td class="n">${money(inv.subtotal)}</td></tr>
    <tr><td>IVA ${inv.tax_rate.toLocaleString('es-ES')} %</td><td class="n">${money(inv.tax)}</td></tr>
    ${inv.irpf_rate ? `<tr><td>Retención IRPF ${inv.irpf_rate.toLocaleString('es-ES')} %</td><td class="n">−${money(inv.irpf)}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="n">${money(inv.total)}</td></tr>
  </table>
  ${inv.notes ? `<div class="notes"><div class="label">Observaciones</div>${nl2br(inv.notes)}</div>` : ''}
  <footer>${settings.business_iban && inv.kind === 'factura' ? `Forma de pago: transferencia a ${esc(settings.business_iban)}<br>` : ''}${nl2br(settings.invoice_footer)}</footer>
  </body></html>`
}

export async function renderPdf(html: string): Promise<Buffer> {
  const tmp = join(app.getPath('temp'), `fotogestor-${randomUUID()}.html`)
  await writeFile(tmp, html, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await win.loadFile(tmp)
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } })
  } finally {
    win.destroy()
    await rm(tmp, { force: true })
  }
}

export function registerInvoiceIpc(db: DB): void {
  ipcMain.handle('invoices:list', (_e, f: { kind?: InvoiceKind; clientId?: number; sessionId?: number } = {}) => {
    const where: string[] = []
    const params: SQLInputValue[] = []
    if (f.kind) { where.push('kind = ?'); params.push(f.kind) }
    if (f.clientId) { where.push('client_id = ?'); params.push(f.clientId) }
    if (f.sessionId) { where.push('session_id = ?'); params.push(f.sessionId) }
    const ids = db.prepare(`SELECT id FROM invoices ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY issue_date DESC, id DESC`).all(...params)
    return ids.map((r) => loadInvoice(db, Number(r.id)))
  })
  ipcMain.handle('invoices:get', (_e, id: number) => loadInvoice(db, id))
  ipcMain.handle('invoices:save', (_e, input: InvoiceInput) => saveInvoice(db, input))
  ipcMain.handle('invoices:remove', (_e, id: number) => {
    const inv = loadInvoice(db, id)
    if (inv?.kind === 'factura' && inv.status !== 'borrador') {
      throw new Error('Una factura emitida no se puede eliminar (la numeración debe ser correlativa). Emite una factura rectificativa con importes negativos.')
    }
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id)
  })
  ipcMain.handle('invoices:convert', (_e, id: number) => {
    const src = loadInvoice(db, id)
    if (!src || src.kind !== 'presupuesto') throw new Error('Solo se pueden convertir presupuestos')
    return transaction(db, () => {
      const inv = saveInvoice(db, {
        kind: 'factura', client_id: src.client_id, session_id: src.session_id,
        issue_date: new Date().toLocaleDateString('sv-SE'), due_date: new Date(Date.now() + 30 * 86400000).toLocaleDateString('sv-SE'), status: 'borrador',
        tax_rate: src.tax_rate, irpf_rate: src.irpf_rate, notes: src.notes,
        items: src.items.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price }))
      })
      db.prepare('UPDATE invoices SET source_id = ? WHERE id = ?').run(src.id, inv.id)
      if (src.status !== 'aceptada') db.prepare("UPDATE invoices SET status = 'aceptada' WHERE id = ?").run(src.id)
      return loadInvoice(db, inv.id)
    })
  })
  ipcMain.handle('invoices:exportPdf', async (e, id: number) => {
    const inv = loadInvoice(db, id)
    if (!inv) throw new Error('El documento no existe')
    const client = inv.client_id ? (db.prepare('SELECT * FROM clients WHERE id = ?').get(inv.client_id) as unknown as Client) : null
    const pdf = await renderPdf(invoiceHtml(inv, getSettings(db), client))
    const win = BrowserWindow.fromWebContents(e.sender)!
    const name = isDraftNumber(inv.number) ? `${inv.kind}-borrador` : inv.number
    const res = await dialog.showSaveDialog(win, {
      title: 'Guardar PDF', defaultPath: join(app.getPath('documents'), `${name}.pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, pdf)
    return res.filePath
  })
}
