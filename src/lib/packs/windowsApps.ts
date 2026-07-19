import { getCatalogByCategory } from "@/lib/catalog";
import type { VendorPack } from "./types";

// 모두 executionPath "windows" — 실제 점검은 WinRM 호스트 확보 시(보류). evaluatePack이
// 항목을 review("Windows 호스트 연결 대기")로 단락하므로 evaluate는 호출되지 않는다.
function windowsPack(
  id: string,
  category: VendorPack["category"],
  vendors: string[],
  itemIds: string[],
): VendorPack {
  return { id, category, vendors, executionPath: "windows", itemIds, evidenceTasks: [], detect: () => false, evaluate: () => [] };
}

const web = () => getCatalogByCategory("web").filter((i) => i.frameworkId === "kisa").map((i) => i.id);
const dbBy = (p: string) => getCatalogByCategory("db").map((i) => i.id).filter((id) => id.startsWith(p));
const wasBy = (p: string) => getCatalogByCategory("was").map((i) => i.id).filter((id) => id.startsWith(p));

export const webIisPack = windowsPack("web-iis", "WEB", ["IIS"], web());
export const dbMssqlPack = windowsPack("db-mssql", "DB", ["MSSQL"], dbBy("MSSQL-"));
export const wasWeblogicPack = windowsPack("was-weblogic", "WAS", ["WebLogic"], wasBy("WLS-"));
export const wasWebspherePack = windowsPack("was-websphere", "WAS", ["WebSphere"], wasBy("WSP-"));
