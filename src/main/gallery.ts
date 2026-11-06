import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GalleryExportOptions, Photo, Session, Settings } from '../shared/types'
import { transaction, type DB } from './db'
import { imageJob } from './imageJobs'
import { getSettings } from './settings'
import type { LocalStorage } from './storage'

const CODE_PREFIX = 'FOTOGESTOR-SELECCION'
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
/** JSON seguro para incrustar dentro de <script>. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '')

async function galleryImage(path: string, watermark: string): Promise<string> {
  return (await imageJob({ op: 'gallery', src: path, watermark })).dataUrl
}

export function galleryHtml(session: Session, settings: Settings, photos: { id: number; name: string; src: string }[]): string {
  const data = {
    galleryId: `${session.id}`,
    code: CODE_PREFIX,
    title: session.title,
    email: settings.business_email,
    business: settings.business_name,
    photos
  }
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(session.title)}${settings.business_name ? ' · ' + esc(settings.business_name) : ''}</title>
<style>
  :root { --bg:#faf8f5; --text:#222; --muted:#777; --accent:#c0392b; color-scheme: light; }
  * { box-sizing: border-box; } body { margin:0; background:var(--bg); color:var(--text); font-family: Georgia, 'Times New Roman', serif; }
  header { text-align:center; padding:48px 16px 28px; } header img { max-height:64px; max-width:240px; margin-bottom:18px; }
  h1 { font-weight:400; font-size:clamp(26px,5vw,42px); margin:0 0 10px; letter-spacing:.02em; }
  .sub { color:var(--muted); font-family: system-ui, sans-serif; font-size:14px; line-height:1.6; max-width:560px; margin:0 auto; }
  .grid { columns: 4 260px; column-gap:12px; padding:0 16px 120px; max-width:1500px; margin:0 auto; }
  .item { position:relative; margin:0 0 12px; break-inside:avoid; cursor:zoom-in; }
  .item img { width:100%; display:block; border-radius:2px; }
  .heart { position:absolute; right:8px; bottom:8px; width:42px; height:42px; border-radius:50%; border:none; cursor:pointer;
    background:rgba(255,255,255,.88); font-size:20px; line-height:42px; color:#999; box-shadow:0 2px 8px rgba(0,0,0,.15); }
  .heart.on { color:var(--accent); background:#fff; }
  .bar { position:fixed; left:0; right:0; bottom:0; background:#fff; border-top:1px solid #e6e1da; padding:14px 16px;
    display:flex; justify-content:center; align-items:center; gap:18px; font-family:system-ui,sans-serif; font-size:15px; }
  .btn { background:#222; color:#fff; border:none; padding:11px 20px; border-radius:99px; font-size:15px; cursor:pointer; text-decoration:none; }
  .btn.light { background:#eee; color:#222; }
  .lb { position:fixed; inset:0; background:rgba(15,15,15,.96); display:none; align-items:center; justify-content:center; z-index:10; }
  .lb.open { display:flex; } .lb img { max-width:94vw; max-height:84vh; }
  .lb .nav { position:absolute; top:50%; transform:translateY(-50%); background:none; border:none; color:#fff; font-size:44px; cursor:pointer; padding:20px; }
  .lb .prev { left:0 } .lb .next { right:0 } .lb .close { position:absolute; top:10px; right:14px; background:none; border:none; color:#fff; font-size:30px; cursor:pointer; }
  .lb .heart { position:absolute; bottom:22px; left:50%; right:auto; transform:translateX(-50%); width:56px; height:56px; font-size:26px; line-height:56px; }
  .lb .count { position:absolute; top:18px; left:20px; color:#bbb; font-family:system-ui,sans-serif; font-size:14px; }
  .panel { position:fixed; inset:0; background:rgba(0,0,0,.5); display:none; align-items:center; justify-content:center; z-index:20; padding:16px; }
  .panel.open { display:flex; }
  .card { background:#fff; border-radius:10px; padding:26px; width:min(520px,100%); font-family:system-ui,sans-serif; max-height:90vh; overflow:auto; }
  .card h2 { margin:0 0 8px; font-family:Georgia,serif; font-weight:400; } .card p { color:#555; line-height:1.5; }
  textarea { width:100%; height:90px; font-family:ui-monospace,monospace; font-size:12px; padding:10px; border:1px solid #ddd; border-radius:6px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; }
  ul { padding-left:18px; color:#555; font-size:13px; max-height:160px; overflow:auto; }
</style></head><body>
<header>
  ${settings.logo_data_url ? `<img src="${settings.logo_data_url}" alt="">` : ''}
  <h1>${esc(session.title)}</h1>
  <p class="sub">Pulsa el corazón en tus fotos favoritas. Tu selección se guarda en este navegador aunque cierres la página.
  Cuando termines, pulsa <strong>Enviar selección</strong>.</p>
</header>
<main class="grid" id="grid"></main>
<div class="bar"><span id="counter">0 favoritas</span><button class="btn" id="send">Enviar selección</button></div>
<div class="lb" id="lb"><span class="count" id="lbCount"></span><button class="close" id="lbClose" aria-label="Cerrar">✕</button>
  <button class="nav prev" id="lbPrev" aria-label="Anterior">‹</button><img id="lbImg" alt=""><button class="nav next" id="lbNext" aria-label="Siguiente">›</button>
  <button class="heart" id="lbHeart" aria-label="Favorita">♥</button></div>
<div class="panel" id="panel"><div class="card">
  <h2>Tu selección</h2>
  <p id="panelText"></p>
  <textarea id="code" readonly></textarea>
  <div class="row"><button class="btn" id="copy">Copiar código</button><a class="btn light" id="mail" href="#">Enviar por correo</a><button class="btn light" id="closePanel">Seguir eligiendo</button></div>
  <ul id="names"></ul>
</div></div>
<script>
const G = ${scriptJson(data)};
const KEY = 'fotogestor-galeria-' + G.galleryId;
let fav = new Set();
try { fav = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...fav])); } catch (e) {} };
const $ = (id) => document.getElementById(id);
let cur = -1;
function render() {
  $('counter').textContent = fav.size + (fav.size === 1 ? ' favorita' : ' favoritas');
  document.querySelectorAll('.item .heart').forEach((b) => b.classList.toggle('on', fav.has(Number(b.dataset.id))));
  if (cur >= 0) $('lbHeart').classList.toggle('on', fav.has(G.photos[cur].id));
}
function toggle(id) { fav.has(id) ? fav.delete(id) : fav.add(id); save(); render(); }
const grid = $('grid');
G.photos.forEach((p, i) => {
  const d = document.createElement('div'); d.className = 'item';
  const img = document.createElement('img'); img.src = p.src; img.alt = p.name; img.loading = 'lazy';
  const h = document.createElement('button'); h.className = 'heart'; h.textContent = '♥'; h.dataset.id = p.id; h.setAttribute('aria-label', 'Favorita');
  h.onclick = (e) => { e.stopPropagation(); toggle(p.id); };
  d.onclick = () => open(i); d.append(img, h); grid.append(d);
});
function open(i) { cur = (i + G.photos.length) % G.photos.length; $('lbImg').src = G.photos[cur].src; $('lbCount').textContent = (cur + 1) + ' / ' + G.photos.length; $('lb').classList.add('open'); render(); }
function close() { cur = -1; $('lb').classList.remove('open'); }
$('lbPrev').onclick = () => open(cur - 1); $('lbNext').onclick = () => open(cur + 1); $('lbClose').onclick = close;
$('lbHeart').onclick = () => toggle(G.photos[cur].id);
document.addEventListener('keydown', (e) => {
  if (cur < 0) return;
  if (e.key === 'ArrowLeft') open(cur - 1); else if (e.key === 'ArrowRight') open(cur + 1);
  else if (e.key === 'Escape') close(); else if (e.key === ' ' || e.key.toLowerCase() === 'f') { e.preventDefault(); toggle(G.photos[cur].id); }
});
$('send').onclick = () => {
  const chosen = G.photos.filter((p) => fav.has(p.id));
  const code = G.code + ':' + G.galleryId + ':' + chosen.map((p) => p.id).join(',');
  $('code').value = code;
  $('panelText').textContent = chosen.length
    ? 'Has elegido ' + chosen.length + ' fotos. Copia este código y envíaselo a ' + (G.business || 'tu fotógrafo') + (G.email ? ' (' + G.email + ')' : '') + ', o pulsa «Enviar por correo».'
    : 'Todavía no has marcado ninguna foto como favorita.';
  $('names').innerHTML = ''; chosen.forEach((p) => { const li = document.createElement('li'); li.textContent = p.name; $('names').append(li); });
  const body = 'Hola, esta es mi selección (' + chosen.length + ' fotos):\\n\\n' + code + '\\n\\n' + chosen.map((p) => p.name).join('\\n');
  $('mail').href = 'mailto:' + encodeURIComponent(G.email || '') + '?subject=' + encodeURIComponent('Selección: ' + G.title) + '&body=' + encodeURIComponent(body);
  $('panel').classList.add('open');
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('code').value); } catch (e) { $('code').select(); document.execCommand('copy'); }
  $('copy').textContent = '¡Copiado!'; setTimeout(() => ($('copy').textContent = 'Copiar código'), 2000);
};
$('closePanel').onclick = () => $('panel').classList.remove('open');
render();
</script></body></html>`
}

export function parseSelection(text: string): { sessionId: number | null; ids: number[]; names: string[] } {
  const m = text.match(new RegExp(`${CODE_PREFIX}:(\\d+):([\\d,]*)`))
  if (m) return { sessionId: Number(m[1]), ids: m[2].split(',').filter(Boolean).map(Number), names: [] }
  const names = text.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean)
  return { sessionId: null, ids: [], names }
}

export function registerGalleryIpc(db: DB, storage: LocalStorage): void {
  ipcMain.handle('gallery:export', async (e, sessionId: number, opts: GalleryExportOptions) => {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as unknown as Session | undefined
    if (!session) throw new Error('La sesión no existe')
    const where = opts.scope === 'picks' ? "flag = 'pick'" : "(flag IS NULL OR flag = 'pick')"
    const photos = db.prepare(`SELECT * FROM photos WHERE session_id = ? AND ${where} ORDER BY taken_at IS NULL, taken_at, file_name`)
      .all(sessionId) as unknown as Photo[]
    if (!photos.length) throw new Error(opts.scope === 'picks' ? 'No hay fotos elegidas (marca alguna con P)' : 'No hay fotos para la galería')

    const win = BrowserWindow.fromWebContents(e.sender)!
    const safeName = session.title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'galeria'
    const res = await dialog.showSaveDialog(win, {
      title: 'Guardar galería para el cliente',
      defaultPath: join(app.getPath('documents'), `Galería - ${safeName}.html`),
      filters: [{ name: 'Página web', extensions: ['html'] }]
    })
    if (res.canceled || !res.filePath) return null

    const settings = getSettings(db)
    const watermark = opts.watermark ? settings.watermark_text || settings.business_name : ''
    const items = []
    for (const p of photos) {
      e.sender.send('gallery:progress', { done: items.length, total: photos.length })
      items.push({ id: p.id, name: p.file_name, src: await galleryImage(storage.resolve(p.preview_key), watermark) })
    }
    await writeFile(res.filePath, galleryHtml(session, settings, items), 'utf8')
    return { file: res.filePath, count: items.length }
  })

  ipcMain.handle('gallery:importSelection', (_e, sessionId: number, text: string) => {
    const sel = parseSelection(text)
    if (sel.sessionId !== null && sel.sessionId !== sessionId) throw new Error('Este código de selección pertenece a otra sesión')
    const photos = db.prepare('SELECT id, file_name FROM photos WHERE session_id = ?').all(sessionId) as { id: number; file_name: string }[]
    const byName = new Map(photos.map((p) => [p.file_name.toLowerCase(), p.id]))
    const valid = new Set(photos.map((p) => p.id))
    const wanted = sel.ids.length ? sel.ids : sel.names.map((n) => byName.get(n.toLowerCase()) ?? -1)
    const matched = wanted.filter((id) => valid.has(id))
    if (!matched.length) throw new Error('No se ha reconocido ninguna foto de esta sesión en el texto pegado')
    transaction(db, () => {
      db.prepare('UPDATE photos SET client_pick = 0 WHERE session_id = ?').run(sessionId)
      const stmt = db.prepare('UPDATE photos SET client_pick = 1 WHERE id = ?')
      matched.forEach((id) => stmt.run(id))
    })
    return { matched: new Set(matched).size, unknown: wanted.length - matched.length }
  })
}
