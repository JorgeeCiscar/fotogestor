// Prueba de extremo a extremo de FotoGestor con Playwright.
// Uso: npm run test:e2e   (en Linux sin pantalla: xvfb-run -a npm run test:e2e)
// Variables: E2E_RAW=/ruta/a/foto.NEF añade un RAW real a la importación;
//            KEEP_E2E=1 conserva el directorio temporal con capturas, galería y PDF.
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const { _electron, chromium } = require('playwright')

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
  const toast = async () => (await win.waitForSelector('.toast')).textContent()

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
  check('importación', (await toast()).includes(`${expectedPhotos} importadas`), await win.textContent('.toast'))
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
  check('galería exportada', (await toast()).includes('Galería con 3 fotos'), await win.textContent('.toast'))
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
  check('selección importada', (await toast()).includes('2 fotos'), await win.textContent('.toast'))
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
  check('fototeca: copia', (await toast()).includes(`${expectedPhotos + 2} fotos copiadas`), await win.textContent('.toast'))
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

  // --- Panel ---
  await win.click('nav >> text=Panel'); await win.waitForTimeout(500)
  const panel = await win.textContent('.page')
  check('panel con facturación', panel.includes('2279,00') && panel.includes('Pendiente de cobro'))
  await shot('panel')

  check('sin errores en la app', errors.length === 0, errors.join(' | '))
  await app.close()

  // Generar una imagen del PDF para revisarla (si pdftoppm está disponible).
  try { execFileSync('pdftoppm', ['-png', '-r', '60', '-singlefile', pdfFile, path.join(S, 'shots', 'factura-pdf')]) } catch {}

  console.log(failures ? `\n${failures} comprobaciones fallidas` : '\nTodas las comprobaciones han pasado')
  if (!process.env.KEEP_E2E) fs.rmSync(S, { recursive: true, force: true })
  else console.log('resultados en', S)
  process.exit(failures ? 1 : 0)
  }
})()
