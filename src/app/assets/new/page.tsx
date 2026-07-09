import { listProjects } from "@/lib/projects/store";
import { AssetForm } from "./AssetForm";

export default async function NewAssetPage() {
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">자산 등록</h1>
        <p className="mb-6 text-[13px] text-muted">새 레포지토리 또는 서버 자산을 등록합니다</p>
        <AssetForm projects={listProjects()} />
      </div>
    </main>
  );
}
