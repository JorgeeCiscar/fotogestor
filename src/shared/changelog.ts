/**
 * Novedades de cada versión. Al abrir la app después de actualizarse se muestran
 * las entradas más nuevas que la última versión vista.
 *
 * Al publicar una versión nueva, añade su entrada ARRIBA con la misma versión
 * que `package.json`.
 */
export interface ChangelogEntry {
  version: string
  date: string
  title: string
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.11.0',
    date: '2026-11-13',
    title: 'Tus precios ya cargados',
    changes: [
      'En «Tarifas», si la lista está vacía, un botón carga tus 22 precios de karting y motorsport: cobertura por piloto y día, fin de semana, precio de equipo, extras, viajes, descuentos y cancelaciones.',
      'Nuevas tarifas en porcentaje: licencia comercial (+25 %), descuentos de temporada (−5 % y −10 %) y cancelaciones (25 %, 50 %, 100 %).',
      'Al añadir un porcentaje a una sesión se calcula solo sobre lo que lleve acumulado.'
    ]
  },
  {
    version: '0.10.0',
    date: '2026-11-13',
    title: 'Tus tarifas',
    changes: [
      'Nuevo apartado «Tarifas»: pon tu precio para cada tipo de sesión y tus extras (álbumes, desplazamiento, urgencia…).',
      'Al crear una sesión, al elegir el tipo se aplica su tarifa y puedes añadirle extras; el precio se calcula solo.',
      'Puedes cambiar el precio a mano cuando hagas una excepción, y volver al de la tarifa con un clic.',
      'El presupuesto de esa sesión ya sale con sus partidas: concepto, cantidad e importe.'
    ]
  },
  {
    version: '0.9.0',
    date: '2026-11-13',
    title: 'Ficha de cliente',
    changes: [
      'Pulsa un cliente en la lista y se abre su ficha: pilotos, equipos y particulares.',
      'Muestra todos sus datos, sus sesiones, sus fotos recientes y sus presupuestos y facturas.',
      'Resumen de sesiones, fotografías y total facturado; en los equipos, la lista de sus pilotos.',
      'Se navega entre fichas: del piloto a su equipo y del equipo a cada piloto.',
      'Desde la ficha puedes crear una sesión o un presupuesto para ese cliente.'
    ]
  },
  {
    version: '0.8.1',
    date: '2026-11-13',
    title: 'Pegar datos: entiende mensajes más desordenados',
    changes: [
      'Reconoce el nombre en frases como «se llama X» y el dorsal en «va con el 71».',
      'Detecta el equipo dentro de una frase, y al tutor con su teléfono («su madre es X, tlf …»).',
      'Ya no confunde un número de licencia con un teléfono, ni arrastra texto de más en el lugar.',
      'Si en el texto hay varios precios, se queda con el último, que suele ser el acordado.'
    ]
  },
  {
    version: '0.8.0',
    date: '2026-11-13',
    title: 'Pegar datos y que se rellenen solos',
    changes: [
      'Botón «Pegar datos…» al crear o editar un cliente y al crear una sesión.',
      'Pega un correo, un WhatsApp o una ficha de inscripción y se reconocen el nombre, dorsal, equipo, categoría, moto, licencia, email, teléfono, Instagram, NIF, fecha, lugar, campeonato y precio.',
      'Antes de aplicarlos se muestran en una lista para que los revises y descartes lo que no quieras.',
      'Si el texto es de un piloto o de un equipo, se elige el tipo de cliente solo; el equipo se enlaza con el que ya tengas dado de alta.'
    ]
  },
  {
    version: '0.7.0',
    date: '2026-11-13',
    title: 'Nuevo aspecto',
    changes: [
      'Interfaz con la paleta de grises neutros de Lightroom y un único acento azul.',
      'Bordes y esquinas más sobrios, y textos más legibles sobre el fondo oscuro.',
      'Los apartados, los botones y los atajos siguen exactamente donde estaban.'
    ]
  },
  {
    version: '0.6.0',
    date: '2026-11-13',
    title: 'Carreras y aviso de novedades',
    changes: [
      'Nuevo tipo de sesión «Carrera»: al elegirlo puedes indicar el campeonato.',
      'Las sesiones se pueden filtrar por campeonato, que también aparece en la búsqueda.',
      'Al actualizarse la app, esta ventana te cuenta las novedades de la versión.'
    ]
  },
  {
    version: '0.5.0',
    date: '2026-11-06',
    title: 'Pilotos, equipos y particulares',
    changes: [
      'Al crear un cliente se elige si es piloto, equipo o particular, cada uno con sus datos.',
      'Pilotos: dorsal, categoría, moto o coche, equipo, licencia y datos del tutor si es menor.',
      'Equipos: persona de contacto, cargo, marca, web y lista de sus pilotos.',
      'La lista de clientes tiene pestañas por tipo y busca por dorsal, equipo o categoría.'
    ]
  },
  {
    version: '0.4.0',
    date: '2026-11-06',
    title: 'Fototeca',
    changes: [
      'Nuevo apartado «Fotos» con todas las fotos de todas las sesiones.',
      'Filtros por una o varias sesiones, cliente, marca, valoración, etiqueta y RAW.',
      'Selección múltiple y copia a una carpeta, con la opción de una subcarpeta por sesión.'
    ]
  }
]

/** Entradas más nuevas que `since` (todas si no hay versión anterior conocida). */
export function changesSince(since: string | null, upTo: string): ChangelogEntry[] {
  const entries = CHANGELOG.filter((e) => compareVersions(e.version, upTo) <= 0)
  if (!since) return entries
  return entries.filter((e) => compareVersions(e.version, since) > 0)
}

/** Compara versiones «1.2.3»: negativo si a < b, 0 si iguales, positivo si a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}
