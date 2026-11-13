import { useEffect, useState } from 'react'
import type { ChangelogEntry } from '../../../shared/changelog'
import { api, formatDate } from '../util'
import Modal from './Modal'

/** Ventana de novedades: se abre sola la primera vez que arrancas tras actualizar. */
export default function WhatsNew() {
  const [data, setData] = useState<{ version: string; entries: ChangelogEntry[] } | null>(null)
  useEffect(() => { api.app.whatsNew().then(setData) }, [])

  function close() {
    api.app.whatsNewSeen()
    setData(null)
  }
  if (!data?.entries.length) return null

  return (
    <Modal title={`FotoGestor ${data.version}`} onClose={close}>
      <div className="whats-new">
        <p className="muted">La aplicación se ha actualizado. Esto es lo que trae:</p>
        {data.entries.map((e) => (
          <section key={e.version}>
            <h3>
              {e.title} <span className="muted small">v{e.version} · {formatDate(e.date)}</span>
            </h3>
            <ul>{e.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </section>
        ))}
        <footer>
          <button className="primary" onClick={close}>Entendido</button>
        </footer>
      </div>
    </Modal>
  )
}
