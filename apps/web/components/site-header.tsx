import Link from "next/link";
import { PondMark } from "./pond-mark";
import { ThemeToggle } from "./theme-toggle";
import { NavIndex } from "./nav-index";

/**
 * 两行的「报头」：上一行是身份（标记 + 产品名 + 外观开关），
 * 下一行是索引条。做成刊物目录页的样子而不是常见的居中 navbar ——
 * 这个产品的内容是一条条真实发生的事，报头的语气应该是编辑部的，不是 SaaS 的。
 *
 * 索引条不做汉堡菜单：校园用户在手机浏览器里用，藏起来的菜单直接违反
 * 「主要动作三次点击内可达」。窄屏下换行，不做横向滚动。
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/92 backdrop-blur">
      <a
        href="#main"
        className="skip-link border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
      >
        跳到主要内容
      </a>

      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <Link href="/" className="flex items-baseline gap-2.5">
          <PondMark className="size-5 translate-y-0.5 text-accent" />
          <span className="font-head text-lg font-semibold tracking-wide text-ink">
            池塘
          </span>
          <span className="mark hidden text-ink-soft sm:inline">
            Pool · 让想做的事真的发生
          </span>
        </Link>
        <ThemeToggle />
      </div>

      <NavIndex />
    </header>
  );
}
