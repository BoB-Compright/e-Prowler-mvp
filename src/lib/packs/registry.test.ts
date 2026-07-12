import { describe, expect, it } from "vitest";
import { findVendorPack, ALL_PACKS } from "./registry";

describe("registry", () => {
  it("finds the nginx pack by WEB/Nginx (case-insensitive vendor)", () => {
    expect(findVendorPack("WEB", "Nginx")?.id).toBe("web-nginx");
    expect(findVendorPack("WEB", "nginx")?.id).toBe("web-nginx");
  });
  it("returns undefined for an unregistered vendor", () => {
    expect(findVendorPack("DB", "Oracle")).toBeUndefined();
  });
  it("registers only baseline + web-nginx in this cycle", () => {
    expect(ALL_PACKS.map((p) => p.id).sort()).toEqual(["container", "os-unix", "web-nginx"]);
  });
});
