import { describe, expect, it, vi } from "vitest";

vi.mock("./ansibleRunner", async () => {
  const actual = await vi.importActual<typeof import("./ansibleRunner")>("./ansibleRunner");
  return { ...actual, runAnsibleChecks: vi.fn() };
});

import { runAnsibleChecks } from "./ansibleRunner";
import { runAllChecks } from "./index";

function task(taskName: string, stdout: string) {
  return { taskName, stdout };
}

describe("runAllChecks (stack-based scoping)", () => {
  it("always includes generic items (C-*, most U-*) regardless of the detected stack", async () => {
    vi.mocked(runAnsibleChecks).mockResolvedValue([]);

    const results = await runAllChecks(undefined, "fake-container");

    expect(results.some((r) => r.id === "C-01")).toBe(true);
    expect(results.some((r) => r.id === "U-01")).toBe(true);
  });

  it("drops WEB-* items entirely (not just marks them skip) when nginx is not detected", async () => {
    vi.mocked(runAnsibleChecks).mockResolvedValue([
      task("nginx detection (internal)", "absent"),
      task("nginx effective config (internal)", "__MISSING__"),
    ]);

    const results = await runAllChecks(undefined, "fake-container");

    expect(results.some((r) => r.id.startsWith("WEB-"))).toBe(false);
  });

  it("includes WEB-* items when nginx is detected on the asset", async () => {
    vi.mocked(runAnsibleChecks).mockResolvedValue([
      task("nginx detection (internal)", "present"),
      task("nginx effective config (internal)", "server {\n  autoindex off;\n}\n"),
      task("nginx version (internal)", "nginx version: nginx/1.25.3"),
    ]);

    const results = await runAllChecks(undefined, "fake-container");

    expect(results.some((r) => r.id === "WEB-04")).toBe(true);
  });

  it("drops mail-only U items when no mail service is detected on the asset", async () => {
    vi.mocked(runAnsibleChecks).mockResolvedValue([]);

    const results = await runAllChecks(undefined, "fake-container");

    expect(results.some((r) => ["U-45", "U-46", "U-47", "U-48"].includes(r.id))).toBe(false);
    // U-52 (Telnet) has no separate reusable detection signal (its check
    // and its presence-detection are the same combined ansible task), so
    // it's never scoped out by the asset profile -- it always evaluates.
    expect(results.some((r) => r.id === "U-52")).toBe(true);
  });

  it("includes mail-only U items when a mail service is detected on the asset", async () => {
    vi.mocked(runAnsibleChecks).mockResolvedValue([task("mail service detection (internal)", "postfix")]);

    const results = await runAllChecks(undefined, "fake-container");

    expect(results.some((r) => r.id === "U-45")).toBe(true);
  });

  // Regression (#vendor-scoped-checks): the nginx evidence tasks were moved out of
  // the base security-checks.yml into webNginxPack.evidenceTasks. The asset-absent
  // path must request them explicitly via extraTasks, or detectAssetProfile never
  // sees nginx and the appliesTo:["nginx"] filter silently drops all WEB-* items.
  it("requests the nginx evidence tasks as extraTasks so WEB-* items aren't silently dropped", async () => {
    vi.mocked(runAnsibleChecks).mockResolvedValue([
      task("nginx detection (internal)", "present"),
      task("nginx effective config (internal)", "server {\n  autoindex off;\n}\n"),
      task("nginx version (internal)", "nginx version: nginx/1.25.3"),
    ]);

    const results = await runAllChecks(undefined, "fake-container");

    const calls = vi.mocked(runAnsibleChecks).mock.calls;
    const [, extraTasks] = calls[calls.length - 1];
    expect(extraTasks).toBeDefined();
    expect(extraTasks!.length).toBeGreaterThan(0);
    expect(extraTasks!.some((t) => t.name === "nginx detection (internal)")).toBe(true);

    // With nginx evidence actually present, WEB-* items must survive the
    // appliesTo/detectAssetProfile filter (not be dropped as before the fix).
    expect(results.some((r) => r.id.startsWith("WEB-"))).toBe(true);
    expect(results.some((r) => r.id === "WEB-04")).toBe(true);
  });
});
