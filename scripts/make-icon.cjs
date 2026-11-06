// Genera build/icon.png (512×512) a partir de un SVG: obturador dorado sobre fondo oscuro.
const sharp = require('sharp')
const path = require('node:path')
// Diafragma: abertura hexagonal y líneas de las láminas prolongando cada lado hasta el borde.
const C = 256, R = 150, r = 58
const hex = Array.from({ length: 6 }, (_, i) => {
  const a = ((i * 60 + 15) * Math.PI) / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
})
const lines = hex.map(([x, y], i) => {
  const [px, py] = hex[(i + 5) % 6]
  let dx = x - px, dy = y - py
  const len = Math.hypot(dx, dy); dx /= len; dy /= len
  // Intersección del rayo (x,y)+t·d con la circunferencia de radio R.
  const fx = x - C, fy = y - C
  const b = fx * dx + fy * dy, c = fx * fx + fy * fy - R * R
  const t = -b + Math.sqrt(b * b - c)
  return `<line x1="${x}" y1="${y}" x2="${x + t * dx}" y2="${y + t * dy}" stroke="#1e2025" stroke-width="7" stroke-linecap="round"/>`
}).join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs><radialGradient id="g" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#f0c060"/><stop offset="1" stop-color="#b98327"/></radialGradient></defs>
  <rect x="16" y="16" width="480" height="480" rx="108" fill="#1e2025"/>
  <circle cx="${C}" cy="${C}" r="186" fill="none" stroke="#d9a441" stroke-width="16"/>
  <circle cx="${C}" cy="${C}" r="${R}" fill="url(#g)"/>
  ${lines}
  <polygon points="${hex.map((p) => p.join(',')).join(' ')}" fill="#121317"/>
  <circle cx="${C - 18}" cy="${C - 20}" r="12" fill="#fff" fill-opacity="0.35"/>
</svg>`
sharp(Buffer.from(svg)).png().toFile(path.join(__dirname, '..', 'build', 'icon.png')).then(() => console.log('build/icon.png'))
