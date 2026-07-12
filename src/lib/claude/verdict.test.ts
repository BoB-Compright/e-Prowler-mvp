import { describe, expect, it } from "vitest";
import { applyVerdict } from "./verdict";

describe("applyVerdict", () => {
  it("review + pass/fail verdict → AI-sourced verdict", () => {
    expect(applyVerdict("review", "fail")).toEqual({ status: "fail", source: "ai" });
    expect(applyVerdict("review", "pass")).toEqual({ status: "pass", source: "ai" });
  });
  it("review + review verdict → stays review, rule-sourced", () => {
    expect(applyVerdict("review", "review")).toEqual({ status: "review", source: "rule" });
  });
  it("non-review rule status is NEVER changed, whatever the AI verdict", () => {
    expect(applyVerdict("pass", "fail")).toEqual({ status: "pass", source: "rule" });
    expect(applyVerdict("fail", "pass")).toEqual({ status: "fail", source: "rule" });
    expect(applyVerdict("skip", "fail")).toEqual({ status: "skip", source: "rule" });
  });
  it("review + a non-pass/fail verdict (skip/not_automated) → stays review", () => {
    expect(applyVerdict("review", "skip")).toEqual({ status: "review", source: "rule" });
  });
});
