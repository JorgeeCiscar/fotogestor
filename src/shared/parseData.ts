/**
 * Reconocimiento de datos pegados en texto libre (un correo, un WhatsApp,
 * una ficha de inscripción…) para rellenar los formularios de cliente y sesión.
 *
 * Funciona en dos pasadas:
 *   1. Pares «etiqueta: valor» (en la misma línea o en la siguiente).
 *   2. Patrones sueltos (email, teléfono, NIF, fecha, dorsal…) para lo que falte.
 * Nunca guarda nada: devuelve lo reconocido para que el usuario lo revise.
 */
import type { ClientKind } from './types'

/** Palabras que delatan el tipo de cliente en un texto pegado. */
const CLIENT_KIND_FROM_WORD: Record<string, ClientKind> = {
  piloto: 'piloto', pilota: 'piloto', corredor: 'piloto', corredora: 'piloto', rider: 'piloto', driver: 'piloto',
  equipo: 'equipo', escuderia: 'equipo', team: 'equipo', estructura: 'equipo'
}

export interface Detected {
  /** Clave del campo del formulario. */
  key: string
  /** Nombre visible del campo. */
  label: string
  value: string
}

export type ParseTarget = 'client' | 'session'

/** Quita acentos y pasa a minúsculas, para comparar etiquetas escritas de cualquier forma. */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Campos reconocibles y las palabras con las que suele venir etiquetado cada uno. */
const FIELDS: { key: string; label: string; aliases: string[]; targets: ParseTarget[] }[] = [
  { key: 'name', label: 'Nombre', targets: ['client'], aliases: ['nombre', 'nombre y apellidos', 'nombre completo', 'apellidos y nombre', 'piloto', 'cliente', 'equipo', 'escuderia', 'team', 'nombre del equipo', 'razon social'] },
  { key: 'email', label: 'Email', targets: ['client'], aliases: ['email', 'e-mail', 'correo', 'correo electronico', 'mail'] },
  { key: 'phone', label: 'Teléfono', targets: ['client'], aliases: ['telefono', 'tel', 'tlf', 'movil', 'celular', 'whatsapp', 'wasap', 'contacto telefonico'] },
  { key: 'instagram', label: 'Instagram', targets: ['client'], aliases: ['instagram', 'ig', 'insta', 'redes', 'red social'] },
  { key: 'tax_id', label: 'NIF / CIF', targets: ['client'], aliases: ['nif', 'dni', 'cif', 'nie', 'documento', 'identificacion'] },
  { key: 'address', label: 'Dirección', targets: ['client'], aliases: ['direccion', 'domicilio', 'calle', 'direccion fiscal', 'direccion postal'] },
  { key: 'racing_number', label: 'Dorsal', targets: ['client'], aliases: ['dorsal', 'numero', 'num', 'number', 'numero de dorsal'] },
  { key: 'category', label: 'Categoría', targets: ['client'], aliases: ['categoria', 'clase', 'campeonato', 'competicion', 'championship', 'copa', 'serie'] },
  { key: 'vehicle', label: 'Moto / coche', targets: ['client'], aliases: ['moto', 'coche', 'vehiculo', 'montura', 'kart', 'modelo', 'maquina'] },
  { key: 'team', label: 'Equipo', targets: ['client'], aliases: ['equipo', 'team', 'escuderia', 'estructura'] },
  { key: 'nationality', label: 'Nacionalidad', targets: ['client'], aliases: ['nacionalidad', 'pais', 'nacion'] },
  { key: 'birth_date', label: 'Fecha de nacimiento', targets: ['client'], aliases: ['fecha de nacimiento', 'nacimiento', 'f. nacimiento', 'fecha nac', 'nacido', 'nacida', 'cumpleanos'] },
  { key: 'license_number', label: 'Nº de licencia', targets: ['client'], aliases: ['licencia', 'numero de licencia', 'n licencia', 'federativa'] },
  { key: 'guardian_name', label: 'Tutor', targets: ['client'], aliases: ['tutor', 'tutor legal', 'padre', 'madre', 'responsable', 'representante legal'] },
  { key: 'guardian_phone', label: 'Teléfono del tutor', targets: ['client'], aliases: ['telefono del tutor', 'tel tutor', 'movil del tutor', 'telefono tutor', 'contacto del tutor'] },
  { key: 'contact_name', label: 'Persona de contacto', targets: ['client'], aliases: ['persona de contacto', 'contacto', 'responsable de prensa', 'manager'] },
  { key: 'contact_role', label: 'Cargo', targets: ['client'], aliases: ['cargo', 'puesto', 'rol', 'funcion'] },
  { key: 'brand', label: 'Marca', targets: ['client'], aliases: ['marca', 'fabricante', 'constructor', 'patrocinador principal'] },
  { key: 'website', label: 'Web', targets: ['client'], aliases: ['web', 'pagina web', 'sitio web', 'url', 'www'] },

  { key: 'title', label: 'Título', targets: ['session'], aliases: ['titulo', 'sesion', 'evento', 'nombre de la sesion', 'asunto', 'prueba'] },
  { key: 'clientName', label: 'Cliente', targets: ['session'], aliases: ['cliente', 'para', 'piloto', 'equipo', 'contratante'] },
  { key: 'type', label: 'Tipo', targets: ['session'], aliases: ['tipo', 'tipo de sesion', 'servicio'] },
  { key: 'championship', label: 'Campeonato', targets: ['session'], aliases: ['campeonato', 'championship', 'competicion', 'serie', 'copa'] },
  { key: 'date', label: 'Fecha', targets: ['session'], aliases: ['fecha', 'dia', 'fecha de la sesion', 'cuando'] },
  { key: 'location', label: 'Lugar', targets: ['session'], aliases: ['lugar', 'circuito', 'ubicacion', 'localizacion', 'sitio', 'direccion', 'donde'] },
  { key: 'price', label: 'Precio', targets: ['session'], aliases: ['precio', 'importe', 'presupuesto', 'coste', 'tarifa', 'honorarios'] },
  { key: 'tags', label: 'Etiquetas', targets: ['session'], aliases: ['etiquetas', 'tags', 'palabras clave'] },

  { key: 'notes', label: 'Notas', targets: ['client', 'session'], aliases: ['notas', 'observaciones', 'comentarios', 'info', 'informacion adicional', 'otros'] }
]

