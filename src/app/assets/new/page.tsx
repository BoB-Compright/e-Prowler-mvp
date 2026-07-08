import { listProjects } from "@/lib/projects/store";
import { AssetForm } from "./AssetForm";

export default async function NewAssetPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-lg font-bold text-[var(--color-text)]">자산 등록</h1>
      <AssetForm projects={listProjects()} />
    </main>
  );
}
