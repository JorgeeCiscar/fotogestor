import { FormEvent, useState } from 'react'
import type { Client, ClientInput } from '../../../shared/types'
import { api, errorMessage } from '../util'
import Modal from './Modal'

export default function ClientForm({ client, onClose, onSaved }: { client?: Client; onClose: () => void; onSaved: (c: Client) => void }) {
  const [form, setForm] = useState<ClientInput>({
    id: client?.id,
    name: client?.name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    notes: client?.notes ?? ''
  })
  const [error, setError] = useState('')
  const set = (k: keyof ClientInput) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      onSaved(await api.clients.save(form))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal title={client ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>Nombre *<input autoFocus value={form.name} onChange={set('name')} /></label>
        <div className="row">
          <label>Email<input type="email" value={form.email ?? ''} onChange={set('email')} /></label>
          <label>Teléfono<input value={form.phone ?? ''} onChange={set('phone')} /></label>
        </div>
        <label>Notas<textarea rows={3} value={form.notes ?? ''} onChange={set('notes')} /></label>
        {error && <p className="error">{error}</p>}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Guardar</button>
        </footer>
      </form>
    </Modal>
  )
}
