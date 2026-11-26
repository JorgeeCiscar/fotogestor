import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Session } from './server'

export interface Cipher {
  available(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

/**
 * Sesión del usuario guardada en disco. Se cifra con el almacén seguro del sistema
 * (DPAPI en Windows, a través de safeStorage de Electron); si no está disponible
 * (p. ej. Linux sin llavero) se guarda sin cifrar.
 */
export class SessionStore {
  private file: string
  constructor(private dir: string, private cipher: Cipher) {
    this.file = join(dir, 'session.bin')
  }

  async load(): Promise<Session | null> {
    const data = await readFile(this.file).catch(() => null)
    if (!data?.length) return null
    try {
      const enc = data[0] === 1
      const text = enc ? this.cipher.decrypt(data.subarray(1)) : data.subarray(1).toString('utf8')
      const s = JSON.parse(text) as Session
      return s?.refresh_token && s.user?.id ? s : null
    } catch {
      return null
    }
  }

  async save(s: Session): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const text = JSON.stringify(s)
    const enc = this.cipher.available()
    const body = enc ? this.cipher.encrypt(text) : Buffer.from(text, 'utf8')
    await writeFile(this.file, Buffer.concat([Buffer.from([enc ? 1 : 0]), body]))
  }

  async clear(): Promise<void> {
    await rm(this.file, { force: true })
  }
}
