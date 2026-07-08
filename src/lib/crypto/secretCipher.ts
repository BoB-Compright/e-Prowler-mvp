import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function loadKey(): Buffer {
  const encoded = process.env.INFRA_SECURITY_MASTER_KEY;
  if (!encoded) {
    throw new Error(
      "INFRA_SECURITY_MASTER_KEY 환경변수가 설정되지 않았습니다. README의 키 생성 방법을 참고하세요.",
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("INFRA_SECURITY_MASTER_KEY는 base64로 인코딩된 32바이트 키여야 합니다.");
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(cipherText: string): string {
  const key = loadKey();
  const [ivB64, authTagB64, encryptedB64] = cipherText.split(":");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
