import { useEffect, useState } from 'react'
import Dashboard from './components/Dashboard'
import ClientsView from './components/ClientsView'
import SessionsView from './components/SessionsView'
import SessionDetail from './components/SessionDetail'
import LibraryView from './components/LibraryView'
import SearchView from './components/SearchView'
import InvoicesView from './components/InvoicesView'
import SettingsView from './components/SettingsView'
import UpdateBanner, { AppVersion } from './components/UpdateBanner'
import WhatsNew from './components/WhatsNew'

export type View =
  | { name: 'dashboard' }
  | { name: 'clients' }
  | { name: 'sessions'; clientId?: number }
  | { name: 'library' }
  | { name: 'session'; id: number; photoId?: number }
  | { name: 'search'; q?: string }
  | { name: 'invoices'; openId?: number; newForSession?: number }
  | { name: 'settings' }

const NAV: [View['name'], string][] = [
  ['dashboard', 'Panel'],
  ['sessions', 'Sesiones'],
  ['library', 'Fotos'],
  ['clients', 'Clientes'],
  ['invoices', 'Facturación'],
  ['search', 'Buscar'],
  ['settings', 'Ajustes']
]

export default function App() {
  const [view, setView] = useState<View>({ name: 'dashboard' })
  const nav = (v: View) => setView(v)
  const active = view.name === 'session' ? 'sessions' : view.name

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setView({ name: 'search' }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">◉</span> FotoGestor</div>
        <nav>
          {NAV.map(([name, label]) => (
            <button key={name} className={active === name ? 'active' : ''} onClick={() => nav({ name } as View)}>
              {label}{name === 'search' && <kbd>Ctrl K</kbd>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <UpdateBanner />
          <AppVersion />
        </div>
      </aside>
      <main className="content">
        {view.name === 'dashboard' && <Dashboard nav={nav} />}
        {view.name === 'clients' && <ClientsView nav={nav} />}
        {view.name === 'sessions' && <SessionsView nav={nav} clientId={view.clientId} />}
        {view.name === 'library' && <LibraryView nav={nav} />}
        {view.name === 'session' && <SessionDetail key={view.id} id={view.id} photoId={view.photoId} nav={nav} />}
        {view.name === 'search' && <SearchView nav={nav} initial={view.q} />}
        {view.name === 'invoices' && <InvoicesView nav={nav} openId={view.openId} newForSession={view.newForSession} />}
        {view.name === 'settings' && <SettingsView />}
      </main>
      <WhatsNew />
    </div>
  )
}
