import { useCallback, useEffect, useRef, useState } from 'react'
import type { Client, EventDay, FolderListing, FolderPhoto, ImportProgress, Session } from '../../../shared/types'
import { RUN_TYPES } from '../../../shared/types'
import { api, dayLabel, errorMessage, formatLabel } from '../util'

const ext = (name: string) => {
  const e = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  return e === 'jpeg' ? 'jpg' : e === 'tiff' ? 'tif' : e
}

/**
 * Mira una carpeta del disco: enseña sus fotos tal cual son (verticales en
 * vertical) y permite verlas a pantalla completa. Si además quieres, puedes
 * elegir algunas y añadirlas a un evento con su día, piloto y prueba.
 */
export default function FolderBrowser({ sessionId, days, defaultDayId, onClose, onAdded }: {
  /** Evento al que se añadirán las fotos; null para mirar carpetas sin más. */
  sessionId: number | null
  days: EventDay[]
  defaultDayId: number | null
  onClose: () => void
  onAdded: (msg: string) => void
}) {
  const standalone = sessionId === null
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [pilots, setPilots] = useState<Client[]>([])
  const [events, setEvents] = useState<Session[]>([])
  const [eventId, setEventId] = useState<number | null>(sessionId)
  const [eventDays, setEventDays] = useState<EventDay[]>(days)
  const [dayId, setDayId] = useState<number | null>(defaultDayId)
  const [pilotId, setPilotId] = useState(0)
  const [runType, setRunType] = useState('')
  const [copy, setCopy] = useState(false)
  const [extFilter, setExtFilter] = useState('')
  const [busy, setBusy] = useState<ImportProgress | null>(null)
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(!standalone)
  const [error, setError] = useState('')
  const opened = useRef(false)

  useEffect(() => { api.clients.list().then((cs) => setPilots(cs.filter((c) => c.kind === 'piloto'))) }, [])
  useEffect(() => api.folder.onProgress(setBusy), [])
  useEffect(() => { if (standalone) api.sessions.list().then(setEvents) }, [standalone])
  // Al elegir otro evento se cargan sus días.
  useEffect(() => {
    if (!standalone) return
    if (!eventId) { setEventDays([]); setDayId(null); return }
    api.days.list(eventId).then((d) => { setEventDays(d); setDayId(null) })
  }, [eventId, standalone])

  const open = useCallback(async (folder?: string) => {
    try {
      setError('')
      const res = folder ? await api.folder.reopen(folder, sessionId) : await api.folder.choose(sessionId)
      if (res) {
        setListing(res)
        setSelected(new Set())
        if (standalone) api.settings.save({ last_folder: res.folder })
      } else if (!listing) onClose()
    } catch (err) { setError(errorMessage(err)) }
  }, [sessionId, listing, onClose, standalone])

  // Al abrirse: la última carpeta usada, o el diálogo para elegir una.
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    if (standalone) {
      api.settings.get().then((s) => (s.last_folder ? open(s.last_folder).catch(() => open()) : open()))
    } else {
      open()
    }
  }, [open, standalone])

  const formats = (() => {
    const m = new Map<string, number>()
    for (const p of listing?.photos ?? []) m.set(ext(p.name), (m.get(ext(p.name)) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  })()
  const shown = (listing?.photos ?? []).filter((p) => !extFilter || ext(p.name) === extFilter)
  const pending = shown.filter((p) => !p.photo_id)
  const added = shown.filter((p) => p.photo_id).length

  function click(e: React.MouseEvent, index: number) {
    const p = shown[index]
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, index), Math.max(anchor, index)]
      const next = new Set(e.ctrlKey || e.metaKey ? selected : [])
      shown.slice(a, b + 1).forEach((x) => next.add(x.path))
      setSelected(next)
      return
    }
    const next = new Set(e.ctrlKey || e.metaKey ? selected : [])
    next.has(p.path) && (e.ctrlKey || e.metaKey) ? next.delete(p.path) : next.add(p.path)
    setSelected(next)
    setAnchor(index)
  }

  // Teclado: flechas y Esc en el visor, Ctrl+A para seleccionar todo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      if (viewing !== null) {
        if (e.key === 'Escape') { e.preventDefault(); setViewing(null) }
        else if (e.key === 'ArrowRight') { e.preventDefault(); setViewing((v) => Math.min(shown.length - 1, (v ?? 0) + 1)) }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); setViewing((v) => Math.max(0, (v ?? 0) - 1)) }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(shown.map((p) => p.path))) }
      else if (e.key === 'Escape') { e.preventDefault(); selected.size ? setSelected(new Set()) : onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing, shown, selected, onClose])

  async function add() {
    if (!selected.size || !eventId) return
    setAdding(true)
    setError('')
    try {
      const res = await api.folder.add({
        sessionId: eventId, paths: [...selected], dayId, pilotId: pilotId || null, runType: runType || null, copy
      })
      const parts = [`${res.imported} ${res.imported === 1 ? 'foto añadida' : 'fotos añadidas'}`]
      if (res.skipped) parts.push(`${res.skipped} ya estaban`)
      if (res.errors.length) parts.push(`${res.errors.length} con error (${res.errors[0].message})`)
      setSelected(new Set())
      setListing(await api.folder.reopen(listing!.folder, sessionId))
      onAdded(parts.join(' · '))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setAdding(false)
      setBusy(null)
    }
  }

  const current: FolderPhoto | undefined = viewing === null ? undefined : shown[viewing]

  return (
    <div className="folder-browser">
      <header className="folder-head">
        <div className="folder-title">
          <strong>{listing ? listing.folder : 'Elige una carpeta'}</strong>
          {listing && (
            <span className="muted small">
              {shown.length} {shown.length === 1 ? 'foto' : 'fotos'}{extFilter ? ` de ${listing.photos.length}` : ''}
              {added > 0 && ` · ${added} ya en un evento`}
              {selected.size > 0 && ` · ${selected.size} seleccionadas`}
            </span>
          )}
        </div>
        {formats.length > 1 && (
          <select value={extFilter} onChange={(e) => { setExtFilter(e.target.value); setSelected(new Set()) }} aria-label="Formato">
            <option value="">Todos los formatos ({listing?.photos.length ?? 0})</option>
            {formats.map(([e, n]) => <option key={e} value={e}>{formatLabel(e)} ({n})</option>)}
          </select>
        )}
        <button className="ghost" onClick={() => open()}>Cambiar carpeta…</button>
        {!showAdd && <button className="ghost" onClick={() => setShowAdd(true)}>Añadir a un evento…</button>}
        <button className="ghost" onClick={onClose}>Cerrar</button>
      </header>

      {error && <p className="error folder-error">{error}</p>}

      {listing && (
        <div className="folder-grid">
          {shown.map((p, i) => (
            <div key={p.path} className={`folder-thumb ${selected.has(p.path) ? 'selected' : ''} ${p.photo_id ? 'done' : ''}`}
              onClick={(e) => click(e, i)} onDoubleClick={() => setViewing(i)}
              title={p.photo_id ? `${p.name} · ya está en ${p.session_title}` : p.name}>
              <img src={api.folder.thumbUrl(p.path)} loading="lazy" alt={p.name} />
              {p.photo_id && <span className="folder-done" title={`Ya está en ${p.session_title}`}>✓</span>}
              {selected.has(p.path) && <span className="lib-check">✓</span>}
              <span className="thumb-name">{p.name}</span>
            </div>
          ))}
          {!shown.length && (
            <p className="empty">{listing.photos.length ? 'Ninguna foto de ese formato en la carpeta.' : 'En esta carpeta no hay fotos que la app pueda leer.'}</p>
          )}
        </div>
      )}

      {showAdd ? (
        <footer className="folder-bar">
          {standalone && (
            <label className="inline">Evento
              <select value={eventId ?? ''} onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Elige un evento —</option>
                {events.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
          )}
          <label className="inline">Día
            <select value={dayId ?? ''} onChange={(e) => setDayId(e.target.value ? Number(e.target.value) : null)} disabled={!eventId}>
              <option value="">— Sin día —</option>
              {eventDays.map((d) => <option key={d.id} value={d.id}>{dayLabel(d)}</option>)}
            </select>
          </label>
          <label className="inline">Piloto
            <select value={pilotId} onChange={(e) => setPilotId(Number(e.target.value))}>
              <option value={0}>— Sin asignar —</option>
              {pilots.map((p) => <option key={p.id} value={p.id}>{p.racing_number ? `#${p.racing_number} ` : ''}{p.name}</option>)}
            </select>
          </label>
          <label className="inline">Prueba
            <select value={runType} onChange={(e) => setRunType(e.target.value)}>
              <option value="">— Sin indicar —</option>
              {RUN_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
            Copiar los originales a la biblioteca
          </label>
          <span className="spacer" />
          <button className="primary" onClick={add} disabled={!selected.size || !eventId || adding}>
            {adding ? (busy ? `Añadiendo ${busy.done}/${busy.total}…` : 'Añadiendo…') : `Añadir ${selected.size || ''} ${selected.size === 1 ? 'foto' : 'fotos'}`}
          </button>
        </footer>
      ) : (
        <footer className="folder-bar quiet">
          <span className="muted small">
            Doble clic para ver una foto a pantalla completa · ← → para pasar · Esc para salir
          </span>
        </footer>
      )}

      {current && (
        <div className="viewer folder-viewer" onClick={() => setViewing(null)}>
          <img src={api.folder.previewUrl(current.path)} alt={current.name} onClick={(e) => e.stopPropagation()} />
          <div className="folder-viewer-bar" onClick={(e) => e.stopPropagation()}>
            <button className="ghost" onClick={() => setViewing(Math.max(0, viewing! - 1))} disabled={viewing === 0}>‹</button>
            <span>{current.name} <span className="muted small">· {viewing! + 1} / {shown.length}</span></span>
            <button className="ghost" onClick={() => setViewing(Math.min(shown.length - 1, viewing! + 1))} disabled={viewing === shown.length - 1}>›</button>
            <button className="ghost" onClick={() => setViewing(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
