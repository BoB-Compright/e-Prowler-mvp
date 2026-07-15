# 모든 단일 자산 스캔 진입점에 카테고리 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 자산 점검 진입점(자산 상세·리포트 재점검·자산 목록 단일) 전부에서 카테고리 사전선택 모달이 뜨도록 공용화·통일한다.

**Architecture:** 후보 카테고리 계산을 `assetScanCategories` 헬퍼로 추출하고, AssetTable의 인라인 카테고리 모달을 공용 `ScanCategoryModal`(+버튼 래퍼 `ScanCategoryButton`)로 뽑아 세 진입점이 재사용한다. 리포트 재점검은 `/api/runs/[id]`가 `scanCategories`를 반환해 공급한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3, vitest, Tailwind v4.

## Global Constraints

- 테스트/타입/린트/빌드는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- 모달 UX·기본값(전체 체크·최소 1개)·POST 계약(`POST /api/runs {assetId, categories}` → `/runs/{id}` 이동)은 기존 AssetTable 단일 점검과 동일.
- `assetScanCategories(asset)` = `[...new Set(resolveCheckPlan(asset).packs.map((p) => p.category))]`(기존 로직 그대로).
- 카테고리 라벨: `{ container:"컨테이너", OS:"OS", WEB:"WEB", WAS:"WAS", DB:"DB" }`.
- 클라이언트 컴포넌트는 서버 전용 모듈 값 import 금지(assetScanCategories는 서버/page·API에서만 호출, 결과 문자열 배열만 클라로 전달).
- 플릿·로컬이미지 경로는 변경 없음(카테고리 미전달=전체).
- 컴포넌트 테스트 인프라 없음 — UI는 tsc/eslint/next build로 검증.

---

### Task 1: `assetScanCategories` 헬퍼 추출 + page 중복 제거

**Files:**
- Modify: `src/lib/packs/resolve.ts`
- Modify: `src/app/assets/page.tsx`, `src/app/projects/[id]/page.tsx`
- Test: `src/lib/packs/resolve.test.ts`

