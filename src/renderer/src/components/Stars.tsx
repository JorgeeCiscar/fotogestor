export default function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'on' : ''}
          onClick={onChange ? (e) => { e.stopPropagation(); onChange(n === value ? 0 : n) } : undefined}>★</span>
      ))}
    </span>
  )
}
