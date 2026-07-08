import type { Asset } from "@/lib/assets/types";

export interface SshConnectionPlan {
  args: string[];
  extraVars: Record<string, string>;
  keyFilePath: string | null;
}

// Builds the ansible-playbook connection args for a server asset. The
// password (if any) is returned only via extraVars, never appended to args,
// so it never shows up in a process listing (`ps`) — the caller (ansibleRunner)
// is responsible for passing extraVars through a file (`--extra-vars @<file>`),
// not the command line. Host key checking is left to the caller to disable
// via env (ANSIBLE_HOST_KEY_CHECKING), not via args here.
export function buildSshArgs(
  asset: Asset,
  decryptedSecret: string,
  keyFilePath: string | null,
): SshConnectionPlan {
  const inventory = `${asset.hostIp},`;
  const extraVars: Record<string, string> = {
    ansible_user: asset.username ?? "",
    ansible_port: String(asset.sshPort ?? 22),
  };

  const args = ["-i", inventory];

  if (asset.authType === "key") {
    if (!keyFilePath) throw new Error("키 인증에는 keyFilePath가 필요합니다");
    args.push("-c", "ssh", "--private-key", keyFilePath);
  } else {
    args.push("-c", "paramiko");
    extraVars.ansible_ssh_pass = decryptedSecret;
  }

  args.push("-e", `ansible_user=${extraVars.ansible_user}`);
  args.push("-e", `ansible_port=${extraVars.ansible_port}`);

  return { args, extraVars, keyFilePath };
}
