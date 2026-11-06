import { useState } from 'react'
import Dashboard from './components/Dashboard'
import ClientsView from './components/ClientsView'
import SessionsView from './components/SessionsView'
import SessionDetail from './components/SessionDetail'

export type View =
  | { name: 'dashboard' }
  | { name: 'clients' }
  | { name: 'sessions'; clientId?: number }
  | { name: 'session'; id: number }

export default function App() {
  const [view, setView] = useState<View>({ name: 'dashboard' })
  const nav = (v: View) => setView(v)
  const active = view.name === 'session' ? 'sessions' : view.name

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◉</span> FotoGestor
        </div>
        <nav>
          <button className={active === 'dashboard' ? 'active' : ''} onClick={() => nav({ name: 'dashboard' })}>Panel</button>
          <button className={active === 'sessions' ? 'active' : ''} onClick={() => nav({ name: 'sessions' })}>Sesiones</button>
          <button className={active === 'clients' ? 'active' : ''} onClick={() => nav({ name: 'clients' })}>Clientes</button>
        </nav>
      </aside>
      <main className="content">
        {view.name === 'dashboard' && <Dashboard nav={nav} />}
        {view.name === 'clients' && <ClientsView nav={nav} />}
        {view.name === 'sessions' && <SessionsView nav={nav} clientId={view.clientId} />}
        {view.name === 'session' && <SessionDetail id={view.id} nav={nav} />}
      </main>
    </div>
  )
}