**Interfaces:**
- Produces: `assetScanCategories(asset: Asset): string[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/packs/resolve.test.ts`에 추가(상단 import에 `assetScanCategories`; `repoAsset`/`serverAsset` 헬퍼 기존 존재):
```ts
import { assetScanCategories } from "./resolve";

describe("assetScanCategories", () => {
  it("이미지는 container·OS·WEB·WAS·DB 고유 카테고리", () => {
    expect(assetScanCategories(repoAsset()).sort()).toEqual(["DB", "OS", "WEB", "WAS", "container"].sort());
  });
  it("서버 OS/Ubuntu는 OS", () => {
    expect(assetScanCategories(serverAsset({ category: "OS", vendor: "Ubuntu" }))).toEqual(["OS"]);
  });
  it("서버 DB/PostgreSQL은 OS + DB", () => {
    expect(assetScanCategories(serverAsset({ category: "DB", vendor: "PostgreSQL" })).sort()).toEqual(["DB", "OS"].sort());
  });
});
```
(확인됨: 이 파일의 `serverAsset`/`repoAsset`은 `Partial<Asset>`를 받으므로 `serverAsset({category,vendor})` 유효.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/packs/resolve.test.ts`
Expected: FAIL — 미정의.

- [ ] **Step 3: 헬퍼 구현 + page 교체**

`src/lib/packs/resolve.ts`에 추가:
```ts
// 자산 점검 계획이 담을 수 있는 후보 카테고리(container/OS/WEB/WAS/DB) 고유 목록. 카테고리 선택 UI용.
export function assetScanCategories(asset: Asset): string[] {
  return [...new Set(resolveCheckPlan(asset).packs.map((p) => p.category))];
}
```
(`Asset` 타입이 이 파일에 이미 import돼 있음 — resolveCheckPlan 인자 타입.)

`src/app/assets/page.tsx`·`src/app/projects/[id]/page.tsx`: import에 `assetScanCategories` 추가(기존 `resolveCheckPlan` import 옆), row 빌드의
`scanCategories: [...new Set(resolveCheckPlan(asset).packs.map((p) => p.category))],`를
`scanCategories: assetScanCategories(asset),`로 교체. (resolveCheckPlan을 더 안 쓰면 import 정리.)

- [ ] **Step 4: 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/packs/resolve.test.ts && npx tsc --noEmit`
Expected: PASS, 타입 클린.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/packs/resolve.ts src/lib/packs/resolve.test.ts src/app/assets/page.tsx "src/app/projects/[id]/page.tsx"
git commit -m "refactor: assetScanCategories 헬퍼 추출(후보 카테고리 계산 DRY)"
```

---

### Task 2: 공용 `ScanCategoryModal` + `ScanCategoryButton`

**Files:**
- Create: `src/app/_components/ScanCategoryModal.tsx`
- Create: `src/app/_components/ScanCategoryButton.tsx`

**Interfaces:**
- Consumes: `Modal`(`./Modal`).
- Produces:
  - `<ScanCategoryModal open onClose assetId scanCategories onStarted? />`
  - `<ScanCategoryButton assetId scanCategories label variant? />`

- [ ] **Step 1: ScanCategoryModal 구현 (AssetTable 인라인 로직 추출)**

`src/app/_components/ScanCategoryModal.tsx` 생성. AssetTable의 카테고리 모달+startSingleScan 동작을 그대로:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

const CATEGORY_LABEL: Record<string, string> = {
  container: "컨테이너", OS: "OS", WEB: "WEB", WAS: "WAS", DB: "DB",
};

// 단일 자산 점검 시 카테고리 사전선택 모달. 기본 전체 체크, 최소 1개, POST /api/runs → /runs/{id} 이동.
export function ScanCategoryModal({
  open, onClose, assetId, scanCategories,
}: {
  open: boolean;
  onClose: () => void;
  assetId: string;
  scanCategories: string[];
}) {
  const router = useRouter();
  const [cats, setCats] = useState<string[]>(scanCategories);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달을 열 때마다 전체 체크로 초기화.
  useEffect(() => {
    if (open) {
      setCats(scanCategories);
      setError(null);
    }
  }, [open, scanCategories]);

  async function start() {
    if (cats.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, categories: cats }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.run?.id) {
        onClose();
        router.push(`/runs/${data.run.id}`);
      } else {
        setError(String(data.error ?? "점검 시작에 실패했습니다"));
      }
    } catch {
      setError("서버에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="점검 카테고리 선택">
      <p className="text-[13px] text-muted">점검할 카테고리를 고르면 대상 항목과 소요시간이 줄어듭니다.</p>
      <div className="mt-3 flex flex-col gap-2">
        {scanCategories.map((cat) => (
          <label key={cat} className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={cats.includes(cat)}
              onChange={(e) =>
                setCats((prev) => (e.target.checked ? [...prev, cat] : prev.filter((c) => c !== cat)))
              }
            />
            {CATEGORY_LABEL[cat] ?? cat}
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-[13px] text-fail">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-muted hover:bg-bg"
        >
          취소
        </button>
        <button
          type="button"
          onClick={start}
          disabled={submitting || cats.length === 0}
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "시작 중…" : "점검 시작"}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: ScanCategoryButton 구현 (버튼 래퍼)**

`src/app/_components/ScanCategoryButton.tsx` 생성:
```tsx
"use client";

import { useState } from "react";
import { ScanCategoryModal } from "./ScanCategoryModal";

// 단일 자산 점검 진입 버튼 + 카테고리 모달. 자산 상세/리포트 재점검에서 사용.
export function ScanCategoryButton({
  assetId, scanCategories, label, variant = "primary",
}: {
  assetId: string;
  scanCategories: string[];
  label: string;
  variant?: "primary" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const cls =
    variant === "outline"
      ? "rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-primary hover:bg-primary/5"
      : "rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-white hover:opacity-90";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cls}>
        {label}
      </button>
      <ScanCategoryModal open={open} onClose={() => setOpen(false)} assetId={assetId} scanCategories={scanCategories} />
    </>
  );
}
```

- [ ] **Step 3: 정적 검증**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/_components/ScanCategoryModal.tsx src/app/_components/ScanCategoryButton.tsx`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/app/_components/ScanCategoryModal.tsx src/app/_components/ScanCategoryButton.tsx
git commit -m "feat: 공용 ScanCategoryModal·ScanCategoryButton(단일 자산 카테고리 선택 점검)"
```

---

### Task 3: AssetTable을 공용 모달로 리팩터

**Files:**
- Modify: `src/app/assets/AssetTable.tsx`

**Interfaces:**
- Consumes: `ScanCategoryModal`(Task 2).

- [ ] **Step 1: 인라인 모달 제거·공용 모달로 교체**

`src/app/assets/AssetTable.tsx`:
- import 추가: `import { ScanCategoryModal } from "../_components/ScanCategoryModal";`
- 로컬 `CATEGORY_LABEL` 상수, `scanCats` state, `startSingleScan` 함수, 인라인 `<Modal open={scanModalOpen} … 점검 카테고리 선택 …>` 블록을 **제거**한다. `scanModalOpen` state는 유지.
- 기존 `handleScan`의 단일 선택 분기(선택 1개면 `setScanCats(...)` 후 `setScanModalOpen(true)`)에서 `setScanCats` 호출은 제거하고 `setScanModalOpen(true)`만 유지(모달이 자체적으로 전체 체크 초기화).
- 컴포넌트 JSX에 공용 모달을 렌더(기존 인라인 모달 자리 대체):
```tsx
      <ScanCategoryModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        assetId={selectedIds[0] ?? ""}
        scanCategories={rows.find((r) => r.id === selectedIds[0])?.scanCategories ?? []}
      />
