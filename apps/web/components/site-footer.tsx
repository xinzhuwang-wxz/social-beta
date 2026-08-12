import Link from "next/link";
import { PondMark } from "./pond-mark";
import { PRIMARY_NAV } from "./nav-links";

export function SiteFooter({ authed = false }: { authed?: boolean }) {
  return (
    <footer className="mt-14 border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex max-w-sm flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <PondMark className="size-6" />
            <span className="text-base font-bold text-brand">池塘 Pool</span>
          </div>
          <p className="t-sec">不是帮你找到搭子，是帮你「想做的事」真正发生。</p>
        </div>

        <nav
          aria-label="页脚导航"
          className="flex flex-wrap gap-x-4 text-sm"
        >
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-11 items-center px-1 text-ink-muted transition-colors duration-200 hover:text-brand"
            >
              {item.label}
            </Link>
          ))}
          {!authed && (
            <Link
              href="/auth/login"
              className="flex min-h-11 items-center px-1 text-ink-muted transition-colors duration-200 hover:text-brand"
            >
              登录
            </Link>
          )}
        </nav>
      </div>
      <div className="mx-auto w-full max-w-5xl px-4 pb-7 sm:px-6">
        <p className="t-cap text-ink-soft">不装 App · 浏览器打开就是全部</p>
      </div>
    </footer>
  );
}
