import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/catalog", () => {
  it("includes the framework registry alongside items and summary", async () => {
    const response = GET();
    const body = await response.json();

    expect(body.frameworks).toEqual([
      { id: "kisa", name: "KISA 주요정보통신기반시설 가이드" },
    ]);
    expect(body.summary.byFramework.kisa).toBe(102);
    expect(body.items[0].frameworkId).toBe("kisa");
  });
});
