// Defense-in-depth text sanitizer applied to anything sent to the Claude API.
// PRD §6 explicitly requires this even though upstream evidence generation
// (src/lib/checks/ruleEvaluation.ts) already avoids embedding raw secret
// values — this is the second layer, not the only one.
const PATTERNS: { name: string; pattern: RegExp }[] = [
  // GitHub PATs (classic + fine-grained) and other common vendor token prefixes.
  { name: "GITHUB_PAT", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: "GITHUB_PAT", pattern: /github_pat_[A-Za-z0-9_]{20,}/g },

  // key=value / key: value assignments where the key name looks sensitive.
  {
    name: "SECRET_ASSIGNMENT",
    pattern:
      /\b([A-Za-z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY))\s*[:=]\s*\S+/gi,
  },

  // Authorization headers.
  { name: "AUTH_HEADER", pattern: /Authorization:\s*(Bearer|Basic)\s+\S+/gi },

  // SSH / TLS private key blocks.
  {
    name: "PRIVATE_KEY_BLOCK",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },

  // Credentials embedded in a URL (https://user:pass@host/...).
  { name: "URL_CREDENTIALS", pattern: /:\/\/[^\s/:@]+:[^\s/:@]+@/g },
];

export function sanitizeForClaude(text: string): string {
  let result = text;
  for (const { name, pattern } of PATTERNS) {
    result = result.replace(pattern, `[REDACTED_${name}]`);
  }
  return result;
}
