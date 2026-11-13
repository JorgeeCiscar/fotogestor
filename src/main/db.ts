import { DatabaseSync } from 'node:sqlite'

export type DB = DatabaseSync

export const MIGRATIONS: string[] = [
  `
  CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    type TEXT,
    date TEXT,
    location TEXT,
    status TEXT NOT NULL DEFAULT 'planificada',
    price REAL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    original_key TEXT NOT NULL,
    thumb_key TEXT NOT NULL,
    preview_key TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    taken_at TEXT,
    camera TEXT,
    lens TEXT,
    iso INTEGER,
    aperture REAL,
    shutter TEXT,
    focal_length REAL,
    rating INTEGER NOT NULL DEFAULT 0,
    flag TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (session_id, file_name, file_size)
  );
  CREATE INDEX idx_photos_session ON photos(session_id);
  CREATE INDEX idx_sessions_client ON sessions(client_id);
  `,
  `
  ALTER TABLE clients ADD COLUMN tax_id TEXT;
  ALTER TABLE clients ADD COLUMN address TEXT;
  ALTER TABLE photos ADD COLUMN client_pick INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE photos ADD COLUMN is_raw INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE photo_tags (
    photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    tag TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (photo_id, tag)
  );
  CREATE INDEX idx_photo_tags_tag ON photo_tags(tag);
  CREATE TABLE session_tags (
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tag TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (session_id, tag)
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('presupuesto', 'factura')),
    number TEXT NOT NULL UNIQUE,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'borrador',
    tax_rate REAL NOT NULL DEFAULT 21,
    irpf_rate REAL NOT NULL DEFAULT 0,
    notes TEXT,
    source_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0
  );
  `,
  // v3: tipos de cliente (piloto / equipo / particular) y sus datos propios.
  `
  ALTER TABLE clients ADD COLUMN kind TEXT CHECK (kind IN ('piloto', 'equipo', 'particular'));
  ALTER TABLE clients ADD COLUMN instagram TEXT;
  ALTER TABLE clients ADD COLUMN racing_number TEXT;
  ALTER TABLE clients ADD COLUMN category TEXT;
  ALTER TABLE clients ADD COLUMN vehicle TEXT;
  ALTER TABLE clients ADD COLUMN team_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
  ALTER TABLE clients ADD COLUMN nationality TEXT;
  ALTER TABLE clients ADD COLUMN birth_date TEXT;
  ALTER TABLE clients ADD COLUMN license_number TEXT;
  ALTER TABLE clients ADD COLUMN guardian_name TEXT;
  ALTER TABLE clients ADD COLUMN guardian_phone TEXT;
  ALTER TABLE clients ADD COLUMN contact_name TEXT;
  ALTER TABLE clients ADD COLUMN contact_role TEXT;
  ALTER TABLE clients ADD COLUMN brand TEXT;
  ALTER TABLE clients ADD COLUMN website TEXT;
  CREATE INDEX idx_clients_team ON clients(team_id);
  CREATE INDEX idx_clients_kind ON clients(kind);
  `,
  // v4: campeonato de las sesiones de tipo «Carrera».
  `
  ALTER TABLE sessions ADD COLUMN championship TEXT;
  CREATE INDEX idx_sessions_championship ON sessions(championship);
  `,
  // v5: tarifas propias y partidas acordadas en cada sesión.
  `
  CREATE TABLE tariffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK (category IN ('sesion', 'extra')),
    session_type TEXT,
    label TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    unit TEXT,
    notes TEXT,
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE session_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_session_items ON session_items(session_id);
  `,
  // v6: tarifas en porcentaje (licencia comercial, descuentos, cancelaciones).
  `
  ALTER TABLE tariffs ADD COLUMN mode TEXT NOT NULL DEFAULT 'fijo';
  `
]

const depth = new WeakMap<DB, number>()

/** Ejecuta fn dentro de una transacción (rollback si lanza un error). Reentrante. */
export function transaction<T>(db: DB, fn: () => T): T {
  const d = depth.get(db) ?? 0
  if (d > 0) {
    depth.set(db, d + 1)
    try { return fn() } finally { depth.set(db, d) }
  }
  depth.set(db, 1)
  try {
    return runTransaction(db, fn)
  } finally {
    depth.set(db, 0)
  }
}

function runTransaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function openDatabase(file: string): DB {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })
  }
  return db
}
