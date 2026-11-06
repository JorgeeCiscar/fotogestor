import { KeyboardEvent, useEffect, useId, useState } from 'react'
import { api } from '../util'

/** Campo de etiquetas: Enter o coma para añadir, ✕ para quitar, con sugerencias. */
export default function TagInput({ value, onAdd, onRemove, placeholder = 'Añadir etiqueta…', autoFocus }: {
  value: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const [all, setAll] = useState<string[]>([])
  const listId = useId()
  useEffect(() => { api.tags().then(setAll) }, [])

  function commit() {
    const t = text.trim().replace(/,$/, '').trim()
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onAdd(t)
    setText('')
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
    else if (e.key === 'Backspace' && !text && value.length) onRemove(value[value.length - 1])
  }

  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="chip">{t}<button type="button" onClick={() => onRemove(t)} aria-label={`Quitar ${t}`}>✕</button></span>
      ))}
      <input list={listId} value={text} placeholder={value.length ? '' : placeholder} autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={commit} />
      <datalist id={listId}>{all.filter((t) => !value.includes(t)).map((t) => <option key={t} value={t} />)}</datalist>
    </div>
  )
}
