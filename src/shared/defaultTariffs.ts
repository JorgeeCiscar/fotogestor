/**
 * Lista de precios de partida para fotografía de karting y motorsport.
 * Sale de la calculadora de precios, la plantilla de carreras y la propuesta
 * para carreras fuera de Valencia: base de 50 € por piloto y día, fin de semana
 * de 3 días con −10 % para pilotos (suelo de 120 €) y 150 € por piloto para equipos.
 */
import type { TariffInput } from './types'

export const DEFAULT_TARIFFS: TariffInput[] = [
  // --- Cobertura por tipo de sesión ---
  {
    category: 'sesion', mode: 'fijo', session_type: 'Carrera',
    label: 'Cobertura de carrera · piloto, fin de semana', price: 135, unit: 'por piloto',
    notes: '3 días con −10 %. 25 fotos editadas por piloto y día. Suelo: 120 €.'
  },
  {
    category: 'sesion', mode: 'fijo', session_type: 'Entrenamientos',
    label: 'Cobertura de entrenamientos · piloto', price: 50, unit: 'por piloto y día',
    notes: 'Pon en «cantidad» los días × pilotos.'
  },
  {
    category: 'sesion', mode: 'fijo', session_type: 'Track day',
    label: 'Cobertura de track day · piloto', price: 50, unit: 'por piloto y día',
    notes: 'Pon en «cantidad» los días × pilotos.'
  },
  {
    category: 'sesion', mode: 'fijo', session_type: '',
    label: 'Cobertura · piloto y día', price: 50, unit: 'por piloto y día',
    notes: 'Tarifa base para los tipos sin precio propio.'
  },

  // --- Coberturas alternativas ---
  {
    category: 'extra', mode: 'fijo', session_type: null,
    label: 'Cobertura equipo · por piloto, fin de semana', price: 150, unit: 'por piloto',
    notes: '50 €/día sin descuento, licencia comercial incluida. Cantidad = nº de pilotos.'
  },
  {
    category: 'extra', mode: 'fijo', session_type: null,
    label: 'Día suelto adicional · piloto', price: 50, unit: 'por día', notes: null
  },

  // --- Extras de servicio ---
  {
    category: 'extra', mode: 'porcentaje', session_type: null,
    label: 'Licencia comercial', price: 25, unit: 'sobre la cobertura',
    notes: 'Pilotos: patrocinadores, publicidad, merchandising, venta o medios. En equipos va incluida.'
  },
  {
    category: 'extra', mode: 'fijo', session_type: null,
    label: 'Entrega prioritaria', price: 15, unit: 'por día',
    notes: 'Todas las fotos del día editadas esa misma noche.'
  },
  {
    category: 'extra', mode: 'fijo', session_type: null,
    label: 'Foto extra', price: 2, unit: 'por foto',
    notes: 'Sobre las 25 incluidas por piloto y día.'
  },
  { category: 'extra', mode: 'fijo', session_type: null, label: 'Vídeo horizontal · piloto', price: 50, unit: 'por evento', notes: 'Resumen del fin de semana.' },
  { category: 'extra', mode: 'fijo', session_type: null, label: 'Vídeo horizontal · equipo', price: 80, unit: 'por evento', notes: 'Resumen del fin de semana.' },

  // --- Desplazamiento ---
  {
    category: 'extra', mode: 'fijo', session_type: null,
    label: 'Desplazamiento local equipo (Valencia)', price: 10, unit: 'por día', notes: '30 € el fin de semana completo.'
  },
  {
    category: 'extra', mode: 'fijo', session_type: null,
    label: 'Kilometraje', price: 0.26, unit: 'por km',
    notes: 'Km de ida y vuelta. Referencia de Hacienda para vehículo propio.'
  },
  { category: 'extra', mode: 'fijo', session_type: null, label: 'Manutención', price: 25, unit: 'por día', notes: 'Días fuera de Valencia.' },
  { category: 'extra', mode: 'fijo', session_type: null, label: 'Día de viaje', price: 25, unit: 'por día', notes: 'Si el trayecto supera 2 horas.' },
  {
    category: 'extra', mode: 'fijo', session_type: null,
    label: 'Alojamiento', price: 0, unit: 'por noche', notes: 'A precio de coste, con justificante: pon el importe real.'
  },
  {
    category: 'extra', mode: 'fijo', session_type: null,
    label: 'Peajes y aparcamiento', price: 0, unit: 'por prueba', notes: 'A precio de coste, con justificante: pon el importe real.'
  },

  // --- Descuentos (porcentajes negativos) ---
  {
    category: 'extra', mode: 'porcentaje', session_type: null,
    label: 'Descuento de temporada · 3 o 4 pruebas', price: -5, unit: 'sobre la cobertura',
    notes: 'Los descuentos no se aplican a los gastos de viaje.'
  },
  {
    category: 'extra', mode: 'porcentaje', session_type: null,
    label: 'Descuento de temporada · 5 o más pruebas', price: -10, unit: 'sobre la cobertura',
    notes: 'Máximo. Suelo de 120 € por piloto y fin de semana.'
  },

  // --- Cancelaciones ---
  {
    category: 'extra', mode: 'porcentaje', session_type: null,
    label: 'Cancelación con 7 a 14 días', price: 25, unit: 'de la cobertura', notes: 'Añádelo a una sesión vacía para facturar la cancelación.'
  },
  { category: 'extra', mode: 'porcentaje', session_type: null, label: 'Cancelación con menos de 7 días', price: 50, unit: 'de la cobertura', notes: null },
  { category: 'extra', mode: 'porcentaje', session_type: null, label: 'No se presenta / sin aviso', price: 100, unit: 'de la cobertura', notes: null }
]
