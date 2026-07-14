"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SectionLabel } from "../_components/SectionLabel";
import { StatusBadge } from "../_components/StatusBadge";
import type { BadgeStatus } from "../_components/statusBadgeStyles";
import type { AssetKind } from "@/lib/assets/kind";
import { AssetKindBadge } from "../_components/AssetKindBadge";
import { Modal } from "../_components/Modal";

export interface AssetRowData {
  id: string;
  displayName: string;
  detail: string; // repoUrl 또는 host:port
  typeLabel: string; // "레포" | "서버"
  kind: AssetKind; // 실질 구분(OS/WEB/WAS/DB/기타)
  scanCategories: string[]; // 이 자산 점검 계획의 후보 카테고리(container/OS/WEB/WAS/DB)
  projectName: string;
  createdAt: string;
  scheduleLabel: string;
  badgeStatus: BadgeStatus;
  badgeLabel: string;
  // 최근 7일 내 critical CVE 경보 수. /assets 목록만 채워 넣는다 — 업로드
  // 미리보기·프로젝트 상세 등 다른 사용처는 생략(배지 없음)이 기본이라 optional.
  newCveAlertCount?: number;
}

type PanelMode = null | "move" | "schedule";

const CATEGORY_LABEL: Record<string, string> = {
  container: "컨테이너", OS: "OS", WEB: "WEB", WAS: "WAS", DB: "DB",
};

const actionButtonClass =
  "rounded-lg border border-primary px-3 py-1.5 text-[13px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-50";
const selectClass =
  "rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] focus:border-primary focus:outline-none";

