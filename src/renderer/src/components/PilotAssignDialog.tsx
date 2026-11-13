import { useEffect, useMemo, useState } from 'react'
import type { Client, Photo } from '../../../shared/types'
import { api } from '../util'
import Modal from './Modal'

/** Asigna las fotos seleccionadas a uno o varios pilotos. */
export default function PilotAssignDialog({ photos, onClose, onChange }: {
  photos: Photo[]
  onClose: () => void
  onChange: (clientId: number, assign: boolean) => Promise<void>
}) {
  const [pilots, setPilots] = useState<Client[]>([])
  const [q, setQ] = useState('')
  useEffect(() => { api.clients.list().then((cs) => setPilots(cs.filter((c) => c.kind === 'piloto'))) }, [])

  /** Cuántas de las fotos elegidas tiene ya asignadas cada piloto. */
  const counts = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of photos) for (const pilot of p.pilots) m.set(pilot.id, (m.get(pilot.id) ?? 0) + 1)
    return m
  }, [photos])

  const needle = q.toLowerCase()
  const shown = pilots.filter((p) => !needle || [p.name, p.racing_number, p.team_name, p.category].some((v) => v?.toLowerCase().includes(needle)))

  return (
    <Modal title={`Asignar ${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'} a pilotos`} onClose={onClose}>
      <div className="form">
        {pilots.length ? (
          <>
            <input autoFocus placeholder="Buscar piloto por nombre, dorsal o equipo…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="pilot-picker">
              {shown.map((p) => {
                const n = counts.get(p.id) ?? 0
                const all = n === photos.length
                return (
                  <div key={p.id} className={`pilot-row ${n ? 'on' : ''}`}>
                    <span className="pilot-name">
                      {p.racing_number && <span className="dorsal">{p.racing_number}</span>}
                      {p.name}
                      {p.team_name && <span className="muted small"> · {p.team_name}</span>}
                    </span>
                    {n > 0 && <span className="muted small">{all ? 'todas' : `${n} de ${photos.length}`}</span>}
                    {all
                      ? <button type="button" className="ghost danger" onClick={() => onChange(p.id, false)}>Quitar</button>
                      : <button type="button" className="primary" onClick={() => onChange(p.id, true)}>Asignar</button>}
                  </div>
                )
              })}
              {!shown.length && <p className="muted small">Ningún piloto coincide.</p>}
            </div>
          </>
        ) : (
          <p className="muted">Todavía no tienes pilotos. Dalos de alta en «Clientes» y podrás asignarles fotos.</p>
        )}
        <footer><button type="button" className="primary" onClick={onClose}>Hecho</button></footer>
      </div>
    </Modal>
  )
}
