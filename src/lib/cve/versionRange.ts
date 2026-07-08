export interface VersionRange {
  versionStartIncluding?: string;
  versionStartExcluding?: string;
  versionEndIncluding?: string;
  versionEndExcluding?: string;
}

// dpkg epoch("1:1.2.3-4") 및 배포판 릴리스 접미사("-4ubuntu1")를 제거해
// "1.2.3" 형태의 업스트림 버전만 남긴다.
function normalize(version: string): string {
  const withoutEpoch = version.replace(/^\d+:/, "");
  return withoutEpoch.split("-")[0];
}

function compareVersions(a: string, b: string): number {
  const partsA = normalize(a).split(".");
  const partsB = normalize(b).split(".");
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const numA = Number(partsA[i] ?? "0");
    const numB = Number(partsB[i] ?? "0");
    if (Number.isNaN(numA) || Number.isNaN(numB)) {
      return normalize(a).localeCompare(normalize(b));
    }
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

// 범위 필드가 하나도 없으면 배제할 근거가 없으므로 true를 반환한다
// (키워드 검색만으로는 정확한 버전 매칭 정보가 없는 CVE도 많다).
export function isVersionInRange(installedVersion: string, range: VersionRange): boolean {
  if (range.versionStartIncluding && compareVersions(installedVersion, range.versionStartIncluding) < 0) return false;
  if (range.versionStartExcluding && compareVersions(installedVersion, range.versionStartExcluding) <= 0) return false;
  if (range.versionEndIncluding && compareVersions(installedVersion, range.versionEndIncluding) > 0) return false;
  if (range.versionEndExcluding && compareVersions(installedVersion, range.versionEndExcluding) >= 0) return false;
  return true;
}
