import { useCallback, useEffect, useRef, useState } from 'react'
import type { Client, EventDay, FolderListing, ImportProgress } from '../../../shared/types'
import { RUN_TYPES } from '../../../shared/types'
import { api, dayLabel, errorMessage, formatLabel } from '../util'

/**
 * Mira una carpeta del disco y permite elegir fotos y añadirlas al evento
 * ya etiquetadas con el piloto, el día y el tipo de prueba.
 * Por defecto no copia nada: solo guarda dónde está cada original.
 */
export default function FolderBrowser({ sessionId, days, defaultDayId, onClose, onAdded }: {
  sessionId: number
  days: EventDay[]
  defaultDayId: number | null
  onClose: () => void
  onAdded: (msg: string) => void
}) {
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [pilots, setPilots] = useState<Client[]>([])
  const [dayId, setDayId] = useState<number | null>(defaultDayId)
  const [pilotId, setPilotId] = useState(0)
  const [runType, setRunType] = useState('')
  const [copy, setCopy] = useState(false)
  const [extFilter, setExtFilter] = useState('')
  const [busy, setBusy] = useState<ImportProgress | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const opened = useRef(false)

  useEffect(() => { api.clients.list().then((cs) => setPilots(cs.filter((c) => c.kind === 'piloto'))) }, [])
  useEffect(() => api.folder.onProgress(setBusy), [])

  const choose = useCallback(async () => {
    try {
      setError('')
      const res = await api.folder.choose(sessionId)
      if (res) { setListing(res); setSelected(new Set()) }
      else if (!listing) onClose()
    } catch (err) { setError(errorMessage(err)) }
  }, [sessionId, listing, onClose])

  // Al abrirse, se pide la carpeta directamente.
  useEffect(() => { if (!opened.current) { opened.current = true; choose() } }, [choose])

  const ext = (name: string) => {
    const e = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    return e === 'jpeg' ? 'jpg' : e === 'tiff' ? 'tif' : e
  }
  /** Formatos que hay en la carpeta, con su número de archivos. */
  const formats = (() => {
    const m = new Map<string, number>()
    for (const p of listing?.photos ?? []) m.set(ext(p.name), (m.get(ext(p.name)) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  })()
  const shown = (listing?.photos ?? []).filter((p) => !extFilter || ext(p.name) === extFilter)
  const pending = shown.filter((p) => !p.photo_id)

  function click(e: React.MouseEvent, index: number) {
    const photos = shown
    const p = photos[index]
    if (p.photo_id) return
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, index), Math.max(anchor, index)]
      const next = new Set(e.ctrlKey || e.metaKey ? selected : [])
      photos.slice(a, b + 1).filter((x) => !x.photo_id).forEach((x) => next.add(x.path))
      setSelected(next)
      return
    }
    const next = new Set(e.ctrlKey || e.metaKey ? selected : selected.size === 1 && selected.has(p.path) ? [] : selected.has(p.path) && selected.size > 1 ? selected : [])
    next.has(p.path) ? next.delete(p.path) : next.add(p.path)
    setSelected(next)
    setAnchor(index)
  }

  async function add() {
    if (!selected.size) return
    setAdding(true)
    setError('')
    try {
      const res = await api.folder.add({
        sessionId, paths: [...selected], dayId, pilotId: pilotId || null, runType: runType || null, copy
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

  const added = shown.filter((p) => p.photo_id).length

  return (
    <div className="folder-browser">
      <header className="folder-head">
        <div className="folder-title">
          <strong>{listing ? listing.folder : 'Elige una carpeta'}</strong>
          {listing && (
            <span className="muted small">
              {shown.length} {shown.length === 1 ? 'foto' : 'fotos'}{extFilter ? ` de ${listing.photos.length}` : ''}
              {added > 0 && ` · ${added} ya en el evento`}
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
        <button className="ghost" onClick={choose}>Cambiar carpeta…</button>
        <button className="ghost" onClick={() => setSelected(new Set(pending.map((p) => p.path)))} disabled={!pending.length}>
          Seleccionar todas
        </button>
        <button className="ghost" onClick={onClose}>Cerrar</button>
      </header>

      {error && <p className="error folder-error">{error}</p>}

      {listing && (
        <div className="folder-grid">
          {shown.map((p, i) => (
            <div key={p.path} className={`folder-thumb ${selected.has(p.path) ? 'selected' : ''} ${p.photo_id ? 'done' : ''}`}
              onClick={(e) => click(e, i)} title={p.photo_id ? `${p.name} · ya está en el evento` : p.name}>
              <img src={api.folder.thumbUrl(p.path)} loading="lazy" alt={p.name} />
              {p.photo_id && <span className="folder-done">✓</span>}
              {selected.has(p.path) && <span className="lib-check">✓</span>}
              <span className="thumb-name">{p.name}</span>
            </div>
          ))}
          {!shown.length && (
            <p className="empty">{listing.photos.length ? 'Ninguna foto de ese formato en la carpeta.' : 'En esta carpeta no hay fotos que la app pueda leer.'}</p>
          )}
        </div>
      )}

      <footer className="folder-bar">
        <label className="inline">Día
          <select value={dayId ?? ''} onChange={(e) => setDayId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Sin día —</option>
            {days.map((d) => <option key={d.id} value={d.id}>{dayLabel(d)}</option>)}
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
        <button className="primary" onClick={add} disabled={!selected.size || adding}>
          {adding ? (busy ? `Añadiendo ${busy.done}/${busy.total}…` : 'Añadiendo…') : `Añadir ${selected.size || ''} ${selected.size === 1 ? 'foto' : 'fotos'}`}
        </button>
      </footer>
    </div>
  )
}
