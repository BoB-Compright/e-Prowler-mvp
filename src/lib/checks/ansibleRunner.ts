import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const PLAYBOOK_PATH = path.join(process.cwd(), "ansible", "security-checks.yml");

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

// Runs ansible/security-checks.yml against a single running sandbox
// container via the community.docker.docker connection plugin (docker exec
// under the hood — no SSH/agent setup, no Python required in the target).
export async function runAnsibleChecks(containerName: string): Promise<AnsibleTaskOutput[]> {
  const { stdout } = await execFileAsync(
    "ansible-playbook",
    ["-i", `${containerName},`, "-c", "community.docker.docker", PLAYBOOK_PATH],
    {
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 10,
      env: { ...process.env, ANSIBLE_STDOUT_CALLBACK: "json" },
    },
  );

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

// Task names are "<catalog-id>: <description>" (see security-checks.yml).
export function findTaskOutput(
  tasks: AnsibleTaskOutput[],
  catalogId: string,
): AnsibleTaskOutput | undefined {
  return tasks.find((task) => task.taskName.startsWith(`${catalogId}:`));
}
