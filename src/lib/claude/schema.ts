import { z } from "zod";

// Mirrors the PRD §6 Claude output schema: {id, status, severity, title,
// evidence, reason, remediation, example}. `status` and `severity` are
// requested from the model for schema completeness, but the orchestrator
// always overwrites them with the already-computed rule evaluation /
// catalog values before storing — see analyze.ts.
export const ClaudeAnalysisSchema = z.object({
  id: z.string(),
  status: z.enum(["pass", "fail", "review", "skip", "not_automated"]),
  severity: z.enum(["Critical", "High", "Medium", "Low"]),
  title: z.string(),
  evidence: z.string(),
  reason: z.string(),
  remediation: z.string(),
  example: z.string(),
  verdict: z.enum(["pass", "fail", "review", "skip", "not_automated"]),
});

export type ClaudeAnalysis = z.infer<typeof ClaudeAnalysisSchema>;
