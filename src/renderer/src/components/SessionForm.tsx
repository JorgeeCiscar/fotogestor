import { FormEvent, useEffect, useState } from 'react'
import type { Client, Session, SessionInput } from '../../../shared/types'
import { RACE_TYPE, SESSION_STATUSES } from '../../../shared/types'
import { api, errorMessage, SESSION_TYPES, STATUS_LABEL } from '../util'
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
    tags: session?.tags ?? []
  })
  const [championships, setChampionships] = useState<string[]>([])
  const [error, setError] = useState('')
  const [pasting, setPasting] = useState(false)
  useEffect(() => { api.clients.list().then(setClients); api.championships().then(setChampionships) }, [])
  const set = (k: keyof SessionInput) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  /** Vuelca en el formulario los datos reconocidos en el texto pegado. */
  function applyPasted(values: Record<string, string>) {
    setPasting(false)
    const { clientName, price, tags, ...rest } = values
    const next: Record<string, unknown> = { ...rest }
    if (price !== undefined) next.price = Number(price)
    if (tags) next.tags = [...new Set([...form.tags, ...tags.split(/[,;]+/).map((t) => t.trim()).filter(Boolean)])]
    if (clientName) {
      const match = clients.find((c) => c.name.localeCompare(clientName, 'es', { sensitivity: 'base' }) === 0)
        ?? clients.find((c) => c.name.toLowerCase().includes(clientName.toLowerCase()))
      if (match) next.client_id = match.id
      else next.notes = [values.notes ?? form.notes, `Cliente indicado: ${clientName}`].filter(Boolean).join('\n')
    }
    setForm((f) => ({ ...f, ...next } as typeof f))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      onSaved(await api.sessions.save(form))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal title={session ? 'Editar sesión' : 'Nueva sesión'} onClose={onClose}>
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
            <select value={form.type ?? ''} onChange={set('type')}>
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
          <label>Lugar<input value={form.location ?? ''} onChange={set('location')} /></label>
        </div>
        <div className="row">
          <label>Estado
            <select value={form.status} onChange={set('status')}>
              {SESSION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label>Precio (€)
            <input type="number" min="0" step="0.01" value={form.price ?? ''}
              onChange={(e) => setForm({ ...form, price: e.target.value === '' ? null : Number(e.target.value) })} />
          </label>
        </div>
        <label>Etiquetas
          <TagInput value={form.tags} onAdd={(t) => setForm({ ...form, tags: [...form.tags, t] })}
            onRemove={(t) => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })} />
        </label>
        <label>Notas<textarea rows={3} value={form.notes ?? ''} onChange={set('notes')} /></label>
        {error && <p className="error">{error}</p>}
        {pasting && <PasteDataDialog target="session" onClose={() => setPasting(false)} onApply={applyPasted} />}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Guardar</button>
        </footer>
      </form>
    </Modal>
  )
}
