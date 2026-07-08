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

  it("collects EXPOSE ports, stripping protocol suffixes", () => {
    const file = writeDockerfile("FROM alpine\nEXPOSE 8080/tcp 3306\nEXPOSE 22\n");
    expect(analyzeDockerfile(file).exposedPorts).toEqual(["8080", "3306", "22"]);
  });

  it("flags an unpinned base image (no tag or :latest)", () => {
    const file = writeDockerfile("FROM alpine\n");
    const [image] = analyzeDockerfile(file).baseImages;
    expect(image).toEqual({ image: "alpine", tag: null, pinned: false });
  });

  it("treats a pinned tag or digest as pinned", () => {
    const file = writeDockerfile(
      "FROM node:18.20.4-alpine\nFROM alpine@sha256:abc123 AS runtime\n",
    );
    const findings = analyzeDockerfile(file);
    expect(findings.baseImages).toEqual([
      { image: "node", tag: "18.20.4-alpine", pinned: true },
      { image: "alpine", tag: null, pinned: true },
    ]);
  });

  it("skips stage aliases when collecting base images", () => {
    const file = writeDockerfile(
      "FROM golang:1.22 AS build\nRUN go build\nFROM build\nCMD [\"./app\"]\n",
    );
    expect(analyzeDockerfile(file).baseImages).toEqual([
      { image: "golang", tag: "1.22", pinned: true },
    ]);
  });

  it("detects a HEALTHCHECK instruction", () => {
    const withCheck = writeDockerfile("FROM alpine\nHEALTHCHECK CMD curl -f http://localhost/ || exit 1\n");
    const withoutCheck = writeDockerfile("FROM alpine\nCMD [\"sleep\", \"3600\"]\n");
    expect(analyzeDockerfile(withCheck).hasHealthcheck).toBe(true);
    expect(analyzeDockerfile(withoutCheck).hasHealthcheck).toBe(false);
  });

  it("flags ADD with a remote URL but not a local COPY-style ADD", () => {
    const file = writeDockerfile(
      "FROM alpine\nADD https://example.com/app.tar.gz /app.tar.gz\nADD ./local.tar.gz /local.tar.gz\n",
    );
    expect(analyzeDockerfile(file).remoteAddSources).toEqual(["https://example.com/app.tar.gz"]);
  });
});
