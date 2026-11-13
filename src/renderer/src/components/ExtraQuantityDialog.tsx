import { useState } from 'react'
import type { Tariff } from '../../../shared/types'
import { formatMoney } from '../util'
import Modal from './Modal'

/** Nombre de la cantidad a partir de la unidad de la tarifa: «por km» → «Kilómetros». */
const QUANTITY_LABELS: [RegExp, string][] = [
  [/\bkm\b|kil/i, 'Kilómetros'],
  [/noche/i, 'Noches'],
  [/d[ií]a/i, 'Días'],
  [/hora/i, 'Horas'],
  [/foto/i, 'Fotos'],
  [/piloto/i, 'Pilotos'],
  [/[áa]lbum/i, 'Álbumes'],
  [/prueba|carrera/i, 'Pruebas']
]

export function quantityLabel(unit: string | null): string | null {
  if (!unit) return null
  if (/por (evento|sesi[óo]n)/i.test(unit)) return null
  return QUANTITY_LABELS.find(([re]) => re.test(unit))?.[1] ?? 'Cantidad'
}

/** ¿Hay que preguntar algo antes de añadir este extra? */
export function needsDetail(t: Tariff): boolean {
  return t.mode === 'fijo' && (quantityLabel(t.unit) !== null || t.price === 0)
}

export default function ExtraQuantityDialog({ tariff, onClose, onAdd }: {
  tariff: Tariff
  onClose: () => void
  onAdd: (quantity: number, unitPrice: number) => void
}) {
  const label = quantityLabel(tariff.unit) ?? 'Cantidad'
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState(String(tariff.price))
  const total = (Number(quantity) || 0) * (Number(price) || 0)

  const submit = () => onAdd(Number(quantity) || 0, Number(price) || 0)

  return (
    <Modal title={tariff.label} onClose={onClose}>
      <div className="form" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}>
        {tariff.notes && <p className="muted small">{tariff.notes}</p>}
        <div className="row">
          <label>{label}
            <input autoFocus type="number" step="0.5" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label>Precio por unidad (€)
            <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            {tariff.unit && <span className="muted small hint">{tariff.unit}</span>}
          </label>
        </div>
        <p className="muted">Importe: <strong>{formatMoney(Math.round(total * 100) / 100)}</strong></p>
        <footer>
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" onClick={submit}>Añadir</button>
        </footer>
      </div>
    </Modal>
  )
}
