import type { ScanInputSpec } from "@/lib/packs/types";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secretCipher";

// 자산의 사전 입력값을 JSON으로 인코딩한다. secret kind 값만 AES-256-GCM으로 암호화하고,
// 비어있는 값은 저장하지 않는다(누락=미제공). 반환값이 assets.scan_inputs에 그대로 저장된다.
export function encodeScanInputs(specs: ScanInputSpec[], raw: Record<string, string>): string {
  const secretNames = new Set(specs.filter((s) => s.kind === "secret").map((s) => s.name));
  const out: Record<string, string> = {};
  for (const spec of specs) {
    const value = (raw[spec.name] ?? "").trim();
    if (!value) continue;
    out[spec.name] = secretNames.has(spec.name) ? encryptSecret(value) : value;
  }
  return JSON.stringify(out);
}

// 저장된 JSON을 파싱하고 secret을 복호화해 평문 맵으로 돌려준다(스캔 전달·폼 프리필용).
export function decodeScanInputs(specs: ScanInputSpec[], stored: string | null): Record<string, string> {
  if (!stored || !stored.trim()) return {};
  const secretNames = new Set(specs.filter((s) => s.kind === "secret").map((s) => s.name));
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(stored) as Record<string, string>;
  } catch {
    return {};
  }
  // 파싱된 값이 객체가 아니면 (배열, 문자열, 숫자 등) 빈 맵 반환
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || !value) continue;
    if (secretNames.has(name)) {
      // secret 복호화 실패 시 해당 필드만 스킵 (전체 디코드 실패 아님)
      try {
        out[name] = decryptSecret(value);
      } catch {
        // 복호화 실패한 필드는 출력에서 제외
        continue;
      }
    } else {
      out[name] = value;
    }
  }
  return out;
}

export function providedInputNames(specs: ScanInputSpec[], values: Record<string, string>): Set<string> {
  return new Set(specs.filter((s) => (values[s.name] ?? "").trim()).map((s) => s.name));
}
