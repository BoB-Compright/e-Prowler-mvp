import { describe, expect, it } from "vitest";
import { statusBadgeClass } from "./statusBadge";

describe("statusBadgeClass", () => {
  it("상태별로 같은 색 계열의 저채도 배경 + 텍스트 클래스를 반환한다", () => {
    expect(statusBadgeClass("pass")).toBe("bg-pass/10 text-pass");
    expect(statusBadgeClass("fail")).toBe("bg-fail/10 text-fail");
    expect(statusBadgeClass("review")).toBe("bg-review/15 text-review");
    expect(statusBadgeClass("neutral")).toBe("bg-neutral/15 text-muted");
  });
});
