import { FormEvent, useState } from 'react'
import type { EventDay } from '../../../shared/types'
import { api, errorMessage } from '../util'
import Modal from './Modal'

/** Alta y edición de un día del evento. */
export default function DayForm({ sessionId, day, defaultDate, onClose, onSaved }: {
  sessionId: number
  day?: EventDay
  defaultDate?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(day?.date ?? defaultDate ?? '')
  const [label, setLabel] = useState(day?.label ?? '')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await api.days.save({ id: day?.id, session_id: sessionId, date: date || null, label: label || null })
      onSaved()
    } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <Modal title={day ? 'Editar día' : 'Añadir día'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted">Los días a los que asistes. Las fotos se importan al día que tengas abierto.</p>
        <div className="row">
          <label>Fecha<input autoFocus type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Nombre (opcional)<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Clasificación, carrera 1…" /></label>
        </div>
        {error && <p className="error">{error}</p>}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Guardar</button>
        </footer>
      </form>
    </Modal>
  )
}