```
- 단일 점검 성공 후 이동/refresh는 공용 모달이 담당하므로, 기존 startSingleScan의 `setSelected(new Set())`는 필요 시 모달 onClose 이후로 자연 소멸(선택 유지되어도 무방). `Modal`을 직접 import하던 게 다른 데서 안 쓰이면 정리.

- [ ] **Step 2: 정적 검증 + 빌드**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/assets/AssetTable.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/assets/AssetTable.tsx"
git commit -m "refactor: AssetTable 단일 점검을 공용 ScanCategoryModal로 통일"
```

---

### Task 4: 자산 상세·리포트 재점검에 배선 (+ /api/runs/[id] scanCategories)

**Files:**
- Modify: `src/app/api/runs/[id]/route.ts` (scanCategories 응답)
- Modify: `src/app/assets/[id]/page.tsx` (StartScanButton → ScanCategoryButton)
- Modify: `src/app/runs/[id]/report/ReportView.tsx` (RescanButton → ScanCategoryButton)
- Delete/Deprecate: `src/app/assets/[id]/StartScanButton.tsx`, `src/app/runs/[id]/report/RescanButton.tsx` (공용으로 대체)
- Test: `src/app/api/runs/[id]/route.test.ts` (있으면; 없으면 생략 가능)

**Interfaces:**
- Consumes: `ScanCategoryButton`(Task 2), `assetScanCategories`(Task 1).

- [ ] **Step 1: /api/runs/[id]에 scanCategories 추가**

`src/app/api/runs/[id]/route.ts`: import에 `getAsset`(`@/lib/assets/store`), `assetScanCategories`(`@/lib/packs/resolve`) 추가.
`run` 조회 뒤, 응답에 scanCategories 포함:
```ts
  const asset = run.assetId ? getAsset(run.assetId) : undefined;
  const scanCategories = asset ? assetScanCategories(asset) : [];
  // ... 기존 checks/cveMatches ...
  return NextResponse.json({ run, events: listRunEvents(id), checks, cveMatches, scanCategories });
```
(기존 반환 객체에 `scanCategories`만 추가.)

- [ ] **Step 2: 자산 상세 페이지 교체**

`src/app/assets/[id]/page.tsx`: import에 `import { ScanCategoryButton } from "@/app/_components/ScanCategoryButton";`, `import { assetScanCategories } from "@/lib/packs/resolve";` 추가(StartScanButton import 제거).
`<StartScanButton assetId={id} />`를 아래로 교체:
```tsx
          <ScanCategoryButton assetId={id} scanCategories={assetScanCategories(asset)} label="점검 시작" variant="primary" />
```

- [ ] **Step 3: 리포트 재점검 교체**

`src/app/runs/[id]/report/ReportView.tsx`: import에 `import { ScanCategoryButton } from "@/app/_components/ScanCategoryButton";` 추가(RescanButton import 제거). ReportView가 `/api/runs/[id]` 데이터를 받는 부분에서 `scanCategories`를 상태로 보관(`data.scanCategories ?? []`).
`{run.status !== "running" && run.assetId && <RescanButton assetId={run.assetId} />}`를 아래로 교체:
```tsx
          {run.status !== "running" && run.assetId && (
            <ScanCategoryButton assetId={run.assetId} scanCategories={scanCategories} label="재스캔" variant="outline" />
          )}
```
(`scanCategories`는 load()에서 `setScanCategories(data.scanCategories ?? [])`로 채운 state. 없으면 [] → 모달에 항목 없이 열리지만 정상 경로에선 채워짐.)

- [ ] **Step 4: 사용 안 하게 된 버튼 파일 정리**

`StartScanButton.tsx`·`RescanButton.tsx`가 다른 곳에서 import되지 않으면 삭제(grep으로 확인 후). 참조가 남아있으면 남겨둔다.

- [ ] **Step 5: 정적 검증 + 빌드 + 전체 테스트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/api/runs/[id]/route.ts" "src/app/assets/[id]/page.tsx" "src/app/runs/[id]/report/ReportView.tsx" && npx next build 2>&1 | tail -3 && npx vitest run 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공, 전체 테스트 통과.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: 자산 상세·리포트 재점검에 카테고리 선택 모달 통일(+/api/runs/[id] scanCategories)"
```

---

## 실행 후(병합 전) 컨트롤러 — 수동 확인 + 배포
- 자산 상세(`/assets/[id]`) "점검 시작" → 카테고리 모달, 자산 목록 단일 점검, 리포트 "재스캔" 모두 동일 모달.
- 카테고리 일부 해제 후 시작 → 좁혀진 점검, 전체 해제 시 시작 비활성.
- 플릿 점검은 기존 전체 유지(모달 없음).
- 프로덕션 재빌드·재기동(.env 실어서) + cloudflared 공개 URL 200.
