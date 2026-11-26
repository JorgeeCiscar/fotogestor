// Servidor de licencias de pruebas: imita Supabase Auth y las funciones license-check y
// device-deactivate (contrato en docs/licencias-y-adminapps.md, apéndice A).
// Se usa en scripts/e2e-license.cjs. También se puede arrancar a mano para probar la app:
//   node scripts/license-mock.cjs            (imprime las variables para `npm run dev`)
const http = require('node:http')
const { generateKeyPairSync, randomUUID, sign } = require('node:crypto')

const DAY = 86_400_000

function startMock({ port = 0, maxDevices = 2 } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const users = new Map() // email -> usuario
  const access = new Map() // token de acceso -> email
  const refresh = new Map() // token de renovación -> email
  let down = false
  let confirmEmail = false
  const log = []

  const newUser = (email, password) => ({
    id: randomUUID(), email, password, status: 'trial',
    trial_end: new Date(Date.now() + 7 * DAY).toISOString(), period_end: null,
    min_version: null, blocked: null, devices: new Map()
  })

  function session(u) {
    const at = randomUUID(); const rt = randomUUID()
    access.set(at, u.email); refresh.set(rt, u.email)
    return { access_token: at, refresh_token: rt, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer', user: { id: u.id, email: u.email } }
  }

  function licenseToken(u, deviceId) {
    const now = Math.floor(Date.now() / 1000)
    const claims = { v: 1, app: 'fotogestor', sub: u.id, email: u.email, device: deviceId, status: u.status, plan: u.status === 'trial' ? null : 'mensual',
      trial_end: u.status === 'trial' ? u.trial_end : null, period_end: u.period_end, features: [], min_version: u.min_version, iat: now, exp: now + 6 * 3600 }
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return `${body}.${sign(null, Buffer.from(body, 'ascii'), privateKey).toString('base64url')}`
  }

  const server = http.createServer((req, res) => {
    if (down) { req.socket.destroy(); return }
    let raw = ''
    req.on('data', (d) => { raw += d })
    req.on('end', () => {
      const url = new URL(req.url, 'http://x')
      const body = raw ? JSON.parse(raw) : {}
      const send = (status, json) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(json === undefined ? '' : JSON.stringify(json)) }
      const bearer = String(req.headers.authorization ?? '').replace(/^Bearer /, '')
      const user = () => users.get(access.get(bearer))
      log.push(`${req.method} ${url.pathname}${url.search}`)
      if (!req.headers.apikey) return send(401, { message: 'No API key found in request' })
      // Como Supabase con las claves nuevas: la clave pública nunca va en Authorization.
      if (bearer && bearer === req.headers.apikey) return send(401, { message: 'Invalid JWT' })

      switch (url.pathname) {
        case '/auth/v1/signup': {
          if (users.has(body.email)) return send(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
          const u = newUser(body.email, body.password)
          users.set(u.email, u)
          if (confirmEmail) return send(200, { id: u.id, email: u.email })
          return send(200, session(u))
        }
        case '/auth/v1/token': {
          if (url.searchParams.get('grant_type') === 'password') {
            const u = users.get(body.email)
            if (!u || u.password !== body.password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
            return send(200, session(u))
          }
          const email = refresh.get(body.refresh_token)
          if (!email) return send(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' })
          refresh.delete(body.refresh_token)
          return send(200, session(users.get(email)))
        }
        case '/auth/v1/recover': return send(200, {})
        case '/auth/v1/logout': access.delete(bearer); return send(204)
        case '/functions/v1/license-check': {
          const u = user()
          if (!u) return send(401, { message: 'Invalid JWT' })
          if (u.blocked) return send(403, { error: 'blocked', message: u.blocked })
          const id = String(body.device_id)
          if (!u.devices.has(id) && u.devices.size >= maxDevices) {
            return send(409, { error: 'device_limit', max: maxDevices,
              devices: [...u.devices].map(([did, d]) => ({ id: did, name: d.name, last_seen: d.last_seen })) })
          }
          u.devices.set(id, { name: body.device_name, last_seen: new Date().toISOString() })
          return send(200, { token: licenseToken(u, id), checkout_url: 'https://checkout.example.com/fotogestor', can_manage: u.status !== 'trial' })
        }
        case '/functions/v1/portal-session': {
          if (!user()) return send(401, { message: 'Invalid JWT' })
          return send(200, { url: 'https://portal.example.com/fotogestor' })
        }
        case '/functions/v1/device-deactivate': {
          const u = user()
          if (!u) return send(401, { message: 'Invalid JWT' })
          u.devices.delete(String(body.device_id))
          return send(200, { ok: true })
        }
        default: return send(404, { message: 'Not found' })
      }
    })
  })

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`
    resolve({
      url,
      env: {
        FOTOGESTOR_LICENSE_URL: url,
        FOTOGESTOR_LICENSE_ANON_KEY: 'anon-de-pruebas',
        FOTOGESTOR_LICENSE_PUBLIC_KEY: publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
      },
      log,
      user: (email) => users.get(email),
      /** Cambia los datos de la suscripción de un usuario. */
      set(email, patch) { Object.assign(users.get(email), patch) },
      /** Simula que no hay conexión (corta todas las peticiones). */
      setDown(v) { down = v },
      setConfirmEmail(v) { confirmEmail = v },
      /** Invalida los tokens de acceso para forzar su renovación. */
      expireAccess() { access.clear() },
      close: () => new Promise((r) => server.close(r))
    })
  }))
}

module.exports = { startMock }

if (require.main === module) {
  startMock({ port: Number(process.env.PORT) || 54321 }).then((m) => {
    console.log('Servidor de licencias de pruebas en', m.url)
    console.log('Arranca la app con estas variables:')
    for (const [k, v] of Object.entries(m.env)) console.log(`  ${k}=${v}`)
  })
}
