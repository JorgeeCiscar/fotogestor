import { useEffect, useState } from 'react'
import type { Contact, ContactKind } from '../../../shared/types'
import type { View } from '../App'
import { api, CONTACT_KIND_ICON, CONTACT_KIND_LABEL, errorMessage } from '../util'
import ContactForm from './ContactForm'

type Tab = 'all' | ContactKind

export default function ContactsView({ nav }: { nav: (v: View) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [editing, setEditing] = useState<Contact | 'new' | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const load = () => api.contacts.list().then(setContacts)
  useEffect(() => { load() }, [])

  const count = (t: Tab) => contacts.filter((c) => t === 'all' || c.kind === t).length
  const needle = q.toLowerCase()
  const filtered = contacts
    .filter((c) => tab === 'all' || c.kind === tab)
    .filter((c) => !needle || [c.name, c.locality, c.contact_name, c.accred_name, c.email, c.phone]
      .some((v) => v?.toLowerCase().includes(needle)))

  async function remove(c: Contact) {
    if (!confirm(`¿Eliminar «${c.name}»? Los eventos que lo usan conservan su lugar escrito.`)) return
    try { await api.contacts.remove(c.id); load() } catch (err) { alert(errorMessage(err)) }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Contactos</h1>
        <input className="search" placeholder="Buscar circuito, organizador, prensa…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => setEditing('new')}>+ Nuevo contacto</button>
      </header>
      <p className="muted">Circuitos y organizadores: acreditaciones, acceso y a quién escribir. Se enlazan solos con el lugar de cada evento.</p>
      <div className="toolbar">
        <div className="segmented">
          {([['all', 'Todos'], ['circuito', '🏁 Circuitos'], ['organizador', '🏆 Organizadores']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{label} <span className="muted">{count(t)}</span></button>
          ))}
        </div>
      </div>
      {filtered.length ? (
        <table className="table">
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Acreditaciones</th><th>Contacto</th><th>Eventos</th><th /></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => nav({ name: 'contact', id: c.id })}>
                <td>
                  <strong>{c.name}</strong>
                  {c.locality && <div className="muted small">{c.locality}</div>}
                </td>
                <td><span className={`kind-badge kind-${c.kind}`}>{CONTACT_KIND_ICON[c.kind]} {CONTACT_KIND_LABEL[c.kind]}</span></td>
                <td className="small">
                  {c.accred_name || c.accred_email || c.accred_phone
                    ? <>{c.accred_name}{c.accred_name && (c.accred_email || c.accred_phone) ? ' · ' : ''}<span className="muted">{c.accred_email ?? c.accred_phone}</span></>
                    : <span className="muted">—</span>}
                </td>
                <td className="small">{[c.contact_name, c.phone].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
                <td>{c.session_count ?? 0}</td>
                <td className="actions">
                  <button className="ghost" onClick={(e) => { e.stopPropagation(); setEditing(c) }}>Editar</button>
                  <button className="ghost danger" onClick={(e) => { e.stopPropagation(); remove(c) }}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">{contacts.length ? 'Ningún contacto coincide.' : 'Aún no hay circuitos ni organizadores.'}</p>
      )}
      {editing && (
        <ContactForm
          contact={editing === 'new' ? undefined : editing}
          defaultKind={editing === 'new' && tab !== 'all' ? tab : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
