// Accepts https/http/git/ssh remote URLs and git@host:path SCP-style URLs.
// Rejects anything that could be interpreted as a CLI flag (e.g. "--upload-pack=...")
// when passed as an argv entry to `git clone`.
const REMOTE_URL_PATTERN =
  /^(https?:\/\/|git:\/\/|ssh:\/\/|git@[\w.-]+:)[\w./~%+-]+(\.git)?\/?$/;

export function isValidRepoUrl(value: string): boolean {
  if (!value || value.startsWith("-")) return false;
  return REMOTE_URL_PATTERN.test(value.trim());
}

// "https://github.com/owner/repo.git" -> "owner/repo". Falls back to the raw
// URL when it doesn't match the expected owner/repo shape.
export function getRepoDisplayName(repoUrl: string): string {
  const match = repoUrl.match(/([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  return match ? match[1] : repoUrl;
}
