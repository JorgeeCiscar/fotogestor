import { DatabaseSync } from 'node:sqlite'

export type DB = DatabaseSync

const MIGRATIONS: string[] = [
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
  `
]

/** Ejecuta fn dentro de una transacción (rollback si lanza un error). */
export function transaction<T>(db: DB, fn: () => T): T {
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
