import { FormEvent, useEffect, useState } from 'react'
import type { Client, ClientInput, ClientKind } from '../../../shared/types'
import { CLIENT_KINDS } from '../../../shared/types'
import { ageFrom, api, CLIENT_KIND_ICON, CLIENT_KIND_LABEL, errorMessage } from '../util'
import Modal from './Modal'

const KIND_HELP: Record<ClientKind, string> = {
  piloto: 'Corre en circuito: dorsal, categoría, moto/coche, equipo…',
  equipo: 'Escudería o equipo: persona de contacto, pilotos, marca…',
  particular: 'Persona ajena a los circuitos y las carreras'
}

function emptyInput(client?: Client, kind?: ClientKind): ClientInput {
  const v = (x: string | null | undefined) => x ?? ''
  return {
    id: client?.id,
    kind: kind ?? client?.kind ?? 'particular',
    name: v(client?.name), email: v(client?.email), phone: v(client?.phone), instagram: v(client?.instagram),
    notes: v(client?.notes), tax_id: v(client?.tax_id), address: v(client?.address),
    racing_number: v(client?.racing_number), category: v(client?.category), vehicle: v(client?.vehicle),
    team_id: client?.team_id ?? null, nationality: v(client?.nationality), birth_date: v(client?.birth_date),
    license_number: v(client?.license_number), guardian_name: v(client?.guardian_name), guardian_phone: v(client?.guardian_phone),
    contact_name: v(client?.contact_name), contact_role: v(client?.contact_role), brand: v(client?.brand), website: v(client?.website)
  }
}

export default function ClientForm({ client, defaultKind, onClose, onSaved }: {
  client?: Client
  defaultKind?: ClientKind
  onClose: () => void
  onSaved: (c: Client) => void
}) {
  // Si el cliente aún no tiene tipo (o es nuevo), primero se pregunta cuál es.
  const [kind, setKind] = useState<ClientKind | null>(client?.kind ?? defaultKind ?? null)
  const [form, setForm] = useState<ClientInput>(() => emptyInput(client, client?.kind ?? defaultKind))
  const [teams, setTeams] = useState<Client[]>([])
  const [error, setError] = useState('')
  useEffect(() => { api.clients.list().then((cs) => setTeams(cs.filter((c) => c.kind === 'equipo' && c.id !== client?.id))) }, [client?.id])

  const set = (k: keyof ClientInput) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const choose = (k: ClientKind) => { setKind(k); setForm((f) => ({ ...f, kind: k })) }
  const age = ageFrom(form.birth_date)
  const minor = age !== null && age < 18

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      onSaved(await api.clients.save(form))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const title = client ? `Editar ${kind ? CLIENT_KIND_LABEL[kind].toLowerCase() : 'cliente'}` : kind ? `Nuevo ${CLIENT_KIND_LABEL[kind].toLowerCase()}` : 'Nuevo cliente'

  if (!kind) {
    return (
      <Modal title={title} onClose={onClose}>
        <p className="muted">¿Qué tipo de cliente es{client ? ` ${client.name}` : ''}?</p>
        <div className="kind-picker">
          {CLIENT_KINDS.map((k) => (
            <button key={k} type="button" className="kind-option" onClick={() => choose(k)}>
              <span className="kind-icon">{CLIENT_KIND_ICON[k]}</span>
              <strong>{CLIENT_KIND_LABEL[k]}</strong>
              <span className="muted small">{KIND_HELP[k]}</span>
            </button>
          ))}
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <div className="kind-switch">
          <span className="muted small">Tipo:</span>
          <div className="segmented">
            {CLIENT_KINDS.map((k) => (
              <button key={k} type="button" className={kind === k ? 'active' : ''} onClick={() => choose(k)}>
                {CLIENT_KIND_ICON[k]} {CLIENT_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          <label>{kind === 'equipo' ? 'Nombre del equipo *' : 'Nombre y apellidos *'}<input autoFocus value={form.name} onChange={set('name')} /></label>
          {kind === 'piloto' && <label className="narrow-field">Dorsal<input value={form.racing_number ?? ''} onChange={set('racing_number')} placeholder="Ej.: 46" /></label>}
        </div>

        {kind === 'piloto' && (
          <>
            <div className="row">
              <label>Categoría / campeonato<input value={form.category ?? ''} onChange={set('category')} placeholder="Ej.: Supersport 300, Copa…" /></label>
              <label>Moto / coche<input value={form.vehicle ?? ''} onChange={set('vehicle')} placeholder="Ej.: Yamaha R3" /></label>
            </div>
            <div className="row">
              <label>Equipo
                <select value={form.team_id ?? ''} onChange={(e) => setForm({ ...form, team_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— Sin equipo / privado —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {!teams.length && <span className="muted small hint">Da de alta el equipo como cliente de tipo «Equipo» para poder elegirlo aquí.</span>}
              </label>
              <label>Nacionalidad<input value={form.nationality ?? ''} onChange={set('nationality')} /></label>
            </div>
            <div className="row">
              <label>Fecha de nacimiento
                <input type="date" value={form.birth_date ?? ''} onChange={set('birth_date')} />
                {age !== null && <span className="muted small hint">{age} años</span>}
              </label>
              <label>Nº de licencia<input value={form.license_number ?? ''} onChange={set('license_number')} /></label>
            </div>
            {minor && (
              <fieldset className="minor-box">
                <legend>Menor de edad</legend>
                <p className="small">Para usar o vender sus imágenes necesitas la autorización de su padre, madre o tutor legal.</p>
                <div className="row">
                  <label>Nombre del tutor<input value={form.guardian_name ?? ''} onChange={set('guardian_name')} /></label>
                  <label>Teléfono del tutor<input value={form.guardian_phone ?? ''} onChange={set('guardian_phone')} /></label>
                </div>
              </fieldset>
            )}
          </>
        )}

        {kind === 'equipo' && (
          <>
            <div className="row">
              <label>Persona de contacto<input value={form.contact_name ?? ''} onChange={set('contact_name')} /></label>
              <label>Cargo<input value={form.contact_role ?? ''} onChange={set('contact_role')} placeholder="Ej.: Team manager, prensa…" /></label>
            </div>
            <div className="row">
              <label>Categoría / campeonato<input value={form.category ?? ''} onChange={set('category')} /></label>
              <label>Marca / fabricante<input value={form.brand ?? ''} onChange={set('brand')} /></label>
            </div>
            <label>Web<input value={form.website ?? ''} onChange={set('website')} placeholder="https://…" /></label>
            {client?.pilot_names && <p className="muted small">Pilotos del equipo: {client.pilot_names}</p>}
          </>
        )}

        <h3 className="form-section">Contacto</h3>
        <div className="row">
          <label>Email<input type="email" value={form.email ?? ''} onChange={set('email')} /></label>
          <label>Teléfono<input value={form.phone ?? ''} onChange={set('phone')} /></label>
          <label>Instagram<input value={form.instagram ?? ''} onChange={set('instagram')} placeholder="@usuario" /></label>
        </div>

        <h3 className="form-section">Facturación</h3>
        <div className="row">
          <label>{kind === 'equipo' ? 'CIF' : 'NIF / CIF'}<input value={form.tax_id ?? ''} onChange={set('tax_id')} /></label>
          <label>Dirección<input value={form.address ?? ''} onChange={set('address')} /></label>
        </div>
        <label>Notas<textarea rows={2} value={form.notes ?? ''} onChange={set('notes')} /></label>
        {error && <p className="error">{error}</p>}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Guardar</button>
        </footer>
      </form>
    </Modal>
  )
}
