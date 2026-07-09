"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const THEME_CHANGE_EVENT = "nh-theme-change";

function subscribe(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
}

function getSnapshot(): Theme {
  return (document.documentElement.dataset.theme as Theme | undefined) ?? "light";
}

// ThemeScript always sets data-theme="light" as the pre-hydration fallback,
// so the server-rendered markup matches that until the real snapshot syncs.
function getServerSnapshot(): Theme {
  return "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <button
      onClick={toggle}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-bg hover:text-text"
    >
      {theme === "dark" ? "라이트" : "다크"}
    </button>
  );
}
