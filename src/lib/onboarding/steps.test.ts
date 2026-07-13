import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEPS,
  shouldAutoStart,
  ONBOARDING_DONE_KEY,
  ONBOARDING_FORCE_KEY,
} from "./steps";

describe("shouldAutoStart", () => {
  it("미열람이면 자동 시작한다(자산 수 무관)", () => {
    expect(shouldAutoStart(false)).toBe(true);
  });
  it("이미 열람했으면 자동 시작하지 않는다", () => {
    expect(shouldAutoStart(true)).toBe(false);
  });
});

describe("ONBOARDING_STEPS", () => {
  it("실 사용 흐름 순서의 9개 스텝", () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual([
      "welcome", "register", "scan", "progress", "results", "ai-analysis", "cve-feed", "share", "done",
    ]);
  });
  it("key가 유일하다", () => {
    const keys = ONBOARDING_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("center 스텝은 anchor null, auto 스텝은 anchor 문자열", () => {
    for (const s of ONBOARDING_STEPS) {
      if (s.placement === "center") expect(s.anchor).toBeNull();
      else expect(typeof s.anchor).toBe("string");
    }
  });
  it("번호 스텝은 stepNumber 1~7을 순서대로 가진다", () => {
    const numbered = ONBOARDING_STEPS.filter((s) => s.stepNumber !== undefined).map((s) => s.stepNumber);
    expect(numbered).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("마지막 스텝(done)은 자산 등록 CTA를 가진다", () => {
    const last = ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1];
    expect(last.key).toBe("done");
    expect(last.cta).toEqual({ label: "자산 등록하기", href: "/assets/new" });
  });
  it("auto 스텝의 anchor는 부여할 data-tour 키와 일치한다", () => {
    const anchors = ONBOARDING_STEPS.filter((s) => s.anchor).map((s) => s.anchor);
    expect(anchors).toEqual([
      "asset-register", "nav-projects", "nav-runs", "nav-dashboard", "nav-settings", "nav-cve", "nav-projects",
    ]);
  });
  it("done-key는 v2로 올려 기존 열람자도 업데이트 투어를 1회 본다", () => {
    expect(ONBOARDING_DONE_KEY).toBe("nhg_onboarding_done_v2");
    expect(ONBOARDING_FORCE_KEY).toBe("nhg_onboarding_force");
  });
});
