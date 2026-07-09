import { listProjects } from "@/lib/projects/store";
import { UploadForm } from "./UploadForm";

export default async function UploadAssetsPage() {
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">자산 엑셀 일괄 업로드</h1>
        <p className="mt-1 text-[13px] text-muted">
          시트 이름은 <code className="font-mono">repo</code>, <code className="font-mono">server</code>여야
          합니다. repo: display_name, repo_url. server: display_name, host_ip, hostname, ssh_port, auth_type,
          username, secret.
        </p>
        <a
          href="/api/assets/upload/template"
          download="asset-upload-template.xlsx"
          className="mt-4 inline-flex w-fit items-center rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5"
        >
          예시 엑셀 파일 다운로드
        </a>
        <div className="mt-6">
          <UploadForm projects={listProjects()} />
        </div>
      </div>
    </main>
  );
}
