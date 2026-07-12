import { getCatalogByCategory } from "@/lib/catalog";
import * as R from "@/lib/checks/ruleEvaluation";
import { getNginxState } from "@/lib/checks/ruleEvaluation";
import type { EvalContext, PlaybookTask, VendorPack } from "./types";
import type { CheckResult } from "@/lib/checks/types";

// security-checks.yml에서 이관한 nginx 전용 증거 수집 태스크. name은 기존과
// 동일해야 evaluateWEB* 의 findTaskOutput/getNginxState 매칭이 유지된다.
const NGINX_EVIDENCE: PlaybookTask[] = [
  { name: "nginx detection (internal)",
    raw: `sh -c 'if command -v nginx >/dev/null 2>&1 && [ -e /etc/nginx/nginx.conf ]; then echo present; else echo absent; fi; true'` },
  { name: "nginx effective config (internal)",
    raw: `sh -c 'if command -v nginx >/dev/null 2>&1; then nginx -T 2>&1; else echo __MISSING__; fi; true'` },
  { name: "nginx version (internal)",
    raw: `sh -c 'if command -v nginx >/dev/null 2>&1; then nginx -v 2>&1; else echo __MISSING__; fi; true'` },
  { name: "WEB-03: nginx basic auth password file permissions",
    raw: `sh -c 'if command -v nginx >/dev/null 2>&1; then LINE=$(nginx -T 2>/dev/null | grep -m1 "auth_basic_user_file"); F=$(echo "$LINE" | tr -s " " | cut -d" " -f2 | tr -d ";"); if [ -n "$F" ] && [ -e "$F" ]; then stat -c "%U:%G %a" "$F"; else echo __MISSING__; fi; else echo __MISSING__; fi; true'` },
  { name: "WEB-26: nginx log directory permissions",
    raw: `sh -c 'if [ -d /var/log/nginx ]; then stat -c "%U:%G %a" /var/log/nginx; else echo __MISSING__; fi; true'` },
  { name: "nginx document root scan (internal)",
    raw: `sh -c 'if command -v nginx >/dev/null 2>&1; then ROOTS=$(nginx -T 2>/dev/null | grep -E "^[[:space:]]*(root|alias)[[:space:]]" | awk "{print \\$2}" | tr -d ";" | sort -u); if [ -z "$ROOTS" ]; then echo __MISSING__; else for r in $ROOTS; do if [ -d "$r" ]; then find "$r" -maxdepth 3 \\( -iname "phpinfo.php" -o -iname "install.php" -o -iname "readme*" -o -iname "changelog*" -o -iname "license*" -o -iname ".git" -o -iname ".svn" -o -iname ".env" \\) 2>/dev/null | sed "s/^/LEFTOVER:/"; find "$r" -maxdepth 5 -type f -perm -0002 2>/dev/null | sed "s/^/WRITABLE:/"; fi; done; fi; else echo __MISSING__; fi; true'` },
];

function evaluateWeb(ctx: EvalContext): CheckResult[] {
  const t = ctx.tasks;
  return [
    R.evaluateWEB01(t), R.evaluateWEB02(t), R.evaluateWEB03(t), R.evaluateWEB04(t), R.evaluateWEB05(t),
    R.evaluateWEB06(t), R.evaluateWEB07(t), R.evaluateWEB08(t), R.evaluateWEB09(t), R.evaluateWEB10(t),
    R.evaluateWEB11(t), R.evaluateWEB12(t), R.evaluateWEB13(t), R.evaluateWEB14(t), R.evaluateWEB15(t),
    R.evaluateWEB16(t), R.evaluateWEB17(t), R.evaluateWEB18(t), R.evaluateWEB19(t), R.evaluateWEB20(t),
    R.evaluateWEB21(t), R.evaluateWEB22(t), R.evaluateWEB23(t), R.evaluateWEB24(t), R.evaluateWEB25(t),
    R.evaluateWEB26(t),
  ];
}

export const webNginxPack: VendorPack = {
  id: "web-nginx",
  category: "WEB",
  vendors: ["Nginx"],
  executionPath: "linux",
  itemIds: getCatalogByCategory("web").map((i) => i.id),
  evidenceTasks: NGINX_EVIDENCE,
  detect: (tasks) => getNginxState(tasks).present,
  evaluate: evaluateWeb,
};
