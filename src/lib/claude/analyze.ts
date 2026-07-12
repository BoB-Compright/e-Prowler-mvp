import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CatalogItem } from "@/lib/catalog/types";
import type { CheckResult } from "@/lib/checks/types";
import { sanitizeForClaude } from "./sanitize";
import { ClaudeAnalysisSchema, type ClaudeAnalysis } from "./schema";

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM_PROMPT = `당신은 컨테이너 보안 점검 결과를 사람이 이해하기 쉽게 설명하는 보조 도구입니다.

신뢰 경계: Ansible evidence -> 가이드 기반 룰 평가 -> 당신의 설명 -> Dashboard 표시.

당신이 하면 안 되는 것:
- 가이드에 없는 보안 기준을 새로 만드는 것
- 이미 확정된 pass/fail 판정을 임의로 바꾸는 것
- evidence가 부족한데 확정적인 취약점으로 단정하는 것

당신이 해야 하는 것: 취약점 설명, 위험도 설명, evidence 해석, 원인 설명, 조치방안 제시, 설정 예시 제시.
반드시 한국어로 답하세요. status와 severity 필드는 입력에서 주어진 값을 그대로 반환하세요 (판정을 바꾸지 마세요).

판정(verdict) 규칙:
- 입력 status가 "review"인 경우에만: 제공된 evidence로 확정할 수 있으면 verdict를 "pass" 또는 "fail"로,
  evidence가 불충분하면 "review"로 반환하세요.
- 입력 status가 review가 아니면: verdict는 반드시 입력 status와 동일해야 합니다(판정을 바꾸지 마세요).`;

export interface AnalyzeInput {
  item: CatalogItem;
  result: CheckResult;
}

// Sends one check's evidence + rule-evaluated status to Claude for a
// human-readable explanation. The returned status/severity are always
// overwritten with the inputs afterward — Claude explains, it never
// overrides an already-decided rule evaluation (PRD §6).
export async function analyzeCheck({ item, result }: AnalyzeInput): Promise<ClaudeAnalysis> {
  const verdictInstruction =
    result.status === "review"
      ? `이 항목은 룰이 판정을 보류(review)했습니다. evidence로 확정 가능하면 verdict를 "pass"/"fail"로, 아니면 "review"로 반환하세요.`
      : `verdict는 "${result.status}"를 그대로 반환하세요(판정 변경 금지).`;

  const userPrompt = sanitizeForClaude(
    `점검 항목: ${item.id} - ${item.title}\n` +
      `카탈로그 심각도: ${item.severity}\n` +
      `룰 평가 결과(status): ${result.status}\n` +
      `evidence: ${result.evidence}\n\n` +
      `위 evidence와 판정 결과를 바탕으로 title/reason/remediation/example을 한국어로 작성하세요. ` +
      `status는 "${result.status}", severity는 "${item.severity}"를 그대로 반환하세요. ` +
      `${verdictInstruction}`,
  );

  const response = await getClient().messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: zodOutputFormat(ClaudeAnalysisSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude가 ${item.id} 분석 요청을 거부했습니다`);
  }
  if (!response.parsed_output) {
    throw new Error(`Claude 응답을 ${item.id}에 대해 구조화된 형식으로 파싱하지 못했습니다`);
  }

  const rawVerdict = response.parsed_output.verdict;
  const verdict = result.status === "review" ? rawVerdict : result.status;

  return {
    ...response.parsed_output,
    id: item.id,
    status: result.status,
    severity: item.severity,
    verdict,
  };
}
