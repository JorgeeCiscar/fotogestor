import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_TARIFFS } from '../../../shared/defaultTariffs'
import type { Tariff, TariffCategory, TariffInput, TariffMode } from '../../../shared/types'
import { api, errorMessage, formatMoney, SESSION_TYPES } from '../util'

const UNITS = ['por evento', 'por hora', 'por día', 'por foto', 'por piloto', 'por álbum', 'por km']

const emptyRow = (category: TariffCategory): TariffInput =>
  ({ category, mode: 'fijo', session_type: '', label: '', price: 0, unit: category === 'sesion' ? 'por sesión' : '', notes: '' })

const same = (a: TariffInput, b: TariffInput) =>
  a.label.trim() === b.label.trim() && Number(a.price) === Number(b.price) && a.mode === b.mode &&
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
      {row.category === 'extra' && (
        <td>
          <select value={row.mode} onChange={(e) => set('mode', e.target.value as TariffMode)} onBlur={commit}>
            <option value="fijo">Importe</option>
            <option value="porcentaje">Porcentaje</option>
          </select>
        </td>
      )}
      <td className="tariff-price">
        <input className="n" type="number" step={row.mode === 'porcentaje' ? 1 : 0.01}
          min={row.mode === 'porcentaje' ? -100 : 0} value={row.price}
          onChange={(e) => set('price', e.target.value as unknown as number)} onBlur={commit} /> {row.mode === 'porcentaje' ? '%' : '€'}
      </td>
      <td>
        <input list="tariff-units" value={row.unit ?? ''} onChange={(e) => set('unit', e.target.value)} onBlur={commit} placeholder="por evento" />
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

/** Lista de precios: tarifa por tipo de evento y extras que se suman a ella. */
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
    if (!confirm(`¿Eliminar la tarifa «${t.label}»? Los eventos ya creados conservan su precio.`)) return
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
              {category === 'sesion' && <th>Tipo de evento</th>}
              <th>Concepto</th>
              {category === 'extra' && <th>Tipo</th>}
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
            {!rows.length && !adding && <tr><td colSpan={7} className="muted small">Sin tarifas todavía.</td></tr>}
          </tbody>
        </table>
        <button className="ghost" onClick={() => setDraft(emptyRow(category))} disabled={!!draft}>
          + Añadir {category === 'sesion' ? 'tipo de evento' : 'extra'}
        </button>
      </section>
    )
  }

  /** Carga la lista de precios de karting y motorsport (solo si no hay ninguna). */
  async function loadDefaults() {
    try {
      setError('')
      for (const t of DEFAULT_TARIFFS) await api.tariffs.save(t)
      load()
    } catch (err) { setError(errorMessage(err)) }
  }

  const base = tariffs.filter((t) => t.category === 'sesion')
  return (
    <div className="page tariffs-page">
      <header className="page-header">
        <h1>Tarifas</h1>
        {base.length > 0 && <span className="muted small">Desde {formatMoney(Math.min(...base.map((t) => t.price)))}</span>}
      </header>
      <p className="muted">
        Tus precios habituales. Al crear un evento se aplica sola la tarifa de su tipo y puedes añadirle extras;
        de ahí salen el precio del evento y las partidas del presupuesto.
      </p>
      {error && <p className="error">{error}</p>}
      {!tariffs.length && (
        <div className="tariff-starter">
          <strong>¿Empezamos con tus precios habituales?</strong>
          <p className="muted small">
            Carga la lista de karting y motorsport: cobertura por piloto y día, fin de semana de 3 días,
            precio de equipo, licencia comercial, entrega prioritaria, vídeo, kilometraje, dietas,
            descuentos de temporada y cancelaciones. Luego cambia lo que quieras.
          </p>
          <button className="primary" onClick={loadDefaults}>Cargar {DEFAULT_TARIFFS.length} tarifas</button>
        </div>
      )}
      {section('sesion', 'Precio por tipo de evento',
        'Se aplica automáticamente al elegir el tipo al crear un evento. Deja el tipo en «Cualquiera» para una tarifa general.')}
      {section('extra', 'Extras',
        'Se añaden a mano en cada evento: álbumes, revelado extra, desplazamiento, urgencia…')}
      <datalist id="tariff-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  )
}
