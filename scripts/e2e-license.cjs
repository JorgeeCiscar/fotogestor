// Prueba de extremo a extremo de las licencias, contra el servidor de pruebas de license-mock.cjs.
// Uso: npm run test:e2e-license   (en Linux sin pantalla: xvfb-run -a npm run test:e2e-license)
// KEEP_E2E=1 conserva el directorio temporal con las capturas.
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { _electron } = require('playwright')
const { startMock } = require('./license-mock.cjs')

const ROOT = path.resolve(__dirname, '..')
const S = fs.mkdtempSync(path.join(process.env.E2E_OUT || os.tmpdir(), 'fotogestor-e2e-licencia-'))
for (const d of ['data', 'lic', 'shots']) fs.mkdirSync(path.join(S, d))
console.log('directorio de prueba:', S)

const EMAIL = 'piloto@example.com'
const PASSWORD = 'contraseña-segura-1'
const DAY = 86_400_000

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

;(async () => {
  const mock = await startMock()
  let current
  const errors = []

  async function launch(device) {
    const app = await _electron.launch({
      executablePath: require('electron'),
      args: [ROOT, '--no-sandbox'],
      env: {
        ...process.env, ...mock.env,
        FOTOGESTOR_DATA_DIR: path.join(S, 'data'),
        FOTOGESTOR_LICENSE_DIR: path.join(S, 'lic'),
        FOTOGESTOR_DEVICE_ID: device
      }
    })
    const win = await app.firstWindow()
    win.on('pageerror', (e) => errors.push(e.message))
    win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await win.setViewportSize({ width: 1400, height: 900 })
    current = { app, win }
    return current
  }
  const shot = (win, name) => win.screenshot({ path: path.join(S, 'shots', name + '.png') })
  const call = (win, fn, ...args) => win.evaluate(([fn, args]) => {
    const [ns, m] = fn.split('.')
    return window.api[ns][m](...args).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: e.message }))
  }, [fn, args])
  const licensed = (win) => win.waitForSelector('aside.sidebar', { timeout: 20000 })
  const refresh = (win) => win.evaluate(() => window.api.license.refresh())

  try {
    // --- Sin cuenta: pantalla de acceso y todo bloqueado ---
    let { app, win } = await launch('equipo-A')
    await win.waitForSelector('text=Empezar la prueba gratuita', { timeout: 20000 })
    check('sin sesión se muestra la pantalla para crear cuenta', true)
    let r = await call(win, 'clients.list')
    check('sin licencia el proceso principal bloquea los datos', !r.ok && /Inicia sesión/.test(r.e), r.e)
    await shot(win, '01-crear-cuenta')

    await win.fill('.gate input[type=email]', EMAIL)
    await win.fill('.gate input[type=password]', 'corta')
    await win.click('button:has-text("Empezar la prueba gratuita")')
    await win.waitForSelector('.gate-msg.error')
    check('valida la longitud de la contraseña', /8 caracteres/.test(await win.textContent('.gate-msg')))

    // --- Prueba gratuita ---
    await win.fill('.gate input[type=password]', PASSWORD)
    await win.click('button:has-text("Empezar la prueba gratuita")')
    await licensed(win)
    const banner = await win.textContent('.license-banner')
    check('al crear la cuenta empieza la prueba de 7 días', /Prueba gratuita/.test(banner) && /7 días/.test(banner), banner)
    r = await call(win, 'clients.save', { kind: 'particular', name: 'Ana Pruebas' })
    check('durante la prueba se puede editar', r.ok, r.e)
    await shot(win, '02-prueba')

    // --- Fin de la suscripción: solo lectura ---
    mock.set(EMAIL, { status: 'expired' })
    await win.click('nav >> text=Ajustes')
    await win.click('button:has-text("Comprobar de nuevo")')
    await win.waitForSelector('.license-banner.readonly')
    check('al terminar la suscripción pasa a solo lectura', true)
    r = await call(win, 'clients.save', { kind: 'particular', name: 'No se guarda' })
    check('en solo lectura no se puede crear', !r.ok && /solo lectura/.test(r.e), r.e)
    r = await call(win, 'clients.list')
    check('en solo lectura se pueden ver los datos', r.ok && r.r.length === 1)
    check('en Ajustes se ve la cuenta y el estado', /piloto@example\.com/.test(await win.textContent('.account')) &&
      /ha terminado/.test(await win.textContent('.license-status')))
    await shot(win, '03-solo-lectura')

    // --- Suscripción activa ---
    mock.set(EMAIL, { status: 'active', period_end: new Date(Date.now() + 30 * DAY).toISOString() })
    await refresh(win)
    await win.waitForFunction(() => !document.querySelector('.license-banner'))
    check('con suscripción activa desaparece el aviso', /Suscripción activa/.test(await win.textContent('.license-status')))
    r = await call(win, 'clients.save', { kind: 'particular', name: 'Benito Pruebas' })
    check('con suscripción activa se puede editar', r.ok, r.e)
    await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (u) => { globalThis.__opened.push(u) } })
    await win.click('.account button:has-text("Gestionar suscripción")')
    await win.waitForTimeout(500)
    const opened = await app.evaluate(() => globalThis.__opened)
    check('«Gestionar suscripción» abre el portal de cliente', opened[0] === 'https://portal.example.com/fotogestor', String(opened))

    // --- Renovación de la sesión ---
    mock.expireAccess()
    const s1 = await refresh(win)
    check('renueva la sesión caducada sin pedir contraseña', s1.kind === 'licensed' &&
      mock.log.some((l) => l.includes('grant_type=refresh_token')))

    // --- Se pierde la conexión con la app abierta ---
    mock.setDown(true)
    const s2 = await refresh(win)
    check('sin conexión con la app abierta se sigue trabajando', s2.kind === 'licensed' && s2.mode === 'full')
    r = await call(win, 'clients.save', { kind: 'particular', name: 'Carla Pruebas' })
    check('sin conexión se puede seguir editando', r.ok, r.e)
    await win.click('button:has-text("Comprobar de nuevo")')
    await win.waitForFunction(() => document.querySelector('.account')?.textContent?.includes('No hay conexión'))
    check('avisa de que no hay conexión', true)
    await app.close()

    // --- Abrir sin conexión ---
    ;({ app, win } = await launch('equipo-A'))
    await win.waitForSelector('text=Sin conexión', { timeout: 20000 })
    check('sin conexión al abrir no se puede entrar', /Conéctate a internet/.test(await win.textContent('.gate')))
    await shot(win, '04-sin-conexion')
    mock.setDown(false)
    await win.click('button:has-text("Reintentar")')
    await licensed(win)
    check('al volver la conexión entra sin volver a iniciar sesión', true)
    await app.close()

    // --- Límite de 2 ordenadores ---
    ;({ app, win } = await launch('equipo-B'))
    await licensed(win)
    check('se puede usar en un segundo ordenador', mock.user(EMAIL).devices.size === 2)
    await app.close()
    ;({ app, win } = await launch('equipo-C'))
    await win.waitForSelector('text=Demasiados ordenadores', { timeout: 20000 })
    check('en un tercer ordenador pide desactivar uno', (await win.$$('.gate-devices li')).length === 2)
    await shot(win, '05-limite-equipos')
    await win.click('.gate-devices li >> nth=0 >> button:has-text("Desactivar")')
    await licensed(win)
    check('al desactivar un ordenador se puede usar en este', mock.user(EMAIL).devices.size === 2)

    // --- Versión mínima obligatoria ---
    mock.set(EMAIL, { min_version: '99.0.0' })
    await refresh(win)
    await win.waitForSelector('text=Hay que actualizar')
    check('con una versión antigua obliga a actualizar', true)
    await shot(win, '06-actualizar')
    mock.set(EMAIL, { min_version: null })
    await refresh(win)
    await licensed(win)

    // --- Cuenta bloqueada ---
    mock.set(EMAIL, { blocked: 'Tu cuenta está suspendida. Escríbenos a soporte.' })
    await refresh(win)
    await win.waitForSelector('text=No se puede abrir FotoGestor')
    check('una cuenta bloqueada no puede entrar', /suspendida/.test(await win.textContent('.gate')))
    mock.set(EMAIL, { blocked: null })
    await win.click('button:has-text("Reintentar")')
    await licensed(win)

    // --- Cerrar sesión e iniciarla de nuevo ---
    await win.click('nav >> text=Ajustes')
    await win.click('.account button:has-text("Cerrar sesión")')
    await win.waitForSelector('.gate button[type=submit]:has-text("Iniciar sesión")')
    check('al cerrar sesión vuelve a la pantalla de acceso con el email', (await win.inputValue('.gate input[type=email]')) === EMAIL)
    await win.fill('.gate input[type=password]', 'mala')
    await win.click('.gate button[type=submit]')
    await win.waitForSelector('.gate-msg.error')
    check('avisa de una contraseña incorrecta', /incorrectos/.test(await win.textContent('.gate-msg')))
    await win.fill('.gate input[type=password]', PASSWORD)
    await win.click('.gate button[type=submit]')
    await licensed(win)
    check('inicia sesión con la contraseña correcta', true)

    // --- Cuenta nueva que debe confirmar el email ---
    await win.evaluate(() => window.api.license.logout())
    mock.setConfirmEmail(true)
    await win.click('.gate-tabs button:has-text("Crear cuenta")')
    await win.fill('.gate input[type=email]', 'nuevo@example.com')
    await win.fill('.gate input[type=password]', PASSWORD)
    await win.click('button:has-text("Empezar la prueba gratuita")')
    await win.waitForSelector('.gate-msg.info')
    check('si hay que confirmar el email, lo avisa', /confirmar la cuenta/.test(await win.textContent('.gate-msg')))
    await shot(win, '07-confirmar-email')
    await app.close()

    check('sin errores en la interfaz', errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (e) {
    failures++
    console.error('✘ ERROR:', e.message.split('\n')[0])
    if (current) await shot(current.win, 'fallo').catch(() => {})
  } finally {
    if (current) await current.app.close().catch(() => {})
    await mock.close()
  }

  if (!process.env.KEEP_E2E) fs.rmSync(S, { recursive: true, force: true })
  else console.log('resultados en', S)
  console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones de licencias han pasado')
  process.exit(failures ? 1 : 0)
})()
