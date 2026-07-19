import type { Asset } from "@/lib/assets/types";
import { getVendorInputSpecs } from "@/lib/packs/registry";
import { decodeScanInputs } from "@/lib/assets/scanInputs";

// 서버 자산의 벤더 사전 입력값을 복호화해 ansible extra-vars 맵으로 만든다.
// 벤더 팩이 없거나 입력이 없으면 {}. secret은 여기서 평문이 되지만, 상위(runAnsibleForServer)가
// 임시파일 채널로만 전달하므로 CLI·로그에 노출되지 않는다.
// allowlist: 저장된 JSON에 선언되지 않은 키가 주입되었더라도 스펙에 선언된 이름만 반환한다.
export function buildScanExtraVars(asset: Asset): Record<string, string> {
  if (asset.type !== "server" || !asset.category || !asset.vendor) return {};
  const specs = getVendorInputSpecs(asset.category, asset.vendor);
  if (specs.length === 0) return {};
  const decoded = decodeScanInputs(specs, asset.scanInputs);
  const allowed = new Set(specs.map((s) => s.name));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(decoded)) if (allowed.has(k)) out[k] = v;
  return out;
}
