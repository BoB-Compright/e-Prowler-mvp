import { describe, expect, it } from "vitest";
import type { VendorPack } from "./types";

describe("VendorPack shape", () => {
  it("constructs a minimal pack", () => {
    const p: VendorPack = {
      id: "x", category: "OS", vendors: [], executionPath: "linux",
      itemIds: [], evidenceTasks: [], detect: () => true, evaluate: () => [],
    };
    expect(p.id).toBe("x");
  });
});
