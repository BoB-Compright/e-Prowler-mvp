import Link from "next/link";
import { getCatalogSummary } from "@/lib/catalog";
import { StartRunForm } from "./StartRunForm";

export default function Home() {
  const summary = getCatalogSummary();

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center px-6 py-24">
      <h1 className="text-2xl font-semibold">
        AI 기반 컨테이너 보안 점검 파이프라인
      </h1>
      <p className="mt-2 text-slate-600">
        GitHub 레포 → Docker 빌드 → Sandbox 실행 → Ansible 보안 점검 → Claude 분석
        → Web Dashboard
      </p>

      <StartRunForm />

      <Link
        href="/catalog"
        className="mt-8 inline-flex w-fit items-center text-sm font-medium text-slate-600 underline hover:text-black"
      >
        점검 항목 카탈로그 보기 ({summary.total}개)
      </Link>
    </main>
  );
}
