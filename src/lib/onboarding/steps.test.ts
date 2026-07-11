import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEPS,
  shouldAutoStart,
  ONBOARDING_DONE_KEY,
  ONBOARDING_FORCE_KEY,
} from "./steps";

describe("shouldAutoStart", () => {
  it("자산 0개 + 미열람이면 자동 시작한다", () => {
    expect(shouldAutoStart(0, false)).toBe(true);
  });
  it("이미 열람했으면 자동 시작하지 않는다", () => {
    expect(shouldAutoStart(0, true)).toBe(false);
  });
  it("자산이 있으면(첫 사용자 아님) 자동 시작하지 않는다", () => {
    expect(shouldAutoStart(3, false)).toBe(false);
    expect(shouldAutoStart(3, true)).toBe(false);
  });
});

describe("ONBOARDING_STEPS", () => {
  it("7개 스텝이 고정 순서로 있다", () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual([
      "welcome", "register", "group-scan", "progress", "results", "share", "done",
    ]);
  });
  it("key가 유일하다", () => {
    const keys = ONBOARDING_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("center 스텝은 anchor가 null, auto 스텝은 anchor 문자열을 가진다", () => {
    for (const s of ONBOARDING_STEPS) {
      if (s.placement === "center") expect(s.anchor).toBeNull();
      else expect(typeof s.anchor).toBe("string");
    }
  });
  it("점검·진행·결과·공유 스텝은 각자의 예시 미리보기를 가진다", () => {
    const preview = (key: string) => ONBOARDING_STEPS.find((s) => s.key === key)?.preview;
    expect(preview("group-scan")).toBe("scan");
    expect(preview("progress")).toBe("progress");
    expect(preview("results")).toBe("results");
    expect(preview("share")).toBe("share");
  });

  it("번호 스텝은 stepNumber 1~5를 순서대로 가진다", () => {
    const numbered = ONBOARDING_STEPS.filter((s) => s.stepNumber !== undefined).map((s) => s.stepNumber);
    expect(numbered).toEqual([1, 2, 3, 4, 5]);
  });

  it("마지막 스텝(done)은 자산 등록 CTA를 가진다", () => {
    const last = ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1];
    expect(last.key).toBe("done");
    expect(last.cta).toEqual({ label: "자산 등록하기", href: "/assets/new" });
  });
  it("auto 스텝의 anchor는 실제로 부여할 data-tour 키와 일치한다", () => {
    const anchors = ONBOARDING_STEPS.filter((s) => s.anchor).map((s) => s.anchor);
    expect(anchors).toEqual([
      "asset-register", "nav-projects", "nav-runs", "nav-dashboard", "nav-projects",
    ]);
  });
  it("localStorage/sessionStorage 키 상수", () => {
    expect(ONBOARDING_DONE_KEY).toBe("nhg_onboarding_done");
    expect(ONBOARDING_FORCE_KEY).toBe("nhg_onboarding_force");
  });
});
