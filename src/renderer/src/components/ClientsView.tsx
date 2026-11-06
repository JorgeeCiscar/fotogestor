import { useEffect, useState } from 'react'
import type { Client } from '../../../shared/types'
import type { View } from '../App'
import { api, errorMessage } from '../util'
import ClientForm from './ClientForm'

export default function ClientsView({ nav }: { nav: (v: View) => void }) {
  const [clients, setClients] = useState<Client[]>([])
  const [editing, setEditing] = useState<Client | 'new' | null>(null)
  const [q, setQ] = useState('')
  const load = () => api.clients.list().then(setClients)
  useEffect(() => { load() }, [])

  const filtered = clients.filter((c) =>
    [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q.toLowerCase()))
  )

  async function remove(c: Client) {
    if (!confirm(`¿Eliminar a ${c.name}? Sus sesiones se conservarán sin cliente asignado.`)) return
    try { await api.clients.remove(c.id); load() } catch (err) { alert(errorMessage(err)) }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Clientes</h1>
        <input className="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => setEditing('new')}>+ Nuevo cliente</button>
      </header>
      {filtered.length ? (
        <table className="table">
          <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Sesiones</th><th /></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong>{c.notes && <div className="muted small">{c.notes}</div>}</td>
                <td>{c.email ?? '—'}</td>
                <td>{c.phone ?? '—'}</td>
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
        <p className="empty">{clients.length ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes.'}</p>
      )}
      {editing && (
        <ClientForm
          client={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
