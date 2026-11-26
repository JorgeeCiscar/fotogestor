import type { DeviceInfo } from '../../shared/license'
import type { Device } from './device'

/**
 * Llamadas al servidor de licencias (Supabase): login con Supabase Auth por REST y funciones
 * del servidor `license-check` y `device-deactivate`. El contrato está en
 * docs/licencias-y-adminapps.md, apéndice A.
 */

export interface LicenseConfig {
  /** URL del proyecto, p. ej. https://xxxx.supabase.co */
  url: string
  /** Clave pública (anon) del proyecto: identifica la app, no da permisos. */
  anonKey: string
  /** Clave pública Ed25519 con la que se verifican los tokens de licencia. */
  publicKey: string
  appId: string
}

export interface Session {
  access_token: string
  refresh_token: string
  /** Segundos desde 1970. */
  expires_at: number
  user: { id: string; email: string }
}

export interface CheckResult {
  token: string
  /** Página de pago con el usuario ya identificado. */
  checkout_url?: string | null
  /** Si el usuario tiene suscripción en Paddle y puede abrir el portal de cliente. */
  can_manage?: boolean
}

/** No se pudo conectar (sin internet, DNS, tiempo agotado…). */
export class NetworkError extends Error {}

/** El servidor respondió con un error. */
export class HttpError extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) {
    super(String(body.message ?? body.msg ?? body.error_description ?? body.error ?? `Error ${status} del servidor`))
  }
  get code(): string { return String(this.body.error ?? this.body.error_code ?? '') }
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>

const TIMEOUT_MS = 15_000

export class LicenseServer {
  constructor(private cfg: LicenseConfig, private fetchImpl: Fetch) {}

  private async call(path: string, body: unknown, bearer?: string): Promise<Record<string, unknown>> {
    let res: Response
    try {
      res = await this.fetchImpl(this.cfg.url.replace(/\/+$/, '') + path, {
        method: 'POST',
        // Las claves nuevas de Supabase (sb_publishable_…) no son JWT: van solo en `apikey`.
        // `Authorization` lleva únicamente el token del usuario.
        headers: {
          'content-type': 'application/json',
          apikey: this.cfg.anonKey,
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {})
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : String(e))
    }
    const text = await res.text().catch(() => '')
    let json: Record<string, unknown> = {}
    try { json = text ? JSON.parse(text) : {} } catch { json = { message: text.slice(0, 200) } }
    if (!res.ok) throw new HttpError(res.status, json)
    return json
  }

  private toSession(j: Record<string, unknown>): Session | null {
    const user = j.user as { id?: string; email?: string } | undefined
    if (!j.access_token || !j.refresh_token || !user?.id) return null
    const expiresAt = Number(j.expires_at) || Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600)
    return {
      access_token: String(j.access_token), refresh_token: String(j.refresh_token),
      expires_at: expiresAt, user: { id: user.id, email: String(user.email ?? '') }
    }
  }

  async login(email: string, password: string): Promise<Session> {
    const s = this.toSession(await this.call('/auth/v1/token?grant_type=password', { email, password }))
    if (!s) throw new Error('Respuesta de inicio de sesión no válida')
    return s
  }

  /** Crea la cuenta. Sin sesión cuando el servidor exige confirmar el email antes. */
  async signup(email: string, password: string): Promise<Session | null> {
    return this.toSession(await this.call('/auth/v1/signup', { email, password }))
  }

  async refresh(refreshToken: string): Promise<Session> {
    const s = this.toSession(await this.call('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken }))
    if (!s) throw new Error('Respuesta de renovación de sesión no válida')
    return s
  }

  async recover(email: string): Promise<void> {
    await this.call('/auth/v1/recover', { email })
  }

  async logout(accessToken: string): Promise<void> {
    await this.call('/auth/v1/logout', {}, accessToken)
  }

  async check(accessToken: string, device: Device, version: string): Promise<CheckResult> {
    const j = await this.call('/functions/v1/license-check', {
      app: this.cfg.appId, version, device_id: device.id, device_name: device.name, os: device.os
    }, accessToken)
    if (typeof j.token !== 'string') throw new Error('El servidor no ha enviado la licencia')
    return j as unknown as CheckResult
  }

  /** Enlace de un solo uso al portal de cliente de Paddle (cambiar tarjeta, cancelar). */
  async portal(accessToken: string): Promise<string> {
    const j = await this.call('/functions/v1/portal-session', { app: this.cfg.appId }, accessToken)
    if (typeof j.url !== 'string') throw new Error('El servidor no ha enviado el enlace del portal')
    return j.url
  }

  async deactivate(accessToken: string, deviceId: string): Promise<void> {
    await this.call('/functions/v1/device-deactivate', { app: this.cfg.appId, device_id: deviceId }, accessToken)
  }
}

/** Equipos que devuelve el servidor cuando se supera el límite (respuesta 409 device_limit). */
export function devicesFrom(err: HttpError): { devices: DeviceInfo[]; max: number } {
  const list = Array.isArray(err.body.devices) ? err.body.devices as DeviceInfo[] : []
  return { devices: list, max: Number(err.body.max) || 2 }
}
