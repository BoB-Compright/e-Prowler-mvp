import type { VendorPack } from "./types";
import { osUnixPack } from "./osUnix";
import { containerPack } from "./container";
import { webNginxPack } from "./webNginx";
import { webApachePack } from "./webApache";
import { wasTomcatPack } from "./wasTomcat";
import { dbMysqlPack } from "./dbMysql";
import { dbPostgresPack } from "./dbPostgres";
import { dbOraclePack } from "./dbOracle";

// 이번 사이클(#0+#1 이전)에 등록된 팩. #1(Apache)~#4는 여기에 팩을 추가만 한다.
export const ALL_PACKS: VendorPack[] = [osUnixPack, containerPack, webNginxPack, webApachePack, wasTomcatPack, dbMysqlPack, dbPostgresPack, dbOraclePack];

// 애플리케이션 벤더 팩(vendors 비어있지 않음)만 대상으로, category와 vendor로
// 팩을 찾는다. vendor는 대소문자 무시.
export function findVendorPack(category: string, vendor: string): VendorPack | undefined {
  const v = vendor.trim().toLowerCase();
  return ALL_PACKS.find(
    (p) => p.category === category && p.vendors.some((pv) => pv.toLowerCase() === v),
  );
}
