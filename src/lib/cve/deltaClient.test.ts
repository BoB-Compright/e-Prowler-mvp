import { describe, expect, it, vi } from "vitest";
import { fetchRecentCves, type DeltaClientDeps } from "./deltaClient";

function nvdCve(overrides: {
  id?: string;
  score?: number | null;
  configurations?: unknown[];
  published?: string;
} = {}) {
  return {
    cve: {
      id: overrides.id ?? "CVE-2026-1000",
      published: overrides.published ?? "2026-07-10T00:00:00.000",
      descriptions: [{ lang: "en", value: "test summary" }],
      metrics:
        overrides.score === null
          ? {}
          : { cvssMetricV31: [{ cvssData: { baseScore: overrides.score ?? 9.8 } }] },
      configurations: overrides.configurations ?? [
        {
          nodes: [
            {
              cpeMatch: [
                {
                  vulnerable: true,
                  criteria: "cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*",
                  versionStartIncluding: "3.0.0",
                  versionEndExcluding: "3.0.14",
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function okResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function deps(fetchImpl: typeof fetch, env: Record<string, string | undefined> = {}): DeltaClientDeps {
  return { fetch: fetchImpl, wait: vi.fn().mockResolvedValue(undefined), env };
}

describe("fetchRecentCves", () => {
  it("expands every cpeMatch across configurations into per-product entries with version ranges", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        totalResults: 1,
        vulnerabilities: [
          nvdCve({
            configurations: [
              {
                nodes: [
                  {
                    cpeMatch: [
                      {
                        vulnerable: true,
                        criteria: "cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*",
                        versionStartIncluding: "3.0.0",
                        versionEndExcluding: "3.0.14",
                      },
                      {
                        vulnerable: true,
                        criteria: "cpe:2.3:a:nginx:nginx:1.24.0:*:*:*:*:*:*:*",
                      },
                    ],
                  },
                ],
              },
              {
                nodes: [
                  {
                    cpeMatch: [
                      {
                        vulnerable: false,
                        criteria: "cpe:2.3:a:apache:httpd:*:*:*:*:*:*:*:*",
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        ],
      }),
    );

    const entries = await fetchRecentCves(new Date("2026-07-13T00:00:00Z"), new Date("2026-07-13T02:00:00Z"), deps(fetchMock));

    // vulnerable:false(httpd)는 제외, openssl은 범위 그대로, nginx는 cpe version 필드가 exact 매치로.
    expect(entries).toHaveLength(2);
    const openssl = entries.find((e) => e.product === "openssl")!;
    expect(openssl.versionRange).toEqual({ versionStartIncluding: "3.0.0", versionEndExcluding: "3.0.14" });
    expect(openssl.severity).toBe("critical");
    expect(openssl.cveId).toBe("CVE-2026-1000");
    const nginx = entries.find((e) => e.product === "nginx")!;
    expect(nginx.versionRange).toEqual({ versionStartIncluding: "1.24.0", versionEndIncluding: "1.24.0" });
  });

  it("paginates until totalResults is exhausted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ totalResults: 2001, vulnerabilities: [nvdCve({ id: "CVE-2026-1" })] }))
      .mockResolvedValueOnce(okResponse({ totalResults: 2001, vulnerabilities: [nvdCve({ id: "CVE-2026-2" })] }));

    const entries = await fetchRecentCves(new Date("2026-07-13T00:00:00Z"), new Date("2026-07-13T02:00:00Z"), deps(fetchMock));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("startIndex=0");
    expect(fetchMock.mock.calls[1][0]).toContain("startIndex=2000");
    expect(entries.map((e) => e.cveId)).toEqual(["CVE-2026-1", "CVE-2026-2"]);
  });

  it("sends the apiKey header only when NVD_API_KEY is set, and window dates in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ totalResults: 0, vulnerabilities: [] }));
    const start = new Date("2026-07-13T00:00:00.000Z");
    const end = new Date("2026-07-13T02:00:00.000Z");

    await fetchRecentCves(start, end, deps(fetchMock, { NVD_API_KEY: "test-key" }));
    expect(fetchMock.mock.calls[0][0]).toContain(`lastModStartDate=${encodeURIComponent(start.toISOString())}`);
    expect(fetchMock.mock.calls[0][0]).toContain(`lastModEndDate=${encodeURIComponent(end.toISOString())}`);
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { apiKey: "test-key" } });

    fetchMock.mockClear();
    await fetchRecentCves(start, end, deps(fetchMock, {}));
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: {} });
  });

  it("throws on a non-ok NVD response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 } as unknown as Response);
    await expect(
      fetchRecentCves(new Date("2026-07-13T00:00:00Z"), new Date("2026-07-13T02:00:00Z"), deps(fetchMock)),
    ).rejects.toThrow("NVD 델타 응답 실패: 503");
  });

  it("skips cpe criteria it cannot parse a product from", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        totalResults: 1,
        vulnerabilities: [
          nvdCve({
            configurations: [
              { nodes: [{ cpeMatch: [{ vulnerable: true, criteria: "not-a-cpe" }] }] },
            ],
          }),
        ],
      }),
    );
    const entries = await fetchRecentCves(new Date("2026-07-13T00:00:00Z"), new Date("2026-07-13T02:00:00Z"), deps(fetchMock));
    expect(entries).toEqual([]);
  });
});
