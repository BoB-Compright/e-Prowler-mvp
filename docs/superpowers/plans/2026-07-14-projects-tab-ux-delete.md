# 프로젝트 삭제 + 프로젝트 탭 UX 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트를 카드 ⋯ 메뉴+확인 다이얼로그로 삭제하고, 프로젝트 탭을 툴바(검색+새 프로젝트 버튼)+모달 생성+바로 아래 리스트로 통합한다.

**Architecture:** 삭제 백엔드(`deleteProject`·`DELETE /api/projects/[id]`)는 이미 존재하므로 store 견고성만 보강하고, 경량 `Modal`을 신설해 생성 폼·삭제 확인에 공용으로 쓴다. `page.tsx` 상단을 `ProjectsToolbar`로 교체하고 카드에 `ProjectCardMenu`를 얹는다.

**Tech Stack:** Next.js 16 App Router(server page + client 컴포넌트), TypeScript, better-sqlite3, vitest, Tailwind v4.

## Global Constraints

- 테스트/타입/린트/빌드는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- 기존 디자인 토큰 재사용: 패널 `rounded-2xl border border-border bg-surface`(또는 Card), primary 버튼 `rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90`, 입력 `rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary`.
- 삭제는 소속 자산을 삭제하지 않고 **연결만 해제**(project_id=NULL). 항상 확인 다이얼로그를 거친다(즉시 삭제 금지).
- 삭제 백엔드는 이미 존재(`deleteProject` store, `DELETE /api/projects/[id]`) — 재구현 금지, 보강만.
- 컴포넌트 테스트 인프라 없음 — UI는 tsc/eslint/next build로 검증.

---

### Task 1: `deleteProject` scan_batches 견고성 보강

**Files:**
- Modify: `src/lib/projects/store.ts` (deleteProject 트랜잭션)
- Test: `src/lib/projects/store.test.ts`

**Interfaces:**
- Consumes: 기존 `deleteProject(id, db)`, `createProject`, `createRepoAsset`, `getAsset`, `getProject`; `createScanBatch(projectId, db)`(`@/lib/pipeline/scanBatches`).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/projects/store.test.ts`에 추가(기존 harness `db=createInMemoryDb()`, `createProject`/`createRepoAsset`/`getAsset`/`getProject`/`deleteProject` 이미 import됨). `createScanBatch` import를 상단에 추가:

```ts
import { createScanBatch } from "@/lib/pipeline/scanBatches";

describe("deleteProject cascade", () => {
  it("scan_batches가 있는 프로젝트도 FK 오류 없이 삭제하고 자산·배치는 연결만 해제한다", () => {
    const p = createProject({ name: "P", pmName: "김", pmEmail: "p@nh.com", sharePassword: "pw" }, db);
    const asset = createRepoAsset({ displayName: "img", repoUrl: "https://github.com/nh/x", projectId: p.id }, db);
    const batch = createScanBatch(p.id, db);

    deleteProject(p.id, db);

    expect(getProject(p.id, db)).toBeUndefined();
    // 자산은 남고 project_id만 NULL
    expect(getAsset(asset.id, db)!.projectId).toBeNull();
    // 배치 행은 남고 project_id만 NULL
    const batchRow = db.prepare(`SELECT project_id FROM scan_batches WHERE id = ?`).get(batch.id) as { project_id: string | null };
    expect(batchRow.project_id).toBeNull();
  });
});
```
(주: `createRepoAsset`는 `{ displayName, repoUrl, projectId? }` 시그니처. `getProject`는 미존재 시 `undefined`를 반환하므로 `toBeUndefined()`가 맞다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/projects/store.test.ts`
Expected: FAIL — scan_batches.project_id가 그대로 남거나(현재 미처리) FK로 삭제 실패.

- [ ] **Step 3: deleteProject 보강**

`src/lib/projects/store.ts`의 `deleteProject` 트랜잭션에 assets NULL 처리와 DELETE 사이에 scan_batches NULL 처리를 추가:

