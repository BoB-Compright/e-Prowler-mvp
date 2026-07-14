import type { Asset } from "./types";
import { getCatalogItem } from "@/lib/catalog";

export type AssetKind = "os" | "web" | "was" | "db" | "other";

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  os: "OS",
  web: "WEB",
  was: "WAS",
  db: "DB",
  other: "기타",
};

// 대문자 category 문자열(OS/WEB/WAS/DB)을 kind로 정규화. 그 외/null → other.
export function categoryToKind(category: string | null): AssetKind {
  switch (category) {
    case "OS":
      return "os";
    case "WEB":
      return "web";
    case "WAS":
      return "was";
    case "DB":
      return "db";
    default:
      return "other";
  }
}

// 우선순위: 구체적 서비스(WAS>WEB>DB) > 런타임(→other) > OS 베이스 > other.
const NAME_RULES: { keywords: string[]; kind: AssetKind }[] = [
  { keywords: ["tomcat", "jboss", "wildfly", "weblogic", "jetty"], kind: "was" },
  { keywords: ["nginx", "apache", "httpd", "caddy", "haproxy"], kind: "web" },
  { keywords: ["mysql", "mariadb", "postgres", "redis", "mongo", "oracle", "mssql"], kind: "db" },
  { keywords: ["python", "node", "golang", "ruby", "php", "openjdk", "jre", "jdk", "dotnet", "rust"], kind: "other" },
  { keywords: ["debian", "ubuntu", "alpine", "centos", "rocky", "almalinux", "rhel", "fedora", "trixie", "bookworm", "bullseye", "busybox", "distroless", "scratch", "amazonlinux"], kind: "os" },
];

export function inferAssetKindFromName(name: string): AssetKind {
  const n = name.toLowerCase();
  for (const rule of NAME_RULES) {
    if (rule.keywords.some((k) => n.includes(k))) return rule.kind;
  }
  return "other";
}

export function classifyAssetKind(asset: Asset): AssetKind {
  if (asset.type === "server") return categoryToKind(asset.category);
  // repo: 스캔으로 보정된 category가 있으면 그걸, 없으면 이름 추론.
  if (asset.category) return categoryToKind(asset.category);
  return inferAssetKindFromName(asset.displayName || asset.repoUrl || asset.dockerfilePath || "");
}

// autodetect 스캔 결과에서 감지된 실질 종류를 도출한다. non-skip(pass/fail/review) 결과가 있는
// 카테고리를 WAS>WEB>DB>OS(unix) 우선순위로 선택. container(C-*)는 변별력 없어 제외. 없으면 null.
export function detectKindFromResults(
  results: { id: string; status: string }[],
): "OS" | "WEB" | "WAS" | "DB" | null {
  const present = new Set<string>();
  for (const r of results) {
    if (r.status === "skip") continue;
    const cat = getCatalogItem(r.id)?.category;
    if (cat) present.add(cat);
  }
  if (present.has("was")) return "WAS";
  if (present.has("web")) return "WEB";
  if (present.has("db")) return "DB";
  if (present.has("unix")) return "OS";
  return null;
}
