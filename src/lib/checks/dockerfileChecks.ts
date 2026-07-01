import fs from "fs";

export interface DockerfileFindings {
  hasUserInstruction: boolean;
  // Variable names only (never values) from ENV/ARG lines that look like secrets.
  hardcodedSecretVars: string[];
}

const USER_INSTRUCTION_PATTERN = /^\s*USER\s+\S+/i;
const ENV_OR_ARG_PATTERN = /^(ENV|ARG)\s+([A-Za-z0-9_]+)/i;
const SECRET_NAME_PATTERN = /(PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)/i;

export function analyzeDockerfile(dockerfilePath: string): DockerfileFindings {
  const content = fs.readFileSync(dockerfilePath, "utf-8");
  const lines = content.split("\n");

  const hasUserInstruction = lines.some((line) => USER_INSTRUCTION_PATTERN.test(line));

  const hardcodedSecretVars: string[] = [];
  for (const line of lines) {
    const match = line.trim().match(ENV_OR_ARG_PATTERN);
    if (!match) continue;
    const [, , varName] = match;
    // Only flag lines that actually assign a value (ARG NAME with no default
    // is just a build parameter declaration, not a hardcoded secret).
    const hasAssignedValue = /=\s*\S+/.test(line) || /^(ENV|ARG)\s+\S+\s+\S+/i.test(line.trim());
    if (SECRET_NAME_PATTERN.test(varName) && hasAssignedValue) {
      hardcodedSecretVars.push(varName);
    }
  }

  return { hasUserInstruction, hardcodedSecretVars };
}
