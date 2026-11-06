import { useEffect, useState } from 'react'
import type { DashboardStats } from '../../../shared/types'
import type { View } from '../App'
import { api, formatMoney } from '../util'
import SessionCard from './SessionCard'
import SessionForm from './SessionForm'

export default function Dashboard({ nav }: { nav: (v: View) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => { api.stats().then(setStats) }, [])
  if (!stats) return null

  return (
    <div className="page">
      <header className="page-header">
        <h1>Panel</h1>
        <button className="primary" onClick={() => setCreating(true)}>+ Nueva sesión</button>
      </header>
      <div className="stats">
        <div className="stat"><span>{stats.sessions}</span>Sesiones</div>
        <div className="stat"><span>{stats.pendingDelivery}</span>Pendientes de entrega</div>
        <div className="stat"><span>{stats.clients}</span>Clientes</div>
        <div className="stat"><span>{stats.photos.toLocaleString('es-ES')}</span>Fotografías</div>
      </div>
      <div className="stats">
        <button className="stat" onClick={() => nav({ name: 'invoices' })}><span>{formatMoney(stats.invoicedThisYear)}</span>Facturado este año</button>
        <button className="stat" onClick={() => nav({ name: 'invoices' })}>
          <span>{formatMoney(stats.pendingAmount)}</span>Pendiente de cobro ({stats.pendingInvoices} {stats.pendingInvoices === 1 ? 'factura' : 'facturas'})
        </button>
      </div>
      <h2>Próximas sesiones</h2>
      {stats.upcoming.length ? (
        <div className="card-grid">
          {stats.upcoming.map((s) => <SessionCard key={s.id} s={s} onOpen={() => nav({ name: 'session', id: s.id })} />)}
        </div>
      ) : (
        <p className="empty">No hay sesiones programadas. Crea una para empezar.</p>
      )}
      {creating && <SessionForm onClose={() => setCreating(false)} onSaved={(s) => nav({ name: 'session', id: s.id })} />}
    </div>
  )
}
