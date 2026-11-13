import { useEffect, useState } from 'react'
import type { Client, Session, SessionStatus } from '../../../shared/types'
import { SESSION_STATUSES } from '../../../shared/types'
import type { View } from '../App'
import { api, STATUS_LABEL } from '../util'
import SessionCard from './SessionCard'
import SessionForm from './SessionForm'

export default function SessionsView({ nav, clientId, create }: { nav: (v: View) => void; clientId?: number; create?: boolean }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [status, setStatus] = useState<SessionStatus | ''>('')
  const [client, setClient] = useState<number | ''>(clientId ?? '')
  const [championship, setChampionship] = useState('')
  const [championships, setChampionships] = useState<string[]>([])
  const [creating, setCreating] = useState(!!create)

  useEffect(() => { api.clients.list().then(setClients); api.championships().then(setChampionships) }, [])
  useEffect(() => {
    api.sessions.list({ clientId: client || undefined, status: status || undefined, championship: championship || undefined }).then(setSessions)
  }, [status, client, championship])

  return (
    <div className="page">
      <header className="page-header">
        <h1>Eventos</h1>
        <select value={client} onChange={(e) => setClient(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Todos los clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as SessionStatus | '')}>
          <option value="">Todos los estados</option>
          {SESSION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        {championships.length > 0 && (
          <select value={championship} onChange={(e) => setChampionship(e.target.value)} aria-label="Campeonato">
            <option value="">Todos los campeonatos</option>
            {championships.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button className="primary" onClick={() => setCreating(true)}>+ Nuevo evento</button>
      </header>
      {sessions.length ? (
        <div className="card-grid">
          {sessions.map((s) => <SessionCard key={s.id} s={s} onOpen={() => nav({ name: 'session', id: s.id })} />)}
        </div>
      ) : (
        <p className="empty">No hay eventos con estos filtros.</p>
      )}
      {creating && (
        <SessionForm defaultClientId={client || undefined} onClose={() => setCreating(false)}
          onSaved={(s) => nav({ name: 'session', id: s.id })} />
      )}
    </div>
  )
}
