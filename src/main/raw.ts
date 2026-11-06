import { readFile } from 'node:fs/promises'

export const RAW_EXT = ['.cr2', '.cr3', '.crw', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.raf', '.dng', '.orf', '.rw2', '.pef', '.srw', '.x3f', '.3fr', '.iiq', '.erf', '.mef', '.mos', '.kdc', '.rwl']

const isRaw = (ext: string) => RAW_EXT.includes(ext.toLowerCase())
export { isRaw }

interface Candidate { start: number; end: number; width: number; height: number }

/**
 * Recorre los segmentos de un JPEG que empieza en `start` (marcador SOI).
 * Devuelve sus límites y dimensiones si es un JPEG baseline/progresivo válido
 * (descarta el "lossless JPEG" que algunas cámaras usan para los datos RAW).
 */
function parseJpegAt(buf: Buffer, start: number): Candidate | null {
  let i = start + 2
  let width = 0
  let height = 0
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null
    const marker = buf[i + 1]
    if (marker === 0xff) { i++; continue } // relleno
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    const len = buf.readUInt16BE(i + 2)
    if (len < 2) return null
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      height = buf.readUInt16BE(i + 5)
      width = buf.readUInt16BE(i + 7)
    } else if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return null // lossless / aritmético: no es una previsualización
    }
    if (marker === 0xda) {
      // Datos comprimidos: buscar EOI saltando bytes de relleno (FF00) y marcadores RST.
      let j = i + 2 + len
      while (j + 1 < buf.length) {
        if (buf[j] === 0xff) {
          const m = buf[j + 1]
          if (m === 0xd9) return width && height ? { start, end: j + 2, width, height } : null
          if (m === 0x00 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { j += m === 0xff ? 1 : 2; continue }
          // Otro marcador (p. ej. otro SOS en progresivos): continuar el recorrido de segmentos.
          i = j
          break
        }
        j++
      }
      if (j + 1 >= buf.length) return null
      continue
    }
    i += 2 + len
  }
  return null
}

/** Extrae la vista previa JPEG más grande incrustada en un fichero RAW. */
export function extractLargestJpeg(buf: Buffer): Buffer | null {
  let best: Candidate | null = null
  let pos = 0
  const soi = Buffer.from([0xff, 0xd8, 0xff])
  while ((pos = buf.indexOf(soi, pos)) !== -1) {
    const c = parseJpegAt(buf, pos)
    if (c) {
      if (!best || c.width * c.height > best.width * best.height) best = c
      pos = c.end
    } else {
      pos += 3
    }
  }
  return best ? buf.subarray(best.start, best.end) : null
}

export async function readRawPreview(path: string): Promise<Buffer> {
  const jpeg = extractLargestJpeg(await readFile(path))
  if (!jpeg) throw new Error('No se encontró una vista previa en el fichero RAW')
  return jpeg
}
