export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    repository TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    branch TEXT,
    head TEXT,
    meta TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    session_id TEXT NOT NULL,
    repository TEXT NOT NULL,
    actor TEXT NOT NULL,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    metadata TEXT,
    source TEXT NOT NULL,
    confidence REAL NOT NULL,
    risk TEXT NOT NULL DEFAULT 'none',
    observed INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor);
  CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
  CREATE INDEX IF NOT EXISTS idx_events_action ON events(action);
  CREATE INDEX IF NOT EXISTS idx_events_target ON events(target);
  CREATE INDEX IF NOT EXISTS idx_events_risk ON events(risk);
  `,
  `
  CREATE TABLE IF NOT EXISTS dep_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    data TEXT NOT NULL
  );
  `,
];