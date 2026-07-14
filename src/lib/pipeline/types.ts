// Full pipeline as described in the PRD: Clone -> Build -> Sandbox -> Ansible ->
// Rule evaluation -> Claude -> Done. This issue (#37) only ever drives the
// pipeline through "build"; later issues (#38-#40) append the remaining stages
// without needing to touch this type.
//
// "connect" | "ansible_scan" | "rule_evaluation" | "claude_analysis" are the
// server (SSH) scan path's stages (A2): connect -> ansible_scan ->
// rule_evaluation -> claude_analysis -> done, in place of the container
// path's clone/build/sandbox/ansible/rule_eval/claude/done.
export type Stage =
  | "clone"
  | "build"
  | "sandbox"
  | "ansible"
  | "rule_eval"
  | "claude"
  | "connect"
  | "ansible_scan"
  | "rule_evaluation"
  | "claude_analysis"
  | "done";

// "cancelled" (#73): a running run the user explicitly stopped mid-pipeline.
// Distinct from "failed" (an unexpected pipeline error) so history/dashboard
// views never conflate a user-initiated stop with an actual failure.
export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";

export type RunTriggerType = "manual" | "scheduled";

// "local_image" is the fallback path (#41): re-scan an already-built image
// instead of cloning/building, skipping straight to sandbox. "server" (A2) is
// an SSH-scanned server asset run, driven by the connect/ansible_scan/... stages.
export type RunSourceType = "git" | "local_image" | "server";

export interface Run {
  id: string;
  repoUrl: string;
  sourceType: RunSourceType;
  stage: Stage;
  status: RunStatus;
  imageTag: string | null;
  containerName: string | null;
  errorMessage: string | null;
  assetId: string | null;
  batchId: string | null;
  triggerType: RunTriggerType;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunEvent {
  id: number;
  runId: string;
  stage: Stage;
  status: RunStatus;
  message: string | null;
  createdAt: string;
}
