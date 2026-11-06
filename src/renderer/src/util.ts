import type { SessionStatus } from '../../shared/types'

export const api = window.api

export const STATUS_LABEL: Record<SessionStatus, string> = {
  planificada: 'Planificada',
  realizada: 'Realizada',
  editando: 'En edición',
  entregada: 'Entregada'
}

export const SESSION_TYPES = ['Boda', 'Retrato', 'Familia', 'Newborn', 'Comunión', 'Evento', 'Producto', 'Corporativo', 'Otro']

export function formatDate(d: string | null): string {
  if (!d) return 'Sin fecha'
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d)
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatMoney(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  // Electron envuelve los errores de IPC: "Error invoking remote method 'x': Error: ..."
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
