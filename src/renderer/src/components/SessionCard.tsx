import type { Session } from '../../../shared/types'
import { api, formatDate, STATUS_LABEL } from '../util'

export default function SessionCard({ s, onOpen }: { s: Session; onOpen: () => void }) {
  return (
    <button className="session-card" onClick={onOpen}>
      <div className="cover">
        {s.cover_key ? <img src={api.mediaUrl(s.cover_key)} alt="" /> : <span className="cover-empty">Sin fotos</span>}
        <span className={`badge status-${s.status}`}>{STATUS_LABEL[s.status]}</span>
      </div>
      <div className="session-card-body">
        <strong>{s.title}</strong>
        <span className="muted">{[s.client_name, s.type].filter(Boolean).join(' · ') || '—'}</span>
        {s.championship && <span className="chip small-chip championship">🏁 {s.championship}</span>}
        <span className="muted small">
          {formatDate(s.date)} · {s.photo_count ?? 0} fotos{s.pick_count ? ` · ${s.pick_count} elegidas` : ''}
        </span>
      </div>
    </button>
  )
}
