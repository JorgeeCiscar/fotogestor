import { useEffect, useState } from 'react'
import type { Client, Invoice, InvoiceInput, InvoiceKind, Session } from '../../../shared/types'
import { INVOICE_STATUSES } from '../../../shared/types'
import { api, displayNumber, errorMessage, formatMoney, INVOICE_STATUS_LABEL, invoiceTotals, today } from '../util'
import Modal from './Modal'

export interface InvoiceDraft extends InvoiceInput { number?: string }

export function newDraft(kind: InvoiceKind, taxRate: number, irpfRate: number, session?: Session | null): InvoiceDraft {
  const due = new Date(); due.setDate(due.getDate() + (kind === 'factura' ? 30 : 30))
  return {
    kind, status: 'borrador', client_id: session?.client_id ?? null, session_id: session?.id ?? null,
    issue_date: today(), due_date: due.toLocaleDateString('sv-SE'), tax_rate: taxRate, irpf_rate: irpfRate, notes: '',
    // Si el evento tiene partidas (tarifa + extras), se copian tal cual.
    items: session?.items?.length
      ? session.items.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price }))
      : [{
          description: session ? `Cobertura fotográfica${session.type ? ' de ' + session.type.toLowerCase() : ''}: ${session.title}` : '',
          quantity: 1,
          unit_price: session?.price ?? 0
        }]
  }
}

export default function InvoiceEditor({ initial, onClose, onSaved, onOpen }: {
  initial: InvoiceDraft
  onClose: () => void
  onSaved: (inv: Invoice) => void
  onOpen: (inv: Invoice) => void
}) {
  const [form, setForm] = useState<InvoiceDraft>(initial)
  const [clients, setClients] = useState<Client[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [error, setError] = useState('')
  useEffect(() => { api.clients.list().then(setClients); api.sessions.list().then(setSessions) }, [])
  useEffect(() => setForm(initial), [initial])

  const issued = form.kind === 'factura' && !!form.id && initial.status !== 'borrador'
  const locked = issued // factura emitida: solo cambia el estado
  const totals = invoiceTotals(form.items, form.tax_rate, form.irpf_rate)
  const title = `${form.kind === 'factura' ? 'Factura' : 'Presupuesto'} ${form.number ? displayNumber(form.number) : 'nuevo'}`
  const set = <K extends keyof InvoiceDraft>(k: K, v: InvoiceDraft[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setItem = (i: number, patch: Partial<InvoiceDraft['items'][number]>) =>
    setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }))

  async function save(): Promise<Invoice | null> {
    setError('')
    if (form.kind === 'factura' && initial.status === 'borrador' && form.status !== 'borrador' &&
        !confirm('Al emitir la factura se le asigna un número definitivo y ya no podrá editarse ni eliminarse. ¿Continuar?')) return null
    try {
      const inv = await api.invoices.save({
        ...form,
        tax_rate: Number(form.tax_rate), irpf_rate: Number(form.irpf_rate),
        items: form.items.map((it) => ({ description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price) }))
      })
      onSaved(inv)
      return inv
    } catch (err) { setError(errorMessage(err)); return null }
  }
  async function pdf() {
    const inv = await save()
    if (!inv) return
    try { const file = await api.invoices.exportPdf(inv.id); if (file) setError(`PDF guardado en ${file}`) } catch (err) { setError(errorMessage(err)) }
  }
  async function convert() {
    try { const inv = await api.invoices.convertToInvoice(form.id!); onOpen(inv) } catch (err) { setError(errorMessage(err)) }
  }
  async function remove() {
    if (!confirm('¿Eliminar este documento?')) return
    try { await api.invoices.remove(form.id!); onClose() } catch (err) { setError(errorMessage(err)) }
  }

  const clientSessions = sessions.filter((s) => !form.client_id || s.client_id === form.client_id)

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="form invoice-form">
        {issued && <p className="notice">Factura emitida: su contenido ya no se puede modificar. Solo puedes cambiar su estado (p. ej. a «Pagada»).</p>}
        <div className="row">
          <label>Cliente
            <select disabled={locked} value={form.client_id ?? ''} onChange={(e) => set('client_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Sin cliente —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Sesión
            <select disabled={locked} value={form.session_id ?? ''} onChange={(e) => set('session_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Ninguno —</option>
              {clientSessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
          <label>Estado
            <select value={form.status} onChange={(e) => set('status', e.target.value as InvoiceDraft['status'])}>
              {INVOICE_STATUSES[form.kind].filter((s) => !(issued && s === 'borrador')).map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABEL[s]}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label>Fecha de emisión<input disabled={locked} type="date" value={form.issue_date} onChange={(e) => set('issue_date', e.target.value)} /></label>
          <label>{form.kind === 'factura' ? 'Vencimiento' : 'Válido hasta'}<input disabled={locked} type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} /></label>
          <label>IVA (%)<input disabled={locked} type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={(e) => set('tax_rate', e.target.value as unknown as number)} /></label>
          <label>IRPF (%)<input disabled={locked} type="number" min="0" max="100" step="0.01" value={form.irpf_rate} onChange={(e) => set('irpf_rate', e.target.value as unknown as number)} /></label>
        </div>

        <table className="items">
          <thead><tr><th>Concepto</th><th className="n">Cantidad</th><th className="n">Precio (€)</th><th className="n">Importe</th><th /></tr></thead>
          <tbody>
            {form.items.map((it, i) => (
              <tr key={i}>
                <td><input disabled={locked} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Concepto" /></td>
                <td><input disabled={locked} className="n" type="number" step="0.01" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value as unknown as number })} /></td>
                <td><input disabled={locked} className="n" type="number" step="0.01" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: e.target.value as unknown as number })} /></td>
                <td className="n">{formatMoney((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</td>
                <td>{!locked && form.items.length > 1 && <button type="button" className="ghost danger" onClick={() => set('items', form.items.filter((_, j) => j !== i))}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!locked && <div><button type="button" className="ghost" onClick={() => set('items', [...form.items, { description: '', quantity: 1, unit_price: 0 }])}>+ Añadir partida</button></div>}

        <div className="totals-box">
          <div><span>Base imponible</span><span>{formatMoney(totals.subtotal)}</span></div>
          <div><span>IVA {form.tax_rate} %</span><span>{formatMoney(totals.tax)}</span></div>
          {Number(form.irpf_rate) > 0 && <div><span>Retención IRPF {form.irpf_rate} %</span><span>−{formatMoney(totals.irpf)}</span></div>}
          <div className="grand"><span>Total</span><span>{formatMoney(totals.total)}</span></div>
        </div>

        <label>Observaciones<textarea disabled={locked} rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
        {error && <p className={error.startsWith('PDF guardado') ? 'muted' : 'error'}>{error}</p>}
        <footer>
          {form.id && !issued && <button type="button" className="ghost danger" onClick={remove}>Eliminar</button>}
          {form.id && form.kind === 'presupuesto' && <button type="button" onClick={convert}>Convertir en factura</button>}
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose}>Cerrar</button>
          <button type="button" onClick={pdf}>Guardar y PDF</button>
          <button type="button" className="primary" onClick={save}>Guardar</button>
        </footer>
      </div>
    </Modal>
  )
}
