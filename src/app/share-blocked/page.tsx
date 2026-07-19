import { Card } from "@/app/_components/Card";

// 공개 공유 호스트에서 공유 외 경로 접근 시 proxy가 이 페이지로 rewrite한다(#share-ux).
// 로그인 폼·관리자 내용 없이 "열람 전용" 안내만 — 관리자 표면은 은폐 유지.
export default function ShareBlockedPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-1 items-center justify-center px-4 py-16 md:px-8">
      <Card bodyClassName="p-8 text-center">
        <h1 className="text-[20px] font-bold tracking-[-0.01em]">접근 권한이 없습니다</h1>
        <p className="mt-2 text-[14px] text-muted">
          이 링크는 공유된 점검 리포트 열람 전용입니다. 요청하신 페이지에는 접근할 수 없습니다.
        </p>
        <p className="mt-1 text-[13px] text-muted">
          점검 리포트는 담당자가 전달한 공유 링크로만 열람할 수 있습니다.
        </p>
      </Card>
    </main>
  );
}
