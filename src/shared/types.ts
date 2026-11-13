export const RACE_TYPE = 'Carrera'
import type { ChangelogEntry } from './changelog'

export type SessionStatus = 'planificada' | 'realizada' | 'editando' | 'entregada'
export const SESSION_STATUSES: SessionStatus[] = ['planificada', 'realizada', 'editando', 'entregada']

export type Flag = 'pick' | 'reject' | null

/** Tipos de prueba dentro de un día de carrera. */
export const RUN_TYPES = ['Prácticas', 'Clasificaciones', 'Heat', 'Carrera', 'Box'] as const
export type RunType = (typeof RUN_TYPES)[number]

export type ClientKind = 'piloto' | 'equipo' | 'particular'
export const CLIENT_KINDS: ClientKind[] = ['piloto', 'equipo', 'particular']


/** Campos propios de cada tipo de cliente (el resto se guardan vacíos). */
export const PILOT_FIELDS = ['racing_number', 'category', 'vehicle', 'team_id', 'nationality', 'birth_date', 'license_number', 'guardian_name', 'guardian_phone'] as const
export const TEAM_FIELDS = ['contact_name', 'contact_role', 'category', 'brand', 'website'] as const

export interface Client {
  id: number
  /** null en clientes creados antes de existir los tipos. */
  kind: ClientKind | null
  name: string
  email: string | null
  phone: string | null
  instagram: string | null
  notes: string | null
  tax_id: string | null
  address: string | null
  // Piloto
  racing_number: string | null
  category: string | null
  vehicle: string | null
  team_id: number | null
  nationality: string | null
  birth_date: string | null
  license_number: string | null
  guardian_name: string | null
  guardian_phone: string | null
  // Equipo
  contact_name: string | null
  contact_role: string | null
  brand: string | null
  website: string | null
  created_at: string
  session_count?: number
  team_name?: string | null
  pilot_count?: number
  pilot_names?: string | null
}
/** Cliente con sus pilotos (si es un equipo), para la ficha. */
export type ClientDetail = Client & { pilots: PilotRef[] }

export type ClientInput = Omit<Client, 'id' | 'created_at' | 'session_count' | 'team_name' | 'pilot_count' | 'pilot_names' | 'kind'> & {
  id?: number
  kind: ClientKind
}

export interface Session {
  id: number
  client_id: number | null
  client_name?: string | null
  title: string
  type: string | null
  date: string | null
  location: string | null
  status: SessionStatus
  /** Solo en las sesiones de tipo «Carrera». */
  championship: string | null
  circuit_id: number | null
  circuit_name?: string | null
  organizer_id: number | null
  organizer_name?: string | null
  price: number | null
  notes: string | null
  created_at: string
  photo_count?: number
  pick_count?: number
  client_pick_count?: number
  cover_key?: string | null
  tags: string[]
  items: SessionItem[]
}
export type SessionInput = Omit<
  Session,
  'id' | 'created_at' | 'client_name' | 'photo_count' | 'pick_count' | 'client_pick_count' | 'cover_key' | 'circuit_name' | 'organizer_name'
> & { id?: number }

export type ContactKind = 'circuito' | 'organizador'
export const CONTACT_KINDS: ContactKind[] = ['circuito', 'organizador']

/** Circuito u organizador: agenda propia, separada de los clientes. */
export interface Contact {
  id: number
  kind: ContactKind
  name: string
  locality: string | null
  address: string | null
  website: string | null
  instagram: string | null
  email: string | null
  phone: string | null
  contact_name: string | null
  contact_role: string | null
  // Acreditaciones
  accred_name: string | null
  accred_email: string | null
  accred_phone: string | null
  accred_deadline: string | null
  accred_notes: string | null
  // Acceso y logística
  access_gate: string | null
  parking: string | null
  hours: string | null
  wifi: string | null
  track_notes: string | null
  // Facturación
  tax_id: string | null
  tax_address: string | null
  notes: string | null
  created_at: string
  session_count?: number
}
export type ContactInput = Omit<Contact, 'id' | 'created_at' | 'session_count'> & { id?: number }

export type TariffCategory = 'sesion' | 'extra'
/** 'fijo': `price` son euros. 'porcentaje': `price` es un % sobre el total de la sesión. */
export type TariffMode = 'fijo' | 'porcentaje'
export interface Tariff {
  id: number
  category: TariffCategory
  mode: TariffMode
  /** Tipo de sesión al que se aplica (solo en category 'sesion'). */
  session_type: string | null
  label: string
  price: number
  unit: string | null
  notes: string | null
  position: number
}
export type TariffInput = Omit<Tariff, 'id' | 'position'> & { id?: number; position?: number }