const SESSION_TYPE_WORDS: Record<string, string> = {
  carrera: 'Carrera', carreras: 'Carrera', gp: 'Carrera', 'gran premio': 'Carrera',
  entrenamientos: 'Entrenamientos', entreno: 'Entrenamientos', entrenos: 'Entrenamientos', libres: 'Entrenamientos',
  'track day': 'Track day', trackday: 'Track day', tanda: 'Track day', tandas: 'Track day',
  boda: 'Boda', retrato: 'Retrato', retratos: 'Retrato', familia: 'Familia', familiar: 'Familia',
  newborn: 'Newborn', comunion: 'Comunión', evento: 'Evento', producto: 'Producto', corporativo: 'Corporativo'
}

const RE = {
  email: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/,
  url: /\bhttps?:\/\/[^\s,;]+|\bwww\.[^\s,;]+/i,
  instagram: /(?:instagram\.com\/|(?<![\w.])@)([A-Za-z0-9._]{2,30})/,
  // DNI/NIE/CIF españoles.
  taxId: /\b(?:[XYZ]\d{7}[-\s]?[A-Za-z]|\d{8}[-\s]?[A-Za-z]|[ABCDEFGHJNPQRSUVW][-\s]?\d{7}[-\s]?[0-9A-Ja-j])\b/,
  phone: /(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,13}\d/,
  isoDate: /\b(\d{4})-(\d{2})-(\d{2})\b/,
  numDate: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/,
  textDate: /\b(\d{1,2})\s*(?:de\s+)?([a-záéíóúñ]{3,10})\.?\s*(?:de\s+)?(\d{4})\b/i,
  price: /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:€|eur\b|euros\b)|(?:€)\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?/i,
  dorsal: /(?:^|[\s(,;])(?:dorsal|n[º°]\.?|nro\.?|num(?:ero)?\.?|#)\s*:?\s*(\d{1,3})\b/i,
  circuit: /\bcircuit(?:o)?[^\S\n]+(?:de[^\S\n]+)?[\wáéíóúñ'’-]+(?:[^\S\n]+[\wáéíóúñ'’-]+){0,2}/i,
  iAm: /\b(?:[Ss]oy|[Ss]e llama|[Mm]e llamo|[Mm]i nombre es|[Ee]l piloto es|[Ss]e trata de)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ'’-]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ'’-]+){1,3})/,
  // «va con el 71», «lleva el 46 este año»
  looseNumber: /\b(?:va|lleva|corre|compite|sale)\s+(?:con\s+)?(?:el|la)\s+(\d{1,3})\b/i,
  // Nombres de equipo que acaban en team / racing / escudería / motorsport
  teamName: /\b((?:[\wÁ-Úá-ú'’.&-]+\s+){0,3}(?:racing\s+team|motorsport|escuder[ií]a|team|racing))\b/i,
  // «su madre es Pilar Ferrer», «tutor legal: Jordi Pérez»
  guardian: /\b(?:su\s+)?(?:madre|padre|tutora?|representante(?:\s+legal)?)\s*(?:legal\s*)?(?:es|:)\s*([A-ZÁÉÍÓÚÑ][\wáéíóúñ'’-]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ'’-]+){0,3})/i,
  guardianLine: /\b(?:madre|padre|tutora?|representante|progenitor)\b/i,
  // «El contratante sería Speed Racing Team», «el cliente es X»
  clientIs: /\b(?:cliente|contratante|factur(?:a|ar)\s+a)\s+(?:ser[ií]a|es|:)\s*([A-ZÁÉÍÓÚÑ][\wÁ-Úá-ú'’.&-]*(?:\s+[\wÁ-Úá-ú'’.&-]+){0,4})/i
}

