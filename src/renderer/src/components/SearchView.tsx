import { useEffect, useState } from 'react'
import type { SearchResults } from '../../../shared/types'
import type { View } from '../App'
import { api, CONTACT_KIND_ICON, CONTACT_KIND_LABEL } from '../util'
import SessionCard from './SessionCard'

export default function SearchView({ nav, initial = '' }: { nav: (v: View) => void; initial?: string }) {
  const [q, setQ] = useState(initial)
  const [res, setRes] = useState<SearchResults | null>(null)
  const [tags, setTags] = useState<string[]>([])
  useEffect(() => { api.tags().then(setTags) }, [])
  useEffect(() => {
    if (!q.trim()) { setRes(null); return }
    const t = setTimeout(() => api.search(q).then(setRes), 180)
    return () => clearTimeout(t)
  }, [q])

  const empty = res && !res.clients.length && !res.contacts.length && !res.sessions.length && !res.photos.length

  return (
    <div className="page">
      <header className="page-header"><h1>Buscar</h1></header>
      <input className="search-big" autoFocus placeholder="Clientes, eventos, lugares, etiquetas, nombres de archivo, cámara, objetivo…"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {!q.trim() && tags.length > 0 && (
        <>
          <h2>Etiquetas</h2>
          <div className="tag-cloud">{tags.map((t) => <button key={t} className="chip" onClick={() => setQ(t)}>{t}</button>)}</div>
        </>
      )}
      {empty && <p className="empty">Sin resultados para «{q}».</p>}
      {res && res.clients.length > 0 && (
        <>
          <h2>Clientes ({res.clients.length})</h2>
          <div className="result-list">
            {res.clients.map((c) => (
              <button key={c.id} className="result" onClick={() => nav({ name: 'client', id: c.id })}>
                <strong>{c.name}</strong>
                <span className="muted small">{[c.email, c.phone].filter(Boolean).join(' · ')} · {c.session_count ?? 0} eventos</span>
              </button>
            ))}
          </div>
        </>
      )}
      {res && res.contacts.length > 0 && (
        <>
          <h2>Circuitos y organizadores ({res.contacts.length})</h2>
          <div className="result-list">
            {res.contacts.map((c) => (
              <button key={c.id} className="result" onClick={() => nav({ name: 'contact', id: c.id })}>
                <strong>{CONTACT_KIND_ICON[c.kind]} {c.name}</strong>
                <span className="muted small">
                  {[CONTACT_KIND_LABEL[c.kind], c.locality, c.accred_email ?? c.email, c.phone].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {res && res.sessions.length > 0 && (
        <>
          <h2>Eventos ({res.sessions.length})</h2>
          <div className="card-grid">
            {res.sessions.map((s) => <SessionCard key={s.id} s={s} onOpen={() => nav({ name: 'session', id: s.id })} />)}
          </div>
        </>
      )}
      {res && res.photos.length > 0 && (
        <>
          <h2>Fotos ({res.photos.length}{res.photos.length === 120 ? '+' : ''})</h2>
          <div className="photo-results">
            {res.photos.map((p) => (
              <button key={p.id} className="photo-result" onClick={() => nav({ name: 'session', id: p.session_id, photoId: p.id })}
                title={`${p.file_name} — ${p.session_title}`}>
                <img src={api.mediaUrl(p.thumb_key)} loading="lazy" alt={p.file_name} />
                <span className="small">{p.file_name}</span>
                <span className="muted small">{p.session_title}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
