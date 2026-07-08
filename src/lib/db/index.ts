import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  repo_url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'git',
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  image_tag TEXT,
  container_name TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  item_id TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  remediation TEXT NOT NULL,
  example TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

// Existing on-disk databases predate the "source_type" column; ADD COLUMN
// isn't idempotent in SQLite, so guard it with a table_info check instead of
// a version table (no other migration has been needed yet).
function migrate(db: Database.Database): void {
  const columns = db.prepare(`PRAGMA table_info(runs)`).all() as { name: string }[];
  if (!columns.some((column) => column.name === "source_type")) {
    db.exec(`ALTER TABLE runs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'git'`);
  }
}

function createDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

let singleton: Database.Database | undefined;

// A single shared connection for the running server process (local, single-user MVP).
export function getDb(): Database.Database {
  if (!singleton) {
    const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
    singleton = createDatabase(dbPath);
  }
  return singleton;
}

// Used by tests to get an isolated in-memory database instead of the shared file-backed one.
export function createInMemoryDb(): Database.Database {
  return createDatabase(":memory:");
}
