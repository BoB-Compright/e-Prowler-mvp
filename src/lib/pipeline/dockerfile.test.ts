import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { detectDockerfile } from "./dockerfile";

const dirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerfile-test-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("detectDockerfile", () => {
  it("returns the path when a Dockerfile exists at the repo root", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "Dockerfile"));
  });

  it("returns undefined when there is no Dockerfile", () => {
    const dir = makeTmpDir();
    expect(detectDockerfile(dir)).toBeUndefined();
  });
});
