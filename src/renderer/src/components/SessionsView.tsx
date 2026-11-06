import { useEffect, useState } from 'react'
import type { Client, Session, SessionStatus } from '../../../shared/types'
import { SESSION_STATUSES } from '../../../shared/types'
import type { View } from '../App'
import { api, STATUS_LABEL } from '../util'
import SessionCard from './SessionCard'
import SessionForm from './SessionForm'

export default function SessionsView({ nav, clientId }: { nav: (v: View) => void; clientId?: number }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [status, setStatus] = useState<SessionStatus | ''>('')
  const [client, setClient] = useState<number | ''>(clientId ?? '')
  const [creating, setCreating] = useState(false)

  useEffect(() => { api.clients.list().then(setClients) }, [])
  useEffect(() => {
    api.sessions.list({ clientId: client || undefined, status: status || undefined }).then(setSessions)
  }, [status, client])

  return (
    <div className="page">
      <header className="page-header">
        <h1>Sesiones</h1>
        <select value={client} onChange={(e) => setClient(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Todos los clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as SessionStatus | '')}>
          <option value="">Todos los estados</option>
          {SESSION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="primary" onClick={() => setCreating(true)}>+ Nueva sesión</button>
      </header>
      {sessions.length ? (
        <div className="card-grid">
          {sessions.map((s) => <SessionCard key={s.id} s={s} onOpen={() => nav({ name: 'session', id: s.id })} />)}
        </div>
      ) : (
        <p className="empty">No hay sesiones con estos filtros.</p>
      )}
      {creating && (
        <SessionForm defaultClientId={client || undefined} onClose={() => setCreating(false)}
          onSaved={(s) => nav({ name: 'session', id: s.id })} />
      )}
    </div>
  )
}