export type SessionItemKind = 'base' | 'extra' | 'ajuste'
/** Partida acordada en un evento (copia de la tarifa en ese momento). */
export interface SessionItem {
  id?: number
  description: string
  quantity: number
  unit_price: number
  /** 'base': la cobertura del tipo de evento. 'ajuste': se calcula como % de la cobertura. */
  kind: SessionItemKind
  /** Porcentaje sobre la cobertura, solo en los ajustes. */
  percent: number | null
}

export interface PilotRef { id: number; name: string; racing_number: string | null }

/** Día de un evento: una jornada a la que asistes (viernes, sábado…). */
export interface EventDay {
  id: number
  session_id: number
  date: string | null
  label: string | null
  position: number
  photo_count?: number
}
export type EventDayInput = { id?: number; session_id: number; date: string | null; label: string | null }

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
  /** 1 si el cliente la marcó como favorita en su galería. */
  client_pick: number
  is_raw: number
  /** Formato del archivo en minúsculas: jpg, cr3, nef… */
  ext: string | null
  /** Ruta del original cuando la foto está enlazada (no copiada a la biblioteca). */
  external_path: string | null
  run_type: string | null
  day_id: number | null
  /** Pilotos que aparecen en la foto. */
  pilots: PilotRef[]
  tags: string[]
  created_at: string
}
export type PhotoPatch = Partial<Pick<Photo, 'rating' | 'flag' | 'client_pick' | 'run_type'>>

/** Una foto de la carpeta que se está mirando, todavía fuera del evento. */
export interface FolderPhoto {
  path: string
  name: string
  size: number
  /** id de la foto si ya está en un evento. */
  photo_id: number | null
  /** Evento en el que ya está, si lo está. */
  session_title: string | null
}
export interface FolderListing {
  folder: string
  photos: FolderPhoto[]
}
export interface AddFromFolderOptions {
  sessionId: number
  paths: string[]
  dayId: number | null
  pilotId: number | null
  runType: string | null
  /** true copia los originales a la biblioteca; false los deja donde están. */
  copy: boolean
}

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
  pendingInvoices: number
  pendingAmount: number
  invoicedThisYear: number
}

export interface SearchResults {
  clients: Client[]
  contacts: Contact[]
  sessions: Session[]
  photos: (Photo & { session_title: string })[]
}

export interface Settings {
  business_name: string
  business_tax_id: string
  business_address: string
  business_email: string
  business_phone: string
  business_iban: string
  logo_data_url: string
  default_tax_rate: number
  default_irpf_rate: number
  invoice_footer: string
  watermark_text: string
  last_folder: string
}

export type InvoiceKind = 'presupuesto' | 'factura'
export type InvoiceStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'pagada'
export const INVOICE_STATUSES: Record<InvoiceKind, InvoiceStatus[]> = {
  presupuesto: ['borrador', 'enviada', 'aceptada', 'rechazada'],
  factura: ['borrador', 'enviada', 'pagada']
}

export interface InvoiceItem {
  id?: number
  description: string
  quantity: number
  unit_price: number
}

export interface Invoice {
  id: number
  kind: InvoiceKind
  number: string
  client_id: number | null
  client_name?: string | null
  session_id: number | null
  session_title?: string | null
  issue_date: string
  due_date: string | null
  status: InvoiceStatus
  tax_rate: number
  irpf_rate: number
  notes: string | null
  source_id: number | null
  created_at: string
  items: InvoiceItem[]
  /** Calculados. */
  subtotal: number
  tax: number
  irpf: number
  total: number
}
export type InvoiceInput = Pick<
  Invoice,
  'kind' | 'client_id' | 'session_id' | 'issue_date' | 'due_date' | 'status' | 'tax_rate' | 'irpf_rate' | 'notes' | 'items'
> & { id?: number }

export interface GalleryExportOptions {
  scope: 'picks' | 'all'
  watermark: boolean
  /** Si se indica, la galería lleva solo las fotos asignadas a ese piloto. */
  pilotId?: number
}

export interface UpdateStatus {
  state: 'idle' | 'disabled' | 'checking' | 'none' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  message?: string
}

