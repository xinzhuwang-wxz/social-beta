"use client";

import { useSyncExternalStore } from "react";

type ThemePref = "system" | "light" | "dark";

const STORAGE_KEY = "pool-theme";
const ORDER: ThemePref[] = ["system", "light", "dark"];
const LABEL: Record<ThemePref, string> = {
  system: "跟随系统",
  light: "白天",
  dark: "夜里",
};

// 按钮显示的状态来自 <html data-theme>，它是外部（DOM）的真相源，不是
// 组件自己的 state——所以用 useSyncExternalStore 订阅它，而不是
// useState+useEffect 手动同步。后者会在 effect 里同步调 setState，
// 触发级联渲染，也是 react-hooks/set-state-in-effect 明确要避免的写法。
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot(): ThemePref {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

function getServerSnapshot(): ThemePref {
  // 服务端不可能知道客户端 localStorage 里存了什么，统一按 "system" 渲染，
  // 真正的初始视觉主题已经由 layout.tsx 里的内联脚本在首帧前写进了
  // <html data-theme>——这里只是按钮上的文案，用 useSyncExternalStore
  // 会在 hydrate 后立刻用 getSnapshot 的真实值重渲染一次，不会有告警。
  return "system";
}

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") {
    // 三态里的"未标记态"：不写 data-theme，交给 globals.css 里的
    // prefers-color-scheme 分支决定。
    root.removeAttribute("data-theme");
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    root.setAttribute("data-theme", pref);
    window.localStorage.setItem(STORAGE_KEY, pref);
  }
  listeners.forEach((notify) => notify());
}

/** 深浅色三态的手动开关：跟随系统 → 浅色 → 深色 → 循环。 */
export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-pill)] border border-border-strong px-3.5 py-2 text-sm text-ink-muted transition-colors duration-200 hover:bg-surface-alt hover:text-ink"
      aria-label={`外观：${LABEL[pref]}。点击切换到下一种`}
    >
      <ThemeGlyph pref={pref} />
      <span>{LABEL[pref]}</span>
    </button>
  );
}

function ThemeGlyph({ pref }: { pref: ThemePref }) {
  if (pref === "light") {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r="3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <line x1="8" y1="0.6" x2="8" y2="2.4" />
          <line x1="8" y1="13.6" x2="8" y2="15.4" />
          <line x1="0.6" y1="8" x2="2.4" y2="8" />
          <line x1="13.6" y1="8" x2="15.4" y2="8" />
        </g>
      </svg>
    );
  }
  if (pref === "dark") {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path
          d="M13.2 9.8A5.6 5.6 0 0 1 6.2 2.8a5.6 5.6 0 1 0 7 7Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M8 2.4a5.6 5.6 0 0 1 0 11.2Z" fill="currentColor" />
    </svg>
  );
}
