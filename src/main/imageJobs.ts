import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'

export type ImageJob =
  | { op: 'renditions'; src: string; isRaw: boolean; exifOrientation: number; thumbPath: string; previewPath: string }
  | { op: 'gallery'; src: string; watermark: string }
  | { op: 'logo'; src: string }

export type ImageJobResult = { width: number | null; height: number | null } | { dataUrl: string }
type ResultOf<T extends ImageJob['op']> = T extends 'renditions' ? { width: number | null; height: number | null } : { dataUrl: string }

let child: UtilityProcess | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function worker(): UtilityProcess {
  if (child) return child
  const proc = utilityProcess.fork(join(__dirname, 'imageWorker.js'), [], { serviceName: 'FotoGestor (imágenes)', stdio: 'inherit' })
  proc.on('message', (msg: { id: number; ok: boolean; result?: unknown; error?: string }) => {
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error))
  })
  proc.on('exit', (code) => {
    // Si el proceso cae (p. ej. una imagen corrupta), fallan sus trabajos y se relanza en el siguiente.
    if (child === proc) child = null
    for (const [id, p] of pending) { pending.delete(id); p.reject(new Error(`El procesador de imágenes se detuvo (código ${code})`)) }
  })
  child = proc
  return proc
}

/** Ejecuta un trabajo de imagen en el proceso auxiliar. */
export function imageJob<J extends ImageJob>(job: J): Promise<ResultOf<J['op']>> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    worker().postMessage({ id, job })
  })
}

export function stopImageWorker(): void {
  child?.kill()
  child = null
}
