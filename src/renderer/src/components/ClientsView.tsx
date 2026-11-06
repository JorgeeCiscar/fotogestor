import { useEffect, useState } from 'react'
import type { Client, ClientKind } from '../../../shared/types'
import type { View } from '../App'
import { ageFrom, api, CLIENT_KIND_ICON, CLIENT_KIND_LABEL, errorMessage } from '../util'
import ClientForm from './ClientForm'

type Tab = 'all' | ClientKind | 'none'

export default function ClientsView({ nav }: { nav: (v: View) => void }) {
  const [clients, setClients] = useState<Client[]>([])
  const [editing, setEditing] = useState<Client | 'new' | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const load = () => api.clients.list().then(setClients)
  useEffect(() => { load() }, [])

  const count = (t: Tab) => clients.filter((c) => t === 'all' || (t === 'none' ? !c.kind : c.kind === t)).length
  const TABS: [Tab, string][] = [
    ['all', 'Todos'], ['piloto', '🏁 Pilotos'], ['equipo', '🏢 Equipos'], ['particular', '👤 Particulares'],
    ...(count('none') ? [['none', 'Sin tipo'] as [Tab, string]] : [])
  ]
  const needle = q.toLowerCase().replace(/^#/, '')
  const filtered = clients
    .filter((c) => tab === 'all' || (tab === 'none' ? !c.kind : c.kind === tab))
    .filter((c) => !needle || [c.name, c.email, c.phone, c.instagram, c.racing_number, c.category, c.vehicle, c.team_name, c.contact_name, c.brand]
      .some((v) => v?.toLowerCase().includes(needle)))

  async function remove(c: Client) {
    const extra = c.kind === 'equipo' && c.pilot_count ? ` Sus ${c.pilot_count} pilotos quedarán sin equipo.` : ''
    if (!confirm(`¿Eliminar a ${c.name}? Sus sesiones se conservarán sin cliente asignado.${extra}`)) return
    try { await api.clients.remove(c.id); load() } catch (err) { alert(errorMessage(err)) }
  }

  /** Línea de detalle según el tipo de cliente. */
  function details(c: Client): string {
    if (c.kind === 'piloto') {
      const age = ageFrom(c.birth_date)
      return [c.category, c.vehicle, c.team_name ?? (c.team_id ? null : 'Privado'),
        age !== null && age < 18 && `Menor (${age} años)`].filter(Boolean).join(' · ')
    }
    if (c.kind === 'equipo') {
      return [c.category, c.brand, c.contact_name && `Contacto: ${c.contact_name}${c.contact_role ? ` (${c.contact_role})` : ''}`,
        `${c.pilot_count ?? 0} ${c.pilot_count === 1 ? 'piloto' : 'pilotos'}`].filter(Boolean).join(' · ')
    }
    return c.notes ?? ''
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Clientes</h1>
        <input className="search" placeholder="Buscar nombre, dorsal, equipo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => setEditing('new')}>+ Nuevo cliente</button>
      </header>
      <div className="toolbar">
        <div className="segmented">
          {TABS.map(([t, label]) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{label} <span className="muted">{count(t)}</span></button>
          ))}
        </div>
      </div>
      {filtered.length ? (
        <table className="table clients-table">
          <thead><tr><th>Cliente</th><th>Tipo</th><th>Contacto</th><th>Sesiones</th><th /></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.kind === 'piloto' && c.racing_number && <span className="dorsal">{c.racing_number}</span>}{c.name}</strong>
                  {details(c) && <div className="muted small">{details(c)}</div>}
                  {c.kind === 'equipo' && c.pilot_names && <div className="muted small">Pilotos: {c.pilot_names}</div>}
                </td>
                <td>{c.kind ? <span className={`kind-badge kind-${c.kind}`}>{CLIENT_KIND_ICON[c.kind]} {CLIENT_KIND_LABEL[c.kind]}</span>
                  : <button className="link" onClick={() => setEditing(c)}>Indicar tipo</button>}</td>
                <td className="small">
                  {[c.email, c.phone].filter(Boolean).join(' · ') || (c.instagram ? '' : '—')}
                  {c.instagram && <div className="muted">@{c.instagram}</div>}
                </td>
                <td><button className="link" onClick={() => nav({ name: 'sessions', clientId: c.id })}>{c.session_count ?? 0}</button></td>
                <td className="actions">
                  <button className="ghost" onClick={() => setEditing(c)}>Editar</button>
                  <button className="ghost danger" onClick={() => remove(c)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">{clients.length ? 'Ningún cliente coincide.' : 'Aún no hay clientes.'}</p>
      )}
      {editing && (
        <ClientForm
          client={editing === 'new' ? undefined : editing}
          defaultKind={editing === 'new' && tab !== 'all' && tab !== 'none' ? tab : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
