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

  it("finds a Dockerfile in a subdirectory", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "docker"));
    fs.writeFileSync(path.join(dir, "docker", "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "docker", "Dockerfile"));
  });

  it("finds a variant name like Dockerfile.prod", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "Dockerfile.prod"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "Dockerfile.prod"));
  });

  it("prefers the root Dockerfile over a deeper one", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "sub", "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "Dockerfile"));
  });

  it("prefers the exact name Dockerfile over a variant at the same depth", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "a"));
    fs.mkdirSync(path.join(dir, "b"));
    fs.writeFileSync(path.join(dir, "b", "Dockerfile.dev"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "a", "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "a", "Dockerfile"));
  });

  it("breaks remaining ties by lexicographic path", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "z"));
    fs.mkdirSync(path.join(dir, "a"));
    fs.writeFileSync(path.join(dir, "z", "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "a", "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "a", "Dockerfile"));
  });

  it("ignores Dockerfiles inside excluded directories", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBeUndefined();
  });

  it("rejects Dockerfile.md as a false-positive variant", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "Dockerfile.md"), "# not a dockerfile\n");
    expect(detectDockerfile(dir)).toBeUndefined();
  });

  it("ignores dockerfile.ts and finds the real Dockerfile elsewhere", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "dockerfile.ts"), "export const x = 1;\n");
    fs.mkdirSync(path.join(dir, "docker"));
    fs.writeFileSync(path.join(dir, "docker", "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "docker", "Dockerfile"));
  });

  it("still matches app.Dockerfile (extname is .dockerfile, not denylisted)", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "app.Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "app.Dockerfile"));
  });

  it("still matches Dockerfile.prod (suffix is not a denylisted extension)", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "Dockerfile.prod"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "Dockerfile.prod"));
  });

  it("prefers the root Dockerfile even when a subdirectory Dockerfile would be enumerated first (files-before-dirs)", () => {
    const dir = makeTmpDir();
    // "a" sorts/enumerates before the root file would be processed if the walk
    // recursed into subdirectories immediately upon encountering their dirent.
    fs.mkdirSync(path.join(dir, "a"));
    fs.writeFileSync(path.join(dir, "a", "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "Dockerfile"));
  });
});
