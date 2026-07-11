import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { detectDockerfile, dockerfileBuildBlockers, dockerfileMissingSources, listDockerfiles } from "./dockerfile";

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

describe("listDockerfiles", () => {
  it("모든 후보를 선택순위로 정렬해 반환한다", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "b")); fs.mkdirSync(path.join(dir, "a"));
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "a", "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "b", "Dockerfile"), "FROM scratch\n");
    expect(listDockerfiles(dir)).toEqual([
      path.join(dir, "Dockerfile"),
      path.join(dir, "a", "Dockerfile"),
      path.join(dir, "b", "Dockerfile"),
    ]);
  });
  it("제외 디렉터리·데니리스트 확장자는 목록에서 빠진다", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "node_modules", "p"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "p", "Dockerfile"), "x");
    fs.writeFileSync(path.join(dir, "Dockerfile.md"), "x");
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    expect(listDockerfiles(dir)).toEqual([path.join(dir, "Dockerfile")]);
  });
  it("detectDockerfile은 listDockerfiles의 첫 요소와 같다", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "sub", "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(listDockerfiles(dir)[0]);
  });
});

describe("dockerfileBuildBlockers", () => {
  it("구체적인 FROM은 차단 없음", () => {
    expect(dockerfileBuildBlockers("FROM ubuntu:24.04\nRUN echo hi\n")).toEqual([]);
  });

  it("기본값 없는 ARG를 쓰는 FROM은 그 인자명을 차단으로 반환한다", () => {
    const df = "ARG BASE_IMAGE\nFROM ${BASE_IMAGE}\nRUN echo hi\n";
    expect(dockerfileBuildBlockers(df)).toEqual(["BASE_IMAGE"]);
  });

  it("선언조차 없는 변수 참조도 차단으로 잡는다", () => {
    expect(dockerfileBuildBlockers("FROM $REGISTRY/app:latest\n")).toEqual(["REGISTRY"]);
  });

  it("기본값 있는 ARG는 차단이 아니다", () => {
    expect(dockerfileBuildBlockers("ARG BASE=ubuntu:24.04\nFROM ${BASE}\n")).toEqual([]);
  });

  it("인라인 기본값(${VAR:-default})은 차단이 아니다", () => {
    expect(dockerfileBuildBlockers("FROM ${BASE:-ubuntu:24.04}\n")).toEqual([]);
  });

  it("멀티스테이지의 스테이지 이름 참조(FROM builder)는 차단이 아니다", () => {
    const df = "FROM ubuntu:24.04 AS builder\nRUN echo build\nFROM builder\nRUN echo run\n";
    expect(dockerfileBuildBlockers(df)).toEqual([]);
  });
});

describe("dockerfileMissingSources", () => {
  it("COPY 소스가 컨텍스트에 없으면 그 경로를 반환한다", () => {
    const dir = makeTmpDir();
    const df = "FROM debian\nCOPY VADA_Agent_LINUX.tar /tmp/\n";
    expect(dockerfileMissingSources(df, dir)).toEqual(["VADA_Agent_LINUX.tar"]);
  });

  it("COPY 소스가 컨텍스트에 있으면 문제 없음", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "app.jar"), "x");
    expect(dockerfileMissingSources("FROM debian\nCOPY app.jar /app/\n", dir)).toEqual([]);
  });

  it("--from=stage 복사는 컨텍스트 검사 대상이 아니다", () => {
    const df = "FROM x AS build\nFROM debian\nCOPY --from=build /out/app /app\n";
    expect(dockerfileMissingSources(df, makeTmpDir())).toEqual([]);
  });

  it("원격 ADD·변수·와일드카드 소스는 오탐하지 않는다", () => {
    const dir = makeTmpDir();
    const df =
      "FROM debian\nADD https://example.com/x.tar /tmp/\nCOPY ${ART} /a/\nCOPY *.jar /libs/\n";
    expect(dockerfileMissingSources(df, dir)).toEqual([]);
  });

  it("JSON 배열 형식 COPY도 소스 존재를 검사한다", () => {
    const dir = makeTmpDir();
    expect(dockerfileMissingSources('FROM debian\nCOPY ["missing.bin", "/tmp/"]\n', dir)).toEqual([
      "missing.bin",
    ]);
  });
});
