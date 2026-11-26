/**
 * Licencias por suscripción: tipos compartidos entre el proceso principal y la interfaz,
 * qué llamadas IPC se permiten en cada nivel de acceso y cómo se interpreta una licencia.
 * Contrato con el servidor: docs/licencias-y-adminapps.md (§5 y apéndice A).
 */

/** Estado de la suscripción tal y como lo envía el servidor. */
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'

/** Contenido del token firmado (Ed25519) que entrega el servidor en cada comprobación. */
export interface LicenseClaims {
  v: 1
  /** Identificador de la app: 'fotogestor' | 'appclase'. */
  app: string
  /** Id del usuario (Supabase Auth). */
  sub: string
  email: string
  /** Hash del ordenador para el que se emitió el token. */
  device: string
  status: SubscriptionStatus
  plan: string | null
  /** Fin de la prueba (ISO 8601), solo con status 'trial'. */
  trial_end: string | null
  /** Fin del periodo pagado (ISO 8601). */
  period_end: string | null
  /** Funciones activadas para este usuario (control remoto). */
  features: string[]
  /** Versión mínima de la app; si la instalada es anterior, hay que actualizar. */
  min_version: string | null
  /** Emitido y caducidad, en segundos desde 1970. */
  iat: number
  exp: number
}

export interface DeviceInfo {
  id: string
  name: string
  last_seen: string | null
  current?: boolean
}

export type LicenseMode = 'full' | 'readonly'

export interface LicensedState {
  kind: 'licensed'
  mode: LicenseMode
  status: SubscriptionStatus
  email: string
  plan: string | null
  trialEnd: string | null
  periodEnd: string | null
  /** Días que quedan de prueba o hasta que termina una suscripción cancelada. */
  daysLeft: number | null
  features: string[]
  canSubscribe: boolean
  canManage: boolean
  /** Última comprobación correcta con el servidor (ISO 8601). */
  checkedAt?: string
}

export type LicenseState =
  /** No hay servidor de licencias configurado: la app funciona sin restricciones. */
  | { kind: 'disabled' }
  | { kind: 'checking' }
  /** No se pudo contactar con el servidor al abrir la app. */
  | { kind: 'offline'; reason: 'network' | 'server'; message: string }
  | { kind: 'signed-out'; email?: string; notice?: string }
  | { kind: 'device-limit'; email: string; devices: DeviceInfo[]; max: number }
  | { kind: 'update-required'; minVersion: string; version: string }
  | { kind: 'blocked'; message: string }
  | LicensedState

/** Resultado de iniciar sesión, crear cuenta o recuperar la contraseña. */
export interface AuthResult {
  ok: boolean
  /** Mensaje para el usuario (error o aviso, p. ej. «revisa tu correo»). */
  message?: string
}

export interface LicenseApi {
  state(): Promise<LicenseState>
  onState(cb: (s: LicenseState) => void): () => void
  /** Vuelve a comprobar la licencia con el servidor. */
  refresh(): Promise<LicenseState>
  login(email: string, password: string): Promise<AuthResult>
  signup(email: string, password: string): Promise<AuthResult>
  recover(email: string): Promise<AuthResult>
  logout(): Promise<void>
  deactivateDevice(id: string): Promise<AuthResult>
  /** Abre en el navegador el pago de la suscripción. */
  openCheckout(): Promise<void>
  /** Abre en el navegador el portal para cambiar la tarjeta o cancelar. */
  openPortal(): Promise<void>
}

// ---------------------------------------------------------------------------
// Acceso a las llamadas IPC
// ---------------------------------------------------------------------------

/** none: solo pantalla de acceso · read: solo lectura · full: todo. */
export type Access = 'none' | 'read' | 'full'

/** Siempre permitidas, aunque no haya licencia (acceso, versión y actualizaciones). */
export const ALWAYS_CHANNELS = new Set([
  'app:version', 'update:status', 'update:check', 'update:install'
])

