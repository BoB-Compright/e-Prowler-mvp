import { describe, expect, it } from "vitest";
import { runProgress } from "./runProgress";

describe("runProgress", () => {
  it("컨테이너(git) 경로: 6단계 순번/6", () => {
    expect(runProgress({ stage: "clone", sourceType: "git" })).toEqual({ label: "클론", fraction: 1 / 6 });
    expect(runProgress({ stage: "build", sourceType: "git" })).toEqual({ label: "빌드", fraction: 2 / 6 });
    expect(runProgress({ stage: "claude", sourceType: "git" })).toEqual({ label: "AI 분석", fraction: 1 });
  });

  it("local_image 경로: clone/build 없이 4단계", () => {
    expect(runProgress({ stage: "sandbox", sourceType: "local_image" })).toEqual({
      label: "샌드박스 준비",
      fraction: 1 / 4,
    });
    expect(runProgress({ stage: "ansible", sourceType: "local_image" })).toEqual({
      label: "Ansible 점검",
      fraction: 2 / 4,
    });
  });

  it("서버 경로: 4단계", () => {
    expect(runProgress({ stage: "connect", sourceType: "server" })).toEqual({ label: "SSH 연결", fraction: 1 / 4 });
    expect(runProgress({ stage: "ansible_scan", sourceType: "server" })).toEqual({
      label: "Ansible 점검",
      fraction: 2 / 4,
    });
    expect(runProgress({ stage: "claude_analysis", sourceType: "server" })).toEqual({
      label: "AI 분석",
      fraction: 1,
    });
  });

  it("done은 경로와 무관하게 완료·1.0", () => {
    expect(runProgress({ stage: "done", sourceType: "git" })).toEqual({ label: "완료", fraction: 1 });
    expect(runProgress({ stage: "done", sourceType: "server" })).toEqual({ label: "완료", fraction: 1 });
  });

  it("경로에 없는 stage는 라벨만 출력하고 fraction 0 (방어)", () => {
    expect(runProgress({ stage: "clone", sourceType: "server" })).toEqual({ label: "클론", fraction: 0 });
  });
});
