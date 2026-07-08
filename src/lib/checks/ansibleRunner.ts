import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import type { Asset } from "@/lib/assets/types";
import { decryptSecret } from "@/lib/crypto/secretCipher";
import { AuthFailureError, ConnectionFailureError } from "./retry";
import { buildSshArgs } from "./sshCommand";
import { withTempKeyFile } from "./tempKeyFile";

const execFileAsync = promisify(execFile);

const PLAYBOOK_PATH = path.join(process.cwd(), "ansible", "security-checks.yml");

// Servers can be slower/less predictable to reach than the local sandbox
// container, so they get a longer timeout than the container path's 60s.
const SERVER_TIMEOUT_MS = 5 * 60 * 1000;

export interface AnsibleTaskOutput {
  taskName: string;
  stdout: string;
}

interface AnsibleJsonCallbackOutput {
  plays: {
    tasks: {
      task: { name: string };
      hosts: Record<string, { stdout?: string }>;
    }[];
  }[];
}

function parseAnsibleJsonOutput(stdout: string): AnsibleTaskOutput[] {
  const parsed = JSON.parse(stdout) as AnsibleJsonCallbackOutput;
  const tasks: AnsibleTaskOutput[] = [];
  for (const play of parsed.plays ?? []) {
    for (const task of play.tasks ?? []) {
      const hostResult = Object.values(task.hosts ?? {})[0];
      tasks.push({ taskName: task.task.name, stdout: hostResult?.stdout ?? "" });
    }
  }
  return tasks;
}

// Low-level ansible-playbook invocation shared by both the container and
// server execution paths. Throws whatever execFile throws (raw, unclassified)
// — the server path wraps calls to this in classifyAnsibleError; the
// container path (runAnsibleChecks) intentionally leaves errors as-is since
// nothing downstream of it distinguishes connection vs. auth failures.
async function execAnsiblePlaybook(
  args: string[],
  timeoutMs: number,
  extraEnv: Record<string, string> = {},
): Promise<AnsibleTaskOutput[]> {
  const { stdout } = await execFileAsync("ansible-playbook", args, {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 10,
    env: { ...process.env, ANSIBLE_STDOUT_CALLBACK: "json", ...extraEnv },
  });
  return parseAnsibleJsonOutput(stdout);
}

// Runs ansible/security-checks.yml against a single running sandbox
// container via the community.docker.docker connection plugin (docker exec
// under the hood — no SSH/agent setup, no Python required in the target).
export async function runAnsibleChecks(containerName: string): Promise<AnsibleTaskOutput[]> {
  return execAnsiblePlaybook(
    ["-i", `${containerName},`, "-c", "community.docker.docker", PLAYBOOK_PATH],
    60_000,
  );
}

// Task names are "<catalog-id>: <description>" (see security-checks.yml).
export function findTaskOutput(
  tasks: AnsibleTaskOutput[],
  catalogId: string,
): AnsibleTaskOutput | undefined {
  return tasks.find((task) => task.taskName.startsWith(`${catalogId}:`));
}

export interface ServerRunPlan {
  decryptedSecret: string;
  needsKeyFile: boolean;
}

export function buildServerRunPlan(asset: Asset): ServerRunPlan {
  const decryptedSecret = decryptSecret(asset.encryptedSecret ?? "");
  return { decryptedSecret, needsKeyFile: asset.authType === "key" };
}

