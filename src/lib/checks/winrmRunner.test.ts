import { describe, expect, it } from "vitest";
import { runWinrmChecks, WINRM_NOT_IMPLEMENTED } from "./winrmRunner";

describe("winrmRunner (scaffold)", () => {
  it("throws a clear not-implemented error until a Windows host/WinRM is wired", async () => {
    await expect(runWinrmChecks()).rejects.toThrow(WINRM_NOT_IMPLEMENTED);
  });
});