/** Convierte un texto de fecha a AAAA-MM-DD, o null si no se reconoce. */
export function parseDate(text: string): string | null {
  const iso = text.match(RE.isoDate)
  if (iso) return validDate(+iso[1], +iso[2], +iso[3])
  const num = text.match(RE.numDate)
  if (num) {
    let year = +num[3]
    if (year < 100) year += year > 50 ? 1900 : 2000
    return validDate(year, +num[2], +num[1])
  }
  const txt = text.match(RE.textDate)
  if (txt) {
    const month = MONTHS.findIndex((m) => m.startsWith(fold(txt[2]).slice(0, 3)))
    if (month >= 0) return validDate(+txt[3], month + 1, +txt[1])
  }
  return null
}

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Convierte «1.800,50 €» en 1800.5. */
export function parsePrice(text: string): number | null {
  const m = text.match(RE.price)
  if (!m) return null
  const whole = (m[1] ?? m[3] ?? '').replace(/[.\s]/g, '')
  const cents = m[2] ?? m[4]
  const n = Number(cents ? `${whole}.${cents}` : whole)
  return Number.isFinite(n) ? n : null
}

const cleanValue = (v: string) => v.replace(/^[\s:·•\-–—*>]+/, '').replace(/[\s;,.]+$/, '').trim()

/**
 * Campos que encajan con una etiqueta escrita por el usuario, en orden de preferencia.
 * Una etiqueta puede valer para varios: «Equipo» es el nombre en la ficha de un equipo
 * y el equipo al que pertenece en la de un piloto; se usa el primero que esté libre.
 */
function fieldsForLabel(label: string, target: ParseTarget): { key: string; label: string }[] {
  const f = fold(label).replace(/[*_]/g, '').replace(/\s+/g, ' ')
  if (!f || f.length > 32) return []
  const candidates = FIELDS.filter((x) => x.targets.includes(target))
  const exact = candidates.filter((x) => x.aliases.includes(f))
  if (exact.length) return exact
  // «teléfono de contacto» → teléfono; «nombre del piloto» → nombre.
  return candidates.filter((x) => x.aliases.some((a) => a.length >= 4 && (f.startsWith(a + ' ') || f.endsWith(' ' + a))))
}

/** Campos cuyo nombre es exactamente la etiqueta escrita (sin coincidencias parciales). */
function exactFieldsForLabel(label: string, target: ParseTarget): { key: string; label: string }[] {
  const f = fold(label).replace(/[*_]/g, '').replace(/\s+/g, ' ')
  return FIELDS.filter((x) => x.targets.includes(target) && x.aliases.includes(f))
}

const STOPWORDS = ['y', 'e', 'o', 'u', 'de', 'del', 'la', 'el', 'los', 'las', 'con', 'en', 'para', 'al']

/**
 * Línea del tipo «Licencia nº RFME-0841» o «Dorsal 46»: la etiqueta va delante
 * y el valor detrás, sin dos puntos. Se usa la etiqueta más larga que encaje.
 */
