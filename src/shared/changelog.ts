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
    version: '0.16.0',
    date: '2026-11-13',
    title: 'Ver carpetas sin añadir nada',
    changes: [
      'Nuevo apartado «Carpetas»: eliges una carpeta y ves sus fotos directamente, sin importar ni añadir nada. Recuerda la última que abriste.',
      'Doble clic abre la foto a pantalla completa; con ← → pasas de una a otra y con Esc sales.',
      'Las fotos se ven con su forma real: las verticales en vertical y las horizontales en horizontal, en las carpetas, en el evento y en Fotos.',
      'Si quieres añadirlas a un evento, el botón «Añadir a un evento…» saca los campos de día, piloto y prueba.',
      'En «Carpetas» se marcan las fotos que ya están en algún evento, y te dice en cuál.'
    ]
  },
  {
    version: '0.15.0',
    date: '2026-11-13',
    title: 'Trabajar sobre la carpeta',
    changes: [
      'En vez de importar, ahora abres la carpeta de la tarjeta y ves sus fotos dentro de la app.',
      'Eliges las que quieras y las añades al evento ya etiquetadas con el día, el piloto y la prueba (Prácticas, Clasificaciones, Heat, Carrera o Box).',
      'Por defecto no se copia nada: los originales se quedan en su carpeta y la app solo guarda dónde están. Si prefieres copiarlos a la biblioteca, hay una casilla para ello.',
      'Las fotos ya añadidas aparecen marcadas en la carpeta, para no repetirlas.',
      'Filtro por formato (JPEG, PNG, RAW de cada marca…) en la carpeta, en el evento y en Fotos.',
      'El tipo de prueba se ve en la miniatura, se cambia desde el visor y sirve para filtrar.'
    ]
  },
  {
    version: '0.14.0',
    date: '2026-11-13',
    title: 'Galería por piloto y tarifas más finas',
    changes: [
      'La galería se puede crear solo con las fotos de un piloto: él ve y elige únicamente las suyas.',
      'Los extras por unidades (kilometraje, dietas, fotos extra, noches…) preguntan la cantidad y el precio al añadirlos, y calculan el importe.',
      'Los porcentajes (licencia comercial, descuentos) se aplican solo sobre la cobertura del evento, nunca sobre los extras ni los gastos de viaje.',
      'Si cambias el precio de la cobertura, esos porcentajes se recalculan solos.'
    ]
  },
  {
    version: '0.13.0',
    date: '2026-11-13',
    title: 'Eventos, días y fotos por piloto',
    changes: [
      'Las «sesiones» ahora se llaman eventos. Tus datos siguen igual.',
      'Dentro de cada evento puedes crear los días a los que asistes (viernes, sábado…), y las fotos se importan al día que tengas abierto.',
      'Las fotos ya importadas se mueven de día seleccionándolas y usando «Mover a…».',
      'Nuevo botón «Asignar a piloto» (atajo A): marca qué pilotos salen en cada foto. El dorsal aparece en la miniatura.',
      'Puedes filtrar las fotos del evento por piloto, y en la ficha de cada piloto ves todas sus fotos asignadas.'
    ]
  },
  {
    version: '0.12.0',
    date: '2026-11-13',
    title: 'Contactos: circuitos y organizadores',
    changes: [
      'Nuevo apartado «Contactos» con fichas de circuito y de organizador, aparte de tus clientes.',
      'Guarda acreditaciones (prensa, email, plazo, requisitos), acceso y logística (puerta, parking, horarios, wifi, notas de la pista), contacto general y datos de facturación.',
      'Al escribir el nombre del circuito en el «Lugar» de una sesión se enlaza solo: desde la carrera llegas a sus datos de un clic.',
      'Cada ficha lista las carreras que has hecho allí, y la búsqueda global también los encuentra.'
    ]
  },
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
