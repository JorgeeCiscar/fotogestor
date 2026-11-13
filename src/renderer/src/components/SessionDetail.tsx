import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Flag, ImportProgress, Photo, PhotoPatch, Session } from '../../../shared/types'
import type { View } from '../App'
import { api, errorMessage, formatDate, formatMoney, STATUS_LABEL } from '../util'
import { BulkTagDialog, GalleryDialog, SelectionDialog } from './SessionDialogs'
import SessionForm from './SessionForm'
import Stars from './Stars'
import TagInput from './TagInput'

type Filter = 'all' | 'pick' | 'reject' | 'none' | 'rated' | 'client'
type Dialog = 'edit' | 'gallery' | 'selection' | 'tag' | null

export default function SessionDetail({ id, photoId, nav }: { id: number; photoId?: number; nav: (v: View) => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [tagFilter, setTagFilter] = useState('')
  const [focus, setFocus] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [viewer, setViewer] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [toast, setToast] = useState('')
  const gridRef = useRef<HTMLDivElement>(null)
  const jumped = useRef(false)

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([api.sessions.get(id), api.photos.list(id)])
    setSession(s)
    setPhotos(p)
    // Al llegar desde la búsqueda, enfocar la foto buscada.
    if (photoId && !jumped.current) {
      jumped.current = true
      const i = p.findIndex((ph) => ph.id === photoId)
      if (i >= 0) setFocus(i)
    }
  }, [id, photoId])
  useEffect(() => { load() }, [load])
  useEffect(() => api.photos.onImportProgress((p) => p.sessionId === id && setProgress(p)), [id])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t) } }, [toast])

  const allTags = useMemo(() => [...new Set(photos.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b)), [photos])
  const visible = useMemo(() => photos.filter((p) => {
    if (tagFilter && !p.tags.includes(tagFilter)) return false
    switch (filter) {
      case 'pick': return p.flag === 'pick'
      case 'reject': return p.flag === 'reject'
      case 'none': return p.flag === null
      case 'rated': return p.rating >= 3
      case 'client': return p.client_pick === 1
      default: return true
    }
  }), [photos, filter, tagFilter])

  const current = visible[Math.min(focus, visible.length - 1)]
  const counts = useMemo(() => ({
    pick: photos.filter((p) => p.flag === 'pick').length,
    reject: photos.filter((p) => p.flag === 'reject').length,
    client: photos.filter((p) => p.client_pick === 1).length
  }), [photos])
  const FILTERS: [Filter, string][] = [
    ['all', 'Todas'], ['pick', `Elegidas${counts.pick ? ` (${counts.pick})` : ''}`], ['none', 'Sin marcar'],
    ['reject', `Descartadas${counts.reject ? ` (${counts.reject})` : ''}`], ['rated', '★ 3+'],
    ...(counts.client ? [['client', `♥ Cliente (${counts.client})`] as [Filter, string]] : [])
  ]

  /** Fotos a las que aplica una acción: la selección múltiple o, si no hay, la enfocada. */
  const targets = useCallback((): number[] =>
    selected.size ? [...selected] : current ? [current.id] : [], [selected, current])

  const patch = useCallback(async (ids: number[], p: PhotoPatch) => {
    if (!ids.length) return
    setPhotos((prev) => prev.map((ph) => (ids.includes(ph.id) ? { ...ph, ...p } : ph)))
    try { await api.photos.update(ids, p) } catch (err) { setToast(errorMessage(err)); load() }
  }, [load])

  const addTag = useCallback(async (ids: number[], tag: string) => {
    setPhotos((prev) => prev.map((ph) => (ids.includes(ph.id) && !ph.tags.includes(tag) ? { ...ph, tags: [...ph.tags, tag].sort() } : ph)))
    try { await api.photos.addTag(ids, tag) } catch (err) { setToast(errorMessage(err)); load() }
  }, [load])
  const removeTag = useCallback(async (ids: number[], tag: string) => {
    setPhotos((prev) => prev.map((ph) => (ids.includes(ph.id) ? { ...ph, tags: ph.tags.filter((t) => t !== tag) } : ph)))
    try { await api.photos.removeTag(ids, tag) } catch (err) { setToast(errorMessage(err)); load() }
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
      if (dialog || e.ctrlKey && e.key.toLowerCase() === 'k') return
      if (e.key === 'Escape' && viewer) { (document.activeElement as HTMLElement | null)?.blur(); setViewer(false); return }
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
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
        case 't': case 'T': e.preventDefault(); return targets().length && setDialog('tag')
        case 'a': if (e.ctrlKey || e.metaKey) { e.preventDefault(); setSelected(new Set(visible.map((p) => p.id))) } return
      }
      if (/^[0-5]$/.test(e.key)) patch(targets(), { rating: Number(e.key) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, current, viewer, dialog, setFlag, patch, targets])

  useEffect(() => {
    gridRef.current?.querySelector('.thumb.focus')?.scrollIntoView({ block: 'nearest' })
  }, [focus, filter, tagFilter, photos.length])

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
  const changeFilter = (f: Filter, tag = tagFilter) => { setFilter(f); setTagFilter(tag); setFocus(0); setSelected(new Set()) }

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

  const closeDialog = (msg?: string) => { setDialog(null); if (msg) { setToast(msg); load() } }

  if (!session) return null

  return (
    <div className="page session-page">
      <header className="page-header">
        <button className="ghost" onClick={() => nav({ name: 'sessions' })}>← Sesiones</button>
        <div className="session-title">
          <h1>{session.title} <span className={`badge status-${session.status}`}>{STATUS_LABEL[session.status]}</span></h1>
          <span className="muted">
            {session.client_id && session.client_name && (
              <>
                <button className="link" onClick={() => nav({ name: 'client', id: session.client_id! })}>{session.client_name}</button>
                {' · '}
              </>
            )}
            {[session.type, session.championship, formatDate(session.date), session.location].filter(Boolean).join(' · ')}
            {session.price !== null && ` · ${formatMoney(session.price)}`}
            {session.tags.map((t) => <span key={t} className="chip small-chip">{t}</span>)}
          </span>
        </div>
        <button className="ghost" onClick={() => nav({ name: 'invoices', newForSession: id })}>Presupuesto</button>
        <button className="ghost" onClick={() => setDialog('edit')}>Editar</button>
        <button className="ghost danger" onClick={removeSession}>Eliminar</button>
      </header>

      <div className="toolbar">
        <div className="segmented">
          {FILTERS.map(([f, label]) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => changeFilter(f)}>{label}</button>
          ))}
        </div>
        {allTags.length > 0 && (
          <select value={tagFilter} onChange={(e) => changeFilter(filter, e.target.value)} aria-label="Filtrar por etiqueta">
            <option value="">Todas las etiquetas</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <span className="muted small">{visible.length} / {photos.length} fotos{selected.size > 1 ? ` · ${selected.size} seleccionadas` : ''}</span>
        <span className="spacer" />
        {counts.reject > 0 && <button className="ghost danger" onClick={removeRejected}>Eliminar descartadas</button>}
        <button onClick={() => setDialog('gallery')} disabled={!photos.length}>Galería cliente</button>
        <button onClick={() => setDialog('selection')} disabled={!photos.length}>Importar selección</button>
        <button onClick={doExport} disabled={!counts.pick}>Exportar elegidas</button>
        <button className="primary" onClick={doImport} disabled={importing}>
          {importing ? (progress ? `Importando ${progress.done}/${progress.total}…` : 'Importando…') : '+ Importar fotos'}
        </button>
      </div>

      {photos.length === 0 ? (
        <div className="dropzone">
          <p>Esta sesión aún no tiene fotos.</p>
          <button className="primary" onClick={doImport} disabled={importing}>
            {importing ? (progress ? `Importando ${progress.done}/${progress.total}…` : 'Importando…') : 'Importar fotos o una carpeta'}
          </button>
          <p className="muted small">JPEG, PNG, TIFF, WebP y RAW (CR2, CR3, NEF, ARW, RAF, DNG, ORF, RW2…). Los originales se copian a la biblioteca sin modificarse.</p>
        </div>
      ) : (
        <div className="grid" ref={gridRef}>
          {visible.map((p, i) => (
            <div key={p.id}
              className={`thumb ${p === current ? 'focus' : ''} ${selected.has(p.id) ? 'selected' : ''} flag-${p.flag ?? 'none'}`}
              onClick={(e) => clickThumb(e, i)} onDoubleClick={() => { setFocus(i); setViewer(true) }}>
              <img src={api.mediaUrl(p.thumb_key)} loading="lazy" alt={p.file_name} />
              {p.is_raw === 1 && <span className="raw-badge">RAW</span>}
              {p.client_pick === 1 && <span className="client-heart" title="Favorita del cliente">♥</span>}
              <div className="thumb-meta">
                <Stars value={p.rating} onChange={(v) => patch([p.id], { rating: v })} />
                {p.flag === 'pick' && <span className="flag pick" title="Elegida">✔</span>}
                {p.flag === 'reject' && <span className="flag reject" title="Descartada">✕</span>}
              </div>
              <span className="thumb-name">{p.file_name}{p.tags.length > 0 && <span className="muted"> · {p.tags.join(', ')}</span>}</span>
            </div>
          ))}
          {visible.length === 0 && <p className="empty">Ninguna foto coincide con el filtro.</p>}
        </div>
      )}

      <footer className="shortcuts muted small">
        ← → ↑ ↓ navegar · Enter ver · P elegir · X descartar · U quitar marca · 0–5 estrellas · T etiquetar · Ctrl/Shift+clic selección múltiple · Ctrl+A todas
      </footer>

      {viewer && current && (
        <div className="viewer" onClick={() => setViewer(false)}>
          <img src={api.mediaUrl(current.preview_key)} alt={current.file_name} onClick={(e) => e.stopPropagation()} />
          <aside className="viewer-info" onClick={(e) => e.stopPropagation()}>
            <h3>{current.file_name} {current.is_raw === 1 && <span className="raw-badge inline">RAW</span>}</h3>
            <Stars value={current.rating} onChange={(v) => patch([current.id], { rating: v })} />
            <div className="viewer-flags">
              <button className={current.flag === 'pick' ? 'primary' : ''} onClick={() => setFlag('pick')}>✔ Elegir</button>
              <button className={current.flag === 'reject' ? 'danger-solid' : ''} onClick={() => setFlag('reject')}>✕ Descartar</button>
            </div>
            <button className={current.client_pick ? 'client-on' : 'ghost'} onClick={() => patch([current.id], { client_pick: current.client_pick ? 0 : 1 })}>
              ♥ {current.client_pick ? 'Favorita del cliente' : 'Marcar como favorita del cliente'}
            </button>
            <div>
              <div className="muted small" style={{ marginBottom: 4 }}>Etiquetas</div>
              <TagInput value={current.tags} onAdd={(t) => addTag([current.id], t)} onRemove={(t) => removeTag([current.id], t)} />
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
            <p className="muted small">{Math.min(focus, visible.length - 1) + 1} / {visible.length} · Esc para cerrar</p>
          </aside>
        </div>
      )}

      {dialog === 'edit' && <SessionForm session={session} onClose={() => setDialog(null)} onSaved={() => closeDialog('Sesión guardada')} />}
      {dialog === 'gallery' && (
        <GalleryDialog sessionId={id} pickCount={counts.pick} total={photos.length - counts.reject}
          onClose={() => setDialog(null)} onDone={closeDialog} />
      )}
      {dialog === 'selection' && <SelectionDialog sessionId={id} onClose={() => setDialog(null)} onDone={(m) => { closeDialog(m); changeFilter('client', '') }} />}
      {dialog === 'tag' && <BulkTagDialog count={targets().length} onClose={() => setDialog(null)} onAdd={(t) => addTag(targets(), t)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
