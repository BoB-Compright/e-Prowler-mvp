import { describe, expect, it } from "vitest";
import type { Run } from "@/lib/pipeline/types";
import type { CheckResult } from "@/lib/checks/types";
import type { AnalysisReport } from "@/lib/claude/store";
import { buildReportCsv } from "./exportCsv";

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    repoUrl: "https://github.com/nh/pay.git",
    sourceType: "git",
    stage: "done",
    status: "succeeded",
    imageTag: "pay:latest",
    containerName: null,
    errorMessage: null,
    assetId: "asset-1",
    batchId: null,
    triggerType: "manual",
    createdAt: "2026-07-09T01:00:00.000Z",
    updatedAt: "2026-07-09T01:23:45.000Z",
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function analysis(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    itemId: "U-01",
    title: "root 계정 원격 접속 제한",
    reason: "sshd_config에 PermitRootLogin이 설정되어 있지 않음",
    remediation: "PermitRootLogin no로 설정",
    example: "PermitRootLogin no",
    ...overrides,
  };
}

describe("buildReportCsv", () => {
  it("leads with a UTF-8 BOM so Excel renders Korean text correctly", () => {
    const csv = buildReportCsv(makeRun(), [], []);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("includes a summary section with total/pass/fail/review counts", () => {
    const checks: CheckResult[] = [
      { id: "U-01", status: "pass", evidence: "" },
      { id: "U-02", status: "fail", evidence: "" },
      { id: "U-03", status: "review", evidence: "" },
      { id: "U-04", status: "fail", evidence: "" },
    ];
    const csv = buildReportCsv(makeRun(), checks, []);

    expect(csv).toContain("전체,4");
    expect(csv).toContain("양호,1");
    expect(csv).toContain("취약,2");
    expect(csv).toContain("검토,1");
  });

  it("includes one detail row per check with id/title/status/severity/reason/remediation", () => {
    const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "raw evidence" }];
    const csv = buildReportCsv(makeRun(), checks, [analysis()]);

    expect(csv).toContain("U-01");
    expect(csv).toContain("root 계정 원격 접속 제한");
    expect(csv).toContain("취약");
    expect(csv).toContain("sshd_config에 PermitRootLogin이 설정되어 있지 않음");
    expect(csv).toContain("PermitRootLogin no로 설정");
  });

  it("quotes and escapes fields containing commas", () => {
    const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "" }];
    const csv = buildReportCsv(makeRun(), checks, [
      analysis({ reason: "포트 22, 2222가 모두 열려 있음" }),
    ]);

    expect(csv).toContain('"포트 22, 2222가 모두 열려 있음"');
  });

  it("quotes and escapes fields containing double quotes by doubling them", () => {
    const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "" }];
    const csv = buildReportCsv(makeRun(), checks, [
      analysis({ remediation: '설정값을 "no"로 변경' }),
    ]);

    expect(csv).toContain('"설정값을 ""no""로 변경"');
  });

  it("quotes and escapes fields containing embedded newlines", () => {
    const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "" }];
    const csv = buildReportCsv(makeRun(), checks, [
      analysis({ reason: "1번째 줄\n2번째 줄" }),
    ]);

    expect(csv).toContain('"1번째 줄\n2번째 줄"');
  });

  it("falls back to the item id as title and blank reason/remediation when no analysis exists yet", () => {
    const checks: CheckResult[] = [{ id: "not-in-catalog", status: "review", evidence: "" }];
    const csv = buildReportCsv(makeRun(), checks, []);

    expect(csv).toContain("not-in-catalog");
  });

  it("returns all-zero summary counts for a run with no checks", () => {
    const csv = buildReportCsv(makeRun(), [], []);

    expect(csv).toContain("전체,0");
    expect(csv).toContain("양호,0");
    expect(csv).toContain("취약,0");
    expect(csv).toContain("검토,0");
  });

  describe("formula injection prevention", () => {
    it("prepends single quote to fields starting with =", () => {
      const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "" }];
      const csv = buildReportCsv(makeRun(), checks, [
        analysis({ reason: "=SUM(A1:A10)" }),
      ]);

      expect(csv).toContain("'=SUM(A1:A10)");
    });

    it("prepends single quote to fields starting with +", () => {
      const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "" }];
      const csv = buildReportCsv(makeRun(), checks, [
        analysis({ remediation: "+1234" }),
      ]);

      expect(csv).toContain("'+1234");
    });

    it("prepends single quote to fields starting with -", () => {
      const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "" }];
      const csv = buildReportCsv(makeRun(), checks, [
        analysis({ reason: "-5000" }),
      ]);

      expect(csv).toContain("'-5000");
    });

    it("prepends single quote to fields starting with @", () => {
      const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "" }];
      const csv = buildReportCsv(makeRun(), checks, [
        analysis({ remediation: "@SUM(A1)" }),
      ]);

      expect(csv).toContain("'@SUM(A1)");
    });

    it("prepends single quote to fields starting with tab character", () => {
      const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "" }];
      const csv = buildReportCsv(makeRun(), checks, [
        analysis({ reason: "\tmalicious" }),
      ]);

      expect(csv).toContain("'\tmalicious");
    });

    it("prepends single quote to fields starting with carriage return", () => {
      const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "" }];
      const csv = buildReportCsv(makeRun(), checks, [
        analysis({ remediation: "\rmalicious" }),
      ]);

      expect(csv).toContain("'\rmalicious");
    });

    it("does not affect fields with formula triggers in the middle", () => {
      const checks: CheckResult[] = [{ id: "U-01", status: "fail", evidence: "" }];
      const csv = buildReportCsv(makeRun(), checks, [
        analysis({ reason: "계산값은 =1000 정도" }),
      ]);

      expect(csv).toContain("계산값은 =1000 정도");
      expect(csv).not.toContain("'계산값은");
    });
  });
});
