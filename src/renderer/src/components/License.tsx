import { FormEvent, ReactNode, useEffect, useState } from 'react'
import type { LicensedState, LicenseState } from '../../../shared/license'
import { api, errorMessage } from '../util'
import { describeUpdate, useUpdateStatus } from './UpdateBanner'

export function useLicense(): LicenseState {
  const [state, setState] = useState<LicenseState>({ kind: 'checking' })
  useEffect(() => {
    const off = api.license.onState(setState)
    api.license.state().then(setState)
    return off
  }, [])
  return state
}

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const days = (n: number | null) => n === 1 ? '1 día' : `${n ?? 0} días`

/** Descripción del estado de la suscripción para Ajustes. */
export function describeLicense(s: LicensedState): string {
  switch (s.status) {
    case 'trial':
      return s.mode === 'full' ? `Prueba gratuita: quedan ${days(s.daysLeft)} (hasta el ${fmtDate(s.trialEnd)})` : 'La prueba gratuita ha terminado'
    case 'active':
      return s.periodEnd ? `Suscripción activa · se renueva el ${fmtDate(s.periodEnd)}` : 'Suscripción activa'
    case 'past_due':
      return 'Suscripción activa · el último cobro ha fallado, actualiza tu tarjeta'
    case 'cancelled':
      return s.mode === 'full' ? `Suscripción cancelada · sigue activa hasta el ${fmtDate(s.periodEnd)}` : 'La suscripción ha terminado'
    case 'expired':
      return 'La suscripción ha terminado'
  }
}

/** Muestra la app solo con una licencia válida (o con las licencias desactivadas). */
export function LicenseGate({ children }: { children: ReactNode }) {
  const s = useLicense()
  if (s.kind === 'disabled' || s.kind === 'licensed') return <>{children}</>
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="brand gate-brand"><span className="brand-mark">◉</span> FotoGestor</div>
        {s.kind === 'checking' && <p className="muted">Comprobando la licencia…</p>}
        {s.kind === 'signed-out' && <AuthForm email={s.email} notice={s.notice} />}
        {s.kind === 'offline' && <Offline message={s.message} />}
        {s.kind === 'device-limit' && <DeviceLimit state={s} />}
        {s.kind === 'update-required' && <UpdateRequired minVersion={s.minVersion} version={s.version} />}
        {s.kind === 'blocked' && <Blocked message={s.message} />}
      </div>
    </div>
  )
}

function RetryButton({ label = 'Reintentar' }: { label?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button className="primary" disabled={busy} onClick={async () => {
      setBusy(true)
      try { await api.license.refresh() } finally { setBusy(false) }
    }}>{busy ? 'Comprobando…' : label}</button>
  )
}

function AuthForm({ email: initialEmail, notice }: { email?: string; notice?: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialEmail ? 'login' : 'signup')
  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(notice ? { text: notice, error: false } : null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const r = mode === 'login' ? await api.license.login(email, password) : await api.license.signup(email, password)
      if (r.message) setMsg({ text: r.message, error: !r.ok })
      if (r.ok && r.message) { setMode('login'); setPassword('') }
    } catch (err) {
      setMsg({ text: errorMessage(err), error: true })
    } finally { setBusy(false) }
  }
  async function recover() {
    setBusy(true); setMsg(null)
    try {
      const r = await api.license.recover(email)
      setMsg({ text: r.message ?? '', error: !r.ok })
    } finally { setBusy(false) }
  }

  return (
    <form className="form gate-form" onSubmit={submit}>
      <div className="gate-tabs">
        <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setMsg(null) }}>Crear cuenta</button>
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setMsg(null) }}>Iniciar sesión</button>
      </div>
      {mode === 'signup' && <p className="muted small">Prueba FotoGestor gratis durante 7 días, con todas las funciones. No hace falta tarjeta.</p>}
      <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
      <label>Contraseña<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Al menos 8 caracteres' : ''} /></label>
      {msg && <p className={`gate-msg ${msg.error ? 'error' : 'info'}`}>{msg.text}</p>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Un momento…' : mode === 'login' ? 'Iniciar sesión' : 'Empezar la prueba gratuita'}
      </button>
      {mode === 'login' && <button type="button" className="ghost small" disabled={busy} onClick={recover}>¿Has olvidado la contraseña?</button>}
    </form>
  )
}

function Offline({ message }: { message: string }) {
  return (
    <>
      <h3>Sin conexión</h3>
      <p>{message}</p>
      <p className="muted small">FotoGestor comprueba tu suscripción al abrirse. Si pierdes la conexión mientras trabajas, puedes seguir hasta cerrar la app.</p>
      <RetryButton />
    </>
  )
}

