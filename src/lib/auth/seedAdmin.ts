import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { countUsers, createUser } from "./users";

interface SeedEnv {
  AUTH_ADMIN_USERNAME?: string;
  AUTH_ADMIN_PASSWORD?: string;
}

// Idempotent first-boot admin seed (see docs/adr/0001-authentication-local-accounts.md,
// section 5). Called from src/instrumentation.ts on server startup. Only
// creates an account when both env vars are set and no user exists yet —
// never overwrites/logs a password.
export function ensureSeedAdmin(env: SeedEnv = process.env as SeedEnv, db: Database = getDb()): void {
  const username = env.AUTH_ADMIN_USERNAME;
  const password = env.AUTH_ADMIN_PASSWORD;

  if (countUsers(db) > 0) {
    return;
  }

  if (!username || !password) {
    console.log(
      "[auth] AUTH_ADMIN_USERNAME/AUTH_ADMIN_PASSWORD not set and no accounts exist yet — skipping admin seed",
    );
    return;
  }

  createUser(username, password, db);
  console.log(`[auth] created initial admin account: ${username}`);
}
