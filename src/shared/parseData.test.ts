import assert from 'node:assert/strict'
import { test } from 'node:test'
import { guessClientKind, parseData, parseDate, parsePrice } from './parseData.ts'

const map = (text: string, target: 'client' | 'session') =>
  Object.fromEntries(parseData(text, target).map((d) => [d.key, d.value]))

test('ficha de piloto con etiquetas', () => {
  const r = map(`Nombre y apellidos: Marc Pérez Soler
Dorsal: 46
Categoría: Supersport 300
Moto: Yamaha R3
Equipo: Speed Racing Team
Fecha de nacimiento: 14/03/2010
Licencia: RFME-998877
Email: marc@example.com
Teléfono: 600 111 222
Instagram: @marc46
DNI: 12345678Z`, 'client')
  assert.equal(r.name, 'Marc Pérez Soler')
  assert.equal(r.racing_number, '46')
  assert.equal(r.category, 'Supersport 300')
  assert.equal(r.vehicle, 'Yamaha R3')
  assert.equal(r.team, 'Speed Racing Team')
  assert.equal(r.birth_date, '2010-03-14')
  assert.equal(r.license_number, 'RFME-998877')
  assert.equal(r.email, 'marc@example.com')
  assert.equal(r.phone, '600 111 222')
  assert.equal(r.instagram, 'marc46')
  assert.equal(r.tax_id, '12345678Z')
})

test('mensaje suelto de WhatsApp', () => {
  const text = 'Hola! Soy Laura Giménez, corro en la Copa de España con el dorsal 7, mi correo es laura.g@correo.es y mi móvil 611-22-33-44'
  const r = map(text, 'client')
  assert.equal(r.name, 'Laura Giménez')
  assert.equal(r.racing_number, '7')
  assert.equal(r.email, 'laura.g@correo.es')
  assert.equal(r.phone.replace(/\D/g, ''), '611223344')
  assert.equal(guessClientKind(text, parseData(text, 'client')), 'piloto')
})

test('el correo no se confunde con el usuario de Instagram', () => {
  const r = map('Contacto: ana@estudio.com y en redes @ana.foto', 'client')
  assert.equal(r.email, 'ana@estudio.com')
  assert.equal(r.instagram, 'ana.foto')
})

test('equipo con persona de contacto', () => {
  const text = `Equipo: Speed Racing Team
Persona de contacto: Laura Gil
Cargo: Team manager
Marca: Yamaha
Web: https://speedracing.es
CIF: B12345678`
  const r = map(text, 'client')
  assert.equal(r.name, 'Speed Racing Team')
  assert.equal(r.contact_name, 'Laura Gil')
  assert.equal(r.contact_role, 'Team manager')
  assert.equal(r.brand, 'Yamaha')
  assert.equal(r.website, 'https://speedracing.es')
  assert.equal(r.tax_id, 'B12345678')
  assert.equal(guessClientKind(text, parseData(text, 'client')), 'equipo')
})

test('un piloto con equipo sigue siendo piloto', () => {
  const text = 'Piloto: Marc Pérez\nDorsal: 46\nEquipo: Speed Racing Team'
  assert.equal(guessClientKind(text, parseData(text, 'client')), 'piloto')
})

test('sin pistas de competición es un particular', () => {
  const text = 'Nombre: Ana García\nEmail: ana@example.com\nTeléfono: 600 000 111'
  assert.equal(guessClientKind(text, parseData(text, 'client')), 'particular')
})

test('etiqueta en una línea y valor en la siguiente', () => {
  const r = map('Nombre\nAna García\nTeléfono\n600 123 456', 'client')
  assert.equal(r.name, 'Ana García')
  assert.equal(r.phone, '600 123 456')
})

test('datos de sesión', () => {
  const r = map(`Sesión: ESBK Cheste - Carrera 1
Cliente: Speed Racing Team
Campeonato: Campeonato de España de Velocidad
Fecha: 20 de septiembre de 2026
Lugar: Circuit Ricardo Tormo
Precio: 1.800,50 €
Notas: Cubrir también el paddock`, 'session')
  assert.equal(r.title, 'ESBK Cheste - Carrera 1')
  assert.equal(r.clientName, 'Speed Racing Team')
  assert.equal(r.championship, 'Campeonato de España de Velocidad')
  assert.equal(r.type, 'Carrera')
  assert.equal(r.date, '2026-09-20')
  assert.equal(r.location, 'Circuit Ricardo Tormo')
  assert.equal(r.price, '1800.5')
  assert.equal(r.notes, 'Cubrir también el paddock')
})