// Maps a raw ansible-playbook/ssh failure into AuthFailureError (never
// retried) or ConnectionFailureError (retried by retryOnConnectionFailure),
// per the global constraint that auth failures fail fast while transient
// connection failures get retried. The classified error message is a fixed
// Korean string, never the raw stderr — this is the boundary that keeps SSH
// credentials and low-level connection details out of run.error_message.
export function classifyAnsibleError(err: unknown): Error {
  const execErr =
    typeof err === "object" && err !== null
      ? (err as { stderr?: unknown; killed?: unknown; signal?: unknown; code?: unknown })
      : undefined;
  const stderr = typeof execErr?.stderr === "string" ? execErr.stderr : "";
  const haystack = `${stderr} ${err instanceof Error ? err.message : ""}`;

  if (/permission denied|invalid\/incorrect password|authentication failed|auth fail/i.test(haystack)) {
    return new AuthFailureError("인증 실패");
  }

  // Node's execFile `timeout` option kills the child process on expiry —
  // the rejected error has `killed: true` (and usually a `signal`, e.g.
  // "SIGTERM") but its message is just "Command failed: ...", with none of
  // the "timed out"/"unreachable" wording matched below. Detecting it
  // structurally (not by message pattern) is required so a real SSH
  // timeout is retried as a connection failure per the "연결 실패만 재시도"
  // constraint, instead of falling through to the generic branch — which
  // would both skip the retry and store the raw command/stderr verbatim in
  // run.error_message.
  const isProcessTimeout = execErr?.killed === true;
  if (
    isProcessTimeout ||
    /timed out|timeout|connection refused|no route to host|unreachable|ETIMEDOUT|EHOSTUNREACH|ECONNREFUSED/i.test(
      haystack,
    )
  ) {
    return new ConnectionFailureError("연결 실패");
  }

  // Anything else (unexpected ansible-playbook crash, maxBuffer overflow,
  // malformed JSON callback output, ...) isn't a failure mode this module
  // knows how to retry or attribute to auth/connection — it's neither
  // classified nor blindly retried, but it also isn't the credential/
  // connection-detail case the constraints above are guarding, so the
  // original message is preserved for operability.
  return err instanceof Error ? err : new Error(String(err));
}

// extraVars (in particular ansible_ssh_pass) must never appear on the
// ansible-playbook command line — a process listing (`ps`) on this host
// would expose it. It's written to a 0600 temp file instead and passed via
// `--extra-vars @<file>`, reusing withTempKeyFile's create/finally-delete
// semantics (it's a generic "write secret content to a temp file" helper,
// not specific to SSH keys despite the name).
async function runAnsibleWithArgs(
  connectionArgs: string[],
  extraVars: Record<string, string>,
  timeoutMs: number,
): Promise<AnsibleTaskOutput[]> {
  const baseArgs = [...connectionArgs, PLAYBOOK_PATH];
  const invoke = (args: string[]) =>
    execAnsiblePlaybook(args, timeoutMs, { ANSIBLE_HOST_KEY_CHECKING: "false" }).catch((err) => {
      throw classifyAnsibleError(err);
    });

  if (Object.keys(extraVars).length === 0) {
    return invoke(baseArgs);
  }
  return withTempKeyFile(JSON.stringify(extraVars), (varsFilePath) =>
    invoke([...baseArgs, "--extra-vars", `@${varsFilePath}`]),
  );
}

// Runs ansible/security-checks.yml against a real server over SSH
// (paramiko/ssh connection plugin, chosen by buildSshArgs based on
// asset.authType). Mirrors runAnsibleChecks but with a connection plan built
// from the asset's (decrypted) credentials instead of a fixed docker
// connection, and a longer timeout since real servers can be slower/less
// predictable to reach than a local sandbox container.
export async function runAnsibleForServer(
  asset: Asset,
  timeoutMs: number = SERVER_TIMEOUT_MS,
): Promise<AnsibleTaskOutput[]> {
  const { decryptedSecret, needsKeyFile } = buildServerRunPlan(asset);

  const run = (keyFilePath: string | null): Promise<AnsibleTaskOutput[]> => {
    const plan = buildSshArgs(asset, decryptedSecret, keyFilePath);
    return runAnsibleWithArgs(plan.args, plan.extraVars, timeoutMs);
  };

  if (needsKeyFile) {
    return withTempKeyFile(decryptedSecret, (keyFilePath) => run(keyFilePath));
  }
  return run(null);
}
