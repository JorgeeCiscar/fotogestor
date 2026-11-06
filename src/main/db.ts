import Database from 'better-sqlite3'

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

export function openDatabase(file: string): Database.Database {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
  return db
}