function inlineLabelValue(line: string, target: ParseTarget): { fields: { key: string; label: string }[]; value: string } | null {
  const f = fold(line)
  if (f.length > 90) return null
  let best = ''
  for (const field of FIELDS) {
    if (!field.targets.includes(target)) continue
    for (const alias of field.aliases) {
      if (alias.length > best.length && (f === alias || f.startsWith(alias + ' '))) best = alias
    }
  }
  if (!best) return null
  // El resto de la línea, quitando separadores sueltos («nº», «-», «=»).
  const rest = line.slice(best.length).replace(/^[\s:=\-–—]*(?:n[ºo°]\.?|num(?:ero)?\.?|#)?[\s:=\-–—]*/i, '').trim()
  if (!rest || rest.length > 60) return null
  // «Nombre y apellidos» no es «Nombre» + valor «y apellidos».
  if (STOPWORDS.includes(fold(rest.split(/\s+/)[0]))) return null
  return { fields: FIELDS.filter((x) => x.targets.includes(target) && x.aliases.includes(best)), value: rest }
}

/** ¿Parece un nombre propio? (2–4 palabras, sin cifras ni símbolos). */
function looksLikeName(line: string): boolean {
  const t = line.trim()
  if (t.length < 4 || t.length > 60 || /[\d@:/]/.test(t)) return false
  const words = t.split(/\s+/)
  return words.length >= 2 && words.length <= 5 && words.every((w) => /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü'’.-]+$/.test(w))
}

/**
 * Analiza el texto pegado y devuelve los campos reconocidos.
 * `target` decide el vocabulario: datos de cliente o datos de sesión.
 */
export function parseData(text: string, target: ParseTarget): Detected[] {
  const found = new Map<string, string>()
  const put = (key: string, value: string | null | undefined) => {
    const v = typeof value === 'string' ? cleanValue(value) : ''
    if (v && !found.has(key)) found.set(key, v)
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim())

  // --- 1) Pares «etiqueta: valor» ---
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const m = line.match(/^[\s>*\-–—•·]*([^:]{2,32}?)\s*[:：]\s*(.*)$/)
    if (m) {
      const fields = fieldsForLabel(m[1], target)
      if (fields.length) {
        // Valor en la misma línea o, si está vacía, en la siguiente.
        const value = m[2].trim() || lines[i + 1] || ''
        put((fields.find((f) => !found.has(f.key)) ?? fields[0]).key, value)
        continue
      }
    }
    // Etiqueta sola en una línea y el valor en la siguiente («Dorsal» / «46»).
    const exact = exactFieldsForLabel(line, target)
    const free = exact.find((f) => !found.has(f.key))
    if (free && lines[i + 1] && !lines[i + 1].includes(':')) { put(free.key, lines[i + 1]); continue }
    // Etiqueta y valor en la misma línea sin dos puntos («Licencia nº RFME-0841»).
    const inline = inlineLabelValue(line, target)
    if (inline) put((inline.fields.find((f) => !found.has(f.key)) ?? inline.fields[0]).key, inline.value)
  }

  // --- 2) Patrones sueltos para lo que falte ---
  const email = text.match(RE.email)?.[0]
  put('email', email)
  // El correo lleva @: se quita antes de buscar el usuario de Instagram.
  const withoutEmails = text.replace(new RegExp(RE.email.source, 'g'), ' ')
  put('instagram', withoutEmails.match(RE.instagram)?.[1])
  put('tax_id', text.match(RE.taxId)?.[0])
  const url = text.match(RE.url)?.[0]
  if (url && !/instagram\.com/i.test(url)) put('website', url)

  if (target === 'client') {
    // El tutor y su teléfono: si un teléfono aparece junto a «madre/padre/tutor», es suyo.
    put('guardian_name', text.match(RE.guardian)?.[1])
    const gLine = lines.find((l) => RE.guardianLine.test(l) && RE.phone.test(l))
    if (gLine) {
      const gPhone = gLine.match(RE.phone)?.[0]?.trim()
      if (gPhone && gPhone.replace(/\D/g, '').length >= 9) {
        put('guardian_phone', gPhone)
        if (!found.has('guardian_name')) put('guardian_name', gLine.match(RE.guardian)?.[1])
      }
    }
  }

  if (!found.has('phone')) {
    // Se descartan las cifras que ya se han reconocido como otra cosa.
    const used = [found.get('tax_id'), found.get('license_number'), found.get('birth_date'), found.get('date'),
      found.get('guardian_phone'), email].filter(Boolean).join(' ')
    for (const cand of withoutEmails.match(new RegExp(RE.phone.source, 'g')) ?? []) {
      const digits = cand.replace(/\D/g, '')
      if (digits.length < 9 || digits.length > 13) continue
      if (used.includes(cand.trim())) continue
      // Descarta cifras pegadas a un código («RFME-2026-00841»).
      const at = withoutEmails.indexOf(cand)
      if (at > 0 && /[A-Za-z-]/.test(withoutEmails[at - 1])) continue
      put('phone', cand)
      break
    }
  }

  if (target === 'client') {
    put('racing_number', text.match(RE.dorsal)?.[1] ?? text.match(RE.looseNumber)?.[1])
    if (!found.has('team')) put('team', teamName(text))
    if (!found.has('birth_date')) {
      const near = lines.find((l) => /naci|nacimiento|cumple/i.test(fold(l)) && parseDate(l))
      if (near) put('birth_date', parseDate(near) ?? '')
    }
    if (!found.has('name')) {
      put('name', text.match(RE.iAm)?.[1])
      if (!found.has('name')) put('name', lines.find(looksLikeName))
    }
  } else {
    if (!found.has('date')) {
      const near = lines.find((l) => /fecha|dia|d[ií]a|cuando|cuándo/i.test(l) && parseDate(l))
      put('date', (near && parseDate(near)) ?? parseDate(text) ?? '')
    } else {
      put('date', parseDate(found.get('date')!) ?? '')
      found.set('date', parseDate(found.get('date')!) ?? found.get('date')!)
    }
    if (!found.has('clientName')) put('clientName', text.match(RE.clientIs)?.[1] ?? teamName(text))
    if (!found.has('location')) put('location', text.match(RE.circuit)?.[0]?.replace(/[.,;]+$/, ''))
    if (!found.has('price')) {
      // Con varias cifras («nos han pasado 1.500 € pero cerraríamos en 1.250 €»)
      // se queda con la última, que suele ser la acordada.
      const all = text.match(new RegExp(RE.price.source, 'gi')) ?? []
      const p = all.length ? parsePrice(all[all.length - 1]) : null
      if (p !== null) put('price', String(p))
    }
    if (!found.has('type')) {
      const f = fold(text)
      const hit = Object.keys(SESSION_TYPE_WORDS).find((w) => new RegExp(`\\b${w}\\b`).test(f))
      if (hit) put('type', SESSION_TYPE_WORDS[hit])
    }
    if (!found.has('title')) {
      const first = lines.find((l) => l.length > 3 && !l.includes(':'))
      if (first && first.length <= 80) put('title', first)
    }
  }

  // Normalizaciones finales.
  if (found.has('birth_date')) {
    const d = parseDate(found.get('birth_date')!)
    d ? found.set('birth_date', d) : found.delete('birth_date')
  }
  if (found.has('date')) {
    const d = parseDate(found.get('date')!)
    d ? found.set('date', d) : found.delete('date')
  }
  if (found.has('price')) {
    const p = parsePrice(found.get('price')!) ?? Number(found.get('price')!.replace(/[^\d,.]/g, '').replace(',', '.'))
    Number.isFinite(p) ? found.set('price', String(p)) : found.delete('price')
  }
  if (found.has('instagram')) {
    found.set('instagram', found.get('instagram')!.replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, ''))
  }
  if (found.has('type')) {
    const t = SESSION_TYPE_WORDS[fold(found.get('type')!)]
    if (t) found.set('type', t)
  }
  if (found.has('championship') && !found.has('type')) found.set('type', 'Carrera')
  if (found.has('racing_number')) {
    const n = found.get('racing_number')!.match(/\d{1,3}/)?.[0]
    n ? found.set('racing_number', n) : found.delete('racing_number')
  }

  const order = FIELDS.filter((f) => f.targets.includes(target)).map((f) => f.key)
  return [...found.entries()]
    .filter(([k]) => order.includes(k))
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([key, value]) => ({ key, label: FIELDS.find((f) => f.key === key)!.label, value }))
}

/** Nombre de equipo dentro de una frase: «va con el Speed Racing Team» → «Speed Racing Team». */
function teamName(text: string): string | null {
  const m = text.match(RE.teamName)
  if (!m) return null
  const words = m[1].trim().split(/\s+/)
  while (words.length > 1 && STOPWORDS.includes(fold(words[0]))) words.shift()
  const name = words.join(' ')
  return words.length >= 2 && name.length <= 48 ? name : null
}

/** Deduce si el texto describe un piloto, un equipo o un particular. */
export function guessClientKind(text: string, detected: Detected[]): ClientKind {
  const has = (k: string) => detected.some((d) => d.key === k)
  const f = fold(text)
  for (const [word, kind] of Object.entries(CLIENT_KIND_FROM_WORD)) {
    if (new RegExp(`\\b${word}\\b`).test(f)) {
      // «equipo: X» en la ficha de un piloto no lo convierte en equipo.
      if (kind === 'equipo' && (has('racing_number') || has('license_number') || has('birth_date'))) continue
      return kind
    }
  }
  if (has('racing_number') || has('license_number') || has('vehicle')) return 'piloto'
  if (has('contact_name') || has('brand')) return 'equipo'
  return 'particular'
}
