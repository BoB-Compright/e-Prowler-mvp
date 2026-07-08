import Link from "next/link";
import { getCatalogSummary } from "@/lib/catalog";
import { listAssets } from "@/lib/assets/store";
import { StartRunForm } from "./StartRunForm";

export default function Home() {
  const summary = getCatalogSummary();
  const assets = listAssets();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-24">
      <h1 className="text-2xl font-bold">AI 기반 컨테이너 보안 점검 파이프라인</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        GitHub 레포 → Docker 빌드 → Sandbox 실행 → Ansible 보안 점검 → Claude 분석
        → Web Dashboard
      </p>

      <div className="mt-8 rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <label className="block font-mono text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
          점검 대상 자산
        </label>
        <StartRunForm assets={assets} />
        <p className="mt-2 font-mono text-[11px] text-[var(--color-muted)]">
          등록된 자산을 선택하면 기본 브랜치를 자동 감지해 점검을 시작합니다
        </p>
      </div>

      <Link
        href="/catalog"
        className="mt-8 inline-flex w-fit items-center text-sm font-medium text-[var(--color-muted)] underline hover:text-[var(--color-text)]"
      >
        점검 항목 카탈로그 보기 ({summary.total}개)
      </Link>
    </main>
  );
}
