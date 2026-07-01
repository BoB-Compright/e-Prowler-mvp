// Full pipeline as described in the PRD: Clone -> Build -> Sandbox -> Ansible ->
// Rule evaluation -> Claude -> Done. This issue (#37) only ever drives the
// pipeline through "build"; later issues (#38-#40) append the remaining stages
// without needing to touch this type.
export type Stage =
  | "clone"
  | "build"
  | "sandbox"
  | "ansible"
  | "rule_eval"
  | "claude"
  | "done";

export type RunStatus = "running" | "succeeded" | "failed";

export interface Run {
  id: string;
  repoUrl: string;
  stage: Stage;
  status: RunStatus;
  imageTag: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunEvent {
  id: number;
  runId: string;
  stage: Stage;
  status: RunStatus;
  message: string | null;
  createdAt: string;
}
