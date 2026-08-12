import Link from "next/link";
import { PondMark } from "./pond-mark";
import { ThemeToggle } from "./theme-toggle";
import { NavIndex } from "./nav-index";

/**
 * 页头。
 *
 * 手机上它只剩一条细身份栏 —— 主导航在底部标签栏（拇指够得到的地方）。
 * 宽屏（sm 以上）才展开那条横向索引：底部固定栏是手机的解法，
 * 放到桌面上只会一直占着视口底部。
 */
export function SiteHeader({ authed = false }: { authed?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <a
        href="#main"
        className="skip-link flex min-h-11 items-center rounded-[var(--radius-sm)] border border-border bg-surface-raised px-4 text-sm text-ink"
      >
        跳到主要内容
      </a>

      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2">
          <PondMark className="size-7 shrink-0" />
          <span className="text-lg font-bold tracking-wide text-brand">池塘</span>
          <span className="t-cap hidden text-ink-muted sm:inline">
            让想做的事真的发生
          </span>
        </Link>
        <ThemeToggle />
      </div>

      <NavIndex authed={authed} />
    </header>
  );
}
