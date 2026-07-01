import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  repo_url TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  image_tag TEXT,
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
`;

function createDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
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
