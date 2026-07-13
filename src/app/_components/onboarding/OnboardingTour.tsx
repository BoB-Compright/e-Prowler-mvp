"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ONBOARDING_STEPS,
  ONBOARDING_DONE_KEY,
  ONBOARDING_FORCE_KEY,
  shouldAutoStart,
  type OnboardingStep,
} from "@/lib/onboarding/steps";
import { StepPreview } from "./StepPreview";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// 대상 요소의 화면 위치. 요소가 없으면 null → 중앙 말풍선 폴백.
function anchorRect(anchor: string | null): Rect | null {
  if (!anchor) return null;
  const el = document.querySelector(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function OnboardingTour({ assetCount }: { assetCount: number }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 마운트 후에만 localStorage/sessionStorage·DOM 접근 (SSR 안전)
  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
    const forced = sessionStorage.getItem(ONBOARDING_FORCE_KEY) === "1";
    if (forced) {
      sessionStorage.removeItem(ONBOARDING_FORCE_KEY);
      // 마운트 시 1회성 초기화(세션 스토리지 판독 후 상태 반영)이며 구독 콜백이 아니라
      // cascading render 우려가 없다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIndex(0);
      setActive(true);
    } else if (shouldAutoStart(seen)) {
      setActive(true);
    }
  }, [assetCount]);

  const step: OnboardingStep | undefined = active ? ONBOARDING_STEPS[index] : undefined;

  // 현재 스텝의 앵커 위치 계산 + 리사이즈/스크롤 시 재계산
  useEffect(() => {
    if (!step) return;
    const update = () => setRect(anchorRect(step.anchor));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  // aria-modal 다이얼로그이므로 초기 포커스를 배경이 아닌 말풍선으로 이동시킨다.
  useEffect(() => {
    if (active) tooltipRef.current?.focus();
  }, [active, index]);

  const finish = useCallback(() => {
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    setActive(false);
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= ONBOARDING_STEPS.length - 1) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish, next, prev]);

  if (!active || !step) return null;

  const isLast = index === ONBOARDING_STEPS.length - 1;
  const pad = 6;
  // 앵커가 있으면(placement auto + 요소 발견) 예시 미리보기 유무와 무관하게
  // 스포트라이트로 강조한다. 앵커가 없으면(center 스텝, 또는 모바일에서 사이드바
  // 숨김) 화면 중앙에 배치한다.
  const hasPreview = !!step.preview;
  const spotlight = !!rect && step.placement === "auto";
  const boxW = hasPreview ? 360 : 320;
  const boxH = hasPreview ? 380 : 180; // 배치 계산용 대략 높이
  // 말풍선 위치: 스포트라이트 스텝은 앵커 아래(공간 없으면 위)에 두되 화면 안에
  // 완전히 들어오도록 클램프. 그 외엔 화면 중앙.
  const tooltipStyle: React.CSSProperties = spotlight
    ? (() => {
        const below = rect!.top + rect!.height + 12;
        const placeBelow = below + boxH < window.innerHeight;
        const top = placeBelow ? below : rect!.top - 12 - boxH;
        return {
          position: "fixed",
          top: Math.min(Math.max(12, top), Math.max(12, window.innerHeight - boxH - 12)),
          left: Math.min(Math.max(12, rect!.left), Math.max(12, window.innerWidth - boxW - 12)),
          width: boxW,
          maxWidth: "calc(100vw - 24px)",
        };
      })()
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        width: boxW,
        maxWidth: "calc(100vw - 24px)",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      {/* 딤 오버레이: 스포트라이트 스텝(앵커 있음)에서는 스포트라이트 링의 boxShadow가 딤을 대신 만들므로
          전체 딤을 투명하게 둬서 이중 딤을 방지한다. 앵커 없는 center 스텝에서는 전체 딤을 표시한다. */}
      <div
        className="absolute inset-0"
        style={{ background: spotlight ? "transparent" : "rgba(0,0,0,0.5)" }}
        onClick={finish}
      />
      {/* 스포트라이트 하이라이트 링 (앵커가 있고 미리보기 스텝이 아닐 때만) */}
      {spotlight && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary ring-offset-2"
          style={{
            position: "fixed",
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
            borderRadius: 12,
          }}
        />
      )}
      {/* 말풍선 */}
      <div
        ref={tooltipRef}
        tabIndex={-1}
        style={tooltipStyle}
        className="rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-[12px] font-mono text-muted">
          {index + 1} / {ONBOARDING_STEPS.length}
        </div>
        <h3 id="onboarding-title" className="flex items-center gap-2 text-[16px] font-bold">
          {step.stepNumber && (
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-[12px] font-bold text-white">
              {step.stepNumber}
            </span>
          )}
          {step.title}
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{step.body}</p>

        {step.preview && <StepPreview kind={step.preview} />}

        {step.cta && (
          <Link
            href={step.cta.href}
            onClick={finish}
            className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            {step.cta.label}
          </Link>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={finish} className="text-[12.5px] text-muted hover:underline">
            건너뛰기
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium hover:bg-bg"
              >
                이전
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90"
            >
              {isLast ? "완료" : "다음"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
