import { FormEvent, useEffect, useState } from 'react'
import type { Client, Contact, Session, SessionInput, SessionItem, Tariff } from '../../../shared/types'
import { RACE_TYPE, SESSION_STATUSES } from '../../../shared/types'
import { api, errorMessage, formatMoney, itemsTotal, SESSION_TYPES, STATUS_LABEL } from '../util'
import ExtraQuantityDialog, { needsDetail } from './ExtraQuantityDialog'
import Modal from './Modal'
import PasteDataDialog from './PasteDataDialog'
import TagInput from './TagInput'

export default function SessionForm({ session, defaultClientId, onClose, onSaved }: {
  session?: Session
  defaultClientId?: number
  onClose: () => void
  onSaved: (s: Session) => void
}) {
  const [clients, setClients] = useState<Client[]>([])
  const [form, setForm] = useState<SessionInput>({
    id: session?.id,
    client_id: session?.client_id ?? defaultClientId ?? null,
    title: session?.title ?? '',
    type: session?.type ?? '',
    date: session?.date ?? '',
    location: session?.location ?? '',
    status: session?.status ?? 'planificada',
    price: session?.price ?? null,
    notes: session?.notes ?? '',
    championship: session?.championship ?? '',
    tags: session?.tags ?? [],
    items: session?.items ?? [],
    circuit_id: session?.circuit_id ?? null,
    organizer_id: session?.organizer_id ?? null
  })
  const [contacts, setContacts] = useState<Contact[]>([])
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  // El precio sigue al total de las partidas mientras el usuario no lo escriba a mano.
  const [priceTouched, setPriceTouched] = useState(session ? session.price !== null : false)
  const [championships, setChampionships] = useState<string[]>([])
  const [error, setError] = useState('')
  const [pasting, setPasting] = useState(false)
  const [askingExtra, setAskingExtra] = useState<Tariff | null>(null)
  useEffect(() => { api.clients.list().then(setClients); api.championships().then(setChampionships); api.tariffs.list().then(setTariffs); api.contacts.list().then(setContacts) }, [])
  const set = (k: keyof SessionInput) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  /** Vuelca en el formulario los datos reconocidos en el texto pegado. */
  function applyPasted(values: Record<string, string>) {
    setPasting(false)
    const { clientName, price, tags, ...rest } = values
    const next: Record<string, unknown> = { ...rest }
    if (price !== undefined) { next.price = Number(price); setPriceTouched(true) }
    if (tags) next.tags = [...new Set([...form.tags, ...tags.split(/[,;]+/).map((t) => t.trim()).filter(Boolean)])]
    if (clientName) {
      const match = clients.find((c) => c.name.localeCompare(clientName, 'es', { sensitivity: 'base' }) === 0)
        ?? clients.find((c) => c.name.toLowerCase().includes(clientName.toLowerCase()))
      if (match) next.client_id = match.id
      else next.notes = [values.notes ?? form.notes, `Cliente indicado: ${clientName}`].filter(Boolean).join('\n')
    }
    setForm((f) => ({ ...f, ...next } as typeof f))
  }

  const extras = tariffs.filter((t) => t.category === 'extra')
  const total = itemsTotal(form.items)
  /** La cobertura: solo las partidas del tipo de evento, sin extras ni ajustes. */
  const coverage = itemsTotal(form.items.filter((it) => it.kind === 'base'))

  /**
   * Recalcula los ajustes en porcentaje (licencia comercial, descuentos…),
   * que se aplican solo sobre la cobertura, nunca sobre los extras.
   */
  function recalc(items: SessionItem[]): SessionItem[] {
    const base = itemsTotal(items.filter((it) => it.kind === 'base'))
    return items.map((it) => (it.kind === 'ajuste' && it.percent !== null
      ? { ...it, quantity: 1, unit_price: Math.round((base * it.percent) / 100 * 100) / 100 }
      : it))
  }

  /** Tarifa base del tipo elegido (la específica manda sobre la general). */
  function baseTariff(type: string | null): Tariff | undefined {
    const base = tariffs.filter((t) => t.category === 'sesion')
    return base.find((t) => t.session_type === type) ?? base.find((t) => !t.session_type)
  }

  /** Al cambiar el tipo se pone su tarifa como primera partida. */
  function changeType(type: string) {
    setForm((f) => {
      const next = baseTariff(type)
      // Se sustituye la cobertura anterior; los extras y ajustes se conservan.
      const rest = f.items.filter((it) => it.kind !== 'base')
      const items = next
        ? [{ description: next.label, quantity: 1, unit_price: next.price, kind: 'base' as const, percent: null }, ...rest]
        : rest
      return { ...f, type, items: recalc(items) }
    })
  }

  /**
   * Añade un extra. Si es un porcentaje (licencia comercial, descuentos…) se calcula
   * sobre el total que haya en ese momento y se guarda ya convertido a euros.
   */
  /** Añade un extra ya resuelto (cantidad y precio decididos). */
  const pushItem = (item: SessionItem) => setForm((f) => ({ ...f, items: recalc([...f.items, item]) }))

  function addExtra(t: Tariff) {
    if (t.mode === 'porcentaje') {
      // Los ajustes se calculan sobre la cobertura y se recalculan solos.
      pushItem({ description: `${t.label} (${t.price} %)`, quantity: 1, unit_price: 0, kind: 'ajuste', percent: t.price })
    } else if (needsDetail(t)) {
      setAskingExtra(t)
    } else {
      pushItem({ description: t.label, quantity: 1, unit_price: t.price, kind: 'extra', percent: null })
    }
  }

  const setItem = (i: number, patch: Partial<SessionItem>) =>
    setForm((f) => ({ ...f, items: recalc(f.items.map((it, j) => (j === i ? { ...it, ...patch } : it))) }))
  const removeItem = (i: number) => setForm((f) => ({ ...f, items: recalc(f.items.filter((_, j) => j !== i)) }))

  useEffect(() => {
    if (!priceTouched) setForm((f) => ({ ...f, price: f.items.length ? itemsTotal(f.items) : null }))
  }, [form.items, priceTouched])

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      onSaved(await api.sessions.save(form))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal title={session ? 'Editar evento' : 'Nuevo evento'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="row paste-row">
          <label>Título *<input autoFocus value={form.title} onChange={set('title')} placeholder="Boda Ana y Luis" /></label>
          <button type="button" className="ghost" onClick={() => setPasting(true)}>📋 Pegar datos…</button>
        </div>
        <div className="row">
          <label>Cliente
            <select value={form.client_id ?? ''} onChange={(e) => setForm({ ...form, client_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— Sin cliente —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Tipo
            <select value={form.type ?? ''} onChange={(e) => changeType(e.target.value)}>
              <option value="">—</option>
              {SESSION_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        {form.type === RACE_TYPE && (
          <label className="race-field">Campeonato
            <input list="championships" value={form.championship ?? ''} onChange={set('championship')}
              placeholder="Ej.: Campeonato de España de Velocidad (ESBK)" />
            <datalist id="championships">{championships.map((c) => <option key={c} value={c} />)}</datalist>
            <span className="muted small hint">Se guarda como etiqueta de la carrera: podrás filtrar y buscar por campeonato.</span>
          </label>
        )}
        <div className="row">
          <label>Fecha<input type="date" value={form.date ?? ''} onChange={set('date')} /></label>
          <label>Lugar
            <input list="circuit-names" value={form.location ?? ''} onChange={set('location')} placeholder="Circuit Ricardo Tormo" />
            <datalist id="circuit-names">
              {contacts.filter((c) => c.kind === 'circuito').map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </label>
        </div>
        {contacts.some((c) => c.kind === 'organizador') && (
          <label>Organizador
            <select value={form.organizer_id ?? ''} onChange={(e) => setForm({ ...form, organizer_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— Ninguno —</option>
              {contacts.filter((c) => c.kind === 'organizador').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <div className="row">
          <label>Estado
            <select value={form.status} onChange={set('status')}>
              {SESSION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label>Precio (€)
            <input type="number" min="0" step="0.01" value={form.price ?? ''}
              onChange={(e) => { setPriceTouched(true); setForm({ ...form, price: e.target.value === '' ? null : Number(e.target.value) }) }} />
            {priceTouched && form.items.length > 0 && Number(form.price) !== total && (
              <button type="button" className="link hint" onClick={() => { setPriceTouched(false); setForm((f) => ({ ...f, price: total })) }}>
                Usar el total de la tarifa ({formatMoney(total)})
              </button>
            )}
          </label>
        </div>
        <label>Etiquetas
          <TagInput value={form.tags} onAdd={(t) => setForm({ ...form, tags: [...form.tags, t] })}
            onRemove={(t) => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })} />
        </label>
        <div className="tariff-block">
          <div className="tariff-head">
            <h3 className="form-section">Tarifa y extras</h3>
            {extras.length > 0 && (
              <select value="" aria-label="Añadir extra"
                onChange={(e) => { const t = extras.find((x) => String(x.id) === e.target.value); if (t) addExtra(t) }}>
                <option value="">+ Añadir extra…</option>
                {extras.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {t.mode === 'porcentaje' ? `${t.price} %` : formatMoney(t.price)}{t.unit ? ` ${t.unit}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          {form.items.length ? (
            <table className="items">
              <thead><tr><th>Concepto</th><th className="n">Cantidad</th><th className="n">Precio (€)</th><th className="n">Importe</th><th /></tr></thead>
              <tbody>
                {form.items.map((it, i) => (
                  <tr key={i} className={it.kind === 'ajuste' ? 'item-adjust' : ''}>
                    <td>
                      <input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                      {it.kind === 'ajuste' && <span className="muted small hint">sobre la cobertura ({formatMoney(coverage)})</span>}
                    </td>
                    <td><input className="n" type="number" step="0.5" min="0" value={it.quantity} disabled={it.kind === 'ajuste'}
                      onChange={(e) => setItem(i, { quantity: e.target.value as unknown as number })} /></td>
                    <td><input className="n" type="number" step="0.01" min="0" value={it.unit_price} disabled={it.kind === 'ajuste'}
                      onChange={(e) => setItem(i, { unit_price: e.target.value as unknown as number })} /></td>
                    <td className="n">{formatMoney((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</td>
                    <td><button type="button" className="ghost danger" onClick={() => removeItem(i)}>✕</button></td>
                  </tr>
                ))}
                <tr className="items-total"><td colSpan={3}>Total</td><td className="n">{formatMoney(total)}</td><td /></tr>
              </tbody>
            </table>
          ) : (
            <p className="muted small">
              {tariffs.length
                ? 'Elige el tipo de evento para aplicar su tarifa, o añade un extra.'
                : 'Todavía no has puesto precios. Añádelos en el apartado «Tarifas» y se aplicarán solos aquí.'}
            </p>
          )}
        </div>
        <label>Notas<textarea rows={3} value={form.notes ?? ''} onChange={set('notes')} /></label>
        {error && <p className="error">{error}</p>}
        {pasting && <PasteDataDialog target="session" onClose={() => setPasting(false)} onApply={applyPasted} />}
        {askingExtra && (
          <ExtraQuantityDialog tariff={askingExtra} onClose={() => setAskingExtra(null)}
            onAdd={(quantity, unitPrice) => {
              pushItem({ description: askingExtra.label, quantity, unit_price: unitPrice, kind: 'extra', percent: null })
              setAskingExtra(null)
            }} />
        )}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Guardar</button>
        </footer>
      </form>
    </Modal>
  )
}
