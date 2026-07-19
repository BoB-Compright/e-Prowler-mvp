import type { Asset } from "@/lib/assets/types";
import { getVendorInputSpecs } from "@/lib/packs/registry";
import { decodeScanInputs } from "@/lib/assets/scanInputs";

// 서버 자산의 벤더 사전 입력값을 복호화해 ansible extra-vars 맵으로 만든다.
// 벤더 팩이 없거나 입력이 없으면 {}. secret은 여기서 평문이 되지만, 상위(runAnsibleForServer)가
// 임시파일 채널로만 전달하므로 CLI·로그에 노출되지 않는다.
export function buildScanExtraVars(asset: Asset): Record<string, string> {
  if (asset.type !== "server" || !asset.category || !asset.vendor) return {};
  const specs = getVendorInputSpecs(asset.category, asset.vendor);
  if (specs.length === 0) return {};
  return decodeScanInputs(specs, asset.scanInputs);
}
