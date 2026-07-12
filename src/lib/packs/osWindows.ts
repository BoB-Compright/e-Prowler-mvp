import { getCatalogByCategory } from "@/lib/catalog";
import type { VendorPack } from "./types";

// 실제 점검은 WinRM 호스트 확보 시(#4 보류). executionPath "windows"라 evaluatePack이
// 항목 전부를 review("Windows 호스트 연결 대기")로 처리하며 evaluate는 호출되지 않는다.
export const osWindowsPack: VendorPack = {
  id: "os-windows",
  category: "OS",
  vendors: ["Windows Server"],
  executionPath: "windows",
  itemIds: getCatalogByCategory("windows").map((i) => i.id),
  evidenceTasks: [],
  detect: () => false,
  evaluate: () => [],
};
