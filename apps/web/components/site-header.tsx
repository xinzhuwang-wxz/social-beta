import Link from "next/link";
import { PondMark } from "./pond-mark";
import { ThemeToggle } from "./theme-toggle";
import { PRIMARY_NAV } from "./nav-links";

/**
 * 两行的"报头"：上一行是身份（标记 + 产品名 + 外观开关），下一行是
 * 索引条——三个主要动作 + 登录一字排开，做成刊物目录页的样子而不是
 * 常见的居中 navbar。索引条不做汉堡菜单：校园用户在手机浏览器里用，
 * 藏起来的菜单会直接违反「三次点击内可达」——这里从落地页到任意主要
 * 动作只需要 1 次点击，而且不需要先找到并点开一个菜单按钮。
 * 窄屏下allow换行，不做横向滚动。
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <a href="#main" className="skip-link border border-border bg-surface-raised px-3 py-2 text-sm text-ink">
        跳到主要内容
      </a>

      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <PondMark className="size-6 text-accent" />
          <span className="font-head text-lg font-semibold tracking-wide text-ink">
            池塘
          </span>
          <span className="hidden text-xs text-ink-soft sm:inline">
            Pool · 校园社交 AI
          </span>
        </Link>
        <ThemeToggle />
      </div>

      <nav
        aria-label="主要功能"
        className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 border-t border-border px-5 py-2.5 text-sm sm:px-8"
      >
        {PRIMARY_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-ink-muted transition-colors hover:text-accent"
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/auth/login"
          className="ml-auto text-ink-muted transition-colors hover:text-accent"
        >
          登录
        </Link>
      </nav>
    </header>
  );
}