export function AssetTable({
  rows,
  projects,
}: {
  rows: AssetRowData[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<PanelMode>(null);
  const [moveTarget, setMoveTarget] = useState<string>(""); // "" = 소속 없음
  const [scheduleTarget, setScheduleTarget] = useState<string>("daily"); // daily|weekly|monthly|none
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanCats, setScanCats] = useState<string[]>([]);

  // 필터 변경으로 rows가 바뀌면 사라진 행의 선택은 무시한다.
  const rowIds = new Set(rows.map((r) => r.id));
  const selectedIds = [...selected].filter((id) => rowIds.has(id));
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function callBulk(
    path: string,
    method: "POST" | "PATCH",
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: selectedIds, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const handleScan = () => {
    if (selectedIds.length === 1) {
      const row = rows.find((r) => r.id === selectedIds[0]);
      setScanCats(row ? [...row.scanCategories] : []);
      setScanModalOpen(true);
      return;
    }
    runAction(async () => {
      const { ok, data } = await callBulk("/api/assets/bulk/scan", "POST", {});
      if (!ok) {
        setMessage(String(data.error ?? "일괄 점검 시작 실패"));
        return;
      }
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      if (skipped > 0) {
        window.alert(`${data.started}개 점검을 시작했습니다. ${skipped}개는 이미 점검 중이어서 건너뛰었습니다.`);
      }
      router.push(`/runs/batch/${data.batchId}`);
    });
  };

  async function startSingleScan() {
    const assetId = selectedIds[0];
    if (!assetId || scanCats.length === 0) return;
    await runAction(async () => {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, categories: scanCats }),
      });
      if (res.ok) {
        setScanModalOpen(false);
        setMessage("점검을 시작했습니다");
      } else {
        setMessage("점검 시작에 실패했습니다");
      }
    });
  }

  const handleMove = () =>
    runAction(async () => {
      const { ok, data } = await callBulk("/api/assets/bulk/project", "PATCH", {
        projectId: moveTarget === "" ? null : moveTarget,
      });
      setMessage(ok ? `프로젝트 이동 완료 ${data.updated}건` : String(data.error ?? "이동 실패"));
      if (ok) {
        setPanel(null);
        setSelected(new Set());
        router.refresh();
      }
    });

  const handleSchedule = () =>
    runAction(async () => {
      const { ok, data } = await callBulk("/api/assets/bulk/schedule", "POST", {
        frequency: scheduleTarget === "none" ? null : scheduleTarget,
      });
      setMessage(ok ? `정기 점검 설정 완료 ${data.updated}건` : String(data.error ?? "설정 실패"));
      if (ok) {
        setPanel(null);
        setSelected(new Set());
        router.refresh();
      }
    });

  const handleDelete = () =>
    runAction(async () => {
      if (!window.confirm(`선택한 자산 ${selectedIds.length}개를 삭제할까요? 점검 이력도 함께 삭제됩니다.`)) {
        return;
      }
      const { ok, data } = await callBulk("/api/assets/bulk/delete", "POST", {});
      if (!ok) {
        setMessage(String(data.error ?? "삭제 실패"));
        return;
      }
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      setMessage(
        skipped > 0
          ? `삭제 ${data.deleted}건 · 건너뜀 ${skipped}건 (실행 중 점검)`
          : `삭제 완료 ${data.deleted}건`,
      );
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div>
      {selectedIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5">
          <span className="text-[13px] font-semibold">{selectedIds.length}개 선택</span>
          <button type="button" disabled={busy} onClick={handleScan} className={actionButtonClass}>
            일괄 점검
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPanel(panel === "move" ? null : "move")}
            className={actionButtonClass}
          >
            프로젝트 이동
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPanel(panel === "schedule" ? null : "schedule")}
            className={actionButtonClass}
          >
            정기 점검 설정
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="rounded-lg border border-fail px-3 py-1.5 text-[13px] font-semibold text-fail hover:bg-fail/5 disabled:opacity-50"
          >
            삭제
          </button>

          {panel === "move" && (
            <span className="flex items-center gap-2">
              <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} className={selectClass}>
                <option value="">소속 없음</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={busy} onClick={handleMove} className={actionButtonClass}>
                적용
              </button>
            </span>
          )}
          {panel === "schedule" && (
            <span className="flex items-center gap-2">
              <select
                value={scheduleTarget}
                onChange={(e) => setScheduleTarget(e.target.value)}
                className={selectClass}
              >
                <option value="daily">매일</option>
                <option value="weekly">매주</option>
                <option value="monthly">매월</option>
                <option value="none">해제</option>
              </select>
              <button type="button" disabled={busy} onClick={handleSchedule} className={actionButtonClass}>
                적용
              </button>
            </span>
          )}
        </div>
      )}

      {message && <p className="mb-3 text-[13px] text-muted">{message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-5 py-3">
                <SectionLabel>이름</SectionLabel>
              </th>
              <th className="px-5 py-3">
                <SectionLabel>타입</SectionLabel>
              </th>
              <th className="px-5 py-3">
                <SectionLabel>프로젝트</SectionLabel>
              </th>
              <th className="px-5 py-3">
                <SectionLabel>등록일</SectionLabel>
              </th>
              <th className="px-5 py-3">
                <SectionLabel>정기 점검</SectionLabel>
              </th>
              <th className="px-5 py-3">
                <SectionLabel>상태</SectionLabel>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-bg">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`${row.displayName} 선택`}
                    checked={selected.has(row.id)}
                    onChange={() => toggleOne(row.id)}
                  />
                </td>
                <td className="px-5 py-3">
                  <Link href={`/assets/${row.id}`} className="font-semibold text-primary hover:underline">
                    {row.displayName}
                  </Link>
                  {(row.newCveAlertCount ?? 0) > 0 && (
                    <span className="ml-2 align-middle">
                      <StatusBadge status="fail">신규 CVE {row.newCveAlertCount}</StatusBadge>
                    </span>
                  )}
                  <p className="mt-0.5 font-mono text-[13px] text-muted">{row.detail}</p>
                </td>
                <td className="px-5 py-3">
                  <span className="text-muted">{row.typeLabel}</span>
                  <span className="mt-0.5 block">
                    <AssetKindBadge kind={row.kind} />
                  </span>
                </td>
                <td className="px-5 py-3">{row.projectName}</td>
                <td className="px-5 py-3 font-mono text-[13px] text-muted">{row.createdAt}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{row.scheduleLabel}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={row.badgeStatus}>{row.badgeLabel}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="p-5 text-[13px] text-muted italic">조건에 맞는 자산이 없습니다.</p>
      )}

      <Modal open={scanModalOpen} onClose={() => setScanModalOpen(false)} title="점검 카테고리 선택">
        <p className="text-[13px] text-muted">점검할 카테고리를 고르면 대상 항목과 소요시간이 줄어듭니다.</p>
        <div className="mt-3 flex flex-col gap-2">
          {(rows.find((r) => r.id === selectedIds[0])?.scanCategories ?? []).map((cat) => (
            <label key={cat} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={scanCats.includes(cat)}
                onChange={(e) =>
                  setScanCats((prev) =>
                    e.target.checked ? [...prev, cat] : prev.filter((c) => c !== cat),
                  )
                }
              />
              {CATEGORY_LABEL[cat] ?? cat}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setScanModalOpen(false)}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-muted hover:bg-bg"
          >
            취소
          </button>
          <button
            type="button"
            onClick={startSingleScan}
            disabled={busy || scanCats.length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            점검 시작
          </button>
        </div>
      </Modal>
    </div>
  );
}
