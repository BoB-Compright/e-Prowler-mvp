import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createInMemoryDb } from "@/lib/db";
import { importAssetsFromWorkbook } from "./excelImport";
import { buildAssetImportTemplate } from "./excelTemplate";

describe("buildAssetImportTemplate", () => {
  it("has repo and server sheets with the exact column headers importAssetsFromWorkbook expects", () => {
    const buffer = buildAssetImportTemplate();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["repo", "server"]);

    const repoHeader = XLSX.utils.sheet_to_json(workbook.Sheets["repo"], { header: 1 })[0];
    expect(repoHeader).toEqual(["display_name", "repo_url"]);

    const serverHeader = XLSX.utils.sheet_to_json(workbook.Sheets["server"], { header: 1 })[0];
    expect(serverHeader).toEqual([
      "display_name",
      "host_ip",
      "hostname",
      "ssh_port",
      "auth_type",
      "username",
      "secret",
    ]);
  });

  it("imports its own example rows successfully end-to-end", () => {
    const db = createInMemoryDb();
    process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
    const buffer = buildAssetImportTemplate();

    const result = importAssetsFromWorkbook(buffer, null, db);

    expect(result.repo).toHaveLength(1);
    expect(result.repo[0]).toMatchObject({ ok: true });
    expect(result.server).toHaveLength(1);
    expect(result.server[0]).toMatchObject({ ok: true });
  });
});
