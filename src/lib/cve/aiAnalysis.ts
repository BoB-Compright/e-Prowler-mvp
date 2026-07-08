import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { sanitizeForClaude } from "@/lib/claude/sanitize";
import type { CveMatch } from "./store";

// analyzeAndSaveChecks(src/lib/claude/index.ts)와 동일한 게이트 — 매 개발/스캔마다
// 실제 API 토큰을 쓰지 않도록 기본은 비활성.
const CLAUDE_ANALYSIS_ENABLED = process.env.CLAUDE_ANALYSIS_ENABLED === "true";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const CveImpactSchema = z.object({
  impact: z.string(),
  remediation: z.string(),
});

const SYSTEM_PROMPT = `당신은 서버에 설치된 패키지의 알려진 취약점(CVE)이 실제로 어떤 위험을 주는지 설명하는 보조 도구입니다.
반드시 한국어로 답하세요. impact에는 이 CVE가 이 패키지·버전에서 어떤 문제를 일으킬 수 있는지, remediation에는 구체적인 조치방안(예: 패키지 업그레이드 명령)을 작성하세요.`;

// CVSS High/Critical 매칭에 대해서만 호출된다 — 호출 여부 판단은 poller.ts(Task 9) 책임.
// 거부/파싱 실패 시 예외를 던지지 않고 null을 반환한다 — 백그라운드 폴러가 한 건의
// 분석 실패로 전체 사이클을 멈추면 안 되기 때문 (analyzeCheck와의 의도적 차이).
export async function analyzeCveImpact(
  match: CveMatch,
): Promise<{ impact: string; remediation: string } | null> {
  if (!CLAUDE_ANALYSIS_ENABLED) return null;

  const userPrompt = sanitizeForClaude(
    `CVE: ${match.cveId}\n` +
      `패키지: ${match.packageName} ${match.packageVersion}\n` +
      `CVSS 점수: ${match.cvssScore ?? "알수없음"}\n` +
      `NVD 설명(영문): ${match.summary}\n\n` +
      `위 정보를 바탕으로 impact와 remediation을 한국어로 작성하세요.`,
  );

  const response = await getClient().messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: zodOutputFormat(CveImpactSchema) },
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return null;
  }
  return response.parsed_output;
}
