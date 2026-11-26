import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { hostname, platform, release } from 'node:os'
import { join } from 'node:path'

/** Identificador del ordenador que da Windows (se mantiene aunque se reinstale la app). */
function windowsMachineGuid(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { windowsHide: true, timeout: 5000 }, (err, out) => {
        if (err) return resolve(null)
        const m = /MachineGuid\s+REG_SZ\s+([0-9a-f-]+)/i.exec(out)
        resolve(m ? m[1].toLowerCase() : null)
      })
  })
}

async function systemMachineId(): Promise<string | null> {
  if (process.platform === 'win32') return windowsMachineGuid()
  if (process.platform === 'linux') {
    for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      const id = (await readFile(f, 'utf8').catch(() => '')).trim()
      if (id) return id
    }
  }
  return null
}

/** Valor aleatorio propio, por si el sistema no da un identificador. */
async function storedRandomId(dir: string): Promise<string> {
  const file = join(dir, 'device-id')
  const prev = (await readFile(file, 'utf8').catch(() => '')).trim()
  if (prev) return prev
  const id = randomUUID()
  await mkdir(dir, { recursive: true })
  await writeFile(file, id)
  return id
}

export interface Device {
  /** Hash que identifica este ordenador ante el servidor (no revela el id original). */
  id: string
  name: string
  os: string
}

/**
 * Identificador del ordenador para el límite de equipos por suscripción. Fuera de la app
 * instalada se puede fijar con FOTOGESTOR_DEVICE_ID (pruebas).
 */
export async function getDevice(dir: string, appId: string, allowOverride: boolean): Promise<Device> {
  const override = allowOverride ? process.env.FOTOGESTOR_DEVICE_ID : undefined
  const raw = override || (await systemMachineId()) || (await storedRandomId(dir))
  const id = createHash('sha256').update(`${appId}:${raw}`).digest('hex').slice(0, 40)
  return { id, name: hostname() || 'Ordenador', os: `${platform()} ${release()}` }
}
