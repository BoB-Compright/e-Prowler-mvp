import { getCatalogByCategory, getCatalogSummary } from "@/lib/catalog";
import { CATEGORY_LABELS, type Category } from "@/lib/catalog/types";

const CATEGORIES: Category[] = ["container", "unix", "web"];

const SEVERITY_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-slate-100 text-slate-700",
};

export default function CatalogPage() {
  const summary = getCatalogSummary();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">점검 항목 카탈로그</h1>
      <p className="mt-1 text-sm text-slate-600">
        컨테이너/이미지 하드닝, KISA 가이드 기반 Unix·웹서비스 점검 항목 총{" "}
        {summary.total}개 (자동화 {summary.automated} · 자동화 전 {summary.notAutomated})
      </p>

      {CATEGORIES.map((category) => {
        const items = getCatalogByCategory(category);
        return (
          <section key={category} className="mt-8">
            <h2 className="text-lg font-medium">
              {CATEGORY_LABELS[category]}{" "}
              <span className="text-sm font-normal text-slate-500">
                ({items.length}개)
              </span>
            </h2>
            <table className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">항목</th>
                  <th className="py-2 pr-4">심각도</th>
                  <th className="py-2 pr-4">자동화 상태</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono">{item.id}</td>
                    <td className="py-2 pr-4">{item.title}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          SEVERITY_STYLES[item.severity]
                        }`}
                      >
                        {item.severity}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {item.automationStatus === "automated" ? "자동화" : "자동화 전"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}
