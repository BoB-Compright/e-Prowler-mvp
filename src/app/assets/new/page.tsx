import { listProjects } from "@/lib/projects/store";
import { getVendorInputSpecs } from "@/lib/packs/registry";
import { ASSET_CATEGORIES, CATEGORY_VENDORS } from "@/lib/assets/categories";
import type { ScanInputSpec } from "@/lib/packs/types";
import { AssetForm } from "./AssetForm";

export default async function NewAssetPage() {
  // 서버 자산 폼의 카테고리·제조사 선택에 따라 렌더할 사전 입력값 스펙을 서버에서 미리
  // 계산해 내려준다(registry.ts는 Node 전용 팩 실행 로직을 포함해 클라이언트에서 직접
  // import할 수 없음).
  const vendorInputSpecs: Record<string, Record<string, ScanInputSpec[]>> = {};
  for (const category of ASSET_CATEGORIES) {
    vendorInputSpecs[category] = {};
    for (const vendor of CATEGORY_VENDORS[category]) {
      vendorInputSpecs[category][vendor] = getVendorInputSpecs(category, vendor);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">자산 등록</h1>
        <p className="mb-6 text-[13px] text-muted">새 레포지토리 또는 서버 자산을 등록합니다</p>
        <AssetForm projects={listProjects()} vendorInputSpecs={vendorInputSpecs} />
      </div>
    </main>
  );
}
