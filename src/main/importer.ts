import { mkdir, readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, parse } from 'node:path'
import { normalizeExt, type DB } from './db'
import exifr from 'exifr'
import type { ImportProgress, ImportResult } from '../shared/types'
import { imageJob } from './imageJobs'
import { isRaw, RAW_EXT } from './raw'
import { LocalStorage, sessionKey } from './storage'

export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']
export const SUPPORTED_EXT = [...IMAGE_EXT, ...RAW_EXT]


/** Expande carpetas (recursivamente) y filtra extensiones soportadas. */
export async function collectFiles(paths: string[]): Promise<string[]> {
  const out: string[] = []
  for (const p of paths) {
    const s = await stat(p)
    if (s.isDirectory()) {
      const entries = await readdir(p)
      out.push(...(await collectFiles(entries.filter((e) => !e.startsWith('.')).map((e) => join(p, e)))))
    } else if (SUPPORTED_EXT.includes(extname(p).toLowerCase())) {
      out.push(p)
    }
  }
  return out.sort()
}

/** "NIKON CORPORATION" + "NIKON D3S" → "NIKON D3S"; "FUJIFILM" + "X-T5" → "FUJIFILM X-T5". */
function cameraName(make?: string, model?: string): string | null {
  const mk = make?.trim() ?? ''
  const md = model?.trim() ?? ''
  const brand = mk.split(/\s+/)[0]
  if (md && brand && md.toLowerCase().startsWith(brand.toLowerCase())) return md
  return [mk, md].filter(Boolean).join(' ') || null
}

function formatShutter(t?: number): string | null {
  if (!t) return null
  // Las cámaras muestran 0,6 s / 0,8 s en lugar de fracciones a partir de ~1/3 s.
  if (t >= 0.3) return `${String(Math.round(t * 10) / 10).replace('.', ',')}s`
  return `1/${Math.round(1 / t)}s`
}

export interface ImportOptions {
  /** false deja los originales donde están y solo guarda su ruta. */
  copy?: boolean
  runType?: string | null
  pilotId?: number | null
}

export async function importPhotos(
  db: DB,
  storage: LocalStorage,
  sessionId: number,
  dayId: number | null,
  files: string[],
  onProgress: (p: ImportProgress) => void,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const copy = options.copy !== false
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] }
  const exists = db.prepare('SELECT 1 FROM photos WHERE session_id = ? AND file_name = ? AND file_size = ?')
  const nameTaken = db.prepare('SELECT 1 FROM photos WHERE session_id = ? AND thumb_key = ?')
  const taken = new Set<string>()
  const assignPilot = db.prepare('INSERT OR IGNORE INTO photo_pilots (photo_id, client_id) VALUES (?, ?)')
  const insert = db.prepare(`
    INSERT INTO photos (session_id, file_name, original_key, external_path, thumb_key, preview_key, file_size,
      width, height, taken_at, camera, lens, iso, aperture, shutter, focal_length, is_raw, day_id, run_type, ext)
    VALUES (@session_id, @file_name, @original_key, @external_path, @thumb_key, @preview_key, @file_size,
      @width, @height, @taken_at, @camera, @lens, @iso, @aperture, @shutter, @focal_length, @is_raw, @day_id, @run_type, @ext)`)

  for (let i = 0; i < files.length; i++) {
    const src = files[i]
    const fileName = basename(src)
    onProgress({ sessionId, done: i, total: files.length, current: fileName })
    try {
      const { size } = await stat(src)
      if (exists.get(sessionId, fileName, size)) {
        result.skipped++
        continue
      }
      // Evita colisiones de nombre (mismo nombre, distinto fichero).
      const { name, ext } = parse(fileName)
      let storedName = fileName
      for (let n = 2; taken.has(storedName.toLowerCase()) || nameTaken.get(sessionId, sessionKey(sessionId, 'thumbs', `${storedName}.webp`)); n++) {
        storedName = `${name}_${n}${ext}`
      }
      taken.add(storedName.toLowerCase())
      const originalKey = sessionKey(sessionId, 'originals', storedName)
      // Incluye la extensión: IMG_1.CR3 e IMG_1.JPG (RAW+JPEG) no deben compartir miniatura.
      const thumbKey = sessionKey(sessionId, 'thumbs', `${storedName}.webp`)
      const previewKey = sessionKey(sessionId, 'previews', `${storedName}.webp`)

      // Enlazada: el original se queda donde está y solo se guarda su ruta.
      if (copy) await storage.put(src, originalKey)
      const abs = copy ? storage.resolve(originalKey) : src
      for (const k of [thumbKey, previewKey]) await mkdir(dirname(storage.resolve(k)), { recursive: true })

      const raw = isRaw(ext)
      const exif = await exifr
        .parse(abs, { translateValues: false, pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel', 'ISO', 'FNumber', 'ExposureTime', 'FocalLength', 'Orientation'] })
        .catch(() => null)

      const dims = await imageJob({
        op: 'renditions', src: abs, isRaw: raw, exifOrientation: Number(exif?.Orientation) || 1,
        thumbPath: storage.resolve(thumbKey), previewPath: storage.resolve(previewKey)
      })

      const camera = cameraName(exif?.Make, exif?.Model)

      const inserted = insert.run({
        session_id: sessionId,
        file_name: fileName,
        original_key: copy ? originalKey : '',
        external_path: copy ? null : src,
        run_type: options.runType ?? null,
        ext: normalizeExt(ext),
        thumb_key: thumbKey,
        preview_key: previewKey,
        file_size: size,
        width: dims.width,
        height: dims.height,
        taken_at: exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.toISOString() : null,
        camera,
        lens: exif?.LensModel ?? null,
        iso: exif?.ISO ?? null,
        aperture: exif?.FNumber ?? null,
        shutter: formatShutter(exif?.ExposureTime),
        focal_length: exif?.FocalLength ?? null,
        is_raw: raw ? 1 : 0,
        day_id: dayId
      })
      const photoId = Number(inserted.lastInsertRowid)
      if (options.pilotId) assignPilot.run(photoId, options.pilotId)
      result.imported++
    } catch (err) {
      result.errors.push({ file: fileName, message: err instanceof Error ? err.message : String(err) })
    }
  }
  onProgress({ sessionId, done: files.length, total: files.length, current: '' })
  return result
}
