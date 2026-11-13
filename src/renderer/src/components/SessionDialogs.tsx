import { useEffect, useState } from 'react'
import type { GalleryExportOptions } from '../../../shared/types'
import { api, errorMessage } from '../util'
import Modal from './Modal'
import TagInput from './TagInput'

export function GalleryDialog({ sessionId, pickCount, total, pilots, onClose, onDone }: {
  sessionId: number
  pickCount: number
  total: number
  /** Pilotos con fotos en el evento, para mandar a cada uno solo las suyas. */
  pilots: { id: number; name: string; racing_number: string | null; n: number }[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [opts, setOpts] = useState<GalleryExportOptions>({ scope: pickCount ? 'picks' : 'all', watermark: true })
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => api.gallery.onProgress(setBusy), [])

  async function run() {
    setError(''); setBusy({ done: 0, total: 0 })
    try {
      const res = await api.gallery.export(sessionId, opts)
      if (res) onDone(`Galería con ${res.count} ${res.count === 1 ? 'foto' : 'fotos'} guardada en ${res.file}`)
      else setBusy(null)
    } catch (err) { setError(errorMessage(err)); setBusy(null) }
  }

  return (
    <Modal title="Galería para el cliente" onClose={onClose}>
      <div className="form">
        <p className="muted">Se crea un único archivo <strong>.html</strong> con las fotos dentro. Envíaselo a tu cliente (WeTransfer, correo, USB…):
          lo abre en cualquier navegador, marca sus favoritas con ♥ y te devuelve un código que importas con «Importar selección».</p>
        <label className="radio"><input type="radio" checked={opts.scope === 'picks'} disabled={!pickCount}
          onChange={() => setOpts({ ...opts, scope: 'picks' })} /> Solo las elegidas ({pickCount})</label>
        <label className="radio"><input type="radio" checked={opts.scope === 'all'}
          onChange={() => setOpts({ ...opts, scope: 'all' })} /> Todas excepto las descartadas ({total})</label>
        {pilots.length > 0 && (
          <label>Para
            <select value={opts.pilotId ?? 0} onChange={(e) => setOpts({ ...opts, pilotId: Number(e.target.value) || undefined })}>
              <option value={0}>Todo el evento</option>
              {pilots.map((p) => (
                <option key={p.id} value={p.id}>
                  Solo {p.racing_number ? `#${p.racing_number} ` : ''}{p.name} ({p.n} {p.n === 1 ? 'foto' : 'fotos'})
                </option>
              ))}
            </select>
            <span className="muted small hint">Con un piloto elegido, la galería lleva solo sus fotos asignadas.</span>
          </label>
        )}
        <label className="radio"><input type="checkbox" checked={opts.watermark}
          onChange={(e) => setOpts({ ...opts, watermark: e.target.checked })} /> Añadir marca de agua (texto en Ajustes)</label>
        {error && <p className="error">{error}</p>}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" onClick={run} disabled={!!busy}>
            {busy ? (busy.total ? `Generando ${busy.done}/${busy.total}…` : 'Generando…') : 'Crear galería'}
          </button>
        </footer>
      </div>
    </Modal>
  )
}

export function SelectionDialog({ sessionId, onClose, onDone }: { sessionId: number; onClose: () => void; onDone: (msg: string) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  async function run() {
    try {
      const r = await api.gallery.importSelection(sessionId, text)
      onDone(`Selección del cliente: ${r.matched} fotos${r.unknown ? ` (${r.unknown} no reconocidas)` : ''}`)
    } catch (err) { setError(errorMessage(err)) }
  }
  return (
    <Modal title="Importar selección del cliente" onClose={onClose}>
      <div className="form">
        <p className="muted">Pega el código que te ha enviado el cliente (empieza por <code>FOTOGESTOR-SELECCION</code>) o una lista de nombres de archivo.
          Sustituye la selección anterior del cliente en este evento.</p>
        <textarea autoFocus rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="FOTOGESTOR-SELECCION:…" />
        {error && <p className="error">{error}</p>}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" onClick={run} disabled={!text.trim()}>Importar</button>
        </footer>
      </div>
    </Modal>
  )
}

export function BulkTagDialog({ count, onClose, onAdd }: { count: number; onClose: () => void; onAdd: (tag: string) => Promise<void> }) {
  const [added, setAdded] = useState<string[]>([])
  return (
    <Modal title={`Etiquetar ${count} ${count === 1 ? 'foto' : 'fotos'}`} onClose={onClose}>
      <div className="form">
        <TagInput autoFocus value={added} onAdd={async (t) => { await onAdd(t); setAdded([...added, t]) }} onRemove={() => undefined}
          placeholder="Escribe una etiqueta y pulsa Enter" />
        <footer><button type="button" className="primary" onClick={onClose}>Hecho</button></footer>
      </div>
    </Modal>
  )
}
