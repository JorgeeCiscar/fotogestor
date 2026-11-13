import { useCallback, useEffect, useState } from 'react'
import type { Tariff, TariffCategory, TariffInput } from '../../../shared/types'
import { api, errorMessage, formatMoney, SESSION_TYPES } from '../util'

const UNITS = ['por sesión', 'por hora', 'por día', 'por foto', 'por piloto', 'por álbum', 'por km']

const emptyRow = (category: TariffCategory): TariffInput =>
  ({ category, session_type: '', label: '', price: 0, unit: category === 'sesion' ? 'por sesión' : '', notes: '' })

const same = (a: TariffInput, b: TariffInput) =>
  a.label.trim() === b.label.trim() && Number(a.price) === Number(b.price) &&
  (a.unit ?? '') === (b.unit ?? '') && (a.notes ?? '') === (b.notes ?? '') && (a.session_type ?? '') === (b.session_type ?? '')

/** Fila editable: se guarda al salir de un campo (si cambió) o con Enter. */
function TariffRow({ tariff, isNew, onSave, onRemove, onCancel }: {
  tariff: TariffInput
  isNew?: boolean
  onSave: (t: TariffInput) => void
  onRemove?: () => void
  onCancel?: () => void
}) {
  const [row, setRow] = useState<TariffInput>(tariff)
  const dirty = !isNew && !same(row, tariff)
  // La fila solo se recarga desde la lista si no hay cambios sin guardar,
  // para no borrar lo que el usuario está escribiendo.
  useEffect(() => { if (!dirty) setRow(tariff) }, [tariff])
  const set = <K extends keyof TariffInput>(k: K, v: TariffInput[K]) => setRow((r) => ({ ...r, [k]: v }))
  const commit = () => { if (dirty) onSave(row) }

  return (
    <tr className={dirty ? 'dirty' : ''} onKeyDown={(e) => {
      if (e.key === 'Enter') { e.preventDefault(); onSave(row) }
      else if (e.key === 'Escape' && isNew) onCancel?.()
    }}>
      {row.category === 'sesion' && (
        <td>
          <select value={row.session_type ?? ''} onChange={(e) => set('session_type', e.target.value)} onBlur={commit}>
            <option value="">— Cualquiera —</option>
            {SESSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </td>
      )}
      <td>
        <input autoFocus={isNew} value={row.label} onChange={(e) => set('label', e.target.value)} onBlur={commit}
          placeholder={row.category === 'sesion' ? 'Cobertura de carrera' : 'Álbum 30×30'} />
      </td>
      <td className="tariff-price">
        <input className="n" type="number" min="0" step="0.01" value={row.price}
          onChange={(e) => set('price', e.target.value as unknown as number)} onBlur={commit} /> €
      </td>
      <td>
        <input list="tariff-units" value={row.unit ?? ''} onChange={(e) => set('unit', e.target.value)} onBlur={commit} placeholder="por sesión" />
      </td>
      <td><input value={row.notes ?? ''} onChange={(e) => set('notes', e.target.value)} onBlur={commit} placeholder="Opcional" /></td>
      <td className="actions">
        {isNew ? (
          <><button className="ghost" onClick={onCancel}>Cancelar</button><button className="primary" onClick={() => onSave(row)}>Añadir</button></>
        ) : dirty ? (
          <><button className="ghost" onClick={() => setRow(tariff)}>Deshacer</button><button className="primary" onClick={() => onSave(row)}>Guardar</button></>
        ) : (
          <button className="ghost danger" onClick={onRemove}>Eliminar</button>
        )}
      </td>
    </tr>
  )
}

/** Lista de precios: tarifa por tipo de sesión y extras que se suman a ella. */
export default function TariffsView() {
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [draft, setDraft] = useState<TariffInput | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => api.tariffs.list().then(setTariffs), [])
  useEffect(() => { load() }, [load])

  async function save(t: TariffInput) {
    if (!t.label?.trim()) { setError('La tarifa necesita un nombre'); return }
    try {
      setError('')
      await api.tariffs.save({ ...t, price: Number(t.price) || 0 })
      setDraft(null)
      load()
    } catch (err) { setError(errorMessage(err)) }
  }

  async function remove(t: Tariff) {
    if (!confirm(`¿Eliminar la tarifa «${t.label}»? Las sesiones ya creadas conservan su precio.`)) return
    await api.tariffs.remove(t.id)
    load()
  }

  function section(category: TariffCategory, title: string, help: string) {
    const rows = tariffs.filter((t) => t.category === category)
    const adding = draft?.category === category
    return (
      <section className="tariff-section">
        <h2>{title}</h2>
        <p className="muted small">{help}</p>
        <table className="table tariffs">
          <thead>
            <tr>
              {category === 'sesion' && <th>Tipo de sesión</th>}
              <th>Concepto</th>
              <th className="n">Precio</th>
              <th>Unidad</th>
              <th>Notas</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <TariffRow key={t.id} tariff={t} onSave={save} onRemove={() => remove(t)} />
            ))}
            {adding && <TariffRow key="new" tariff={draft!} isNew onSave={save} onCancel={() => setDraft(null)} />}
            {!rows.length && !adding && <tr><td colSpan={6} className="muted small">Sin tarifas todavía.</td></tr>}
          </tbody>
        </table>
        <button className="ghost" onClick={() => setDraft(emptyRow(category))} disabled={!!draft}>
          + Añadir {category === 'sesion' ? 'tipo de sesión' : 'extra'}
        </button>
      </section>
    )
  }

  const base = tariffs.filter((t) => t.category === 'sesion')
  return (
    <div className="page tariffs-page">
      <header className="page-header">
        <h1>Tarifas</h1>
        {base.length > 0 && <span className="muted small">Desde {formatMoney(Math.min(...base.map((t) => t.price)))}</span>}
      </header>
      <p className="muted">
        Tus precios habituales. Al crear una sesión se aplica sola la tarifa de su tipo y puedes añadirle extras;
        de ahí salen el precio de la sesión y las partidas del presupuesto.
      </p>
      {error && <p className="error">{error}</p>}
      {section('sesion', 'Precio por tipo de sesión',
        'Se aplica automáticamente al elegir el tipo al crear una sesión. Deja el tipo en «Cualquiera» para una tarifa general.')}
      {section('extra', 'Extras',
        'Se añaden a mano en cada sesión: álbumes, revelado extra, desplazamiento, urgencia…')}
      <datalist id="tariff-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  )
}
