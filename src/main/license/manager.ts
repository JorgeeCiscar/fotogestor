import type { KeyObject } from 'node:crypto'
import { compareVersions } from '../../shared/changelog'
import {
  accessFor, licensedState, type Access, type AuthResult, type LicenseState
} from '../../shared/license'
import type { Device } from './device'
import { devicesFrom, HttpError, NetworkError, type LicenseServer, type Session } from './server'
import type { SessionStore } from './store'
import { verifyLicenseToken } from './token'

const RECHECK_MS = 60 * 60 * 1000 // cada hora con la app abierta

export interface ManagerOptions {
  appId: string
  version: string
  server: LicenseServer
  publicKey: KeyObject
  store: SessionStore
  device: () => Promise<Device>
  onChange: (s: LicenseState) => void
  log?: (msg: string) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Mensaje comprensible para los errores de Supabase Auth. */
function authMessage(e: unknown): string {
  if (e instanceof NetworkError) return 'No hay conexión con el servidor. Comprueba tu conexión a internet.'
  if (e instanceof HttpError) {
    const code = e.code.toLowerCase()
    const msg = e.message.toLowerCase()
    if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Confirma tu email con el enlace que te enviamos y vuelve a intentarlo.'
    if (code === 'invalid_credentials' || code === 'invalid_grant' || msg.includes('invalid login')) return 'Email o contraseña incorrectos.'
    if (code === 'user_already_exists' || msg.includes('already registered')) return 'Ya existe una cuenta con ese email. Inicia sesión.'
    if (code === 'weak_password') return 'La contraseña es demasiado débil. Usa al menos 8 caracteres combinando letras y números.'
    if (e.status === 429) return 'Demasiados intentos. Espera unos minutos.'
    if (e.status >= 500) return 'El servidor no está disponible. Inténtalo de nuevo en unos minutos.'
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

/**
 * Estado de la licencia de la app. Al abrir hace falta conexión; si se pierde con la app
 * abierta, se conserva el último estado válido hasta cerrarla.
 */
export class LicenseManager {
  private state: LicenseState = { kind: 'checking' }
  private session: Session | null = null
  private dev: Device | null = null
  private urls: { checkout: string | null; canManage: boolean } = { checkout: null, canManage: false }
  private timer: ReturnType<typeof setInterval> | null = null
  private running: Promise<LicenseState> | null = null

  constructor(private o: ManagerOptions) {}

  getState(): LicenseState { return this.state }
  access(): Access { return accessFor(this.state) }
  checkoutUrl(): string | null { return this.urls.checkout }

  /** Pide al servidor un enlace al portal de cliente (caduca enseguida, por eso no se guarda). */
  async portalUrl(): Promise<string | null> {
    if (!this.urls.canManage) return null
    try {
      return await this.o.server.portal((await this.freshSession()).access_token)
    } catch (e) {
      this.o.log?.(`portal: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  private set(s: LicenseState): LicenseState {
    this.state = s
    this.o.onChange(s)
    return s
  }

  private async device(): Promise<Device> {
    return (this.dev ??= await this.o.device())
  }

  async start(): Promise<void> {
    this.session = await this.o.store.load()
    await this.check()
    this.timer = setInterval(() => { void this.check() }, RECHECK_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private async saveSession(s: Session | null): Promise<void> {
    this.session = s
    if (s) await this.o.store.save(s)
    else await this.o.store.clear()
  }

  /** Sesión con el token de acceso vigente (se renueva si caduca en menos de un minuto). */
  private async freshSession(force = false): Promise<Session> {
    const s = this.session
    if (!s) throw new HttpError(401, { message: 'Sin sesión' })
    if (!force && s.expires_at - 60 > Date.now() / 1000) return s
    try {
      const n = await this.o.server.refresh(s.refresh_token)
      await this.saveSession(n)
      return n
    } catch (e) {
      // Sesión revocada o caducada: hay que volver a iniciar sesión.
      if (e instanceof HttpError && e.status >= 400 && e.status < 500) throw new HttpError(401, { message: 'Sesión caducada', error: 'session_expired' })
      throw e
    }
  }

  /** Comprueba la licencia con el servidor. Si ya hay una comprobación en curso, espera a esa. */
  check(): Promise<LicenseState> {
    this.running ??= this.doCheck().finally(() => { this.running = null })
    return this.running
  }

  private async doCheck(): Promise<LicenseState> {
    if (!this.session) return this.set({ kind: 'signed-out' })
    try {
      const device = await this.device()
      let s = await this.freshSession()
      let res
      try {
        res = await this.o.server.check(s.access_token, device, this.o.version)
      } catch (e) {
        if (!(e instanceof HttpError && e.status === 401)) throw e
        s = await this.freshSession(true)
        res = await this.o.server.check(s.access_token, device, this.o.version)
      }
      const claims = verifyLicenseToken(res.token, this.o.publicKey, { app: this.o.appId, device: device.id, sub: s.user.id })
      this.urls = { checkout: res.checkout_url ?? null, canManage: !!res.can_manage }
      if (claims.min_version && compareVersions(this.o.version, claims.min_version) < 0) {
        return this.set({ kind: 'update-required', minVersion: claims.min_version, version: this.o.version })
      }
      return this.set({ ...licensedState(claims, { checkout: !!this.urls.checkout, portal: this.urls.canManage }), checkedAt: new Date().toISOString() })
    } catch (e) {
      return this.fail(e)
    }
  }

  private async fail(e: unknown): Promise<LicenseState> {
    const email = this.session?.user.email
    if (e instanceof HttpError && e.status === 401) {
      await this.saveSession(null)
      return this.set({ kind: 'signed-out', email, notice: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' })
    }
    if (e instanceof HttpError && e.status === 409 && e.code === 'device_limit') {
      return this.set({ kind: 'device-limit', email: email ?? '', ...devicesFrom(e) })
    }
    if (e instanceof HttpError && e.status === 403) {
      return this.set({ kind: 'blocked', message: e.message })
    }
    this.o.log?.(`licencia: ${e instanceof Error ? e.message : String(e)}`)
    // Sin conexión o error del servidor con la app ya abierta: no se corta el trabajo.
    if (this.state.kind === 'licensed' || this.state.kind === 'update-required') return this.state
    if (e instanceof NetworkError) {
      return this.set({ kind: 'offline', reason: 'network', message: 'Conéctate a internet para abrir FotoGestor.' })
    }
    return this.set({
      kind: 'offline', reason: 'server',
      message: e instanceof HttpError && e.status >= 500
        ? 'El servidor de licencias no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.'
        : `No se pudo comprobar la licencia: ${e instanceof Error ? e.message : String(e)}`
    })
  }

  async login(email: string, password: string): Promise<AuthResult> {
    email = email.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return { ok: false, message: 'Escribe un email válido.' }
    if (!password) return { ok: false, message: 'Escribe la contraseña.' }
    try {
      await this.saveSession(await this.o.server.login(email, password))
    } catch (e) {
      return { ok: false, message: authMessage(e) }
    }
    await this.check()
    return { ok: true }
  }

  async signup(email: string, password: string): Promise<AuthResult> {
    email = email.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return { ok: false, message: 'Escribe un email válido.' }
    if (password.length < 8) return { ok: false, message: 'La contraseña debe tener al menos 8 caracteres.' }
    let session: Session | null
    try {
      session = await this.o.server.signup(email, password)
    } catch (e) {
      return { ok: false, message: authMessage(e) }
    }
    if (!session) {
      const message = 'Te hemos enviado un email para confirmar la cuenta. Ábrelo y después inicia sesión.'
      this.set({ kind: 'signed-out', email, notice: message })
      return { ok: true, message }
    }
    await this.saveSession(session)
    await this.check()
    return { ok: true }
  }

  async recover(email: string): Promise<AuthResult> {
    email = email.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return { ok: false, message: 'Escribe tu email para recuperar la contraseña.' }
    try {
      await this.o.server.recover(email)
      return { ok: true, message: 'Si existe una cuenta con ese email, te hemos enviado un enlace para cambiar la contraseña.' }
    } catch (e) {
      return { ok: false, message: authMessage(e) }
    }
  }

  async logout(): Promise<void> {
    const s = this.session
    if (s) await this.o.server.logout(s.access_token).catch(() => undefined)
    await this.saveSession(null)
    this.urls = { checkout: null, canManage: false }
    this.set({ kind: 'signed-out', email: s?.user.email })
  }

  async deactivateDevice(id: string): Promise<AuthResult> {
    try {
      const s = await this.freshSession()
      await this.o.server.deactivate(s.access_token, id)
    } catch (e) {
      if (e instanceof HttpError && e.status === 429) return { ok: false, message: 'Has cambiado de ordenador demasiadas veces este mes. Escríbenos y lo revisamos.' }
      if (e instanceof HttpError && e.status === 401) { await this.fail(e); return { ok: false, message: 'Tu sesión ha caducado.' } }
      return { ok: false, message: authMessage(e) }
    }
    await this.check()
    return { ok: true }
  }
}