function DeviceLimit({ state }: { state: Extract<LicenseState, { kind: 'device-limit' }> }) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  async function deactivate(id: string) {
    setBusy(id); setMsg('')
    try {
      const r = await api.license.deactivateDevice(id)
      if (!r.ok) setMsg(r.message ?? 'No se pudo desactivar')
    } finally { setBusy(null) }
  }
  return (
    <>
      <h3>Demasiados ordenadores</h3>
      <p>Tu suscripción se puede usar en {state.max} ordenadores a la vez. Desactiva uno para usar FotoGestor en este.</p>
      <ul className="gate-devices">
        {state.devices.map((d) => (
          <li key={d.id}>
            <div><strong>{d.name}</strong>
              <span className="muted small">{d.last_seen ? `Última vez: ${new Date(d.last_seen).toLocaleString('es-ES')}` : ''}</span></div>
            <button disabled={!!busy} onClick={() => deactivate(d.id)}>{busy === d.id ? 'Desactivando…' : 'Desactivar'}</button>
          </li>
        ))}
      </ul>
      {msg && <p className="gate-msg error">{msg}</p>}
      <button className="ghost small" onClick={() => api.license.logout()}>Cerrar sesión ({state.email})</button>
    </>
  )
}

function UpdateRequired({ minVersion, version }: { minVersion: string; version: string }) {
  const u = useUpdateStatus()
  return (
    <>
      <h3>Hay que actualizar</h3>
      <p>Esta versión de FotoGestor ({version}) ya no es compatible. Instala la versión {minVersion} o posterior para continuar.</p>
      <p className="muted small">{describeUpdate(u)}</p>
      {u.state === 'downloaded'
        ? <button className="primary" onClick={() => api.app.installUpdate()}>Reiniciar y actualizar</button>
        : <button className="primary" disabled={u.state === 'checking' || u.state === 'downloading' || u.state === 'disabled'}
            onClick={() => api.app.checkForUpdates()}>Buscar la actualización</button>}
    </>
  )
}

function Blocked({ message }: { message: string }) {
  return (
    <>
      <h3>No se puede abrir FotoGestor</h3>
      <p>{message}</p>
      <div className="gate-actions">
        <RetryButton />
        <button className="ghost" onClick={() => api.license.logout()}>Cerrar sesión</button>
      </div>
    </>
  )
}

/** Aviso en la barra lateral: prueba, solo lectura, pago pendiente o fin de la suscripción. */
export function LicenseBanner() {
  const s = useLicense()
  if (s.kind !== 'licensed') return null
  const subscribe = s.canSubscribe && <button className="primary" onClick={() => api.license.openCheckout()}>Suscribirse</button>
  const manage = (label: string) => s.canManage && <button onClick={() => api.license.openPortal()}>{label}</button>

  if (s.mode === 'readonly') {
    return (
      <div className="license-banner readonly">
        <strong>Modo solo lectura</strong>
        <span className="small">{s.status === 'trial' ? 'La prueba gratuita ha terminado.' : 'Tu suscripción ha terminado.'} Puedes ver y exportar tus datos; suscríbete para seguir creando y editando.</span>
        {subscribe}
      </div>
    )
  }
  if (s.status === 'trial') {
    return (
      <div className="license-banner">
        <strong>Prueba gratuita</strong>
        <span className="small">Quedan {days(s.daysLeft)}.</span>
        {subscribe}
      </div>
    )
  }
  if (s.status === 'past_due') {
    return (
      <div className="license-banner warn">
        <strong>Pago pendiente</strong>
        <span className="small">No se pudo cobrar la suscripción. Actualiza tu tarjeta para no perder el acceso.</span>
        {manage('Actualizar tarjeta')}
      </div>
    )
  }
  if (s.status === 'cancelled' && (s.daysLeft ?? 99) <= 7) {
    return (
      <div className="license-banner">
        <strong>Tu suscripción termina en {days(s.daysLeft)}</strong>
        {manage('Reactivar')}
      </div>
    )
  }
  return null
}

/** Apartado «Cuenta» en Ajustes. */
export function AccountSection() {
  const s = useLicense()
  const [msg, setMsg] = useState('')
  if (s.kind !== 'licensed') return null
  return (
    <section className="account">
      <h2>Cuenta y suscripción</h2>
      <div className="update-row">
        <div>
          <div><strong>{s.email}</strong></div>
          <div className="muted small license-status">{describeLicense(s)}</div>
          {msg && <div className="muted small">{msg}</div>}
        </div>
        <div className="account-actions">
          {s.canSubscribe && (s.status === 'trial' || s.status === 'expired' || s.mode === 'readonly') &&
            <button className="primary" onClick={() => api.license.openCheckout()}>Suscribirse</button>}
          {s.canManage && s.status !== 'trial' && <button onClick={() => api.license.openPortal()}>Gestionar suscripción</button>}
          <button onClick={async () => {
            setMsg('Comprobando…')
            const n = await api.license.refresh()
            setMsg(n.kind === 'licensed' && n.checkedAt === s.checkedAt
              ? 'No hay conexión con el servidor. Puedes seguir trabajando hasta cerrar la app.'
              : 'Licencia comprobada')
          }}>Comprobar de nuevo</button>
          <button className="ghost" onClick={() => api.license.logout()}>Cerrar sesión</button>
        </div>
      </div>
    </section>
  )
}
