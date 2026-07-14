import type { Asset } from "@/lib/assets/types";
import type { CheckResult } from "@/lib/checks/types";
import type { CheckPlan, EvalContext, VendorPack } from "./types";
import { osUnixPack } from "./osUnix";
import { containerPack } from "./container";
import { osWindowsPack } from "./osWindows";
import { findVendorPack } from "./registry";
import { mergeEvidenceTasks } from "./playbook";
import { webNginxPack } from "./webNginx";
import { webApachePack } from "./webApache";
import { wasTomcatPack } from "./wasTomcat";
import { dbMysqlPack } from "./dbMysql";
import { dbPostgresPack } from "./dbPostgres";

// 미지원 벤더(선택된 category에 매칭 팩 없음)를 알리는 합성 항목 id.
const UNSUPPORTED_VENDOR_ID = "VENDOR-NA";

// 이미지 자동 탐지 대상(테스트 가능한 리눅스 벤더). 각 팩의 detect가 이미지 내부 증거로 자체 판정한다.
const CONTAINER_AUTODETECT_PACKS: VendorPack[] = [
  webNginxPack, webApachePack, wasTomcatPack, dbMysqlPack, dbPostgresPack,
];

// 자산의 종류로 베이스라인을, category+vendor로 벤더 팩을 골라 합성한다.
export function resolveCheckPlan(asset: Asset): CheckPlan {
  // 컨테이너/이미지: OS + 서비스로 전면 점검(자동 탐지). container·os-unix·벤더 오토셋을 모두 넣고,
  // 평가 시 각 팩 detect로 탐지된 것만 평가·미탐지는 skip한다.
  if (asset.type !== "server") {
    const packs: VendorPack[] = [containerPack, osUnixPack, ...CONTAINER_AUTODETECT_PACKS];
    const evidenceTasks = mergeEvidenceTasks(packs.map((p) => p.evidenceTasks));
    return { packs, evidenceTasks, mode: "autodetect" };
  }

  // 서버: 선언 category+vendor 기반(declared) — 기존 로직 유지.
  const packs: VendorPack[] = [];
  const linuxBaseline = osUnixPack;

  if (asset.category === "OS") {
    // OS 벤더 팩(os-windows 등) 매칭 시 그것만; 아니면 Linux 베이스라인.
    const osVp = asset.vendor ? findVendorPack("OS", asset.vendor) : undefined;
    packs.push(osVp ?? linuxBaseline);
  } else {
    const vendorPack =
      asset.category && asset.vendor ? findVendorPack(asset.category, asset.vendor) : undefined;
    // 벤더 팩이 windows 경로면 호스트도 Windows이므로 os-windows 베이스라인을 쓴다.
    const baseline = vendorPack?.executionPath === "windows" ? osWindowsPack : linuxBaseline;
    packs.push(baseline);
    if (vendorPack) packs.push(vendorPack);
  }

  const evidenceTasks = mergeEvidenceTasks(packs.map((p) => p.evidenceTasks));
  return { packs, evidenceTasks, mode: "declared" };
}

function reviewAll(pack: VendorPack, message: string): CheckResult[] {
  return pack.itemIds.map((id) => ({ id, status: "review", evidence: message }));
}

function skipAll(pack: VendorPack, message: string): CheckResult[] {
  return pack.itemIds.map((id) => ({ id, status: "skip", evidence: message }));
}

// 팩 하나를 평가하되 선택-모델 규칙을 적용한다:
// - windows 실행경로: 실제 연결 전이므로 전부 review.
// - autodetect(이미지): 팩 detect로 탐지된 것만 평가, 미탐지는 skip(노이즈 억제).
// - declared(서버): 벤더 팩인데 호스트에서 미탐지: skip이 아니라 전부 review(인벤토리 불일치 노출).
// - 그 외: 팩의 실제 평가.
export function evaluatePack(
  pack: VendorPack,
  ctx: EvalContext,
  mode: "declared" | "autodetect" = "declared",
): CheckResult[] {
  if (pack.executionPath === "windows") {
    return reviewAll(pack, "Windows 호스트 연결 대기 (자동 점검 미연결)");
  }
  if (mode === "autodetect") {
    // 이미지: 탐지된 것만 평가, 미탐지는 skip(노이즈 억제).
    if (pack.detect(ctx.tasks)) return pack.evaluate(ctx);
    const label = pack.vendors.length > 0 ? pack.vendors.join("/") : "OS(리눅스 userland)";
    return skipAll(pack, `이미지에서 ${label} 미탐지 — 해당 없음`);
  }
  // declared(서버): 선언 벤더 미확인은 review.
  if (pack.vendors.length > 0 && !pack.detect(ctx.tasks)) {
    return reviewAll(pack, `선언된 ${pack.vendors.join("/")} 미확인 — 인벤토리 확인 필요`);
  }
  return pack.evaluate(ctx);
}

// 애플리케이션 자산인데 category에 매칭되는 벤더 팩이 없을 때, 침묵 대신
// 미지원 사실을 review 1건으로 남긴다. resolveCheckPlan에서 벤더 팩을 못 찾은
// 경우를 evaluatePlan이 알 수 있도록 asset을 함께 받는다. declared 모드에만 적용된다
// (autodetect는 오토셋 전체를 항상 넣으므로 "미지원 벤더" 개념이 없다).
export function evaluatePlan(plan: CheckPlan, ctx: EvalContext, asset: Asset): CheckResult[] {
  const mode = plan.mode ?? "declared";
  const results = plan.packs.flatMap((pack) => evaluatePack(pack, ctx, mode));
  const hasVendorPack = plan.packs.some((p) => p.vendors.length > 0);
  if (mode === "declared" && asset.category && asset.category !== "OS" && asset.vendor && !hasVendorPack) {
    results.push({
      id: UNSUPPORTED_VENDOR_ID,
      status: "review",
      evidence: `미지원 벤더 (${asset.category}/${asset.vendor}) — 자동 점검 미구현`,
    });
  }
  return results;
}
