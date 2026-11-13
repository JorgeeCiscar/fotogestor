import { useMemo, useState } from 'react'
import { parseData, type Detected, type ParseTarget } from '../../../shared/parseData'
import Modal from './Modal'

const EXAMPLE: Record<ParseTarget, string> = {
  client: 'Nombre: Marc Pérez\nDorsal: 46\nEquipo: Speed Racing Team\nEmail: marc@example.com\nTeléfono: 600 111 222',
  session: 'Sesión: ESBK Cheste - Carrera 1\nCampeonato: Campeonato de España de Velocidad\nFecha: 20/09/2026\nLugar: Circuit Ricardo Tormo\nPrecio: 450 €'
}

/**
 * Pega un correo, un WhatsApp o una ficha y reconoce los datos que contiene.
 * No guarda nada: rellena el formulario para que el usuario lo revise.
 */
export default function PasteDataDialog({ target, onClose, onApply }: {
  target: ParseTarget
  onClose: () => void
  onApply: (values: Record<string, string>, text: string) => void
}) {
  const [text, setText] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const detected = useMemo<Detected[]>(() => (text.trim() ? parseData(text, target) : []), [text, target])
  const chosen = detected.filter((d) => !excluded.has(d.key))

  function toggle(key: string) {
    const next = new Set(excluded)
    next.has(key) ? next.delete(key) : next.add(key)
    setExcluded(next)
  }

  function apply() {
    onApply(Object.fromEntries(chosen.map((d) => [d.key, d.value])), text)
  }

  return (
    <Modal title="Pegar datos" onClose={onClose} wide>
      <div className="form paste-dialog">
        <p className="muted">
          Pega aquí el correo, el mensaje o la ficha con los datos{target === 'client' ? ' del cliente' : ' del evento'}.
          Se reconocen solos y puedes revisarlos antes de aplicarlos.
        </p>
        <textarea autoFocus rows={10} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE[target]} spellCheck={false} />

        {text.trim() && (
          detected.length ? (
            <>
              <h3 className="form-section">{detected.length} {detected.length === 1 ? 'dato reconocido' : 'datos reconocidos'}</h3>
              <table className="detected">
                <tbody>
                  {detected.map((d) => (
                    <tr key={d.key} className={excluded.has(d.key) ? 'off' : ''}>
                      <td className="detected-check">
                        <input type="checkbox" checked={!excluded.has(d.key)} onChange={() => toggle(d.key)}
                          aria-label={`Usar ${d.label}`} />
                      </td>
                      <td className="detected-label muted">{d.label}</td>
                      <td className="detected-value">{d.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">No se ha reconocido ningún dato. Prueba a escribir cada dato en una línea,
              con su nombre delante: <code>Teléfono: 600 111 222</code></p>
          )
        )}

        <footer>
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" onClick={apply} disabled={!chosen.length}>
            Aplicar {chosen.length || ''} {chosen.length === 1 ? 'dato' : chosen.length ? 'datos' : ''}
          </button>
        </footer>
      </div>
    </Modal>
  )
}
