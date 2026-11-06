import { mkdir, readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, parse } from 'node:path'
import type Database from 'better-sqlite3'
import sharp from 'sharp'
import exifr from 'exifr'
import type { ImportProgress, ImportResult } from '../shared/types'
import { LocalStorage, sessionKey } from './storage'

export const SUPPORTED_EXT = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']

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

function formatShutter(t?: number): string | null {
  if (!t) return null
  return t >= 1 ? `${t}s` : `1/${Math.round(1 / t)}s`
}

export async function importPhotos(
  db: Database.Database,
  storage: LocalStorage,
  sessionId: number,
  files: string[],
  onProgress: (p: ImportProgress) => void
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] }
  const exists = db.prepare('SELECT 1 FROM photos WHERE session_id = ? AND file_name = ? AND file_size = ?')
  const nameTaken = db.prepare('SELECT 1 FROM photos WHERE session_id = ? AND original_key = ?')
  const insert = db.prepare(`
    INSERT INTO photos (session_id, file_name, original_key, thumb_key, preview_key, file_size,
      width, height, taken_at, camera, lens, iso, aperture, shutter, focal_length)
    VALUES (@session_id, @file_name, @original_key, @thumb_key, @preview_key, @file_size,
      @width, @height, @taken_at, @camera, @lens, @iso, @aperture, @shutter, @focal_length)`)

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
      for (let n = 2; nameTaken.get(sessionId, sessionKey(sessionId, 'originals', storedName)); n++) {
        storedName = `${name}_${n}${ext}`
      }
      const originalKey = sessionKey(sessionId, 'originals', storedName)
      const thumbKey = sessionKey(sessionId, 'thumbs', `${parse(storedName).name}.webp`)
      const previewKey = sessionKey(sessionId, 'previews', `${parse(storedName).name}.webp`)

      await storage.put(src, originalKey)
      const abs = storage.resolve(originalKey)
      for (const k of [thumbKey, previewKey]) await mkdir(dirname(storage.resolve(k)), { recursive: true })

      const meta = await sharp(abs).metadata()
      const rotated = (meta.orientation ?? 1) >= 5
      await sharp(abs).rotate().resize(480, 480, { fit: 'inside' }).webp({ quality: 78 }).toFile(storage.resolve(thumbKey))
      await sharp(abs).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(storage.resolve(previewKey))

      const exif = await exifr.parse(abs, { pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel', 'ISO', 'FNumber', 'ExposureTime', 'FocalLength'] }).catch(() => null)
      const camera = [exif?.Make, exif?.Model].filter(Boolean).join(' ').trim() || null

      insert.run({
        session_id: sessionId,
        file_name: fileName,
        original_key: originalKey,
        thumb_key: thumbKey,
        preview_key: previewKey,
        file_size: size,
        width: (rotated ? meta.height : meta.width) ?? null,
        height: (rotated ? meta.width : meta.height) ?? null,
        taken_at: exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.toISOString() : null,
        camera,
        lens: exif?.LensModel ?? null,
        iso: exif?.ISO ?? null,
        aperture: exif?.FNumber ?? null,
        shutter: formatShutter(exif?.ExposureTime),
        focal_length: exif?.FocalLength ?? null
      })
      result.imported++
    } catch (err) {
      result.errors.push({ file: fileName, message: err instanceof Error ? err.message : String(err) })
    }
  }
  onProgress({ sessionId, done: files.length, total: files.length, current: '' })
  return result
}
