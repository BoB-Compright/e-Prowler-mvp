import { getCatalogByCategory } from "@/lib/catalog";
import * as R from "@/lib/checks/ruleEvaluation";
import type { EvalContext, VendorPack } from "./types";
import type { CheckResult } from "@/lib/checks/types";

// U-01..U-67 평가기를 evaluateAllChecks와 동일 순서로 나열한다. 각 평가기는
// tasks만 사용(U-*는 Dockerfile findings 불필요)한다.
function evaluateUnix(ctx: EvalContext): CheckResult[] {
  const t = ctx.tasks;
  return [
    R.evaluateU01(t), R.evaluateU02(t), R.evaluateU03(t), R.evaluateU04(t), R.evaluateU05(t),
    R.evaluateU06(t), R.evaluateU07(t), R.evaluateU08(t), R.evaluateU09(t), R.evaluateU10(t),
    R.evaluateU11(t), R.evaluateU12(t), R.evaluateU13(t), R.evaluateU16(t), R.evaluateU14(t),
    R.evaluateU15(t), R.evaluateU17(t), R.evaluateU18(t), R.evaluateU19(t), R.evaluateU20(t),
    R.evaluateU21(t), R.evaluateU22(t), R.evaluateU23(t), R.evaluateU24(t), R.evaluateU25(t),
    R.evaluateU26(t), R.evaluateU27(t), R.evaluateU28(t), R.evaluateU29(t), R.evaluateU30(t),
    R.evaluateU31(t), R.evaluateU32(t), R.evaluateU33(t), R.evaluateU34(t), R.evaluateU35(t),
    R.evaluateU36(t), R.evaluateU37(t), R.evaluateU38(t), R.evaluateU39(t), R.evaluateU40(t),
    R.evaluateU41(t), R.evaluateU42(t), R.evaluateU43(t), R.evaluateU44(t), R.evaluateU45(t),
    R.evaluateU46(t), R.evaluateU47(t), R.evaluateU48(t), R.evaluateU49(t), R.evaluateU50(t),
    R.evaluateU51(t), R.evaluateU52(t), R.evaluateU53(t), R.evaluateU54(t), R.evaluateU55(t),
    R.evaluateU56(t), R.evaluateU57(t), R.evaluateU58(t), R.evaluateU59(t), R.evaluateU60(t),
    R.evaluateU61(t), R.evaluateU62(t), R.evaluateU63(t), R.evaluateU64(t), R.evaluateU65(t),
    R.evaluateU66(t), R.evaluateU67(t),
  ];
}

export const osUnixPack: VendorPack = {
  id: "os-unix",
  category: "OS",
  vendors: [],
  executionPath: "linux",
  itemIds: getCatalogByCategory("unix").map((i) => i.id),
  evidenceTasks: [],
  detect: () => true,
  evaluate: evaluateUnix,
};
