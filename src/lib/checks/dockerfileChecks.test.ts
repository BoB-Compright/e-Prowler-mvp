import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeDockerfile } from "./dockerfileChecks";

const dirs: string[] = [];

function writeDockerfile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerfile-checks-test-"));
  dirs.push(dir);
  const file = path.join(dir, "Dockerfile");
  fs.writeFileSync(file, content);
  return file;
}

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("analyzeDockerfile", () => {
  it("detects a USER instruction", () => {
    const file = writeDockerfile("FROM alpine\nUSER appuser\n");
    expect(analyzeDockerfile(file).hasUserInstruction).toBe(true);
  });

  it("flags a missing USER instruction", () => {
    const file = writeDockerfile("FROM alpine\nCMD [\"sleep\", \"3600\"]\n");
    expect(analyzeDockerfile(file).hasUserInstruction).toBe(false);
  });

  it("flags hardcoded secrets in ENV/ARG without leaking the value", () => {
    const file = writeDockerfile(
      "FROM alpine\nENV DB_PASSWORD=hunter2\nARG API_KEY=abc123\nENV PORT=8080\n",
    );
    const findings = analyzeDockerfile(file);
    expect(findings.hardcodedSecretVars).toEqual(["DB_PASSWORD", "API_KEY"]);
    // Never include the raw value anywhere in the findings.
    expect(JSON.stringify(findings)).not.toContain("hunter2");
    expect(JSON.stringify(findings)).not.toContain("abc123");
  });

  it("does not flag an ARG declared without a default value", () => {
    const file = writeDockerfile("FROM alpine\nARG API_KEY\n");
    expect(analyzeDockerfile(file).hardcodedSecretVars).toEqual([]);
  });

  it("passes a clean Dockerfile", () => {
    const file = writeDockerfile("FROM alpine\nUSER appuser\nENV PORT=8080\n");
    const findings = analyzeDockerfile(file);
    expect(findings.hasUserInstruction).toBe(true);
    expect(findings.hardcodedSecretVars).toEqual([]);
  });
});
