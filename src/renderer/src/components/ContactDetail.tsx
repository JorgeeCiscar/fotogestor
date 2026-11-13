import { useCallback, useEffect, useState } from 'react'
import type { Contact, Session } from '../../../shared/types'
import type { View } from '../App'
import { api, CONTACT_KIND_ICON, CONTACT_KIND_LABEL, errorMessage } from '../util'
import ContactForm from './ContactForm'
import SessionCard from './SessionCard'

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (<><dt>{label}</dt><dd>{value}</dd></>)
}

/** Ficha de un circuito o un organizador. */
export default function ContactDetail({ id, nav }: { id: number; nav: (v: View) => void }) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [editing, setEditing] = useState(false)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    const c = await api.contacts.get(id)
    if (!c) { setMissing(true); return }
    setContact(c)
    const all = await api.sessions.list()
    setSessions(all.filter((s) => s.circuit_id === id || s.organizer_id === id))
  }, [id])
  useEffect(() => { load() }, [load])

  async function remove() {
    if (!contact || !confirm(`¿Eliminar «${contact.name}»?`)) return
    try { await api.contacts.remove(contact.id); nav({ name: 'contacts' }) } catch (err) { alert(errorMessage(err)) }
  }

  if (missing) return <div className="page"><p className="empty">Este contacto ya no existe.</p></div>
  if (!contact) return null
  const c = contact
  const hasContact = c.phone || c.email || c.instagram || c.website || c.contact_name
  const hasAccred = c.accred_name || c.accred_email || c.accred_phone || c.accred_deadline || c.accred_notes
  const hasAccess = c.address || c.access_gate || c.parking || c.hours || c.wifi || c.track_notes

  return (
    <div className="page client-page">
      <header className="page-header">
        <button className="ghost" onClick={() => nav({ name: 'contacts' })}>← Contactos</button>
        <div className="session-title">
          <h1>{c.name} <span className={`kind-badge kind-${c.kind}`}>{CONTACT_KIND_ICON[c.kind]} {CONTACT_KIND_LABEL[c.kind]}</span></h1>
          <span className="muted">{[c.locality, c.contact_name && `${c.contact_name}${c.contact_role ? ` (${c.contact_role})` : ''}`].filter(Boolean).join(' · ')}</span>
        </div>
        <button className="ghost" onClick={() => setEditing(true)}>Editar</button>
        <button className="ghost danger" onClick={remove}>Eliminar</button>
      </header>

      <div className="client-cols">
        <section className="client-data">
          {hasContact && (
            <>
              <h2>Contacto</h2>
              <dl className="data-list">
                <Row label="Teléfono" value={c.phone} />
                <Row label="Email" value={c.email} />
                <Row label="Instagram" value={c.instagram ? `@${c.instagram}` : null} />
                <Row label="Web" value={c.website} />
                <Row label="Persona" value={[c.contact_name, c.contact_role && `(${c.contact_role})`].filter(Boolean).join(' ') || null} />
              </dl>
            </>
          )}

          {hasAccred && (
            <>
              <h2>Acreditaciones</h2>
              <dl className="data-list">
                <Row label="Prensa" value={c.accred_name} />
                <Row label="Email" value={c.accred_email} />
                <Row label="Teléfono" value={c.accred_phone} />
                <Row label="Plazo" value={c.accred_deadline} />
                <Row label="Requisitos" value={c.accred_notes} />
              </dl>
            </>
          )}

          {hasAccess && (
            <>
              <h2>Acceso y logística</h2>
              <dl className="data-list">
                <Row label="Dirección" value={c.address} />
                <Row label="Puerta" value={c.access_gate} />
                <Row label="Parking" value={c.parking} />
                <Row label="Horarios" value={c.hours} />
                <Row label="Wifi" value={c.wifi} />
              </dl>
              {c.track_notes && <p className="notes-text" style={{ marginTop: 10 }}>{c.track_notes}</p>}
            </>
          )}

          {(c.tax_id || c.tax_address) && (
            <>
              <h2>Facturación</h2>
              <dl className="data-list">
                <Row label="NIF / CIF" value={c.tax_id} />
                <Row label="Dirección" value={c.tax_address} />
              </dl>
            </>
          )}

          {c.notes && (<><h2>Notas</h2><p className="notes-text">{c.notes}</p></>)}
        </section>

        <section className="client-activity">
          <h2>Eventos aquí</h2>
          {sessions.length ? (
            <div className="card-grid">
              {sessions.map((s) => <SessionCard key={s.id} s={s} onOpen={() => nav({ name: 'session', id: s.id })} />)}
            </div>
          ) : (
            <p className="muted small">
              Todavía no hay eventos con este {c.kind === 'circuito' ? 'circuito' : 'organizador'}.
              {c.kind === 'circuito' && ' Escribe su nombre exacto en el «Lugar» de un evento y se enlazará solo.'}
            </p>
          )}
        </section>
      </div>

      {editing && <ContactForm contact={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}
    </div>
  )
}
