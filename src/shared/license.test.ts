import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  accessFor, deniedMessage, licensedState, LOCKED_MESSAGE, READ_CHANNELS, READONLY_MESSAGE,
  requiredAccess, WRITE_CHANNELS, type LicenseClaims
} from './license.ts'

const NOW = Date.parse('2026-11-26T12:00:00Z')
const iso = (days: number) => new Date(NOW + days * 86_400_000).toISOString()
const claims = (p: Partial<LicenseClaims>): LicenseClaims => ({
  v: 1, app: 'fotogestor', sub: 'u1', email: 'a@b.es', device: 'd1', status: 'active', plan: 'mensual',
  trial_end: null, period_end: null, features: [], min_version: null, iat: 0, exp: 0, ...p
})
const urls = { checkout: true, portal: true }

test('prueba vigente: acceso completo y días restantes', () => {
  const s = licensedState(claims({ status: 'trial', trial_end: iso(6.5) }), urls, NOW)
  assert.equal(s.mode, 'full')
  assert.equal(s.daysLeft, 7)
})

test('prueba terminada: solo lectura', () => {
  const s = licensedState(claims({ status: 'trial', trial_end: iso(-0.1) }), urls, NOW)
  assert.equal(s.mode, 'readonly')
  assert.equal(s.daysLeft, 0)
})

test('suscripción activa, con pago pendiente o cancelada pero vigente: acceso completo', () => {
  assert.equal(licensedState(claims({ status: 'active', period_end: iso(20) }), urls, NOW).mode, 'full')
  assert.equal(licensedState(claims({ status: 'active' }), urls, NOW).mode, 'full')
  assert.equal(licensedState(claims({ status: 'past_due', period_end: iso(2) }), urls, NOW).mode, 'full')
  const c = licensedState(claims({ status: 'cancelled', period_end: iso(3) }), urls, NOW)
  assert.equal(c.mode, 'full')
  assert.equal(c.daysLeft, 3)
})

test('suscripción terminada: solo lectura', () => {
  assert.equal(licensedState(claims({ status: 'expired' }), urls, NOW).mode, 'readonly')
  assert.equal(licensedState(claims({ status: 'cancelled', period_end: iso(-1) }), urls, NOW).mode, 'readonly')
  assert.equal(licensedState(claims({ status: 'active', period_end: iso(-1) }), urls, NOW).mode, 'readonly')
})

test('niveles de acceso por llamada', () => {
  assert.equal(requiredAccess('license:login'), 'none')
  assert.equal(requiredAccess('update:install'), 'none')
  assert.equal(requiredAccess('clients:list'), 'read')
  assert.equal(requiredAccess('invoices:exportPdf'), 'read')
  assert.equal(requiredAccess('clients:save'), 'full')
  assert.equal(requiredAccess('canal:desconocido'), 'full')

  assert.equal(deniedMessage('clients:save', 'full'), null)
  assert.equal(deniedMessage('clients:save', 'read'), READONLY_MESSAGE)
  assert.equal(deniedMessage('clients:list', 'read'), null)
  assert.equal(deniedMessage('clients:list', 'none'), LOCKED_MESSAGE)
  assert.equal(deniedMessage('license:state', 'none'), null)

  assert.equal(accessFor({ kind: 'disabled' }), 'full')
  assert.equal(accessFor({ kind: 'offline', reason: 'network', message: '' }), 'none')
  assert.equal(accessFor(licensedState(claims({ status: 'expired' }), urls, NOW)), 'read')
})

test('todas las llamadas IPC del proceso principal están clasificadas', () => {
  const dir = join(import.meta.dirname, '..', 'main')
  const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'))
  const channels = new Set<string>()
  for (const f of files) {
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/ipcMain\.handle\('([^']+)'/g)) channels.add(m[1])
  }
  assert.ok(channels.size > 40, 'no se han encontrado las llamadas IPC')
  const unclassified = [...channels].filter((c) =>
    !c.startsWith('license:') && requiredAccess(c) !== 'none' && !READ_CHANNELS.has(c) && !WRITE_CHANNELS.has(c))
  assert.deepEqual(unclassified, [], 'añade estas llamadas a READ_CHANNELS o WRITE_CHANNELS en src/shared/license.ts')
  const both = [...READ_CHANNELS].filter((c) => WRITE_CHANNELS.has(c))
  assert.deepEqual(both, [])
})