```ts
export function deleteProject(id: string, db: Database = getDb()): void {
  const transaction = db.transaction(() => {
    db.prepare(`UPDATE assets SET project_id = NULL WHERE project_id = ?`).run(id);
    db.prepare(`UPDATE scan_batches SET project_id = NULL WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  });
  transaction();
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/projects/store.test.ts && npx tsc --noEmit`
Expected: PASS, 타입 클린.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/projects/store.ts src/lib/projects/store.test.ts
git commit -m "fix: deleteProject가 scan_batches.project_id도 해제(FK 오류 방지)"
```

---

### Task 2: 경량 `Modal` 컴포넌트

**Files:**
- Create: `src/app/_components/Modal.tsx`

**Interfaces:**
- Produces: `<Modal open onClose title? children />` — `open: boolean`, `onClose: () => void`, `title?: React.ReactNode`, `children: React.ReactNode`.

- [ ] **Step 1: 컴포넌트 구현**

`src/app/_components/Modal.tsx` 생성:

```tsx
"use client";

import { useEffect } from "react";

// 디자인 토큰 기반 경량 모달. open=false면 렌더하지 않음. ESC·오버레이 클릭·✖로 닫힘.
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted hover:text-text"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 정적 검증**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/_components/Modal.tsx`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/app/_components/Modal.tsx
git commit -m "feat: 경량 Modal 컴포넌트(오버레이·ESC·✖ 닫기, 디자인 토큰)"
```

---

### Task 3: 툴바 + 모달 생성 (ProjectForm onSuccess, ProjectsToolbar, page.tsx 상단 교체)

**Files:**
- Modify: `src/app/projects/ProjectForm.tsx` (onSuccess 콜백)
- Create: `src/app/projects/ProjectsToolbar.tsx`
- Modify: `src/app/projects/page.tsx` (상단 블록 교체)

**Interfaces:**
- Consumes: `Modal`(Task 2), 기존 `ProjectSearch`, `ProjectForm`.
- Produces: `<ProjectsToolbar />`(client).

- [ ] **Step 1: ProjectForm에 onSuccess 콜백 추가**

`src/app/projects/ProjectForm.tsx`: 시그니처와 성공 처리부를 수정한다.

컴포넌트 선언을 `export function ProjectForm({ onSuccess }: { onSuccess?: () => void })`로 바꾸고, 성공 블록을:
```tsx
    if (res.ok) {
      form.reset();
      if (onSuccess) onSuccess();
      else router.refresh();
    }
```
(onSuccess가 있으면 부모가 모달 닫기+refresh를 담당, 없으면 기존처럼 자체 refresh — 하위 호환.)

- [ ] **Step 2: ProjectsToolbar 생성**

`src/app/projects/ProjectsToolbar.tsx` 생성:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectSearch } from "./ProjectSearch";
import { ProjectForm } from "./ProjectForm";
import { Modal } from "../_components/Modal";

// 프로젝트 탭 상단 툴바: 좌측 검색 + 우측 새 프로젝트 버튼(모달 생성).
export function ProjectsToolbar() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <ProjectSearch />
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
      >
        + 새 프로젝트
      </button>
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="새 프로젝트">
        <ProjectForm
          onSuccess={() => {
            setCreateOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}
```

- [ ] **Step 3: page.tsx 상단 블록 교체**

`src/app/projects/page.tsx`:
- import 교체: `ProjectForm`/`ProjectSearch` 직접 import 제거, `import { ProjectsToolbar } from "./ProjectsToolbar";` 추가.
- 헤더(`<div className="mb-6">…프로젝트…</div>`) 다음의 두 블록:
```tsx
      <Card title="새 프로젝트" className="mb-6">
        <ProjectForm />
      </Card>

      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <ProjectSearch />
      </div>
```
을 아래 한 줄로 교체:
```tsx
      <ProjectsToolbar />
```
(나머지 리스트/빈 상태 그리드는 그대로.)

