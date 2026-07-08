import { listProjects } from "@/lib/projects/store";
import { UploadForm } from "./UploadForm";

export default async function UploadAssetsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-lg font-bold text-[var(--color-text)]">자산 엑셀 일괄 업로드</h1>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        시트 이름은 <code>repo</code>, <code>server</code>여야 합니다. repo: display_name, repo_url.
        server: display_name, host_ip, hostname, ssh_port, auth_type, username, secret.
      </p>
      <UploadForm projects={listProjects()} />
    </main>
  );
}
