import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventDay, Flag, ImportProgress, Photo, PhotoPatch, Session } from '../../../shared/types'
import type { View } from '../App'
import { api, dayLabel, errorMessage, formatDate, formatMoney, STATUS_LABEL } from '../util'
import DayForm from './DayForm'
import PilotAssignDialog from './PilotAssignDialog'
import { BulkTagDialog, GalleryDialog, SelectionDialog } from './SessionDialogs'
import SessionForm from './SessionForm'
import Stars from './Stars'
import TagInput from './TagInput'

type Filter = 'all' | 'pick' | 'reject' | 'none' | 'rated' | 'client'
type Dialog = 'edit' | 'gallery' | 'selection' | 'tag' | 'pilots' | 'day' | null
/** Día activo: null = todas las fotos, 'none' = las que no tienen día. */
type ActiveDay = number | 'none' | null

export default function SessionDetail({ id, photoId, nav }: { id: number; photoId?: number; nav: (v: View) => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [tagFilter, setTagFilter] = useState('')
  const [pilotFilter, setPilotFilter] = useState(0)
  const [days, setDays] = useState<EventDay[]>([])
  const [activeDay, setActiveDay] = useState<ActiveDay>(null)
  const [editingDay, setEditingDay] = useState<EventDay | undefined>()
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
    const [s, p, d] = await Promise.all([api.sessions.get(id), api.photos.list(id), api.days.list(id)])
    setSession(s)
    setPhotos(p)
    setDays(d)
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

  const eventPilots = useMemo(() => {
    const m = new Map<number, { id: number; name: string; racing_number: string | null; n: number }>()
    for (const p of photos) for (const x of p.pilots) {
      const cur = m.get(x.id)
      m.set(x.id, { ...x, n: (cur?.n ?? 0) + 1 })
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [photos])
  const withoutDay = useMemo(() => photos.filter((p) => p.day_id === null).length, [photos])

  const allTags = useMemo(() => [...new Set(photos.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b)), [photos])
  const visible = useMemo(() => photos.filter((p) => {
    if (activeDay === 'none' ? p.day_id !== null : activeDay !== null && p.day_id !== activeDay) return false
    if (pilotFilter && !p.pilots.some((x) => x.id === pilotFilter)) return false
    if (tagFilter && !p.tags.includes(tagFilter)) return false
    switch (filter) {
      case 'pick': return p.flag === 'pick'
      case 'reject': return p.flag === 'reject'
      case 'none': return p.flag === null
      case 'rated': return p.rating >= 3
      case 'client': return p.client_pick === 1
      default: return true
    }
  }), [photos, filter, tagFilter, pilotFilter, activeDay])

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

  const assignPilot = useCallback(async (clientId: number, assign: boolean) => {
    const ids = targets()
    if (!ids.length) return
    try {
      await api.photos.assign(ids, clientId, assign)
      const [p] = await Promise.all([api.photos.list(id)])
      setPhotos(p)
    } catch (err) { setToast(errorMessage(err)) }
  }, [targets, id])

  const moveToDay = useCallback(async (dayId: number | null) => {
    const ids = targets()
    if (!ids.length) return
    await api.photos.setDay(ids, dayId)
    load()
  }, [targets, load])

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

        case 'a': case 'A':
          e.preventDefault()
          // Ctrl+A selecciona todas; A sola abre la asignación a pilotos.
          if (e.ctrlKey || e.metaKey) setSelected(new Set(visible.map((p) => p.id)))
          else if (targets().length) setDialog('pilots')
          return
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
  const changeDay = (d: ActiveDay) => { setActiveDay(d); setFocus(0); setSelected(new Set()) }

  async function doImport() {
    setImporting(true)
    setProgress(null)
    try {
      const res = await api.photos.importFiles(id, typeof activeDay === 'number' ? activeDay : null)
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
    if (!session || !confirm(`¿Eliminar el evento "${session.title}" y sus ${photos.length} fotos? No se puede deshacer.`)) return
    await api.sessions.remove(id)
    nav({ name: 'sessions' })
  }

  const closeDialog = (msg?: string) => { setDialog(null); if (msg) { setToast(msg); load() } }

  if (!session) return null

  return (
    <div className="page session-page">
      <header className="page-header">
        <button className="ghost" onClick={() => nav({ name: 'sessions' })}>← Eventos</button>
        <div className="session-title">
          <h1>{session.title} <span className={`badge status-${session.status}`}>{STATUS_LABEL[session.status]}</span></h1>
          <span className="muted">
            {session.client_id && session.client_name && (
              <>
                <button className="link" onClick={() => nav({ name: 'client', id: session.client_id! })}>{session.client_name}</button>
                {' · '}
              </>
            )}
            {[session.type, session.championship, formatDate(session.date)].filter(Boolean).join(' · ')}
            {session.location && (
              <>
                {' · '}
                {session.circuit_id
                  ? <button className="link" onClick={() => nav({ name: 'contact', id: session.circuit_id! })}>{session.location}</button>
                  : session.location}
              </>
            )}
            {session.organizer_id && session.organizer_name && (
              <>
                {' · '}
                <button className="link" onClick={() => nav({ name: 'contact', id: session.organizer_id! })}>{session.organizer_name}</button>
              </>
            )}
            {session.price !== null && ` · ${formatMoney(session.price)}`}
            {session.tags.map((t) => <span key={t} className="chip small-chip">{t}</span>)}
          </span>
        </div>
        <button className="ghost" onClick={() => nav({ name: 'invoices', newForSession: id })}>Presupuesto</button>
        <button className="ghost" onClick={() => setDialog('edit')}>Editar</button>
        <button className="ghost danger" onClick={removeSession}>Eliminar</button>
      </header>

      <div className="day-bar">
        <div className="segmented">
          <button className={activeDay === null ? 'active' : ''} onClick={() => changeDay(null)}>
            Todas <span className="muted">{photos.length}</span>
          </button>
          {days.map((d) => (
            <button key={d.id} className={activeDay === d.id ? 'active' : ''} onClick={() => changeDay(d.id)}>
              {dayLabel(d)} <span className="muted">{d.photo_count ?? 0}</span>
            </button>
          ))}
          {days.length > 0 && withoutDay > 0 && (
            <button className={activeDay === 'none' ? 'active' : ''} onClick={() => changeDay('none')}>
              Sin día <span className="muted">{withoutDay}</span>
            </button>
          )}
        </div>
        <button className="ghost" onClick={() => { setEditingDay(undefined); setDialog('day') }}>+ Añadir día</button>
        {typeof activeDay === 'number' && (
          <>
            <button className="ghost" onClick={() => { setEditingDay(days.find((d) => d.id === activeDay)); setDialog('day') }}>Editar día</button>
            <button className="ghost danger" onClick={async () => {
              const d = days.find((x) => x.id === activeDay)
              if (!d || !confirm(`¿Eliminar el día «${dayLabel(d)}»? Sus fotos se quedan en el evento, sin día.`)) return
              await api.days.remove(d.id)
              changeDay(null)
              load()
            }}>Eliminar día</button>
          </>
        )}
        {days.length === 0 && <span className="muted small">Añade los días a los que asistes para organizar las fotos.</span>}
      </div>

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
        {eventPilots.length > 0 && (
          <select value={pilotFilter} onChange={(e) => { setPilotFilter(Number(e.target.value)); setFocus(0); setSelected(new Set()) }} aria-label="Filtrar por piloto">
            <option value={0}>Todos los pilotos</option>
            {eventPilots.map((p) => (
              <option key={p.id} value={p.id}>{p.racing_number ? `#${p.racing_number} ` : ''}{p.name} ({p.n})</option>
            ))}
          </select>
        )}
        <span className="muted small">{visible.length} / {photos.length} fotos{selected.size > 1 ? ` · ${selected.size} seleccionadas` : ''}</span>
        <span className="spacer" />
        {days.length > 0 && selected.size > 0 && (
          <select value="" aria-label="Mover a un día" onChange={(e) => moveToDay(e.target.value === 'none' ? null : Number(e.target.value))}>
            <option value="">Mover a…</option>
            {days.map((d) => <option key={d.id} value={d.id}>{dayLabel(d)}</option>)}
            <option value="none">Sin día</option>
          </select>
        )}
        <button onClick={() => setDialog('pilots')} disabled={!targets().length}>Asignar a piloto</button>
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
          <p>Este evento aún no tiene fotos.</p>
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
              {p.pilots.length > 0 && (
                <span className="pilot-badge" title={p.pilots.map((x) => x.name).join(', ')}>
                  {p.pilots.map((x) => x.racing_number || x.name.split(' ')[0]).join(' · ')}
                </span>
              )}
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
        ← → ↑ ↓ navegar · Enter ver · P elegir · X descartar · U quitar marca · 0–5 estrellas · T etiquetar · A asignar a piloto · Ctrl/Shift+clic selección múltiple · Ctrl+A todas
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
              <div className="muted small" style={{ marginBottom: 4 }}>Pilotos</div>
              {current.pilots.length ? (
                <div className="chips">
                  {current.pilots.map((x) => (
                    <span key={x.id} className="chip">
                      {x.racing_number && <span className="dorsal">{x.racing_number}</span>}{x.name}
                      <button onClick={() => assignPilot(x.id, false)} aria-label={`Quitar ${x.name}`}>✕</button>
                    </span>
                  ))}
                </div>
              ) : <p className="muted small" style={{ margin: 0 }}>Sin asignar</p>}
              <button className="ghost" style={{ marginTop: 6 }} onClick={() => setDialog('pilots')}>Asignar a piloto…</button>
            </div>
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

      {dialog === 'edit' && <SessionForm session={session} onClose={() => setDialog(null)} onSaved={() => closeDialog('Evento guardado')} />}
      {dialog === 'gallery' && (
        <GalleryDialog sessionId={id} pickCount={counts.pick} total={photos.length - counts.reject}
          onClose={() => setDialog(null)} onDone={closeDialog} />
      )}
      {dialog === 'selection' && <SelectionDialog sessionId={id} onClose={() => setDialog(null)} onDone={(m) => { closeDialog(m); changeFilter('client', '') }} />}
      {dialog === 'pilots' && (
        <PilotAssignDialog photos={photos.filter((p) => targets().includes(p.id))}
          onClose={() => setDialog(null)} onChange={assignPilot} />
      )}
      {dialog === 'day' && (
        <DayForm sessionId={id} day={editingDay} defaultDate={session.date}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />
      )}
      {dialog === 'tag' && <BulkTagDialog count={targets().length} onClose={() => setDialog(null)} onAdd={(t) => addTag(targets(), t)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
