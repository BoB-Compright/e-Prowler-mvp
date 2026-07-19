import type { VendorPack, ScanInputSpec } from "./types";
import { osUnixPack } from "./osUnix";
import { containerPack } from "./container";
import { osWindowsPack } from "./osWindows";
import { webNginxPack } from "./webNginx";
import { webApachePack } from "./webApache";
import { wasTomcatPack } from "./wasTomcat";
import { dbMysqlPack } from "./dbMysql";
import { dbPostgresPack } from "./dbPostgres";
import { dbOraclePack } from "./dbOracle";
import { webIisPack, dbMssqlPack, wasWeblogicPack, wasWebspherePack } from "./windowsApps";
import { tiberoPack } from "./dbTibero";
import { jeusPack } from "./wasJeus";

// 이번 사이클(#0+#1 이전)에 등록된 팩. #1(Apache)~#4는 여기에 팩을 추가만 한다.
export const ALL_PACKS: VendorPack[] = [osUnixPack, containerPack, osWindowsPack, webNginxPack, webApachePack, wasTomcatPack, dbMysqlPack, dbPostgresPack, dbOraclePack, webIisPack, dbMssqlPack, wasWeblogicPack, wasWebspherePack, tiberoPack, jeusPack];

// 애플리케이션 벤더 팩(vendors 비어있지 않음)만 대상으로, category와 vendor로
// 팩을 찾는다. vendor는 대소문자 무시.
export function findVendorPack(category: string, vendor: string): VendorPack | undefined {
  const v = vendor.trim().toLowerCase();
  return ALL_PACKS.find(
    (p) => p.category === category && p.vendors.some((pv) => pv.toLowerCase() === v),
  );
}

// 특정 category+vendor 팩이 선언한 사전 입력값 스펙. 폼·저장·스캔이 이 하나를 공유한다.
export function getVendorInputSpecs(category: string, vendor: string): ScanInputSpec[] {
  return findVendorPack(category, vendor)?.requiredInputs ?? [];
}
