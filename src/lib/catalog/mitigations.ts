import mitigationsData from "./data/mitigations.json";
import type { Mitigation } from "./types";

const MITIGATIONS = mitigationsData as Record<string, Mitigation>;

// 항목 id의 정적 조치 가이드를 반환한다. 없으면 null(호출부가 섹션 생략).
export function getMitigation(itemId: string): Mitigation | null {
  return MITIGATIONS[itemId] ?? null;
}
