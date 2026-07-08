import { execFile } from "child_process";
import { promisify } from "util";
import type { Asset } from "@/lib/assets/types";
import { buildServerRunPlan } from "@/lib/checks/ansibleRunner";
import { buildSshArgs } from "@/lib/checks/sshCommand";
import { withTempKeyFile } from "@/lib/checks/tempKeyFile";

const execFileAsync = promisify(execFile);

export interface InstalledPackage {
  name: string;
  version: string;
}

export interface PackageCollectorDeps {
  execFile: typeof execFileAsync;
}

const defaultDeps: PackageCollectorDeps = { execFile: execFileAsync };

// dpkg/rpm 계열만 지원한다 — 그 외(apk 등)는 빈 문자열을 출력해 빈 목록이 된다.
const LIST_PACKAGES_COMMAND =
  "if command -v dpkg-query >/dev/null 2>&1; then dpkg-query -W -f='${Package} ${Version}\\n'; " +
  "elif command -v rpm >/dev/null 2>&1; then rpm -qa --qf '%{NAME} %{VERSION}-%{RELEASE}\\n'; " +
  "else echo ''; fi";

function parsePackageList(stdout: string): InstalledPackage[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const spaceIndex = line.indexOf(" ");
      if (spaceIndex === -1) return null;
      return { name: line.slice(0, spaceIndex), version: line.slice(spaceIndex + 1) };
    })
    .filter((pkg): pkg is InstalledPackage => pkg !== null);
}

export async function collectInstalledPackages(
  asset: Asset,
  deps: PackageCollectorDeps = defaultDeps,
): Promise<InstalledPackage[]> {
  const { decryptedSecret, needsKeyFile } = buildServerRunPlan(asset);

  const run = async (keyFilePath: string | null): Promise<InstalledPackage[]> => {
    const plan = buildSshArgs(asset, decryptedSecret, keyFilePath);
    const { stdout } = await deps.execFile(
      "ansible",
      ["all", ...plan.args, "-m", "shell", "-a", LIST_PACKAGES_COMMAND],
      { timeout: 30_000, maxBuffer: 1024 * 1024 * 5, env: { ...process.env, ANSIBLE_HOST_KEY_CHECKING: "false" } },
    );
    // ansible ad-hoc 출력 형식: "<host> | CHANGED | rc=0 >>\n<실제 stdout>"
    const bodyStart = stdout.indexOf(">>");
    const body = bodyStart === -1 ? stdout : stdout.slice(bodyStart + 2);
    return parsePackageList(body);
  };

  if (needsKeyFile) {
    return withTempKeyFile(decryptedSecret, (keyFilePath) => run(keyFilePath));
  }
  return run(null);
}
