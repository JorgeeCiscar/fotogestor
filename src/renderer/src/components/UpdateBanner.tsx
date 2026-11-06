import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/types'
import { api } from '../util'

export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    api.app.updateStatus().then(setStatus)
    return api.app.onUpdateStatus(setStatus)
  }, [])
  return status
}

export function describeUpdate(s: UpdateStatus): string {
  switch (s.state) {
    case 'checking': return 'Buscando actualizaciones…'
    case 'none': return 'Tienes la última versión'
    case 'downloading': return `Descargando la versión ${s.version ?? ''}… ${s.percent ?? 0} %`
    case 'downloaded': return `Versión ${s.version} lista para instalar`
    case 'error': return `No se pudo comprobar: ${s.message ?? 'error desconocido'}`
    case 'disabled': return s.message ?? 'Actualizaciones desactivadas'
    default: return 'Se comprueban automáticamente al abrir la app y cada 4 horas'
  }
}

/** Aviso en la barra lateral cuando hay una actualización descargada o en curso. */
export default function UpdateBanner() {
  const s = useUpdateStatus()
  if (s.state === 'downloading') return <div className="update-banner muted small">{describeUpdate(s)}</div>
  if (s.state !== 'downloaded') return null
  return (
    <div className="update-banner ready">
      <strong>Nueva versión {s.version}</strong>
      <span className="small">Se instalará al cerrar FotoGestor.</span>
      <button className="primary" onClick={() => api.app.installUpdate()}>Reiniciar y actualizar</button>
    </div>
  )
}

export function AppVersion() {
  const [v, setV] = useState('')
  useEffect(() => { api.app.version().then(setV) }, [])
  return <div className="app-version muted small">v{v}</div>
}
