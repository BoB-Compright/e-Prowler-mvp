import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";

export async function withTempKeyFile<T>(
  keyContent: string,
  fn: (path: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "ssh-key-"));
  const keyPath = path.join(dir, `${randomUUID()}.pem`);
  writeFileSync(keyPath, keyContent, { mode: 0o600 });
  try {
    return await fn(keyPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
