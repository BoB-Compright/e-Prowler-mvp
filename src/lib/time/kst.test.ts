import { describe, expect, it } from "vitest";
import { formatKst } from "./kst";

describe("formatKst", () => {
  it("converts UTC to KST (+9h)", () => {
    expect(formatKst("2026-07-14T00:00:00.000Z")).toBe("2026-07-14 09:00");
  });
  it("crosses the date boundary", () => {
    expect(formatKst("2026-07-13T15:30:00.000Z")).toBe("2026-07-14 00:30");
  });
  it("falls back to a sliced string for an invalid iso", () => {
    expect(formatKst("not-a-date")).toBe("not-a-date".replace("T", " ").slice(0, 16));
  });
});
