// Prueba de extremo a extremo de FotoGestor con Playwright.
// Uso: npm run test:e2e   (en Linux sin pantalla: xvfb-run -a npm run test:e2e)
// Variables: E2E_RAW=/ruta/a/foto.NEF añade un RAW real a la importación;
//            KEEP_E2E=1 conserva el directorio temporal con capturas, galería y PDF.
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const { _electron, chromium } = require('playwright')
const { DatabaseSync } = require('node:sqlite')

const ROOT = path.resolve(__dirname, '..')
const S = fs.mkdtempSync(path.join(process.env.E2E_OUT || os.tmpdir(), 'fotogestor-e2e-'))
for (const d of ['imgs', 'data', 'shots', 'out']) fs.mkdirSync(path.join(S, d))
execFileSync(process.execPath, [path.join(__dirname, 'make-test-images.cjs'), path.join(S, 'imgs')])
if (process.env.E2E_RAW) fs.copyFileSync(process.env.E2E_RAW, path.join(S, 'imgs', path.basename(process.env.E2E_RAW)))
const expectedPhotos = fs.readdirSync(path.join(S, 'imgs')).length
console.log('directorio de prueba:', S)

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

;(async () => {
  let win
  try { await run() } catch (e) {
    console.error('✘ ERROR:', e.message.split('\n')[0])
    if (win) {
      await win.screenshot({ path: path.join(S, 'shots', 'fallo.png'), timeout: 5000 }).catch(() => {})
      const text = await Promise.race([
        win.evaluate(() => (document.querySelector('.modal') ?? document.querySelector('main'))?.textContent ?? ''),
        new Promise((r) => setTimeout(() => r('(la ventana no responde)'), 5000))
      ]).catch((err) => `(error: ${err.message})`)
      console.error('pantalla:', String(text).slice(0, 600))
    }
    console.error('resultados en', S)
    process.exit(1)
  }

  async function run() {
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [ROOT, '--no-sandbox'],
    env: { ...process.env, FOTOGESTOR_DATA_DIR: path.join(S, 'data') }
  })
  const errors = []
  // Salida del proceso principal: se muestra si la prueba falla.
  const mainLog = []
  app.process().stdout.on('data', (d) => mainLog.push(String(d)))
  app.process().stderr.on('data', (d) => mainLog.push(String(d)))
  process.on('exit', (code) => { if (code) console.error('--- proceso principal ---\n' + mainLog.join('').slice(-4000)) })
  win = await app.firstWindow()
  win.on('pageerror', (e) => errors.push(e.message))
  win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  win.on('dialog', (d) => d.accept())
  await win.setViewportSize({ width: 1400, height: 900 })
  const stubOpen = (p) => app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }) }, p)
  const stubSave = (p) => app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }) }, p)
  const shot = (name) => win.screenshot({ path: path.join(S, 'shots', name + '.png') })
  /** Texto del aviso emergente; con `expect` espera a que aparezca ese aviso concreto. */
  const toast = async (expect) => {
    if (expect) {
      await win.waitForFunction((t) => document.querySelector('.toast')?.textContent?.includes(t), expect, { timeout: 20000 }).catch(() => {})
    } else {
      await win.waitForSelector('.toast')
    }
    return win.textContent('.toast')
  }

  // --- Ajustes ---
  await win.click('nav >> text=Ajustes')
  await win.fill('label:has-text("Nombre comercial") input', 'Estudio Luz de Tarde')
  await win.fill('label:has-text("NIF / CIF") input', '12345678Z')
  await win.fill('label:has-text("Dirección") textarea', 'C/ Mayor 1\n46001 Valencia')
  await win.fill('label:has-text("Email") input', 'hola@luzdetarde.es')
  await win.fill('label:has-text("IBAN") input', 'ES12 3456 7890 1234 5678 9012')
  await win.fill('label:has-text("IRPF") input', '15')
  await win.click('button:has-text("Guardar ajustes")')
  await win.waitForSelector('text=Ajustes guardados')
  await shot('ajustes')

  // --- Cliente y sesión ---
  await win.click('nav >> text=Clientes'); await win.click('text=+ Nuevo cliente')
  check('cliente: pregunta el tipo', (await win.locator('.kind-option').count()) === 3)
  await win.click('.kind-option:has(strong:text-is("Particular"))')
  await win.fill('.modal label:has-text("Nombre") input', 'Ana García')
  await win.fill('.modal input[type=email]', 'ana@example.com')
  await win.fill('.modal label:has-text("NIF") input', '87654321X')
  await win.fill('.modal label:has-text("Dirección") input', 'Av. del Puerto 12, Valencia')
  await win.click('.modal button:has-text("Guardar")')
  await win.waitForSelector('td:has-text("Ana García")')

  // Equipo y piloto (menor de edad) asignado al equipo.
  await win.click('text=+ Nuevo cliente'); await win.click('.kind-option:has(strong:text-is("Equipo"))')
  check('equipo: campos propios', (await win.locator('.modal label:has-text("Persona de contacto")').count()) === 1
    && (await win.locator('.modal label:has-text("Dorsal")').count()) === 0)
  await win.fill('.modal label:has-text("Nombre del equipo") input', 'Speed Racing Team')
  await win.fill('.modal label:has-text("Persona de contacto") input', 'Laura Gil')
  await win.fill('.modal label:has-text("Cargo") input', 'Team manager')
  await win.fill('.modal label:has-text("Categoría") input', 'Supersport 300')
  await win.fill('.modal label:has-text("Marca") input', 'Yamaha')
  await win.fill('.modal label:has-text("CIF") input', 'B12345678')
  await win.click('.modal button:has-text("Guardar")')
  await win.waitForSelector('td:has-text("Speed Racing Team")')

  await win.click('text=+ Nuevo cliente'); await win.click('.kind-option:has(strong:text-is("Piloto"))')
  await win.fill('.modal label:has-text("Nombre y apellidos") input', 'Marc Pérez')
  await win.fill('.modal label:has-text("Dorsal") input', '46')
  await win.fill('.modal label:has-text("Categoría") input', 'Supersport 300')
  await win.fill('.modal label:has-text("Moto") input', 'Yamaha R3')
  await win.selectOption('.modal label:has-text("Equipo") select', { label: 'Speed Racing Team' })
  const teen = new Date(); teen.setFullYear(teen.getFullYear() - 16)
  await win.fill('.modal input[type=date]', teen.toLocaleDateString('sv-SE'))
  check('piloto: aviso de menor de edad', (await win.locator('.minor-box').count()) === 1)
  await win.fill('.modal label:has-text("Nombre del tutor") input', 'Jordi Pérez')
  await win.fill('.modal label:has-text("Teléfono del tutor") input', '600111222')
  await win.fill('.modal label:has-text("Instagram") input', 'https://instagram.com/marc46/')
  await win.click('.modal button:has-text("Guardar")')
  await win.waitForSelector('td:has-text("Marc Pérez")')
  const pilotRow = (await win.textContent('tr:has-text("Marc Pérez")')).replace(/\s+/g, ' ')
  check('piloto: datos en la lista', pilotRow.startsWith('46Marc Pérez') && pilotRow.includes('Speed Racing Team') && pilotRow.includes('Menor (16 años)') && pilotRow.includes('@marc46'), pilotRow)
  const teamRow = (await win.textContent('tr:has(strong:text-is("Speed Racing Team"))')).replace(/\s+/g, ' ')
  check('equipo: lista sus pilotos', teamRow.includes('Pilotos: Marc Pérez') && teamRow.includes('1 piloto'), teamRow)
  await win.click('.segmented button:has-text("Pilotos")')
  check('clientes: pestaña pilotos', (await win.locator('.clients-table tbody tr').count()) === 1)
  await win.fill('.page-header .search', '46')
  check('clientes: búsqueda por dorsal', (await win.locator('.clients-table tbody tr').count()) === 1)
  await win.fill('.page-header .search', '')
  await win.click('.segmented button:has-text("Todos")')
  await shot('clientes')
  // Al cambiar a particular se vacían los datos de piloto.
  const saved = await win.evaluate(async () => {
    const all = await window.api.clients.list()
    const marc = all.find((c) => c.name === 'Marc Pérez')
    const changed = await window.api.clients.save({ ...marc, kind: 'particular' })
    await window.api.clients.save({ ...marc, kind: 'piloto' })
    return { before: marc.guardian_name, after: changed.racing_number, team: changed.team_id }
  })
  check('cliente: cambio de tipo limpia datos', saved.before === 'Jordi Pérez' && saved.after === null && saved.team === null, JSON.stringify(saved))

  await win.click('nav >> text=Sesiones'); await win.click('text=+ Nueva sesión')
  await win.fill('.modal label:has-text("Título") input', 'Boda Ana y Luis')
  await win.selectOption('.modal label:has-text("Cliente") select', { label: 'Ana García' })
  await win.selectOption('.modal label:has-text("Tipo") select', 'Boda')
  await win.fill('.modal input[type=date]', '2026-12-12')
  await win.selectOption('.modal label:has-text("Estado") select', 'editando')
  await win.fill('.modal input[type=number]', '1800')
  await win.fill('.modal .tag-input input', 'Valencia'); await win.keyboard.press('Enter')
  await win.fill('.modal .tag-input input', 'Exterior'); await win.keyboard.press('Enter')
  await win.click('.modal button:has-text("Guardar")')
  await win.waitForSelector('.dropzone')
  check('etiquetas de sesión', (await win.locator('.session-title .chip').count()) === 2)

  // --- Importación (JPEG + RAW) ---
  await stubOpen(path.join(S, 'imgs'))
  await win.click('.dropzone button')
  await win.waitForFunction((n) => document.querySelectorAll('.thumb img').length === n
    || /error|importadas/.test(document.querySelector('.toast')?.textContent ?? ''), expectedPhotos, { timeout: 60000 })
  check('importación', (await toast(`${expectedPhotos} importadas`)).includes(`${expectedPhotos} importadas`), await win.textContent('.toast'))
  if (process.env.E2E_RAW) check('distintivo RAW', (await win.locator('.raw-badge').count()) === 1)
  await win.click('button:has-text("+ Importar fotos")')
  await win.waitForFunction(() => document.querySelector('.toast')?.textContent?.includes('ya existían'))
  check('duplicados omitidos', (await win.textContent('.toast')).includes(`${expectedPhotos} ya existían`))

  // --- Selección por teclado ---
  await win.click('.thumb >> nth=0')
  await win.keyboard.press('p'); await win.keyboard.press('5'); await win.keyboard.press('ArrowRight')
  await win.keyboard.press('x'); await win.keyboard.press('ArrowRight')
  await win.keyboard.press('p'); await win.keyboard.press('3'); await win.keyboard.press('ArrowRight'); await win.keyboard.press('ArrowRight')
  await win.keyboard.press('p'); await win.keyboard.press('4')

  // --- Etiquetado en bloque (Ctrl+clic + T) ---
  await win.click('.thumb >> nth=0'); await win.click('.thumb >> nth=2', { modifiers: ['Control'] })
  await win.keyboard.press('t')
  await win.fill('.modal .tag-input input', 'Ceremonia'); await win.keyboard.press('Enter')
  await win.click('.modal button:has-text("Hecho")')
  await win.waitForTimeout(300)
  check('etiquetado en bloque', (await win.locator('.thumb-name:has-text("Ceremonia")').count()) === 2)

  // --- Visor + etiqueta individual ---
  await win.click('.thumb >> nth=4'); await win.keyboard.press('Enter'); await win.waitForTimeout(500)
  await win.fill('.viewer .tag-input input', 'Retrato'); await win.keyboard.press('Enter'); await win.waitForTimeout(300)
  await shot('visor')
  const viewerInfo = (await win.textContent('.viewer-info dl')).replace(/\s+/g, ' ')
  check('EXIF en el visor', viewerInfo.includes('Fujifilm') || viewerInfo.includes('FUJIFILM'), viewerInfo)
  await win.keyboard.press('Escape')
  await shot('sesion')

  if (process.env.E2E_RAW) {
    // Abrir el RAW en el visor y comprobar sus EXIF.
    await win.click('.thumb:has(.raw-badge)'); await win.keyboard.press('Enter'); await win.waitForTimeout(800)
    const rawInfo = (await win.textContent('.viewer-info dl')).replace(/\s+/g, ' ')
    check('EXIF del RAW', /D3S/.test(rawInfo) && /ISO 3200/.test(rawInfo), rawInfo)
    const dims = await win.$eval('.viewer img', (img) => [img.naturalWidth, img.naturalHeight])
    check('vista previa del RAW', dims[0] === 2000, dims.join('×'))
    await shot('visor-raw')
    await win.keyboard.press('Escape')
  }

  // --- Búsqueda global ---
  await win.keyboard.press('Control+k')
  await win.fill('.search-big', 'ceremonia'); await win.waitForTimeout(500)
  check('búsqueda por etiqueta', (await win.locator('.photo-result').count()) === 2)
  await win.fill('.search-big', 'valencia'); await win.waitForTimeout(500)
  check('búsqueda de sesión por etiqueta', (await win.locator('.session-card').count()) === 1)
  await win.fill('.search-big', 'ana'); await win.waitForTimeout(500)
  check('búsqueda de cliente', (await win.locator('.result:has-text("Ana García")').count()) === 1)
  await win.fill('.search-big', 'ceremonia'); await win.waitForTimeout(500)
  await shot('busqueda')
  await win.click('.photo-result >> nth=0')
  await win.waitForSelector('.thumb.focus')

  // --- Galería para el cliente ---
  const galleryFile = path.join(S, 'out', 'galeria.html')
  await stubSave(galleryFile)
  await win.click('button:has-text("Galería cliente")')
  await win.click('.modal button:has-text("Crear galería")')
  check('galería exportada', (await toast('Galería con')).includes('Galería con 3 fotos'), await win.textContent('.toast'))
  check('tamaño de la galería', fs.statSync(galleryFile).size > 10000, `${Math.round(fs.statSync(galleryFile).size / 1024)} KB`)

  // El cliente abre la galería en su navegador y marca 2 favoritas.
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {})
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.goto(require('node:url').pathToFileURL(galleryFile).href)
  await page.click('.item:nth-child(1) .heart'); await page.click('.item:nth-child(3) .heart')
  check('contador de favoritas', (await page.textContent('#counter')) === '2 favoritas')
  await page.screenshot({ path: path.join(S, 'shots', 'galeria-cliente.png') })
  await page.click('.item:nth-child(2) img'); await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(S, 'shots', 'galeria-visor.png') })
  await page.keyboard.press('Escape')
  await page.reload()
  check('favoritas persistentes', (await page.textContent('#counter')) === '2 favoritas')
  await page.click('#send')
  const code = await page.inputValue('#code')
  check('código de selección', /^FOTOGESTOR-SELECCION:\d+:\d+,\d+$/.test(code), code)
  await page.screenshot({ path: path.join(S, 'shots', 'galeria-enviar.png') })
  check('sin errores en la galería', pageErrors.length === 0, pageErrors.join(' | '))
  await browser.close()

  // El fotógrafo importa el código.
  await win.click('button:has-text("Importar selección")')
  await win.fill('.modal textarea', `Hola! aquí va:\n${code}\nGracias`)
  await win.click('.modal button:has-text("Importar")')
  check('selección importada', (await toast('Selección del cliente')).includes('2 fotos'), await win.textContent('.toast'))
  await win.waitForTimeout(300)
  check('filtro favoritas del cliente', (await win.locator('.thumb').count()) === 2)
  await shot('sesion-favoritas')

  // --- Presupuesto → factura → PDF ---
  await win.click('button:has-text("Presupuesto")')
  await win.waitForSelector('.modal.wide')
  const desc = await win.inputValue('.items tbody tr:first-child td:first-child input')
  check('presupuesto prellenado', desc.includes('Boda Ana y Luis'), desc)
  await win.click('button:has-text("+ Añadir partida")')
  await win.fill('.items tbody tr:nth-child(2) td:nth-child(1) input', 'Álbum 30x30 (40 páginas)')
  await win.fill('.items tbody tr:nth-child(2) td:nth-child(3) input', '350')
  const totalText = await win.textContent('.totals-box .grand')
  // (1800 + 350) * (1 + 0.21 - 0.15) = 2279
  check('cálculo de totales', totalText.includes('2279,00'), totalText)
  await win.click('.modal button.primary:has-text("Guardar")')
  await win.waitForSelector('.modal h2:has-text("P-2026-001")')
  await shot('presupuesto')
  await win.click('.modal button:has-text("Convertir en factura")')
  await win.waitForSelector('.modal h2:has-text("Factura Borrador")')
  await win.selectOption('.modal label:has-text("Estado") select', 'enviada')
  await win.click('.modal button.primary:has-text("Guardar")')
  await win.waitForSelector('.modal h2:has-text("F-2026-001")')
  check('factura emitida bloqueada', await win.isDisabled('.items tbody tr:first-child td:first-child input'))
  const pdfFile = path.join(S, 'out', 'factura.pdf')
  await stubSave(pdfFile)
  await win.click('.modal button:has-text("Guardar y PDF")')
  await win.waitForFunction(() => document.querySelector('.modal')?.textContent?.includes('PDF guardado'), null, { timeout: 20000 })
  const pdf = fs.readFileSync(pdfFile)
  check('PDF generado', pdf.subarray(0, 4).toString() === '%PDF', `${Math.round(pdf.length / 1024)} KB`)
  await shot('factura')
  await win.keyboard.press('Escape')
  await win.waitForSelector('td:has-text("F-2026-001")')
  check('presupuesto aceptado', (await win.locator('tr:has-text("P-2026-001") .badge').textContent()) === 'Aceptada')
  await shot('facturacion')

  // Una factura emitida no se puede eliminar (se comprueba por IPC directamente).
  const delErr = await win.evaluate(async () => {
    const [f] = await window.api.invoices.list({ kind: 'factura' })
    try { await window.api.invoices.remove(f.id); return 'eliminada' } catch (e) { return String(e.message) }
  })
  check('factura emitida no eliminable', delErr.includes('no se puede eliminar'), delErr.slice(0, 90))

  // --- Fototeca: todas las fotos, filtro por sesión, selección y copia ---
  // Segunda sesión con 2 fotos cuyos nombres coinciden con los de la primera.
  const imgs2 = path.join(S, 'imgs2'); fs.mkdirSync(imgs2)
  for (const f of ['DSCF1000.jpg', 'DSCF1001.jpg']) fs.copyFileSync(path.join(S, 'imgs', f), path.join(imgs2, f))
  await win.click('nav >> text=Sesiones'); await win.click('text=+ Nueva sesión')
  await win.fill('.modal label:has-text("Título") input', 'Retrato Marta')
  await win.click('.modal button:has-text("Guardar")')
  await win.waitForSelector('.dropzone')
  await stubOpen(imgs2)
  await win.click('.dropzone button')
  await win.waitForFunction(() => document.querySelectorAll('.thumb img').length === 2, null, { timeout: 60000 })

  await win.click('nav >> text=Fotos')
  const libCount = async () => { await win.waitForTimeout(500); return win.locator('.lib-thumb').count() }
  check('fototeca: todas las fotos', (await libCount()) === expectedPhotos + 2, `${await win.locator('.lib-thumb').count()}`)
  await win.click('.lib-session:has-text("Retrato Marta") input')
  check('fototeca: filtro por una sesión', (await libCount()) === 2)
  await win.click('.lib-session:has-text("Boda Ana y Luis") input')
  check('fototeca: filtro por dos sesiones', (await libCount()) === expectedPhotos + 2)
  await win.click('.lib-session:has-text("Retrato Marta") input')
  check('fototeca: solo la primera sesión', (await libCount()) === expectedPhotos)
  await win.click('button:has-text("Ver todas")')
  await win.selectOption('select[aria-label="Marca"]', 'pick')
  check('fototeca: filtro elegidas', (await libCount()) === 3)
  await win.click('button:has-text("Quitar filtros")')
  await win.fill('.lib-main .search', 'ceremonia')
  check('fototeca: búsqueda por etiqueta', (await libCount()) === 2)
  await win.click('button:has-text("Quitar filtros")')
  await win.waitForTimeout(400)

  // Selección: clic, Ctrl+clic, Shift+clic y Ctrl+A.
  await win.click('.lib-thumb >> nth=0')
  await win.click('.lib-thumb >> nth=2', { modifiers: ['Control'] })
  check('fototeca: Ctrl+clic', (await win.locator('.lib-thumb.selected').count()) === 2)
  await win.click('.lib-thumb >> nth=5', { modifiers: ['Shift'] })
  check('fototeca: Shift+clic', (await win.locator('.lib-thumb.selected').count()) === 4)
  await win.keyboard.press('Control+a'); await win.waitForTimeout(300)
  check('fototeca: Ctrl+A', (await win.textContent('.lib-selbar strong')).startsWith(String(expectedPhotos + 2)))
  await shot('fototeca')

  // Copiar todas en una sola carpeta: los nombres repetidos no se sobrescriben.
  const flat = path.join(S, 'out', 'copia'); fs.mkdirSync(flat)
  await stubOpen(flat)
  await win.click('button:has-text("Copiar a carpeta")')
  check('fototeca: copia', (await toast('fotos copiadas')).includes(`${expectedPhotos + 2} fotos copiadas`), await win.textContent('.toast'))
  const flatFiles = fs.readdirSync(flat)
  check('fototeca: nombres repetidos conservados', flatFiles.length === expectedPhotos + 2 && flatFiles.includes('DSCF1000 (2).jpg'), flatFiles.join(', '))
  // Copiar en subcarpetas por sesión.
  const nested = path.join(S, 'out', 'por-sesion'); fs.mkdirSync(nested)
  await stubOpen(nested)
  await win.click('.lib-selbar label:has-text("Una carpeta por sesión") input')
  await win.click('button:has-text("Copiar a carpeta")')
  await win.waitForFunction(() => document.querySelector('.toast')?.textContent?.includes('por-sesion'))
  const dirs = fs.readdirSync(nested).sort()
  check('fototeca: carpetas por sesión', dirs.join('|') === 'Boda Ana y Luis|Retrato Marta'
    && fs.readdirSync(path.join(nested, 'Retrato Marta')).length === 2, dirs.join(', '))
  await win.keyboard.press('Escape')
  check('fototeca: Esc quita la selección', (await win.locator('.lib-thumb.selected').count()) === 0)

  // --- Sesión de tipo «Carrera» con campeonato ---
  await win.click('nav >> text=Sesiones'); await win.click('text=+ Nueva sesión')
  check('carrera: sin campo de campeonato al principio', (await win.locator('.race-field').count()) === 0)
  await win.selectOption('.modal label:has-text("Tipo") select', 'Carrera')
  await win.waitForSelector('.race-field')
  check('carrera: aparece el campo de campeonato', true)
  await win.fill('.modal label:has-text("Título") input', 'ESBK Cheste - Carrera 1')
  await win.fill('.race-field input', 'Campeonato de España de Velocidad')
  await win.fill('.modal input[type=date]', '2026-09-20')
  await win.fill('.modal label:has-text("Lugar") input', 'Circuit Ricardo Tormo')
  await win.click('.modal button:has-text("Guardar")')
  await win.waitForSelector('.session-page')
  const raceHeader = (await win.textContent('.session-title')).replace(/\s+/g, ' ')
  check('carrera: campeonato en la sesión', raceHeader.includes('Campeonato de España de Velocidad'), raceHeader)
  // Al cambiar de tipo, el campeonato desaparece y deja de guardarse.
  await win.click('.page-header button:has-text("Editar")')
  await win.selectOption('.modal label:has-text("Tipo") select', 'Retrato')
  check('carrera: el campo se oculta en otros tipos', (await win.locator('.race-field').count()) === 0)
  await win.selectOption('.modal label:has-text("Tipo") select', 'Carrera')
  check('carrera: el campeonato se conserva al volver', (await win.inputValue('.race-field input')) === 'Campeonato de España de Velocidad')
  await win.click('.modal button:has-text("Guardar")')
  await win.waitForSelector('.session-page')

  await win.click('nav >> text=Sesiones'); await win.waitForTimeout(400)
  check('carrera: campeonato en la tarjeta', (await win.locator('.session-card .championship').count()) === 1)
  await win.selectOption('select[aria-label="Campeonato"]', 'Campeonato de España de Velocidad')
  await win.waitForTimeout(400)
  check('carrera: filtro por campeonato', (await win.locator('.session-card').count()) === 1)
  await shot('sesiones-carrera')
  await win.selectOption('select[aria-label="Campeonato"]', '')
  await win.keyboard.press('Control+k')
  await win.fill('.search-big', 'velocidad'); await win.waitForTimeout(500)
  check('carrera: búsqueda por campeonato', (await win.locator('.session-card').count()) === 1)

  // --- Pegar datos: cliente creado desde un mensaje suelto ---
  await win.click('nav >> text=Clientes'); await win.click('text=+ Nuevo cliente')
  await win.click('.picker-footer button:has-text("Pegar datos")')
  await win.fill('.paste-dialog textarea', `Hola Jorge! Te paso los datos para la inscripción:
Nombre y apellidos: Nuria Blanco Ruiz
Dorsal: 23
Categoría: Supersport 300
Moto: Kawasaki Ninja 400
Equipo: Speed Racing Team
Fecha de nacimiento: 02/07/2004
Licencia: RFME-554433
Email: nuria.blanco@example.com
Teléfono: 622 334 455
Instagram: @nuriablanco23
DNI: 45678912P
Un saludo!`)
  await win.waitForSelector('.detected tr')
  check('pegar: datos reconocidos', (await win.locator('.detected tr').count()) === 11, String(await win.locator('.detected tr').count()))
  await shot('pegar-dialogo')
  await win.click('.paste-dialog button:has-text("Aplicar")')
  await win.waitForSelector('.kind-switch')
  check('pegar: detecta que es un piloto', (await win.locator('.kind-switch .segmented button.active').textContent()).includes('Piloto'))
  const pasted = {
    name: await win.inputValue('.modal label:has-text("Nombre y apellidos") input'),
    dorsal: await win.inputValue('.modal label:has-text("Dorsal") input'),
    moto: await win.inputValue('.modal label:has-text("Moto") input'),
    equipo: await win.inputValue('.modal label:has-text("Equipo") select'),
    nacimiento: await win.inputValue('.modal input[type=date]'),
    email: await win.inputValue('.modal input[type=email]'),
    tel: await win.inputValue('.modal label:has-text("Teléfono") input'),
    ig: await win.inputValue('.modal label:has-text("Instagram") input'),
    nif: await win.inputValue('.modal label:has-text("NIF") input')
  }
  check('pegar: formulario relleno', pasted.name === 'Nuria Blanco Ruiz' && pasted.dorsal === '23'
    && pasted.moto === 'Kawasaki Ninja 400' && pasted.nacimiento === '2004-07-02'
    && pasted.email === 'nuria.blanco@example.com' && pasted.tel === '622 334 455'
    && pasted.ig === 'nuriablanco23' && pasted.nif === '45678912P', JSON.stringify(pasted))
  check('pegar: equipo enlazado con el cliente existente', pasted.equipo !== '', `team_id=${pasted.equipo}`)
  await shot('pegar-datos')
  await win.click('.modal button:has-text("Guardar")')
  await win.waitForSelector('td:has-text("Nuria Blanco Ruiz")')
  const nuriaRow = (await win.textContent('tr:has(strong:text-is("Nuria Blanco Ruiz"))')).replace(/\s+/g, ' ')
  check('pegar: cliente guardado con sus datos', nuriaRow.includes('Speed Racing Team') && nuriaRow.includes('Kawasaki'), nuriaRow)

  // --- Pegar datos: sesión descrita en un correo ---
  await win.click('nav >> text=Sesiones'); await win.click('text=+ Nueva sesión')
  await win.click('.paste-row button:has-text("Pegar datos")')
  await win.fill('.paste-dialog textarea', `Sesión: ESBK Jerez - Carrera 2
Cliente: Speed Racing Team
Campeonato: Campeonato de España de Velocidad
Fecha: 18 de octubre de 2026
Lugar: Circuito de Jerez
Precio: 1.250 €
Notas: Entregar las fotos el lunes`)
  await win.waitForSelector('.detected tr')
  await win.click('.paste-dialog button:has-text("Aplicar")')
  await win.waitForTimeout(300)
  const ses = {
    title: await win.inputValue('.modal label:has-text("Título") input'),
    tipo: await win.inputValue('.modal label:has-text("Tipo") select'),
    camp: await win.inputValue('.race-field input'),
    fecha: await win.inputValue('.modal input[type=date]'),
    lugar: await win.inputValue('.modal label:has-text("Lugar") input'),
    precio: await win.inputValue('.modal input[type=number]'),
    cliente: await win.inputValue('.modal label:has-text("Cliente") select')
  }
  check('pegar: sesión rellena', ses.title === 'ESBK Jerez - Carrera 2' && ses.tipo === 'Carrera'
    && ses.camp === 'Campeonato de España de Velocidad' && ses.fecha === '2026-10-18'
    && ses.lugar === 'Circuito de Jerez' && ses.precio === '1250' && ses.cliente !== '', JSON.stringify(ses))
  await win.click('.modal button:has-text("Guardar")')
  await win.waitForSelector('.session-page')
  check('pegar: sesión guardada', (await win.textContent('.session-title')).includes('ESBK Jerez'))

  // --- Ficha de cliente ---
  await win.click('nav >> text=Clientes')
  await win.click('tr:has(strong:text-is("Speed Racing Team"))')
  await win.waitForSelector('.client-page')
  const teamPage = (await win.textContent('.client-page')).replace(/\s+/g, ' ')
  check('ficha de equipo: datos', teamPage.includes('Laura Gil') && teamPage.includes('Team manager')
    && teamPage.includes('Yamaha') && teamPage.includes('B12345678'), teamPage.slice(0, 140))
  check('ficha de equipo: lista de pilotos', (await win.locator('.pilot-list .pilot-link').count()) === 2,
    String(await win.locator('.pilot-list .pilot-link').count()))
  check('ficha de equipo: sesión del cliente', (await win.locator('.client-activity .session-card').count()) >= 1)
  check('ficha de equipo: facturación', teamPage.includes('ESBK Jerez') || (await win.locator('.client-activity .table tbody tr').count()) >= 0)
  await shot('ficha-equipo')

  // Desde el equipo se entra a la ficha de uno de sus pilotos.
  await win.click('.pilot-link:has-text("Marc Pérez")')
  await win.waitForSelector('.client-page')
  const pilotPage = (await win.textContent('.client-page')).replace(/\s+/g, ' ')
  check('ficha de piloto: datos', pilotPage.includes('Supersport 300') && pilotPage.includes('Yamaha R3')
    && pilotPage.includes('@marc46'), pilotPage.slice(0, 140))
  check('ficha de piloto: aviso de menor', (await win.locator('.minor-box.standalone').count()) === 1
    && pilotPage.includes('Jordi Pérez'), pilotPage.slice(0, 200))
  await shot('ficha-piloto')
  // Y desde el piloto se vuelve al equipo.
  await win.click('.data-list button.link:has-text("Speed Racing Team")')
  await win.waitForSelector('.pilot-list')
  check('ficha: del piloto al equipo', (await win.textContent('.client-page h1')).includes('Speed Racing Team'))

  // Particular: ficha con sus sesiones y facturas.
  await win.click('nav >> text=Clientes'); await win.click('tr:has(strong:text-is("Ana García"))')
  await win.waitForSelector('.client-page')
  const anaPage = (await win.textContent('.client-page')).replace(/\s+/g, ' ')
  check('ficha de particular: sesiones y facturas', anaPage.includes('Boda Ana y Luis') && anaPage.includes('F-2026-001'), anaPage.slice(0, 160))
  check('ficha de particular: fotos recientes', (await win.locator('.client-activity .photo-result').count()) > 0)
  check('ficha: total facturado', anaPage.includes('2279,00'), anaPage.slice(0, 120))
  await shot('ficha-particular')
  // La factura se abre desde la ficha.
  await win.click('.client-activity tr:has-text("F-2026-001")')
  await win.waitForSelector('.modal.wide')
  check('ficha: abre la factura', (await win.textContent('.modal h2')).includes('F-2026-001'))
  await win.keyboard.press('Escape')

  // --- Tarifas: lista de precios y su efecto al crear sesiones ---
  await win.click('nav >> text=Tarifas')
  check('tarifas: ofrece cargar la lista inicial', (await win.locator('.tariff-starter').count()) === 1)
  await win.click('.tariff-starter button')
  await win.waitForFunction(() => document.querySelectorAll('.tariffs tbody tr').length > 15, null, { timeout: 20000 })
  const loaded = await win.locator('.tariffs tbody tr').count()
  check('tarifas: catálogo cargado', loaded === 22, String(loaded))
  check('tarifas: incluye porcentajes', (await win.locator('.tariffs tr:has(select option[value="porcentaje"]:checked)').count()) >= 5,
    String(await win.locator('.tariffs tr:has(select option[value="porcentaje"]:checked)').count()))
  await shot('tarifas-catalogo')
  // Se borra la tarifa de Carrera del catálogo para probar el alta a mano.
  await win.click('.tariffs tr:has(input[value="Cobertura de carrera · piloto, fin de semana"]) button:has-text("Eliminar")')
  await win.waitForTimeout(400)
  await win.click('button:has-text("+ Añadir tipo de sesión")')
  await win.selectOption('.tariffs tr:last-child select', 'Carrera')
  await win.fill('.tariffs tr:last-child td:nth-child(2) input', 'Cobertura de carrera')
  await win.fill('.tariffs tr:last-child .tariff-price input', '450')
  await win.click('.tariffs tr:last-child button:has-text("Añadir")')
  await win.waitForSelector('.tariffs input[value="Cobertura de carrera"]')
  await win.click('.tariff-section:has-text("Extras") button:has-text("+ Añadir extra")')
  await win.fill('.tariff-section:has-text("Extras") tr:last-child td:nth-child(1) input', 'Desplazamiento')
  await win.fill('.tariff-section:has-text("Extras") tr:last-child .tariff-price input', '80')
  await win.click('.tariff-section:has-text("Extras") tr:last-child button:has-text("Añadir")')
  await win.waitForSelector('.tariffs input[value="Desplazamiento"]')
  check('tarifas: guardadas', (await win.locator('.tariffs input[value="Cobertura de carrera"]').count()) === 1
    && (await win.locator('.tariffs input[value="Desplazamiento"]').count()) === 1)
  // Se editan en la propia tabla: al salir del campo se guarda.
  await win.fill('.tariffs tr:has(input[value="Cobertura de carrera"]) .tariff-price input', '500')
  check('tarifas: avisa de cambios sin guardar', (await win.locator('.tariffs tr.dirty').count()) === 1)
  await win.click('.tariffs tr.dirty button:has-text("Guardar")')
  await win.waitForTimeout(500)
  await win.click('nav >> text=Panel'); await win.click('nav >> text=Tarifas'); await win.waitForTimeout(400)
  check('tarifas: edición en la tabla', (await win.inputValue('.tariffs tr:has(input[value="Cobertura de carrera"]) .tariff-price input')) === '500')
  await shot('tarifas')

  // Al crear una sesión de ese tipo, su tarifa se aplica sola.
  await win.click('nav >> text=Sesiones'); await win.click('text=+ Nueva sesión')
  await win.fill('.modal label:has-text("Título") input', 'ESBK Montmeló - Carrera 1')
  await win.selectOption('.modal label:has-text("Tipo") select', 'Carrera')
  await win.waitForSelector('.tariff-block .items')
  check('tarifa aplicada al elegir el tipo', (await win.inputValue('.modal input[type=number]')) === '500',
    await win.inputValue('.modal input[type=number]'))
  await win.selectOption('select[aria-label="Añadir extra"]', { label: 'Desplazamiento — 80,00 €' })
  await win.waitForTimeout(300)
  check('extra añadido y precio actualizado', (await win.inputValue('.modal input[type=number]')) === '580',
    await win.inputValue('.modal input[type=number]'))
  check('total de la tarifa', (await win.textContent('.items-total')).includes('580,00'))
  // Licencia comercial: 25 % sobre los 580 € que hay en ese momento = 145 €.
  await win.selectOption('select[aria-label="Añadir extra"]', { label: 'Licencia comercial — 25 % sobre la cobertura' })
  await win.waitForTimeout(300)
  check('extra en porcentaje calculado', (await win.textContent('.items-total')).includes('725,00'),
    await win.textContent('.items-total'))
  const pctRow = await win.locator('.tariff-block .items tbody tr:nth-child(3) td:first-child input').inputValue()
  check('extra en porcentaje: concepto', pctRow === 'Licencia comercial (25 %)', pctRow)
  // Se quita para que el resto de la prueba siga con los importes de antes.
  await win.click('.tariff-block .items tbody tr:nth-child(3) button')
  await win.waitForTimeout(300)
  check('extra quitado', (await win.textContent('.items-total')).includes('580,00'))
  await shot('sesion-tarifa')
  await win.click('.modal button:has-text("Guardar")')
  await win.waitForSelector('.session-page')
  check('sesión guardada con su precio', (await win.textContent('.session-title')).includes('580,00'))

  // Las partidas llegan al presupuesto.
  await win.click('.page-header button:has-text("Presupuesto")')
  await win.waitForSelector('.modal.wide')
  const lines = await win.locator('.items tbody tr').count()
  const conceptos = await win.locator('.items tbody tr td:first-child input').evaluateAll((els) => els.map((e) => e.value))
  check('presupuesto con las partidas de la sesión', lines === 2 && conceptos.includes('Cobertura de carrera') && conceptos.includes('Desplazamiento'),
    conceptos.join(' | '))
  check('presupuesto: total con IVA e IRPF', (await win.textContent('.totals-box .grand')).includes('614,80'),
    await win.textContent('.totals-box .grand'))
  await shot('presupuesto-tarifa')
  await win.keyboard.press('Escape')

  // --- Panel ---
  await win.click('nav >> text=Panel'); await win.waitForTimeout(500)
  const panel = await win.textContent('.page')
  check('panel con facturación', panel.includes('2279,00') && panel.includes('Pendiente de cobro'))
  await shot('panel')

  check('sin errores en la app', errors.length === 0, errors.join(' | '))
  await app.close()

  // --- Ventana de novedades tras actualizar ---
  const version = require('../package.json').version
  const dbFile = path.join(S, 'data', 'fotogestor.db')
  const readSeen = () => {
    const db = new DatabaseSync(dbFile)
    const row = db.prepare("SELECT value FROM settings WHERE key = 'last_seen_version'").get()
    db.close()
    return row?.value ?? null
  }
  check('novedades: no se muestran en la primera ejecución', readSeen() === version, String(readSeen()))

  const setSeen = (v) => {
    const db = new DatabaseSync(dbFile)
    db.prepare("INSERT INTO settings (key, value) VALUES ('last_seen_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(v)
    db.close()
  }
  const relaunch = async () => {
    const a2 = await _electron.launch({ executablePath: require('electron'), args: [ROOT, '--no-sandbox'],
      env: { ...process.env, FOTOGESTOR_DATA_DIR: path.join(S, 'data') } })
    const w2 = await a2.firstWindow()
    await w2.setViewportSize({ width: 1400, height: 900 })
    await w2.waitForSelector('.sidebar')
    await w2.waitForTimeout(1500)
    return { a2, w2 }
  }

  setSeen('0.3.0')
  {
    const { a2, w2 } = await relaunch()
    const shown = await w2.locator('.modal:has-text("FotoGestor")').count()
    check('novedades: se abren tras actualizar', shown === 1)
    if (shown) {
      const text = (await w2.textContent('.whats-new')).replace(/\s+/g, ' ')
      check('novedades: listan los cambios de la versión', text.includes('Carrera') && text.includes(version), text.slice(0, 120))
      check('novedades: incluyen las versiones intermedias', text.includes('v0.4.0') && text.includes('v0.5.0'))
      await w2.screenshot({ path: path.join(S, 'shots', 'novedades.png') })
      await w2.click('.whats-new button:has-text("Entendido")')
      await w2.waitForTimeout(300)
      check('novedades: se cierran', (await w2.locator('.whats-new').count()) === 0)
    }
    await a2.close()
  }
  check('novedades: queda guardada la versión vista', readSeen() === version, String(readSeen()))
  {
    const { a2, w2 } = await relaunch()
    check('novedades: no se repiten al reabrir', (await w2.locator('.whats-new').count()) === 0)
    await a2.close()
  }

  // Generar una imagen del PDF para revisarla (si pdftoppm está disponible).
  try { execFileSync('pdftoppm', ['-png', '-r', '60', '-singlefile', pdfFile, path.join(S, 'shots', 'factura-pdf')]) } catch {}

  console.log(failures ? `\n${failures} comprobaciones fallidas` : '\nTodas las comprobaciones han pasado')
  if (!process.env.KEEP_E2E) fs.rmSync(S, { recursive: true, force: true })
  else console.log('resultados en', S)
  process.exit(failures ? 1 : 0)
  }
})()
