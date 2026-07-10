import { ImportForm } from "./ImportForm";

export default function ImportAssetsPage() {
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">레포 가져오기</h1>
        <p className="mb-6 text-[13px] text-muted">
          레포 URL로 Dockerfile을 발견하고, 선택한 이미지를 새 프로젝트의 자산으로 가져옵니다
        </p>
        <ImportForm />
      </div>
    </main>
  );
}
