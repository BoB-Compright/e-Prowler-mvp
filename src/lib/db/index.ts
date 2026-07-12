import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

export const SCHEMA = `
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
  framework_id TEXT,
  source TEXT NOT NULL DEFAULT 'rule',
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

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pm_name TEXT NOT NULL,
  pm_email TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE,
  share_password_hash TEXT NOT NULL,
  share_failed_attempts INTEGER NOT NULL DEFAULT 0,
  share_locked_until TEXT,
  share_status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id),
  display_name TEXT NOT NULL,
  repo_url TEXT,
  host_ip TEXT,
  hostname TEXT,
  ssh_port INTEGER,
  auth_type TEXT,
  username TEXT,
  encrypted_secret TEXT,
  os TEXT,
  owner TEXT,
  category TEXT,
  vendor TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_batches (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installed_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  collected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cve_matches (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  package_name TEXT NOT NULL,
  package_version TEXT NOT NULL,
  cve_id TEXT NOT NULL,
  cvss_score REAL,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  published_at TEXT,
  first_seen_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  dismissed INTEGER NOT NULL DEFAULT 0,
  ai_impact TEXT,
  ai_remediation TEXT,
  UNIQUE(asset_id, cve_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nvd_query_cache (
  package_name TEXT PRIMARY KEY,
  raw_response TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cve_delta_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  watermark TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL UNIQUE REFERENCES assets(id),
  frequency TEXT NOT NULL,
  day_of_week INTEGER,
  day_of_month INTEGER,
  time_of_day TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_skip_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

// Existing on-disk databases predate the "source_type" column; ADD COLUMN
// isn't idempotent in SQLite, so guard it with a table_info check instead of
// a version table (no other migration has been needed yet).
export function migrate(db: Database.Database): void {
  const runColumns = db.prepare(`PRAGMA table_info(runs)`).all() as { name: string }[];
  if (!runColumns.some((column) => column.name === "source_type")) {
    db.exec(`ALTER TABLE runs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'git'`);
  }
  if (!runColumns.some((column) => column.name === "asset_id")) {
    db.exec(`ALTER TABLE runs ADD COLUMN asset_id TEXT REFERENCES assets(id)`);
  }
  if (!runColumns.some((column) => column.name === "batch_id")) {
    db.exec(`ALTER TABLE runs ADD COLUMN batch_id TEXT REFERENCES scan_batches(id)`);
  }
  if (!runColumns.some((column) => column.name === "trigger_type")) {
    db.exec(`ALTER TABLE runs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual'`);
  }

  const assetColumns = db.prepare(`PRAGMA table_info(assets)`).all() as { name: string }[];
  if (!assetColumns.some((column) => column.name === "os")) {
    db.exec(`ALTER TABLE assets ADD COLUMN os TEXT`);
  }
  if (!assetColumns.some((column) => column.name === "owner")) {
    db.exec(`ALTER TABLE assets ADD COLUMN owner TEXT`);
  }
  if (!assetColumns.some((column) => column.name === "dockerfile_path")) {
    db.exec(`ALTER TABLE assets ADD COLUMN dockerfile_path TEXT`);
  }
  if (!assetColumns.some((column) => column.name === "category")) {
    db.exec(`ALTER TABLE assets ADD COLUMN category TEXT`);
  }
  if (!assetColumns.some((column) => column.name === "vendor")) {
    db.exec(`ALTER TABLE assets ADD COLUMN vendor TEXT`);
  }

  const checkCols = db.prepare(`PRAGMA table_info(check_results)`).all() as { name: string }[];
  if (!checkCols.some((c) => c.name === "framework_id")) {
    db.exec(`ALTER TABLE check_results ADD COLUMN framework_id TEXT`);
  }
  if (!checkCols.some((c) => c.name === "source")) {
    db.exec(`ALTER TABLE check_results ADD COLUMN source TEXT NOT NULL DEFAULT 'rule'`);
  }

  const projectColumns = db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[];
  if (!projectColumns.some((column) => column.name === "share_status")) {
    // Links issued before this column existed keep working exactly as before
    // (DEFAULT 'active' preserves current behavior for every existing project).
    db.exec(`ALTER TABLE projects ADD COLUMN share_status TEXT NOT NULL DEFAULT 'active'`);
  }

  // scan_batches.project_id를 nullable로 재구축 — 프로젝트와 무관한
  // 자산 선택 일괄 점검(bulk scan)의 배치를 담기 위함. SQLite는 NOT NULL
  // 해제를 지원하지 않아 테이블 재생성으로 마이그레이션한다.
  const scanBatchProjectCol = (
    db.prepare(`PRAGMA table_info(scan_batches)`).all() as { name: string; notnull: number }[]
  ).find((col) => col.name === "project_id");
  if (scanBatchProjectCol && scanBatchProjectCol.notnull === 1) {
    // scan_batches.project_id의 NOT NULL을 해제한다. 핵심 제약들:
    //  - better-sqlite3는 foreign_keys를 기본 ON으로 켜므로, runs.batch_id가
    //    scan_batches를 참조하는 기존 DB에서는 재구축 중 DROP이 FK로 실패한다
    //    → 재구축 동안 foreign_keys를 끈다(트랜잭션 밖에서만 토글 가능).
    //  - 새 테이블을 원본 이름으로 RENAME하는 순서(new→scan_batches)는 이 환경의
    //    SQLite에서 scan_batches_new 잔여 테이블을 남기므로, 원본을 옆으로
    //    rename하는 순서(scan_batches→_old)를 쓴다.
    //  - RENAME이 runs.batch_id의 FK 참조 텍스트를 _old로 재작성하면 FK가
    //    깨지므로 legacy_alter_table=ON으로 참조를 이름("scan_batches") 그대로
    //    남긴다 → 새로 만든 scan_batches를 다시 가리켜 FK 무결성 보존.
    // 오래된 버그 버전이 남긴 임시 테이블(scan_batches_new/_old)은 pragma 토글·
    // 재구축 배치와 섞으면 이 환경에서 DROP이 반영되지 않으므로, 그 전에 독립
    // 문으로 정리한다.
    db.exec(`DROP TABLE IF EXISTS scan_batches_new`);
    db.exec(`DROP TABLE IF EXISTS scan_batches_old`);
    const foreignKeysOn = db.pragma("foreign_keys", { simple: true }) === 1;
    if (foreignKeysOn) db.pragma("foreign_keys = OFF");
    db.pragma("legacy_alter_table = ON");
    try {
      db.exec(`
        BEGIN;
        ALTER TABLE scan_batches RENAME TO scan_batches_old;
        CREATE TABLE scan_batches (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id),
          created_at TEXT NOT NULL
        );
        INSERT INTO scan_batches SELECT id, project_id, created_at FROM scan_batches_old;
        DROP TABLE scan_batches_old;
        COMMIT;
      `);
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // 진행 중 트랜잭션이 없으면 ROLLBACK은 무시 가능
      }
      throw err;
    } finally {
      db.pragma("legacy_alter_table = OFF");
      if (foreignKeysOn) db.pragma("foreign_keys = ON");
    }
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
