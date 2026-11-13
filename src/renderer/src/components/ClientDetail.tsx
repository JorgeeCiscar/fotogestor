import { useCallback, useEffect, useState } from 'react'
import type { ClientDetail as Detail, Invoice, LibraryPhoto, Session } from '../../../shared/types'
import type { View } from '../App'
import {
  ageFrom, api, CLIENT_KIND_ICON, CLIENT_KIND_LABEL, displayNumber, errorMessage,
  formatDate, formatMoney, INVOICE_STATUS_LABEL
} from '../util'
import ClientForm from './ClientForm'
import SessionCard from './SessionCard'

/** Una fila «etiqueta → valor» de la ficha; no se muestra si no hay valor. */
function Row({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  if (!children && !value) return null
  return (
    <>
      <dt>{label}</dt>
      <dd>{children ?? value}</dd>
    </>
  )
}

export default function ClientDetail({ id, nav }: { id: number; nav: (v: View) => void }) {
  const [client, setClient] = useState<Detail | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [photos, setPhotos] = useState<LibraryPhoto[]>([])
  const [photoCount, setPhotoCount] = useState(0)
  const [editing, setEditing] = useState(false)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    const c = await api.clients.get(id)
    if (!c) { setMissing(true); return }
    setClient(c)
    const [ss, inv, page] = await Promise.all([
      api.sessions.list({ clientId: id }),
      api.invoices.list({ clientId: id }),
      api.library.query({ clientId: id, sort: 'date_desc' }, 0, 12)
    ])
    setSessions(ss)
    setInvoices(inv)
    setPhotos(page.photos)
    setPhotoCount(page.total)
  }, [id])
  useEffect(() => { load() }, [load])

  async function remove() {
    if (!client) return
    const extra = client.pilots.length ? ` Sus ${client.pilots.length} pilotos quedarán sin equipo.` : ''
    if (!confirm(`¿Eliminar a ${client.name}? Sus sesiones se conservarán sin cliente asignado.${extra}`)) return
    try {
      await api.clients.remove(client.id)
      nav({ name: 'clients' })
    } catch (err) { alert(errorMessage(err)) }
  }

  if (missing) return <div className="page"><p className="empty">Este cliente ya no existe.</p></div>
  if (!client) return null

  const age = ageFrom(client.birth_date)
  const minor = age !== null && age < 18
  const kind = client.kind
  const billed = invoices
    .filter((i) => i.kind === 'factura' && i.status !== 'borrador')
    .reduce((sum, i) => sum + i.total, 0)

  return (
    <div className="page client-page">
      <header className="page-header">
        <button className="ghost" onClick={() => nav({ name: 'clients' })}>← Clientes</button>
        <div className="session-title">
          <h1>
            {kind === 'piloto' && client.racing_number && <span className="dorsal">{client.racing_number}</span>}
            {client.name}{' '}
            {kind
              ? <span className={`kind-badge kind-${kind}`}>{CLIENT_KIND_ICON[kind]} {CLIENT_KIND_LABEL[kind]}</span>
              : <button className="link" onClick={() => setEditing(true)}>Indicar tipo</button>}
          </h1>
          <span className="muted">
            {[kind === 'equipo' ? client.contact_name && `Contacto: ${client.contact_name}` : client.category,
              kind === 'piloto' ? client.vehicle : client.brand,
              client.team_name].filter(Boolean).join(' · ')}
          </span>
        </div>
        <button className="ghost" onClick={() => nav({ name: 'sessions', clientId: id, create: true })}>+ Sesión</button>
        <button className="ghost" onClick={() => setEditing(true)}>Editar</button>
        <button className="ghost danger" onClick={remove}>Eliminar</button>
      </header>

      <div className="stats client-stats">
        <div className="stat"><span>{sessions.length}</span>{sessions.length === 1 ? 'Sesión' : 'Sesiones'}</div>
        <div className="stat"><span>{photoCount.toLocaleString('es-ES')}</span>Fotografías</div>
        <div className="stat"><span>{formatMoney(billed)}</span>Facturado</div>
        {kind === 'equipo' && <div className="stat"><span>{client.pilots.length}</span>{client.pilots.length === 1 ? 'Piloto' : 'Pilotos'}</div>}
      </div>

      <div className="client-cols">
        <section className="client-data">
          <h2>Datos</h2>
          <dl className="data-list">
            {kind === 'piloto' && (
              <>
                <Row label="Dorsal" value={client.racing_number} />
                <Row label="Categoría" value={client.category} />
                <Row label="Moto / coche" value={client.vehicle} />
                <Row label="Equipo">
                  {client.team_id && client.team_name
                    ? <button className="link" onClick={() => nav({ name: 'client', id: client.team_id! })}>{client.team_name}</button>
                    : null}
                </Row>
                <Row label="Nacionalidad" value={client.nationality} />
                <Row label="Nacimiento" value={client.birth_date ? `${formatDate(client.birth_date)}${age !== null ? ` (${age} años)` : ''}` : null} />
                <Row label="Licencia" value={client.license_number} />
              </>
            )}
            {kind === 'equipo' && (
              <>
                <Row label="Persona de contacto" value={[client.contact_name, client.contact_role && `(${client.contact_role})`].filter(Boolean).join(' ') || null} />
                <Row label="Categoría" value={client.category} />
                <Row label="Marca" value={client.brand} />
                <Row label="Web" value={client.website} />
              </>
            )}
            <Row label="Email" value={client.email} />
            <Row label="Teléfono" value={client.phone} />
            <Row label="Instagram" value={client.instagram ? `@${client.instagram}` : null} />
            <Row label="NIF / CIF" value={client.tax_id} />
            <Row label="Dirección" value={client.address} />
            <Row label="Alta" value={formatDate(client.created_at.slice(0, 10))} />
          </dl>
          {minor && (
            <div className="minor-box standalone">
              <strong>Menor de edad ({age} años)</strong>
              <p className="small">Necesitas la autorización del tutor para usar sus imágenes.</p>
              <dl className="data-list">
                <Row label="Tutor" value={client.guardian_name} />
                <Row label="Teléfono" value={client.guardian_phone} />
              </dl>
            </div>
          )}
          {client.notes && (
            <>
              <h2>Notas</h2>
              <p className="notes-text">{client.notes}</p>
            </>
          )}
          {kind === 'equipo' && (
            <>
              <h2>Pilotos</h2>
              {client.pilots.length ? (
                <ul className="pilot-list">
                  {client.pilots.map((p) => (
                    <li key={p.id}>
                      <button className="pilot-link" onClick={() => nav({ name: 'client', id: p.id })}>
                        {p.racing_number && <span className="dorsal">{p.racing_number}</span>}{p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Ningún piloto asignado todavía. Indica este equipo en la ficha de cada piloto.</p>
              )}
            </>
          )}
        </section>

        <section className="client-activity">
          <h2>Sesiones</h2>
          {sessions.length ? (
            <div className="card-grid">
              {sessions.map((s) => <SessionCard key={s.id} s={s} onOpen={() => nav({ name: 'session', id: s.id })} />)}
            </div>
          ) : (
            <p className="muted small">Todavía no hay sesiones de este cliente.</p>
          )}

          {photos.length > 0 && (
            <>
              <h2>Fotos recientes</h2>
              <div className="photo-results">
                {photos.map((p) => (
                  <button key={p.id} className="photo-result" onClick={() => nav({ name: 'session', id: p.session_id, photoId: p.id })}
                    title={`${p.file_name} — ${p.session_title}`}>
                    <img src={api.mediaUrl(p.thumb_key)} loading="lazy" alt={p.file_name} />
                    <span className="muted small">{p.session_title}</span>
                  </button>
                ))}
              </div>
              {photoCount > photos.length && (
                <button className="ghost" onClick={() => nav({ name: 'library', clientId: id })}>
                  Ver las {photoCount.toLocaleString('es-ES')} fotos
                </button>
              )}
            </>
          )}

          <h2>Presupuestos y facturas</h2>
          {invoices.length ? (
            <table className="table">
              <thead><tr><th>Número</th><th>Tipo</th><th>Fecha</th><th className="n">Total</th><th>Estado</th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="clickable" onClick={() => nav({ name: 'invoices', openId: i.id })}>
                    <td><strong>{displayNumber(i.number)}</strong></td>
                    <td>{i.kind === 'factura' ? 'Factura' : 'Presupuesto'}</td>
                    <td>{formatDate(i.issue_date)}</td>
                    <td className="n">{formatMoney(i.total)}</td>
                    <td><span className={`badge inv-${i.status}`}>{INVOICE_STATUS_LABEL[i.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small">
              Sin presupuestos ni facturas.{' '}
              <button className="link" onClick={() => nav({ name: 'invoices', newForClient: id })}>Crear un presupuesto</button>
            </p>
          )}
        </section>
      </div>

      {editing && <ClientForm client={client} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}
    </div>
  )
}
