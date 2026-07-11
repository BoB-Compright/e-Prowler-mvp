import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import * as XLSX from "xlsx";
import { createInMemoryDb } from "@/lib/db";
import { getAsset, listAssets } from "./store";
import { importAssetsFromWorkbook } from "./excelImport";

let db: Database;

function buildWorkbook(sheets: Record<string, Record<string, unknown>[]>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("importAssetsFromWorkbook", () => {
  it("imports valid repo rows and reports success per row", () => {
    const buffer = buildWorkbook({
      repo: [
        { display_name: "a", repo_url: "https://github.com/x/a" },
        { display_name: "b", repo_url: "https://github.com/x/b" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo).toHaveLength(2);
    expect(result.repo.every((r) => r.ok)).toBe(true);
    expect(listAssets({ type: "repo" }, db)).toHaveLength(2);
  });

  it("reports a per-row failure for missing required fields without aborting the batch", () => {
    const buffer = buildWorkbook({
      repo: [
        { display_name: "a", repo_url: "https://github.com/x/a" },
        { display_name: "no-url" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo[0]).toMatchObject({ ok: true });
    expect(result.repo[1]).toMatchObject({ ok: false });
    expect(listAssets({ type: "repo" }, db)).toHaveLength(1);
  });

  it("reports a per-row failure for a duplicate repo_url", () => {
    const buffer = buildWorkbook({
      repo: [
        { display_name: "a", repo_url: "https://github.com/x/a" },
        { display_name: "dup", repo_url: "https://github.com/x/a" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo[1]).toMatchObject({ ok: false });
  });

  it("imports valid server rows with encrypted secrets", () => {
    const buffer = buildWorkbook({
      server: [
        { display_name: "web-01", host_ip: "10.0.0.5", hostname: "web-01", ssh_port: 22, auth_type: "password", username: "admin", secret: "pw" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.server).toHaveLength(1);
    expect(result.server[0]).toMatchObject({ ok: true });
    expect(listAssets({ type: "server" }, db)).toHaveLength(1);
  });

  it("서버 행의 종류(category)·제조사(vendor)를 저장하고, 잘못된 종류는 무시한다", () => {
    const buffer = buildWorkbook({
      server: [
        { display_name: "was-01", host_ip: "10.0.0.6", hostname: "was-01", ssh_port: 22, auth_type: "password", username: "admin", secret: "pw", category: "WAS", vendor: "Tomcat" },
        { display_name: "bad-01", host_ip: "10.0.0.7", hostname: "bad-01", ssh_port: 22, auth_type: "password", username: "admin", secret: "pw", category: "HACK", vendor: "x" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.server.every((r) => r.ok)).toBe(true);
    const rows = listAssets({ type: "server" }, db);
    const was = rows.find((a) => a.displayName === "was-01");
    const bad = rows.find((a) => a.displayName === "bad-01");
    expect(was?.category).toBe("WAS");
    expect(was?.vendor).toBe("Tomcat");
    expect(bad?.category).toBeNull(); // 유효하지 않은 종류는 null
    expect(bad?.vendor).toBe("x");
  });

  it("returns empty arrays for sheets that are absent", () => {
    const buffer = buildWorkbook({ repo: [{ display_name: "a", repo_url: "https://github.com/x/a" }] });
    expect(importAssetsFromWorkbook(buffer, null, db).server).toEqual([]);
  });

  it("keeps correct row numbers when a blank row precedes a data row", () => {
    const buffer = buildWorkbook({
      repo: [
        { display_name: "a", repo_url: "https://github.com/x/a" },
        {},
        { display_name: "c", repo_url: "https://github.com/x/c" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo).toHaveLength(3);
    expect(result.repo[0]).toMatchObject({ row: 2, ok: true });
    expect(result.repo[1]).toMatchObject({ row: 3, ok: false }); // the blank row itself, correctly reported
    expect(result.repo[2]).toMatchObject({ row: 4, ok: true }); // not shifted to row 3
  });

  it("accepts a numeric secret value instead of treating it as empty", () => {
    const buffer = buildWorkbook({
      server: [
        { display_name: "web-01", host_ip: "10.0.0.5", hostname: "web-01", ssh_port: 22, auth_type: "password", username: "admin", secret: 123456 },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.server[0]).toMatchObject({ ok: true });
  });

  it("imports repo rows with os/owner columns and stores the values", () => {
    const buffer = buildWorkbook({
      repo: [
        { display_name: "a", repo_url: "https://github.com/x/a", os: "Ubuntu 22.04", owner: "김철수" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo[0]).toMatchObject({ ok: true });
    const asset = getAsset((result.repo[0] as { assetId: string }).assetId, db);
    expect(asset).toMatchObject({ os: "Ubuntu 22.04", owner: "김철수" });
  });

  it("imports repo rows without os/owner columns and leaves them null (backward compatibility)", () => {
    const buffer = buildWorkbook({
      repo: [{ display_name: "a", repo_url: "https://github.com/x/a" }],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo[0]).toMatchObject({ ok: true });
    const asset = getAsset((result.repo[0] as { assetId: string }).assetId, db);
    expect(asset).toMatchObject({ os: null, owner: null });
  });

  it("imports server rows with os/owner columns and stores the values", () => {
    const buffer = buildWorkbook({
      server: [
        {
          display_name: "web-01", host_ip: "10.0.0.5", hostname: "web-01", ssh_port: 22,
          auth_type: "password", username: "admin", secret: "pw",
          os: "CentOS 7", owner: "박영희",
        },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.server[0]).toMatchObject({ ok: true });
    const asset = getAsset((result.server[0] as { assetId: string }).assetId, db);
    expect(asset).toMatchObject({ os: "CentOS 7", owner: "박영희" });
  });

  it("imports server rows without os/owner columns and leaves them null (backward compatibility)", () => {
    const buffer = buildWorkbook({
      server: [
        { display_name: "web-01", host_ip: "10.0.0.5", hostname: "web-01", ssh_port: 22, auth_type: "password", username: "admin", secret: "pw" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.server[0]).toMatchObject({ ok: true });
    const asset = getAsset((result.server[0] as { assetId: string }).assetId, db);
    expect(asset).toMatchObject({ os: null, owner: null });
  });

  it("imports repo rows with numeric owner cell as string", () => {
    const buffer = buildWorkbook({
      repo: [
        { display_name: "a", repo_url: "https://github.com/x/a", owner: 12345 },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo[0]).toMatchObject({ ok: true });
    const asset = getAsset((result.repo[0] as { assetId: string }).assetId, db);
    expect(asset).toMatchObject({ owner: "12345" });
  });

  it("imports server rows with numeric owner cell as string", () => {
    const buffer = buildWorkbook({
      server: [
        { display_name: "web-01", host_ip: "10.0.0.5", hostname: "web-01", ssh_port: 22, auth_type: "password", username: "admin", secret: "pw", owner: 54321 },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.server[0]).toMatchObject({ ok: true });
    const asset = getAsset((result.server[0] as { assetId: string }).assetId, db);
    expect(asset).toMatchObject({ owner: "54321" });
  });

  it("imports repo rows with numeric os cell as string", () => {
    const buffer = buildWorkbook({
      repo: [
        { display_name: "a", repo_url: "https://github.com/x/a", os: 2022 },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo[0]).toMatchObject({ ok: true });
    const asset = getAsset((result.repo[0] as { assetId: string }).assetId, db);
    expect(asset).toMatchObject({ os: "2022" });
  });
});
