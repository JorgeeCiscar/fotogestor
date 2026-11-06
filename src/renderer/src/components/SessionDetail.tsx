import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Flag, ImportProgress, Photo, PhotoPatch, Session } from '../../../shared/types'
import type { View } from '../App'
import { api, errorMessage, formatDate, formatMoney, STATUS_LABEL } from '../util'
import SessionForm from './SessionForm'
import Stars from './Stars'

type Filter = 'all' | 'pick' | 'reject' | 'none' | 'rated'
const FILTERS: [Filter, string][] = [
  ['all', 'Todas'], ['pick', 'Elegidas'], ['none', 'Sin marcar'], ['reject', 'Descartadas'], ['rated', '★ 3+']
]

export default function SessionDetail({ id, nav }: { id: number; nav: (v: View) => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [focus, setFocus] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [viewer, setViewer] = useState(false)
  const [editing, setEditing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [toast, setToast] = useState('')
  const gridRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([api.sessions.get(id), api.photos.list(id)])
    setSession(s)
    setPhotos(p)
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => api.photos.onImportProgress((p) => p.sessionId === id && setProgress(p)), [id])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t) } }, [toast])

  const visible = useMemo(() => photos.filter((p) => {
    switch (filter) {
      case 'pick': return p.flag === 'pick'
      case 'reject': return p.flag === 'reject'
      case 'none': return p.flag === null
      case 'rated': return p.rating >= 3
      default: return true
    }
  }), [photos, filter])

  const current = visible[Math.min(focus, visible.length - 1)]
  const counts = useMemo(() => ({
    pick: photos.filter((p) => p.flag === 'pick').length,
    reject: photos.filter((p) => p.flag === 'reject').length
  }), [photos])

  /** Fotos a las que aplica una acción: la selección múltiple o, si no hay, la enfocada. */
  const targets = useCallback((): number[] =>
    selected.size ? [...selected] : current ? [current.id] : [], [selected, current])

  const patch = useCallback(async (ids: number[], p: PhotoPatch) => {
    if (!ids.length) return
    setPhotos((prev) => prev.map((ph) => (ids.includes(ph.id) ? { ...ph, ...p } : ph)))
    try { await api.photos.update(ids, p) } catch (err) { setToast(errorMessage(err)); load() }
  }, [load])

  const setFlag = useCallback((flag: Flag) => {
    const ids = targets()
    // Pulsar la misma marca sobre una sola foto la quita (como un interruptor).
    const toggled = ids.length === 1 && photos.find((p) => p.id === ids[0])?.flag === flag ? null : flag
    patch(ids, { flag: toggled })
  }, [targets, photos, patch])

  // Atajos de teclado estilo "culling".
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing || (e.target as HTMLElement).closest('input, textarea, select')) return
      const cols = viewer ? 1 : Math.max(1, Math.floor((gridRef.current?.clientWidth ?? 1) / 236))
      const move = (d: number) => { e.preventDefault(); setSelected(new Set()); setFocus((f) => Math.max(0, Math.min(visible.length - 1, f + d))) }
      switch (e.key) {
        case 'ArrowRight': return move(1)
        case 'ArrowLeft': return move(-1)
        case 'ArrowDown': return move(cols)
        case 'ArrowUp': return move(-cols)
        case 'Enter': case ' ': e.preventDefault(); return current && setViewer((v) => !v)
        case 'Escape': return viewer ? setViewer(false) : setSelected(new Set())
        case 'p': case 'P': return setFlag('pick')
        case 'x': case 'X': return setFlag('reject')
        case 'u': case 'U': return patch(targets(), { flag: null })
        case 'a': if (e.ctrlKey || e.metaKey) { e.preventDefault(); setSelected(new Set(visible.map((p) => p.id))) } return
      }
      if (/^[0-5]$/.test(e.key)) patch(targets(), { rating: Number(e.key) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, current, viewer, editing, setFlag, patch, targets])

  useEffect(() => {
    gridRef.current?.querySelector('.thumb.focus')?.scrollIntoView({ block: 'nearest' })
  }, [focus, filter])

  function clickThumb(e: React.MouseEvent, index: number) {
    const ph = visible[index]
    if (e.shiftKey) {
      const [a, b] = [Math.min(focus, index), Math.max(focus, index)]
      setSelected(new Set(visible.slice(a, b + 1).map((p) => p.id)))
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected.size ? selected : current ? [current.id] : [])
      next.has(ph.id) ? next.delete(ph.id) : next.add(ph.id)
      setSelected(next)
      setFocus(index)
    } else {
      setSelected(new Set())
      setFocus(index)
    }
  }

  async function doImport() {
    setImporting(true)
    setProgress(null)
    try {
      const res = await api.photos.importFiles(id)
      if (!res) return
      await load()
      const parts = [`${res.imported} importadas`]
      if (res.skipped) parts.push(`${res.skipped} ya existían`)
      if (res.errors.length) parts.push(`${res.errors.length} con error (${res.errors[0].file}: ${res.errors[0].message})`)
      setToast(parts.join(' · '))
    } catch (err) {
      setToast(errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  async function doExport() {
    try {
      const res = await api.photos.exportPicks(id)
      if (res) setToast(`${res.exported} fotos exportadas a ${res.folder}`)
    } catch (err) { setToast(errorMessage(err)) }
  }

  async function removeRejected() {
    const ids = photos.filter((p) => p.flag === 'reject').map((p) => p.id)
    if (!ids.length || !confirm(`¿Eliminar definitivamente ${ids.length} fotos descartadas de la biblioteca?`)) return
    await api.photos.remove(ids)
    load()
  }

  async function removeSession() {
    if (!session || !confirm(`¿Eliminar la sesión "${session.title}" y sus ${photos.length} fotos? No se puede deshacer.`)) return
    await api.sessions.remove(id)
    nav({ name: 'sessions' })
  }

  if (!session) return null

  return (
    <div className="page session-page">
      <header className="page-header">
        <button className="ghost" onClick={() => nav({ name: 'sessions' })}>← Sesiones</button>
        <div className="session-title">
          <h1>{session.title} <span className={`badge status-${session.status}`}>{STATUS_LABEL[session.status]}</span></h1>
          <span className="muted">
            {[session.client_name, session.type, formatDate(session.date), session.location].filter(Boolean).join(' · ')}
            {session.price !== null && ` · ${formatMoney(session.price)}`}
          </span>
        </div>
        <button className="ghost" onClick={() => setEditing(true)}>Editar</button>
        <button className="ghost danger" onClick={removeSession}>Eliminar</button>
      </header>

      <div className="toolbar">
        <div className="segmented">
          {FILTERS.map(([f, label]) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => { setFilter(f); setFocus(0); setSelected(new Set()) }}>
              {label}{f === 'pick' && counts.pick ? ` (${counts.pick})` : ''}{f === 'reject' && counts.reject ? ` (${counts.reject})` : ''}
            </button>
          ))}
        </div>
        <span className="muted small">{visible.length} / {photos.length} fotos{selected.size > 1 ? ` · ${selected.size} seleccionadas` : ''}</span>
        <span className="spacer" />
        {counts.reject > 0 && <button className="ghost danger" onClick={removeRejected}>Eliminar descartadas</button>}
        <button onClick={doExport} disabled={!counts.pick}>Exportar elegidas</button>
        <button className="primary" onClick={doImport} disabled={importing}>
          {importing ? (progress ? `Importando ${progress.done}/${progress.total}…` : 'Importando…') : '+ Importar fotos'}
        </button>
      </div>

      {photos.length === 0 ? (
        <div className="dropzone">
          <p>Esta sesión aún no tiene fotos.</p>
          <button className="primary" onClick={doImport}>Importar fotos o una carpeta</button>
          <p className="muted small">JPEG, PNG, TIFF y WebP. Los originales se copian a la biblioteca.</p>
        </div>
      ) : (
        <div className="grid" ref={gridRef}>
          {visible.map((p, i) => (
            <div key={p.id}
              className={`thumb ${p === current ? 'focus' : ''} ${selected.has(p.id) ? 'selected' : ''} flag-${p.flag ?? 'none'}`}
              onClick={(e) => clickThumb(e, i)} onDoubleClick={() => { setFocus(i); setViewer(true) }}>
              <img src={api.mediaUrl(p.thumb_key)} loading="lazy" alt={p.file_name} />
              <div className="thumb-meta">
                <Stars value={p.rating} onChange={(v) => patch([p.id], { rating: v })} />
                {p.flag === 'pick' && <span className="flag pick" title="Elegida">✔</span>}
                {p.flag === 'reject' && <span className="flag reject" title="Descartada">✕</span>}
              </div>
              <span className="thumb-name">{p.file_name}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="shortcuts muted small">
        ← → ↑ ↓ navegar · Enter ver · P elegir · X descartar · U quitar marca · 0–5 estrellas · Ctrl/Shift+clic selección múltiple
      </footer>

      {viewer && current && (
        <div className="viewer" onClick={() => setViewer(false)}>
          <img src={api.mediaUrl(current.preview_key)} alt={current.file_name} onClick={(e) => e.stopPropagation()} />
          <aside className="viewer-info" onClick={(e) => e.stopPropagation()}>
            <h3>{current.file_name}</h3>
            <Stars value={current.rating} onChange={(v) => patch([current.id], { rating: v })} />
            <div className="viewer-flags">
              <button className={current.flag === 'pick' ? 'primary' : ''} onClick={() => setFlag('pick')}>✔ Elegir</button>
              <button className={current.flag === 'reject' ? 'danger-solid' : ''} onClick={() => setFlag('reject')}>✕ Descartar</button>
            </div>
            <dl>
              {current.width && <><dt>Dimensiones</dt><dd>{current.width} × {current.height}</dd></>}
              <dt>Tamaño</dt><dd>{(current.file_size / 1024 / 1024).toFixed(1)} MB</dd>
              {current.taken_at && <><dt>Fecha</dt><dd>{new Date(current.taken_at).toLocaleString('es-ES')}</dd></>}
              {current.camera && <><dt>Cámara</dt><dd>{current.camera}</dd></>}
              {current.lens && <><dt>Objetivo</dt><dd>{current.lens}</dd></>}
              {(current.aperture || current.shutter || current.iso) && (
                <><dt>Exposición</dt><dd>{[current.aperture && `ƒ/${current.aperture}`, current.shutter, current.iso && `ISO ${current.iso}`, current.focal_length && `${current.focal_length} mm`].filter(Boolean).join(' · ')}</dd></>
              )}
            </dl>
            <button className="ghost" onClick={() => api.photos.reveal(current.id)}>Mostrar original en carpeta</button>
            <p className="muted small">{focus + 1} / {visible.length} · Esc para cerrar</p>
          </aside>
        </div>
      )}

      {editing && <SessionForm session={session} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
