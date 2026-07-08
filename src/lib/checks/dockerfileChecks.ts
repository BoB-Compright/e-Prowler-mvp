import fs from "fs";

export interface BaseImageRef {
  image: string;
  tag: string | null;
  // Pinned = tag other than "latest", or a @sha256 digest.
  pinned: boolean;
}

export interface DockerfileFindings {
  hasUserInstruction: boolean;
  // Variable names only (never values) from ENV/ARG lines that look like secrets.
  hardcodedSecretVars: string[];
  // Raw EXPOSE port tokens (protocol suffix stripped), e.g. "3306".
  exposedPorts: string[];
  // One entry per external FROM (stage aliases referenced by name are skipped).
  baseImages: BaseImageRef[];
  hasHealthcheck: boolean;
  // ADD sources that are remote URLs instead of local files (should be COPY).
  remoteAddSources: string[];
}

const USER_INSTRUCTION_PATTERN = /^\s*USER\s+\S+/i;
const ENV_OR_ARG_PATTERN = /^(ENV|ARG)\s+([A-Za-z0-9_]+)/i;
const SECRET_NAME_PATTERN = /(PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)/i;
const EXPOSE_PATTERN = /^\s*EXPOSE\s+(.+)/i;
const FROM_PATTERN = /^\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i;
const HEALTHCHECK_PATTERN = /^\s*HEALTHCHECK\b/i;
const ADD_PATTERN = /^\s*ADD\s+(.+)/i;
const REMOTE_URL_PATTERN = /^https?:\/\//i;

function parseBaseImage(ref: string): BaseImageRef {
  if (ref.includes("@sha256:")) {
    return { image: ref.split("@")[0], tag: null, pinned: true };
  }
  const lastColon = ref.lastIndexOf(":");
  const lastSlash = ref.lastIndexOf("/");
  if (lastColon > lastSlash) {
    const tag = ref.slice(lastColon + 1);
    return { image: ref.slice(0, lastColon), tag, pinned: tag !== "latest" };
  }
  return { image: ref, tag: null, pinned: false };
}

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

  const exposedPorts: string[] = [];
  for (const line of lines) {
    const match = line.match(EXPOSE_PATTERN);
    if (!match) continue;
    for (const token of match[1].trim().split(/\s+/)) {
      const port = token.split("/")[0];
      if (port) exposedPorts.push(port);
    }
  }

  // Stage aliases must be declared before use, so a single left-to-right pass
  // is enough to tell an external image ref apart from "FROM <prior-stage>".
  const aliasNames = new Set<string>();
  const baseImages: BaseImageRef[] = [];
  for (const line of lines) {
    const match = line.match(FROM_PATTERN);
    if (!match) continue;
    const [, ref, alias] = match;
    if (!aliasNames.has(ref)) baseImages.push(parseBaseImage(ref));
    if (alias) aliasNames.add(alias);
  }

  const hasHealthcheck = lines.some((line) => HEALTHCHECK_PATTERN.test(line));

  const remoteAddSources: string[] = [];
  for (const line of lines) {
    const match = line.match(ADD_PATTERN);
    if (!match) continue;
    const source = match[1]
      .trim()
      .split(/\s+/)
      .filter((token) => !token.startsWith("--"))[0];
    if (source && REMOTE_URL_PATTERN.test(source)) remoteAddSources.push(source);
  }

  return {
    hasUserInstruction,
    hardcodedSecretVars,
    exposedPorts,
    baseImages,
    hasHealthcheck,
    remoteAddSources,
  };
}
