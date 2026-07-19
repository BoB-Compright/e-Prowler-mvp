import type { AssetKind } from "./kind";
import { ASSET_KIND_LABEL } from "./kind";

// 공유 뷰 자산 선택을 종류로 묶기 위한 순수 로직. 프로젝트 단위에서 자산 종류는
// 거의 고정이고 개수만 다르므로, 종류(OS/WEB/WAS/DB/기타)로 그룹핑해 가로 스크롤을 없앤다.
const KIND_ORDER: AssetKind[] = ["os", "web", "was", "db", "other"];

export interface GroupableAsset {
  id: string;
  displayName: string;
  kind: AssetKind;
}

export interface AssetKindGroup<T extends GroupableAsset> {
  kind: AssetKind;
  label: string;
  assets: T[];
}

// 고정 순서(OS→WEB→WAS→DB→기타)로, 자산이 하나라도 있는 종류만 반환한다.
// 그룹 내 자산 순서는 입력 순서를 유지한다.
export function groupAssetsByKind<T extends GroupableAsset>(assets: T[]): AssetKindGroup<T>[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    label: ASSET_KIND_LABEL[kind],
    assets: assets.filter((asset) => asset.kind === kind),
  })).filter((group) => group.assets.length > 0);
}
