import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Same scrypt-based scheme as src/lib/crypto/sharePassword.ts (share link
// passwords), kept as a separate module since account passwords are a
// distinct concept (see docs/adr/0001-authentication-local-accounts.md).
const KEY_LENGTH = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }
  const candidate = scryptSync(plain, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