- [ ] **Step 4: 정적 검증 + 빌드**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/projects/ProjectForm.tsx" "src/app/projects/ProjectsToolbar.tsx" "src/app/projects/page.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/projects/ProjectForm.tsx" "src/app/projects/ProjectsToolbar.tsx" "src/app/projects/page.tsx"
git commit -m "feat: 프로젝트 탭 툴바(검색+새 프로젝트 버튼)+모달 생성으로 통합"
```

---

### Task 4: 카드 삭제 메뉴 (ProjectCardMenu + page.tsx 카드 배선)

**Files:**
- Create: `src/app/projects/ProjectCardMenu.tsx`
- Modify: `src/app/projects/page.tsx` (카드 action에 메뉴)

**Interfaces:**
- Consumes: `Modal`(Task 2).
- Produces: `<ProjectCardMenu projectId projectName assetCount />`.

- [ ] **Step 1: ProjectCardMenu 생성**

`src/app/projects/ProjectCardMenu.tsx` 생성:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";

// 프로젝트 카드의 삭제 진입점: ⋯ 버튼 → 확인 다이얼로그 → DELETE.
export function ProjectCardMenu({
  projectId,
  projectName,
  assetCount,
}: {
  projectId: string;
  projectName: string;
  assetCount: number;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("삭제에 실패했습니다");
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } catch {
      setError("서버 연결 실패");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label={`${projectName} 삭제`}
        className="rounded-md px-2 py-1 text-[13px] text-muted hover:bg-bg hover:text-fail"
      >
        삭제
      </button>
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="프로젝트 삭제">
        <p className="text-[13px] text-muted">
          &lsquo;<span className="font-semibold text-text">{projectName}</span>&rsquo; 프로젝트를 삭제할까요?
          소속 자산 {assetCount}개는 삭제되지 않고 연결만 해제됩니다.
        </p>
        {error && <p className="mt-2 text-[13px] text-fail">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-muted hover:bg-bg"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg bg-fail px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </Modal>
    </>
  );
}
```
(주: `bg-fail`은 유효한 토큰 — `ShareLinkPanel.tsx`의 `dangerButtonClass`가 동일하게 `rounded-lg bg-fail px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90`를 쓴다. 그대로 사용.)

- [ ] **Step 2: page.tsx 카드 action에 메뉴 추가**

`src/app/projects/page.tsx`:
- import 추가: `import { ProjectCardMenu } from "./ProjectCardMenu";`
- 프로젝트 카드의 `action` prop(현재 `<span className="text-[13px] text-muted">자산 {projectAssets.length}</span>`)을 자산 수 + 메뉴 병기로 교체:
```tsx
                action={
                  <span className="flex items-center gap-3">
                    <span className="text-[13px] text-muted">자산 {projectAssets.length}</span>
                    <ProjectCardMenu
                      projectId={project.id}
                      projectName={project.name}
                      assetCount={projectAssets.length}
                    />
                  </span>
                }
```

- [ ] **Step 3: 정적 검증 + 빌드**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/projects/ProjectCardMenu.tsx" "src/app/projects/page.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 4: 전체 테스트 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run 2>&1 | tail -3`
Expected: 전부 통과.

```bash
git add "src/app/projects/ProjectCardMenu.tsx" "src/app/projects/page.tsx"
git commit -m "feat: 프로젝트 카드 삭제(확인 다이얼로그, 자산 연결 해제 안내)"
```

---

## 실행 후(병합 전) 컨트롤러 — 수동 확인 + 배포
- 프로젝트 탭: 상단 툴바(검색+새 프로젝트) 한 줄, "+ 새 프로젝트" → 모달 생성 → 성공 시 닫힘·목록 갱신.
- 검색 디바운스·URL 동기 회귀 없는지.
- 카드 "삭제" → 확인 다이얼로그(자산 N개 연결 해제 안내) → 삭제 후 목록에서 사라짐. 자산은 자산 관리에 남아있고 프로젝트 미지정인지.
- 프로덕션 재빌드·재기동(TZ=Asia/Seoul) + 공개 URL 200 확인.
