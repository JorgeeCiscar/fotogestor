import { useCallback, useEffect, useState } from 'react'
import type { Invoice, InvoiceKind } from '../../../shared/types'
import type { View } from '../App'
import { api, displayNumber, errorMessage, formatDate, formatMoney, INVOICE_STATUS_LABEL } from '../util'
import InvoiceEditor, { InvoiceDraft, newDraft } from './InvoiceEditor'

const toDraft = (inv: Invoice): InvoiceDraft => ({
  id: inv.id, number: inv.number, kind: inv.kind, client_id: inv.client_id, session_id: inv.session_id,
  issue_date: inv.issue_date, due_date: inv.due_date, status: inv.status, tax_rate: inv.tax_rate, irpf_rate: inv.irpf_rate,
  notes: inv.notes ?? '', items: inv.items
})

export default function InvoicesView({ openId, newForSession, newForClient }: { nav: (v: View) => void; openId?: number; newForSession?: number; newForClient?: number }) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [kind, setKind] = useState<InvoiceKind | ''>('')
  const [editing, setEditing] = useState<InvoiceDraft | null>(null)
  const [msg, setMsg] = useState('')
  const load = useCallback(() => api.invoices.list({ kind: kind || undefined }).then(setInvoices), [kind])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (openId) api.invoices.get(openId).then((inv) => inv && setEditing(toDraft(inv)))
  }, [openId])
  useEffect(() => {
    if (!newForSession) return
    Promise.all([api.sessions.get(newForSession), api.settings.get()]).then(([s, st]) =>
      setEditing(newDraft('presupuesto', st.default_tax_rate, st.default_irpf_rate, s)))
  }, [newForSession])

  useEffect(() => {
    if (!newForClient) return
    api.settings.get().then((st) => setEditing({ ...newDraft('presupuesto', st.default_tax_rate, st.default_irpf_rate), client_id: newForClient }))
  }, [newForClient])

  async function create(k: InvoiceKind) {
    const st = await api.settings.get()
    setEditing(newDraft(k, st.default_tax_rate, st.default_irpf_rate))
  }
  async function pdf(inv: Invoice) {
    try { const f = await api.invoices.exportPdf(inv.id); if (f) setMsg(`PDF guardado en ${f}`) } catch (err) { setMsg(errorMessage(err)) }
  }

  const pending = invoices.filter((i) => i.kind === 'factura' && i.status === 'enviada').reduce((s, i) => s + i.total, 0)

  return (
    <div className="page">
      <header className="page-header">
        <h1>Facturación</h1>
        <div className="segmented">
          {([['', 'Todo'], ['presupuesto', 'Presupuestos'], ['factura', 'Facturas']] as const).map(([k, label]) => (
            <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
        <button onClick={() => create('presupuesto')}>+ Presupuesto</button>
        <button className="primary" onClick={() => create('factura')}>+ Factura</button>
      </header>
      {pending > 0 && <p className="muted">Pendiente de cobro: <strong>{formatMoney(pending)}</strong></p>}
      {msg && <p className="muted">{msg}</p>}
      {invoices.length ? (
        <table className="table">
          <thead><tr><th>Número</th><th>Tipo</th><th>Cliente</th><th>Evento</th><th>Fecha</th><th className="n">Total</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className="clickable" onClick={() => setEditing(toDraft(i))}>
                <td><strong>{displayNumber(i.number)}</strong></td>
                <td>{i.kind === 'factura' ? 'Factura' : 'Presupuesto'}</td>
                <td>{i.client_name ?? '—'}</td>
                <td className="muted">{i.session_title ?? '—'}</td>
                <td>{formatDate(i.issue_date)}</td>
                <td className="n">{formatMoney(i.total)}</td>
                <td><span className={`badge inv-${i.status}`}>{INVOICE_STATUS_LABEL[i.status]}</span></td>
                <td className="actions"><button className="ghost" onClick={(e) => { e.stopPropagation(); pdf(i) }}>PDF</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">Aún no hay {kind === 'factura' ? 'facturas' : kind === 'presupuesto' ? 'presupuestos' : 'presupuestos ni facturas'}.</p>
      )}
      {editing && (
        <InvoiceEditor initial={editing}
          onClose={() => { setEditing(null); load() }}
          onSaved={(inv) => { setEditing(toDraft(inv)); load() }}
          onOpen={(inv) => { setEditing(toDraft(inv)); load() }} />
      )}
    </div>
  )
}
