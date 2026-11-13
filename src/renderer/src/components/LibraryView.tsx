import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Client, LibraryFilter, LibraryPhoto, LibrarySort, Session } from '../../../shared/types'
import type { View } from '../App'
import { api, errorMessage, formatDate } from '../util'
import Stars from './Stars'

const PAGE = 200

const SORTS: [LibrarySort, string][] = [
  ['date_desc', 'Más recientes'],
  ['date_asc', 'Más antiguas'],
  ['session', 'Por evento'],
  ['rating', 'Mejor valoradas'],
  ['name', 'Nombre de archivo']
]

/** Fototeca: todas las fotos de todos los eventos, con filtros, selección y copia. */
export default function LibraryView({ nav, clientId, pilotId }: { nav: (v: View) => void; clientId?: number; pilotId?: number }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [sessionIds, setSessionIds] = useState<number[]>([])
  const [sessionQuery, setSessionQuery] = useState('')
  const [filter, setFilter] = useState<Omit<LibraryFilter, 'sessionIds'>>({ sort: 'date_desc', clientId, pilotId })
  const [q, setQ] = useState('')
  const [photos, setPhotos] = useState<LibraryPhoto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [bySession, setBySession] = useState(false)
  const [copying, setCopying] = useState<{ done: number; total: number } | null>(null)
  const [toast, setToast] = useState('')
  const request = useRef(0)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.sessions.list().then(setSessions)
    api.clients.list().then(setClients)
    api.tags().then(setTags)
  }, [])
  useEffect(() => api.library.onCopyProgress(setCopying), [])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t) } }, [toast])
  // La búsqueda de texto se aplica tras una pausa al escribir.
  useEffect(() => { const t = setTimeout(() => setFilter((f) => ({ ...f, q })), 250); return () => clearTimeout(t) }, [q])

  const fullFilter = useMemo<LibraryFilter>(() => ({ ...filter, sessionIds }), [filter, sessionIds])

  // Primera página al cambiar los filtros.
  useEffect(() => {
    const id = ++request.current
    setLoading(true)
    api.library.query(fullFilter, 0, PAGE).then((page) => {
      if (id !== request.current) return
      setPhotos(page.photos)
      setTotal(page.total)
      setLoading(false)
    })
  }, [fullFilter])

  const loadMore = useCallback(() => {
    if (loading || photos.length >= total) return
    const id = request.current
    setLoading(true)
    api.library.query(fullFilter, photos.length, PAGE).then((page) => {
      if (id !== request.current) return
      setPhotos((prev) => [...prev, ...page.photos])
      setLoading(false)
    })
  }, [loading, photos.length, total, fullFilter])

  // Carga más fotos al acercarse al final de la rejilla.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: '600px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  const selectAll = useCallback(async () => setSelected(new Set(await api.library.ids(fullFilter))), [fullFilter])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll() }
      else if (e.key === 'Escape') setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectAll])

  function clickPhoto(e: React.MouseEvent, index: number) {
    const id = photos[index].id
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, index), Math.max(anchor, index)]
      const next = new Set(e.ctrlKey || e.metaKey ? selected : [])
      photos.slice(a, b + 1).forEach((p) => next.add(p.id))
      setSelected(next)
      return
    }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected)
      next.has(id) ? next.delete(id) : next.add(id)
      setSelected(next)
    } else {
      setSelected(selected.size === 1 && selected.has(id) ? new Set() : new Set([id]))
    }
    setAnchor(index)
  }

  function dragStart(e: React.DragEvent, id: number) {
    e.preventDefault()
    let ids = [...selected]
    if (!selected.has(id)) { ids = [id]; setSelected(new Set([id])) }
    api.library.startDrag(ids)
  }

  async function copy() {
    setCopying({ done: 0, total: selected.size })
    try {
      const res = await api.library.copyTo([...selected], { bySession })
      if (res) setToast(`${res.copied} ${res.copied === 1 ? 'foto copiada' : 'fotos copiadas'} a ${res.folder}`)
    } catch (err) { setToast(errorMessage(err)) } finally { setCopying(null) }
  }

  const toggleSession = (id: number) =>
    setSessionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const visibleSessions = sessions.filter((s) =>
    !sessionQuery.trim() || [s.title, s.client_name, s.type].some((v) => v?.toLowerCase().includes(sessionQuery.toLowerCase())))
  const setF = <K extends keyof LibraryFilter>(k: K, v: LibraryFilter[K]) => setFilter((f) => ({ ...f, [k]: v }))
  const hasFilters = sessionIds.length > 0 || !!(filter.pilotId || filter.clientId || filter.flag || filter.minRating || filter.tag || filter.rawOnly || q)

  return (
    <div className="library">
      <aside className="lib-sessions">
        <div className="lib-sessions-head">
          <strong>Eventos</strong>
          {sessionIds.length > 0 && <button className="link" onClick={() => setSessionIds([])}>Ver todas</button>}
        </div>
        <input placeholder="Filtrar eventos…" value={sessionQuery} onChange={(e) => setSessionQuery(e.target.value)} />
        <div className="lib-session-list">
          {visibleSessions.map((s) => (
            <label key={s.id} className={`lib-session ${sessionIds.includes(s.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={sessionIds.includes(s.id)} onChange={() => toggleSession(s.id)} />
              <span className="lib-session-text">
                <span className="lib-session-title">{s.title}</span>
                <span className="muted small">{[s.client_name, s.date && formatDate(s.date)].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              <span className="muted small">{s.photo_count ?? 0}</span>
            </label>
          ))}
          {!visibleSessions.length && <p className="muted small">Ningún evento coincide.</p>}
        </div>
      </aside>

      <section className="lib-main">
        <header className="page-header">
          <h1>Fotos <span className="muted lib-count">{total.toLocaleString('es-ES')}</span></h1>
          <input className="search" placeholder="Buscar archivo, cámara, etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={filter.sort} onChange={(e) => setF('sort', e.target.value as LibrarySort)} aria-label="Ordenar">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </header>

        <div className="toolbar lib-filters">
          <select value={filter.clientId ?? ''} onChange={(e) => setF('clientId', e.target.value ? Number(e.target.value) : undefined)} aria-label="Cliente">
            <option value="">Todos los clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filter.flag ?? ''} onChange={(e) => setF('flag', (e.target.value || undefined) as LibraryFilter['flag'])} aria-label="Marca">
            <option value="">Todas las marcas</option>
            <option value="pick">Elegidas</option>
            <option value="none">Sin marcar</option>
            <option value="reject">Descartadas</option>
            <option value="client">♥ Favoritas del cliente</option>
          </select>
          <select value={filter.minRating ?? ''} onChange={(e) => setF('minRating', e.target.value ? Number(e.target.value) : undefined)} aria-label="Estrellas">
            <option value="">Cualquier valoración</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}{n < 5 ? ' o más' : ''}</option>)}
          </select>
          {tags.length > 0 && (
            <select value={filter.tag ?? ''} onChange={(e) => setF('tag', e.target.value || undefined)} aria-label="Etiqueta">
              <option value="">Todas las etiquetas</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <label className="check"><input type="checkbox" checked={!!filter.rawOnly} onChange={(e) => setF('rawOnly', e.target.checked || undefined)} /> Solo RAW</label>
          {hasFilters && (
            <button className="ghost" onClick={() => { setSessionIds([]); setQ(''); setFilter({ sort: filter.sort }) }}>Quitar filtros</button>
          )}
        </div>

        <div className={`lib-selbar ${selected.size ? 'active' : ''}`}>
          {selected.size ? (
            <>
              <strong>{selected.size.toLocaleString('es-ES')} {selected.size === 1 ? 'seleccionada' : 'seleccionadas'}</strong>
              {selected.size < total && <button className="ghost" onClick={selectAll}>Seleccionar las {total.toLocaleString('es-ES')}</button>}
              <button className="ghost" onClick={() => setSelected(new Set())}>Quitar selección</button>
              <span className="spacer" />
              <span className="muted small">o arrástralas a una carpeta</span>
              <label className="check"><input type="checkbox" checked={bySession} onChange={(e) => setBySession(e.target.checked)} /> Una carpeta por evento</label>
              <button className="primary" onClick={copy} disabled={!!copying}>
                {copying ? `Copiando ${copying.done}/${copying.total}…` : 'Copiar a carpeta…'}
              </button>
            </>
          ) : (
            <span className="muted small">Haz clic para seleccionar · Ctrl+clic para añadir · Shift+clic para un rango · Ctrl+A para todas · doble clic abre el evento</span>
          )}
        </div>

        {total === 0 && !loading ? (
          <p className="empty">{hasFilters ? 'Ninguna foto coincide con los filtros.' : 'Aún no hay fotos. Importa fotos desde un evento.'}</p>
        ) : (
          <div className="lib-grid">
            {photos.map((p, i) => (
              <div key={p.id} className={`lib-thumb ${selected.has(p.id) ? 'selected' : ''} flag-${p.flag ?? 'none'}`}
                draggable onDragStart={(e) => dragStart(e, p.id)}
                onClick={(e) => clickPhoto(e, i)} onDoubleClick={() => nav({ name: 'session', id: p.session_id, photoId: p.id })}
                title={`${p.file_name} — ${p.session_title}`}>
                <div className="lib-img">
                  <img src={api.mediaUrl(p.thumb_key)} loading="lazy" alt={p.file_name} draggable={false} />
                  {selected.has(p.id) && <span className="lib-check">✓</span>}
                  {p.is_raw === 1 && <span className="raw-badge">RAW</span>}
                  {p.client_pick === 1 && <span className="client-heart">♥</span>}
                </div>
                <div className="thumb-meta">
                  <Stars value={p.rating} />
                  {p.flag === 'pick' && <span className="flag pick">✔</span>}
                  {p.flag === 'reject' && <span className="flag reject">✕</span>}
                </div>
                <span className="thumb-name">{p.file_name}</span>
                <span className="thumb-name muted">{p.session_title}</span>
              </div>
            ))}
            <div ref={sentinel} className="lib-sentinel">{loading && <span className="muted small">Cargando…</span>}</div>
          </div>
        )}
      </section>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
