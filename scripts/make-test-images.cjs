const sharp = require('sharp')
const out = process.argv[2]
const colors = [[200,120,60],[60,120,200],[90,170,110],[180,60,120],[220,200,80],[70,70,90],[150,100,200],[40,160,170]]
;(async () => {
  for (let i = 0; i < colors.length; i++) {
    const [r,g,b] = colors[i]
    const svg = `<svg width="1800" height="1200"><defs><radialGradient id="g"><stop offset="0" stop-color="rgb(${r},${g},${b})"/><stop offset="1" stop-color="#111"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${600+i*80}" cy="600" r="220" fill="rgba(255,255,255,.25)"/></svg>`
    await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).withExifMerge({ IFD0: { Make: 'Fujifilm', Model: 'X-T5' }, IFD2: { ISO: '400', FNumber: '28/10', ExposureTime: '1/250', FocalLength: '56/1', DateTimeOriginal: `2026:10:1${i} 12:00:00`, LensModel: 'XF56mmF1.2 R WR' } })
      .toFile(`${out}/DSCF${1000+i}.jpg`)
  }
})()
