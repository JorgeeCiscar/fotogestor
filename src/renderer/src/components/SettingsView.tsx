import { FormEvent, useEffect, useState } from 'react'
import type { Settings } from '../../../shared/types'
import { api, errorMessage } from '../util'
import { describeUpdate, useUpdateStatus } from './UpdateBanner'

export default function SettingsView() {
  const [form, setForm] = useState<Settings | null>(null)
  const [msg, setMsg] = useState('')
  const [version, setVersion] = useState('')
  const update = useUpdateStatus()
  useEffect(() => { api.settings.get().then(setForm); api.app.version().then(setVersion) }, [])
  if (!form) return null
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      setForm(await api.settings.save({ ...form!, default_tax_rate: Number(form!.default_tax_rate), default_irpf_rate: Number(form!.default_irpf_rate) }))
      setMsg('Ajustes guardados')
    } catch (err) { setMsg(errorMessage(err)) }
  }
  async function chooseLogo() {
    const url = await api.settings.chooseLogo()
    if (url) setForm({ ...form!, logo_data_url: url })
  }

  return (
    <div className="page narrow">
      <header className="page-header"><h1>Ajustes</h1></header>
      <form className="form" onSubmit={submit}>
        <h2>Tu negocio</h2>
        <p className="muted small">Aparece en presupuestos, facturas y en las galerías para clientes.</p>
        <div className="row">
          <label>Nombre comercial<input value={form.business_name} onChange={set('business_name')} placeholder="Estudio Fotográfico…" /></label>
          <label>NIF / CIF<input value={form.business_tax_id} onChange={set('business_tax_id')} /></label>
        </div>
        <label>Dirección<textarea rows={2} value={form.business_address} onChange={set('business_address')} /></label>
        <div className="row">
          <label>Email<input type="email" value={form.business_email} onChange={set('business_email')} /></label>
          <label>Teléfono<input value={form.business_phone} onChange={set('business_phone')} /></label>
        </div>
        <div className="logo-row">
          {form.logo_data_url ? <img src={form.logo_data_url} alt="Logotipo" /> : <span className="muted small">Sin logotipo</span>}
          <button type="button" onClick={chooseLogo}>Elegir logotipo…</button>
          {form.logo_data_url && <button type="button" className="ghost danger" onClick={() => setForm({ ...form, logo_data_url: '' })}>Quitar</button>}
        </div>

        <h2>Facturación</h2>
        <div className="row">
          <label>IVA por defecto (%)<input type="number" min="0" max="100" step="0.01" value={form.default_tax_rate} onChange={set('default_tax_rate')} /></label>
          <label>Retención IRPF por defecto (%)<input type="number" min="0" max="100" step="0.01" value={form.default_irpf_rate} onChange={set('default_irpf_rate')} /></label>
        </div>
        <label>IBAN (aparece en las facturas)<input value={form.business_iban} onChange={set('business_iban')} placeholder="ES00 0000 0000 0000 0000 0000" /></label>
        <label>Pie de página de facturas<textarea rows={2} value={form.invoice_footer} onChange={set('invoice_footer')}
          placeholder="Ej.: Inscrito en el Registro Mercantil… / Condiciones de pago…" /></label>

        <h2>Galerías para clientes</h2>
        <label>Texto de la marca de agua<input value={form.watermark_text} onChange={set('watermark_text')}
          placeholder={form.business_name || 'Si se deja vacío se usa el nombre comercial'} /></label>

        <h2>Actualizaciones</h2>
        <div className="update-row">
          <div>
            <div>FotoGestor <strong>v{version}</strong></div>
            <div className="muted small">{describeUpdate(update)}</div>
          </div>
          {update.state === 'downloaded' ? (
            <button type="button" className="primary" onClick={() => api.app.installUpdate()}>Reiniciar y actualizar</button>
          ) : (
            <button type="button" onClick={() => api.app.checkForUpdates()}
              disabled={['checking', 'downloading', 'disabled'].includes(update.state)}>Buscar actualizaciones</button>
          )}
        </div>

        <footer>
          {msg && <span className="muted">{msg}</span>}
          <button type="submit" className="primary">Guardar ajustes</button>
        </footer>
      </form>
    </div>
  )
}
