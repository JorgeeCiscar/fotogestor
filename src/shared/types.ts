export type SessionStatus = 'planificada' | 'realizada' | 'editando' | 'entregada'
export const SESSION_STATUSES: SessionStatus[] = ['planificada', 'realizada', 'editando', 'entregada']

export type Flag = 'pick' | 'reject' | null

export interface Client {
  id: number
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
  session_count?: number
}
export type ClientInput = Omit<Client, 'id' | 'created_at' | 'session_count'> & { id?: number }

export interface Session {
  id: number
  client_id: number | null
  client_name?: string | null
  title: string
  type: string | null
  date: string | null
  location: string | null
  status: SessionStatus
  price: number | null
  notes: string | null
  created_at: string
  photo_count?: number
  pick_count?: number
  cover_key?: string | null
}
export type SessionInput = Omit<
  Session,
  'id' | 'created_at' | 'client_name' | 'photo_count' | 'pick_count' | 'cover_key'
> & { id?: number }

export interface Photo {
  id: number
  session_id: number
  file_name: string
  original_key: string
  thumb_key: string
  preview_key: string
  file_size: number
  width: number | null
  height: number | null
  taken_at: string | null
  camera: string | null
  lens: string | null
  iso: number | null
  aperture: number | null
  shutter: string | null
  focal_length: number | null
  rating: number
  flag: Flag
  created_at: string
}
export type PhotoPatch = Partial<Pick<Photo, 'rating' | 'flag'>>

export interface ImportProgress {
  sessionId: number
  done: number
  total: number
  current: string
}
export interface ImportResult {
  imported: number
  skipped: number
  errors: { file: string; message: string }[]
}

export interface DashboardStats {
  clients: number
  sessions: number
  photos: number
  pendingDelivery: number
  upcoming: Session[]
}

export interface Api {
  clients: {
    list(): Promise<Client[]>
    save(c: ClientInput): Promise<Client>
    remove(id: number): Promise<void>
  }
  sessions: {
    list(filter?: { clientId?: number; status?: SessionStatus }): Promise<Session[]>
    get(id: number): Promise<Session | null>
    save(s: SessionInput): Promise<Session>
    remove(id: number): Promise<void>
  }
  photos: {
    list(sessionId: number): Promise<Photo[]>
    update(ids: number[], patch: PhotoPatch): Promise<void>
    remove(ids: number[]): Promise<void>
    importFiles(sessionId: number): Promise<ImportResult | null>
    exportPicks(sessionId: number): Promise<{ exported: number; folder: string } | null>
    reveal(id: number): Promise<void>
    onImportProgress(cb: (p: ImportProgress) => void): () => void
  }
  stats(): Promise<DashboardStats>
  mediaUrl(key: string): string
}
