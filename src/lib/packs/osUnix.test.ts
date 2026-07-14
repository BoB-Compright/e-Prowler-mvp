import { describe, expect, it } from "vitest";
import { osUnixPack } from "./osUnix";
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";

function tasks(osOut: string | null): AnsibleTaskOutput[] {
  return osOut === null ? [] : [{ taskName: "os detection (internal)", stdout: osOut }];
}

describe("osUnixPack.detect (OS 감지)", () => {
  it("os-release/uname 출력이 있으면 true", () => {
    expect(osUnixPack.detect(tasks('NAME="Ubuntu"\nVERSION="24.04"'))).toBe(true);
    expect(osUnixPack.detect(tasks("Linux"))).toBe(true);
  });
  it("태스크가 없거나 비어있으면 false (distroless/scratch)", () => {
    expect(osUnixPack.detect(tasks(null))).toBe(false);
    expect(osUnixPack.detect(tasks("   "))).toBe(false);
  });
  it("os detection 증거 태스크를 evidenceTasks에 포함한다", () => {
    expect(osUnixPack.evidenceTasks.some((t) => t.name === "os detection (internal)")).toBe(true);
  });
});
