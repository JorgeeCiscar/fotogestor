import type { SessionStatus } from '../../shared/types'

export const api = window.api

export const STATUS_LABEL: Record<SessionStatus, string> = {
  planificada: 'Planificada',
  realizada: 'Realizada',
  editando: 'En edición',
  entregada: 'Entregada'
}

export const SESSION_TYPES = ['Carrera', 'Entrenamientos', 'Track day', 'Boda', 'Retrato', 'Familia', 'Newborn', 'Comunión', 'Evento', 'Producto', 'Corporativo', 'Otro']

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

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  borrador: 'Borrador', enviada: 'Enviada', aceptada: 'Aceptada', rechazada: 'Rechazada', pagada: 'Pagada'
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export function invoiceTotals(items: { quantity: number; unit_price: number }[], taxRate: number, irpfRate: number) {
  const subtotal = round2(items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0))
  const tax = round2((subtotal * (Number(taxRate) || 0)) / 100)
  const irpf = round2((subtotal * (Number(irpfRate) || 0)) / 100)
  return { subtotal, tax, irpf, total: round2(subtotal + tax - irpf) }
}

export const today = () => new Date().toLocaleDateString('sv-SE')
export const displayNumber = (n: string) => (n.startsWith('BORRADOR-') ? 'Borrador' : n)

export const CLIENT_KIND_LABEL: Record<string, string> = { piloto: 'Piloto', equipo: 'Equipo', particular: 'Particular' }
export const CLIENT_KIND_ICON: Record<string, string> = { piloto: '🏁', equipo: '🏢', particular: '👤' }

/** Edad en años a partir de una fecha AAAA-MM-DD (null si no hay fecha). */
export function ageFrom(birth: string | null | undefined, now = new Date()): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null
  const [y, m, d] = birth.split('-').map(Number)
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--
  return age
}

/** Suma de las partidas de una sesión o documento. */
export function itemsTotal(items: { quantity: number; unit_price: number }[]): number {
  const n = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export const CONTACT_KIND_LABEL: Record<string, string> = { circuito: 'Circuito', organizador: 'Organizador' }
export const CONTACT_KIND_ICON: Record<string, string> = { circuito: '🏁', organizador: '🏆' }