test('sesión descrita en una frase', () => {
  const r = map('Track day en el Circuito de Jerez el 12/04/2026, presupuesto 450€', 'session')
  assert.equal(r.type, 'Track day')
  assert.equal(r.date, '2026-04-12')
  assert.equal(r.price, '450')
  assert.match(r.location, /Jerez/)
})

test('fechas y precios en varios formatos', () => {
  assert.equal(parseDate('2026-01-05'), '2026-01-05')
  assert.equal(parseDate('5/1/26'), '2026-01-05')
  assert.equal(parseDate('5 de enero de 2026'), '2026-01-05')
  assert.equal(parseDate('5 ene 2026'), '2026-01-05')
  assert.equal(parseDate('32/13/2026'), null)
  assert.equal(parseDate('sin fecha'), null)
  assert.equal(parsePrice('1.800 €'), 1800)
  assert.equal(parsePrice('450,25 eur'), 450.25)
  assert.equal(parsePrice('€ 90'), 90)
  assert.equal(parsePrice('nada'), null)
})

test('el texto vacío o sin datos no inventa nada', () => {
  assert.deepEqual(parseData('', 'client'), [])
  assert.deepEqual(parseData('...', 'session'), [])
})

test('mensaje desordenado de un piloto menor', () => {
  const text = `Buenas Jorge!! perdona el retraso jeje
Te paso lo del chaval para las fotos del finde:

Se llama Iker Montalbán Ferrer, va con el 71 este año
Categoría   :   PreMoto4 (Cuna de Campeones)
Moto: Honda NSF100
Va con el Speed racing team aunque antes estaba en otro
nacio el 3 de marzo de 2012 asi que todavia es menor...
su madre es Pilar Ferrer, tlf 655-44-33-22
Licencia nº RFME-2026-00841
el correo que usamos es iker.montalban@gmail.com (lo lleva ella)
IG: @iker71_racing
DNI del chaval 49887766K
Gracias!!`
  const r = map(text, 'client')
  assert.equal(r.name, 'Iker Montalbán Ferrer')
  assert.equal(r.racing_number, '71')
  assert.equal(r.category, 'PreMoto4 (Cuna de Campeones)')
  assert.equal(r.vehicle, 'Honda NSF100')
  assert.equal(r.team, 'Speed racing team')
  assert.equal(r.birth_date, '2012-03-03')
  assert.equal(r.license_number, 'RFME-2026-00841')
  assert.equal(r.email, 'iker.montalban@gmail.com')
  assert.equal(r.instagram, 'iker71_racing')
  assert.equal(r.tax_id, '49887766K')
  assert.equal(r.guardian_name, 'Pilar Ferrer')
  assert.equal(r.guardian_phone, '655-44-33-22')
  // El número de licencia no es un teléfono.
  assert.equal(r.phone, undefined)
  assert.equal(guessClientKind(text, parseData(text, 'client')), 'piloto')
})

test('correo de encargo con dos precios', () => {
  const r = map(`Asunto: presupuesto fotos Cheste
Hola! quería contratarte para la última prueba del ESBK en Cheste.
Serían las dos carreras del domingo 18/10/26 en el Circuit Ricardo Tormo.
Nos han pasado otros 1.500€ pero contigo cerraríamos en 1.250 €.
El contratante sería Speed Racing Team (CIF B12345678).
Necesitamos las fotos el lunes por la mañana para prensa.`, 'session')
  assert.equal(r.title, 'presupuesto fotos Cheste')
  assert.equal(r.clientName, 'Speed Racing Team')
  assert.equal(r.type, 'Carrera')
  assert.equal(r.date, '2026-10-18')
  assert.equal(r.location, 'Circuit Ricardo Tormo')
  // Se queda con el importe acordado, no con el de la competencia.
  assert.equal(r.price, '1250')
})
