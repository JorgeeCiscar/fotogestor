import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import type { LicenseClaims } from '../../shared/license'

/**
 * Token de licencia: `base64url(JSON de LicenseClaims).base64url(firma Ed25519)`.
 * La firma se hace sobre la primera parte tal cual (texto ASCII). El servidor firma con su
 * clave privada y la app comprueba con la clave pública incluida en el instalador.
 */

/** Clave pública en DER SPKI codificada en base64 (o PEM). */
export function loadPublicKey(key: string): KeyObject {
  const k = key.trim()
  if (k.startsWith('-----BEGIN')) return createPublicKey(k)
  return createPublicKey({ key: Buffer.from(k, 'base64'), format: 'der', type: 'spki' })
}

export interface Expected {
  app: string
  device: string
  sub: string
  /** Segundos desde 1970. */
  now?: number
}

/** Margen por diferencias de reloj entre el ordenador y el servidor. */
const SKEW = 300

/** Comprueba firma, app, ordenador, usuario y caducidad. Devuelve las licencias o lanza un error. */
export function verifyLicenseToken(token: string, key: KeyObject, exp: Expected): LicenseClaims {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Token de licencia con formato no válido')
  const [body, sig] = parts
  if (!verify(null, Buffer.from(body, 'ascii'), key, Buffer.from(sig, 'base64url'))) {
    throw new Error('La firma de la licencia no es válida')
  }
  let c: LicenseClaims
  try { c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch {
    throw new Error('Token de licencia ilegible')
  }
  const now = exp.now ?? Math.floor(Date.now() / 1000)
  if (c.v !== 1) throw new Error('Versión de licencia no admitida')
  if (c.app !== exp.app) throw new Error('La licencia es de otra aplicación')
  if (c.device !== exp.device) throw new Error('La licencia es de otro ordenador')
  if (c.sub !== exp.sub) throw new Error('La licencia es de otro usuario')
  if (typeof c.exp !== 'number' || c.exp + SKEW < now) throw new Error('La licencia ha caducado')
  if (typeof c.iat !== 'number' || c.iat - SKEW > now) throw new Error('La licencia tiene una fecha futura')
  if (!Array.isArray(c.features)) c.features = []
  return c
}