/** Consultar, buscar y sacar datos de la app: permitidas en modo solo lectura. */
export const READ_CHANNELS = new Set([
  'app:whatsNew', 'app:whatsNewSeen',
  'clients:list', 'clients:get',
  'sessions:list', 'sessions:get',
  'contacts:list', 'contacts:get',
  'days:list', 'photos:list', 'photos:reveal',
  'tariffs:list', 'invoices:list', 'invoices:get',
  'library:query', 'library:ids',
  'championships', 'tags', 'formats', 'search', 'stats',
  'settings:get',
  'folder:choose', 'folder:reopen',
  // Exportar: nunca se retienen los datos del usuario.
  'library:copyTo', 'photos:exportPicks', 'invoices:exportPdf'
])

/** Crean, modifican o borran datos: necesitan una licencia activa. */
export const WRITE_CHANNELS = new Set([
  'clients:save', 'clients:remove',
  'sessions:save', 'sessions:remove',
  'contacts:save', 'contacts:remove',
  'days:save', 'days:remove',
  'photos:assign', 'photos:setDay', 'photos:update', 'photos:addTag', 'photos:removeTag',
  'photos:remove', 'photos:import',
  'tariffs:save', 'tariffs:remove',
  'invoices:save', 'invoices:remove', 'invoices:convert',
  'folder:add', 'gallery:export', 'gallery:importSelection',
  'settings:save', 'settings:chooseLogo'
])

export const READONLY_MESSAGE = 'Modo solo lectura: suscríbete para crear y editar'
export const LOCKED_MESSAGE = 'Inicia sesión para usar FotoGestor'

/** Nivel de acceso que necesita una llamada. Las desconocidas se tratan como escritura. */
export function requiredAccess(channel: string): Access {
  if (channel.startsWith('license:') || ALWAYS_CHANNELS.has(channel)) return 'none'
  if (READ_CHANNELS.has(channel)) return 'read'
  return 'full'
}

export function accessFor(state: LicenseState): Access {
  if (state.kind === 'disabled') return 'full'
  if (state.kind === 'licensed') return state.mode === 'full' ? 'full' : 'read'
  return 'none'
}

const RANK: Record<Access, number> = { none: 0, read: 1, full: 2 }

/** Error si la llamada no está permitida con el acceso actual; null si lo está. */
export function deniedMessage(channel: string, access: Access): string | null {
  const need = requiredAccess(channel)
  if (RANK[access] >= RANK[need]) return null
  return access === 'read' ? READONLY_MESSAGE : LOCKED_MESSAGE
}

// ---------------------------------------------------------------------------
// Interpretación de la licencia
// ---------------------------------------------------------------------------

const DAY = 86_400_000

function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / DAY)) : null
}

function inFuture(iso: string | null, now: number): boolean {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) && t > now
}

/**
 * Convierte la licencia en el estado que ve la app. Con prueba o suscripción vigente: acceso
 * completo; con un pago pendiente se mantiene mientras Paddle reintenta el cobro; al terminar la
 * prueba o el periodo pagado: solo lectura.
 */
export function licensedState(c: LicenseClaims, urls: { checkout: boolean; portal: boolean }, now = Date.now()): LicensedState {
  let mode: LicenseMode = 'readonly'
  let daysLeft: number | null = null
  switch (c.status) {
    case 'trial':
      if (inFuture(c.trial_end, now)) mode = 'full'
      daysLeft = daysUntil(c.trial_end, now)
      break
    case 'active':
    case 'past_due':
      // Sin fecha de fin el servidor manda: está activa.
      if (!c.period_end || inFuture(c.period_end, now)) mode = 'full'
      break
    case 'cancelled':
      if (inFuture(c.period_end, now)) mode = 'full'
      daysLeft = daysUntil(c.period_end, now)
      break
    case 'expired':
      break
  }
  return {
    kind: 'licensed', mode, status: c.status, email: c.email, plan: c.plan,
    trialEnd: c.trial_end, periodEnd: c.period_end, daysLeft, features: c.features ?? [],
    canSubscribe: urls.checkout, canManage: urls.portal
  }
}
