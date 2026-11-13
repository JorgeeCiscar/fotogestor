import { copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

/**
 * Abstracción del almacenamiento de ficheros. Las fotos se identifican por una
 * "key" relativa (p. ej. "sessions/3/originals/IMG_001.jpg"), de modo que más
 * adelante se pueda sustituir el disco local por S3, R2, Dropbox, etc.
 */
export interface PhotoStorage {
  /** Ruta absoluta donde escribir/leer una key en local. */
  resolve(key: string): string
  put(srcPath: string, key: string): Promise<void>
  remove(key: string): Promise<void>
}

export class LocalStorage implements PhotoStorage {
  constructor(private readonly root: string) {}

  resolve(key: string): string {
    const abs = resolve(this.root, key)
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new Error(`Key fuera de la biblioteca: ${key}`)
    }
    return abs
  }

  async put(srcPath: string, key: string): Promise<void> {
    const dest = this.resolve(key)
    await mkdir(dirname(dest), { recursive: true })
    await copyFile(srcPath, dest)
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true, recursive: true })
  }

  async ensureDir(key: string): Promise<string> {
    const abs = this.resolve(key)
    await mkdir(abs, { recursive: true })
    return abs
  }

  get rootDir(): string {
    return this.root
  }
}

export const sessionKey = (sessionId: number, ...parts: string[]): string =>
  join('sessions', String(sessionId), ...parts).split(sep).join('/')

/** Ruta del original: dentro de la biblioteca o donde esté si la foto está enlazada. */
export function originalPath(storage: LocalStorage, p: { original_key: string; external_path: string | null }): string {
  return p.external_path ? p.external_path : storage.resolve(p.original_key)
}
