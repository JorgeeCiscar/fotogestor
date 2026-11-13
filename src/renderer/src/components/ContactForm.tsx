import { FormEvent, useState } from 'react'
import type { Contact, ContactInput, ContactKind } from '../../../shared/types'
import { CONTACT_KINDS } from '../../../shared/types'
import { api, CONTACT_KIND_ICON, CONTACT_KIND_LABEL, errorMessage } from '../util'
import Modal from './Modal'

const KIND_HELP: Record<ContactKind, string> = {
  circuito: 'El lugar: Cheste, Jerez, un karting… Acceso, parking, prensa.',
  organizador: 'Quien organiza la prueba o el campeonato: club, promotora, federación.'
}

function emptyInput(contact?: Contact, kind?: ContactKind): ContactInput {
  const v = (x: string | null | undefined) => x ?? ''
  return {
    id: contact?.id,
    kind: kind ?? contact?.kind ?? 'circuito',
    name: v(contact?.name), locality: v(contact?.locality), address: v(contact?.address),
    website: v(contact?.website), instagram: v(contact?.instagram), email: v(contact?.email), phone: v(contact?.phone),
    contact_name: v(contact?.contact_name), contact_role: v(contact?.contact_role),
    accred_name: v(contact?.accred_name), accred_email: v(contact?.accred_email), accred_phone: v(contact?.accred_phone),
    accred_deadline: v(contact?.accred_deadline), accred_notes: v(contact?.accred_notes),
    access_gate: v(contact?.access_gate), parking: v(contact?.parking), hours: v(contact?.hours),
    wifi: v(contact?.wifi), track_notes: v(contact?.track_notes),
    tax_id: v(contact?.tax_id), tax_address: v(contact?.tax_address), notes: v(contact?.notes)
  }
}

export default function ContactForm({ contact, defaultKind, onClose, onSaved }: {
  contact?: Contact
  defaultKind?: ContactKind
  onClose: () => void
  onSaved: (c: Contact) => void
}) {
  const [kind, setKind] = useState<ContactKind | null>(contact?.kind ?? defaultKind ?? null)
  const [form, setForm] = useState<ContactInput>(() => emptyInput(contact, contact?.kind ?? defaultKind))
  const [error, setError] = useState('')
  const set = (k: keyof ContactInput) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const choose = (k: ContactKind) => { setKind(k); setForm((f) => ({ ...f, kind: k })) }

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      onSaved(await api.contacts.save(form))
    } catch (err) { setError(errorMessage(err)) }
  }

  const title = contact ? `Editar ${CONTACT_KIND_LABEL[contact.kind].toLowerCase()}` : kind ? `Nuevo ${CONTACT_KIND_LABEL[kind].toLowerCase()}` : 'Nuevo contacto'

  if (!kind) {
    return (
      <Modal title={title} onClose={onClose}>
        <p className="muted">¿Qué tipo de contacto es?</p>
        <div className="kind-picker two">
          {CONTACT_KINDS.map((k) => (
            <button key={k} type="button" className="kind-option" onClick={() => choose(k)}>
              <span className="kind-icon">{CONTACT_KIND_ICON[k]}</span>
              <strong>{CONTACT_KIND_LABEL[k]}</strong>
              <span className="muted small">{KIND_HELP[k]}</span>
            </button>
          ))}
        </div>
      </Modal>
    )
  }

  const isCircuit = kind === 'circuito'
  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <div className="kind-switch">
          <span className="muted small">Tipo:</span>
          <div className="segmented">
            {CONTACT_KINDS.map((k) => (
              <button key={k} type="button" className={kind === k ? 'active' : ''} onClick={() => choose(k)}>
                {CONTACT_KIND_ICON[k]} {CONTACT_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          <label>{isCircuit ? 'Nombre del circuito *' : 'Nombre del organizador *'}
            <input autoFocus value={form.name} onChange={set('name')}
              placeholder={isCircuit ? 'Circuit Ricardo Tormo' : 'RFME · Cuna de Campeones'} />
          </label>
          <label>Localidad<input value={form.locality ?? ''} onChange={set('locality')} placeholder="Cheste (Valencia)" /></label>
        </div>

        <h3 className="form-section">Contacto general</h3>
        <div className="row">
          <label>Teléfono<input value={form.phone ?? ''} onChange={set('phone')} /></label>
          <label>Email<input type="email" value={form.email ?? ''} onChange={set('email')} /></label>
          <label>Instagram<input value={form.instagram ?? ''} onChange={set('instagram')} placeholder="@usuario" /></label>
        </div>
        <div className="row">
          <label>Persona de contacto<input value={form.contact_name ?? ''} onChange={set('contact_name')} /></label>
          <label>Cargo<input value={form.contact_role ?? ''} onChange={set('contact_role')} placeholder="Prensa, dirección…" /></label>
          <label>Web<input value={form.website ?? ''} onChange={set('website')} placeholder="https://…" /></label>
        </div>

        <h3 className="form-section">Acreditaciones</h3>
        <div className="row">
          <label>Responsable de prensa<input value={form.accred_name ?? ''} onChange={set('accred_name')} /></label>
          <label>Email de acreditación<input type="email" value={form.accred_email ?? ''} onChange={set('accred_email')} /></label>
          <label>Teléfono<input value={form.accred_phone ?? ''} onChange={set('accred_phone')} /></label>
        </div>
        <div className="row">
          <label>Plazo<input value={form.accred_deadline ?? ''} onChange={set('accred_deadline')} placeholder="Hasta el jueves anterior" /></label>
          <label>Requisitos<input value={form.accred_notes ?? ''} onChange={set('accred_notes')} placeholder="Chaleco propio, seguro, pase de boxes…" /></label>
        </div>

        {isCircuit && (
          <>
            <h3 className="form-section">Acceso y logística</h3>
            <label>Dirección<input value={form.address ?? ''} onChange={set('address')} /></label>
            <div className="row">
              <label>Puerta de acceso<input value={form.access_gate ?? ''} onChange={set('access_gate')} placeholder="Puerta 3, acceso prensa" /></label>
              <label>Dónde aparcar<input value={form.parking ?? ''} onChange={set('parking')} /></label>
            </div>
            <div className="row">
              <label>Horarios<input value={form.hours ?? ''} onChange={set('hours')} placeholder="Apertura 8:00, briefing 9:00" /></label>
              <label>Wifi<input value={form.wifi ?? ''} onChange={set('wifi')} placeholder="Red y contraseña" /></label>
            </div>
            <label>Notas de la pista
              <textarea rows={2} value={form.track_notes ?? ''} onChange={set('track_notes')}
                placeholder="Curvas con buena luz por la tarde, zonas autorizadas, dónde no se puede estar…" />
            </label>
          </>
        )}
        {!isCircuit && (
          <label>Dirección<input value={form.address ?? ''} onChange={set('address')} /></label>
        )}

        <h3 className="form-section">Facturación</h3>
        <div className="row">
          <label>NIF / CIF<input value={form.tax_id ?? ''} onChange={set('tax_id')} /></label>
          <label>Dirección fiscal<input value={form.tax_address ?? ''} onChange={set('tax_address')} /></label>
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
