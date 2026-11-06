/**
 * Proceso auxiliar (Electron utilityProcess) que hace todo el trabajo con sharp/libvips.
 *
 * sharp no se carga en el proceso principal: en Linux, su libvips choca con las
 * librerías GLib/GTK que carga Electron y puede abortar toda la app. Aquí, además,
 * un fallo con una imagen concreta no tumba la aplicación ni bloquea la interfaz.
 */
import sharp from 'sharp'
import { readRawPreview } from './raw'
import type { ImageJob, ImageJobResult } from './imageJobs'

/** Ángulo de rotación para cada valor de orientación EXIF (solo rotaciones). */
const ORIENTATION_ANGLE: Record<number, number> = { 3: 180, 6: 90, 8: 270 }
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

sharp.cache(false) // el proceso vive mucho; no acumular memoria entre imágenes

async function run(job: ImageJob): Promise<ImageJobResult> {
  switch (job.op) {
    case 'renditions': {
      // Para RAW se trabaja con la vista previa JPEG incrustada; el original no se modifica.
      const source: string | Buffer = job.isRaw ? await readRawPreview(job.src) : job.src
      const meta = await sharp(source).metadata()
      // Las vistas previas de RAW no suelen llevar orientación propia: se usa la del RAW.
      const orientation = meta.orientation ?? (job.isRaw ? job.exifOrientation || 1 : 1)
      const angle = meta.orientation ? undefined : ORIENTATION_ANGLE[orientation]
      const rotated = orientation >= 5
      const pipeline = () => (angle === undefined ? sharp(source).rotate() : sharp(source).rotate(angle))
      await pipeline().resize(480, 480, { fit: 'inside' }).webp({ quality: 78 }).toFile(job.thumbPath)
      await pipeline().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(job.previewPath)
      return {
        width: (rotated ? meta.height : meta.width) ?? null,
        height: (rotated ? meta.width : meta.height) ?? null
      }
    }
    case 'gallery': {
      let img = sharp(job.src).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      if (job.watermark) {
        const { data, info } = await img.toBuffer({ resolveWithObject: true })
        const size = Math.round(Math.min(info.width, info.height) / 11)
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">
          <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif"
            font-size="${size}" font-weight="700" fill="#fff" fill-opacity="0.38" stroke="#000" stroke-opacity="0.18" stroke-width="${Math.max(1, size / 30)}"
            transform="rotate(-24 ${info.width / 2} ${info.height / 2})">${esc(job.watermark)}</text></svg>`
        img = sharp(data).composite([{ input: Buffer.from(svg) }])
      }
      const webp = await img.webp({ quality: 78 }).toBuffer()
      return { dataUrl: `data:image/webp;base64,${webp.toString('base64')}` }
    }
    case 'logo': {
      const png = await sharp(job.src).resize(600, 300, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
      return { dataUrl: `data:image/png;base64,${png.toString('base64')}` }
    }
  }
}

process.parentPort.on('message', async (e) => {
  const { id, job } = e.data as { id: number; job: ImageJob }
  try {
    process.parentPort.postMessage({ id, ok: true, result: await run(job) })
  } catch (err) {
    process.parentPort.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})
