import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { test } from 'node:test'
import type { LicenseClaims } from '../../shared/license.ts'
import { loadPublicKey, verifyLicenseToken } from './token.ts'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const other = generateKeyPairSync('ed25519')
const PUB_B64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const NOW = 1_800_000_000

function make(p: Partial<LicenseClaims> = {}, key = privateKey): string {
  const c: LicenseClaims = {
    v: 1, app: 'fotogestor', sub: 'u1', email: 'a@b.es', device: 'd1', status: 'active', plan: null,
    trial_end: null, period_end: null, features: ['x'], min_version: null, iat: NOW - 10, exp: NOW + 3600, ...p
  }
  const body = Buffer.from(JSON.stringify(c)).toString('base64url')
  return `${body}.${sign(null, Buffer.from(body, 'ascii'), key).toString('base64url')}`
}
const exp = { app: 'fotogestor', device: 'd1', sub: 'u1', now: NOW }

test('acepta un token válido (clave en base64 y en PEM)', () => {
  assert.equal(verifyLicenseToken(make(), loadPublicKey(PUB_B64), exp).status, 'active')
  const pem = publicKey.export({ format: 'pem', type: 'spki' }).toString()
  assert.deepEqual(verifyLicenseToken(make(), loadPublicKey(pem), exp).features, ['x'])
})

test('rechaza firmas falsas o tokens manipulados', () => {
  const key = loadPublicKey(PUB_B64)
  assert.throws(() => verifyLicenseToken(make({}, other.privateKey), key, exp), /firma/)
  const [, sig] = make().split('.')
  const forged = Buffer.from(JSON.stringify({ v: 1, app: 'fotogestor', sub: 'u1', device: 'd1', status: 'active', iat: NOW, exp: NOW + 9e9 })).toString('base64url')
  assert.throws(() => verifyLicenseToken(`${forged}.${sig}`, key, exp), /firma/)
  assert.throws(() => verifyLicenseToken('basura', key, exp), /formato/)
})

test('rechaza tokens de otra app, otro ordenador, otro usuario o caducados', () => {
  const key = loadPublicKey(PUB_B64)
  assert.throws(() => verifyLicenseToken(make({ app: 'appclase' }), key, exp), /otra aplicación/)
  assert.throws(() => verifyLicenseToken(make({ device: 'd2' }), key, exp), /otro ordenador/)
  assert.throws(() => verifyLicenseToken(make({ sub: 'u2' }), key, exp), /otro usuario/)
  assert.throws(() => verifyLicenseToken(make({ exp: NOW - 3600 }), key, exp), /caducado/)
  assert.throws(() => verifyLicenseToken(make({ iat: NOW + 3600 }), key, exp), /futura/)
})