export type LibrarySort = 'date_desc' | 'date_asc' | 'rating' | 'session' | 'name'
export interface LibraryFilter {
  pilotId?: number
  sessionIds?: number[]
  clientId?: number
  flag?: 'pick' | 'reject' | 'none' | 'client'
  minRating?: number
  tag?: string
  q?: string
  /** Formato: una extensión concreta («cr3») o «raw» para cualquier RAW. */
  ext?: string
  sort?: LibrarySort
}
export type LibraryPhoto = Photo & { session_title: string; session_date: string | null; client_name: string | null }
export interface LibraryPage { photos: LibraryPhoto[]; total: number }
export interface CopyOptions { bySession: boolean }
export interface CopyProgress { done: number; total: number }

export interface Api {
  clients: {
    list(): Promise<Client[]>
    get(id: number): Promise<ClientDetail | null>
    save(c: ClientInput): Promise<Client>
    remove(id: number): Promise<void>
  }
  sessions: {
    list(filter?: { clientId?: number; status?: SessionStatus; championship?: string }): Promise<Session[]>
    get(id: number): Promise<Session | null>
    save(s: SessionInput): Promise<Session>
    remove(id: number): Promise<void>
  }
  folder: {
    choose(sessionId: number | null): Promise<FolderListing | null>
    reopen(folder: string, sessionId: number | null): Promise<FolderListing>
    add(opts: AddFromFolderOptions): Promise<ImportResult>
    thumbUrl(path: string): string
    previewUrl(path: string): string
    onProgress(cb: (p: ImportProgress) => void): () => void
  }
  days: {
    list(sessionId: number): Promise<EventDay[]>
    save(d: EventDayInput): Promise<EventDay>
    remove(id: number): Promise<void>
  }
  photos: {
    list(sessionId: number): Promise<Photo[]>
    assign(ids: number[], clientId: number, assign: boolean): Promise<void>
    setDay(ids: number[], dayId: number | null): Promise<void>
    update(ids: number[], patch: PhotoPatch): Promise<void>
    remove(ids: number[]): Promise<void>
    importFiles(sessionId: number, dayId?: number | null): Promise<ImportResult | null>
    exportPicks(sessionId: number): Promise<{ exported: number; folder: string } | null>
    reveal(id: number): Promise<void>
    addTag(ids: number[], tag: string): Promise<void>
    removeTag(ids: number[], tag: string): Promise<void>
    onImportProgress(cb: (p: ImportProgress) => void): () => void
  }
  library: {
    query(filter: LibraryFilter, offset: number, limit: number): Promise<LibraryPage>
    ids(filter: LibraryFilter): Promise<number[]>
    copyTo(ids: number[], opts: CopyOptions): Promise<{ copied: number; folder: string } | null>
    startDrag(ids: number[]): void
    onCopyProgress(cb: (p: CopyProgress) => void): () => void
  }
  contacts: {
    list(kind?: ContactKind): Promise<Contact[]>
    get(id: number): Promise<Contact | null>
    save(c: ContactInput): Promise<Contact>
    remove(id: number): Promise<void>
  }
  tariffs: {
    list(): Promise<Tariff[]>
    save(t: TariffInput): Promise<Tariff>
    remove(id: number): Promise<void>
  }
  tags(): Promise<string[]>
  /** Formatos presentes en la biblioteca, con su número de fotos. */
  formats(): Promise<{ ext: string; n: number }[]>
  championships(): Promise<string[]>
  search(q: string): Promise<SearchResults>
  gallery: {
    export(sessionId: number, opts: GalleryExportOptions): Promise<{ file: string; count: number } | null>
    importSelection(sessionId: number, text: string): Promise<{ matched: number; unknown: number }>
    onProgress(cb: (p: { done: number; total: number }) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    save(s: Partial<Settings>): Promise<Settings>
    chooseLogo(): Promise<string | null>
  }
  invoices: {
    list(filter?: { kind?: InvoiceKind; clientId?: number; sessionId?: number }): Promise<Invoice[]>
    get(id: number): Promise<Invoice | null>
    save(i: InvoiceInput): Promise<Invoice>
    remove(id: number): Promise<void>
    convertToInvoice(id: number): Promise<Invoice>
    exportPdf(id: number): Promise<string | null>
  }
  stats(): Promise<DashboardStats>
  app: {
    version(): Promise<string>
    updateStatus(): Promise<UpdateStatus>
    checkForUpdates(): Promise<UpdateStatus>
    installUpdate(): Promise<void>
    onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
    /** Novedades pendientes de ver tras actualizarse (null si no hay). */
    whatsNew(): Promise<{ version: string; entries: ChangelogEntry[] } | null>
    whatsNewSeen(): Promise<void>
  }
  mediaUrl(key: string): string
}
