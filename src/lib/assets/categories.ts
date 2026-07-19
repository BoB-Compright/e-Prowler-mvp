// 서버 자산의 종류(OS/WEB/WAS/DB)와 종류별 제조사(vendor) 기본 세트.
// vendor는 아래 기본 목록 중 하나이거나, "기타" 선택 시 사용자가 직접 입력한 값이다.
export const ASSET_CATEGORIES = ["OS", "WEB", "WAS", "DB"] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const CATEGORY_VENDORS: Record<AssetCategory, string[]> = {
  OS: ["Ubuntu", "RHEL", "CentOS", "Windows Server"],
  WEB: ["Apache", "Nginx", "IIS"],
  WAS: ["Tomcat", "JBoss/WildFly", "WebLogic", "WebSphere"],
  DB: ["Oracle", "MySQL", "PostgreSQL", "MSSQL", "MariaDB", "Tibero"],
};

export function isValidCategory(value: unknown): value is AssetCategory {
  return typeof value === "string" && (ASSET_CATEGORIES as readonly string[]).includes(value);
}
