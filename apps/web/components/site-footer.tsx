import Link from "next/link";
import { PondMark } from "./pond-mark";
import { PRIMARY_NAV } from "./nav-links";

export function SiteFooter({ authed = false }: { authed?: boolean }) {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex max-w-sm flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <PondMark className="size-4 translate-y-0.5 text-accent" />
            <span className="font-head text-base font-semibold text-ink">
              池塘 Pool
            </span>
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">
            不是帮你找到搭子，是帮你「想做的事」真正发生。
          </p>
        </div>

        <nav
          aria-label="页脚导航"
          className="flex flex-wrap gap-x-6 gap-y-2 text-sm"
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
          {!authed && (
            <Link
              href="/auth/login"
              className="text-ink-soft transition-colors hover:text-accent"
            >
              登录
            </Link>
          )}
        </nav>
      </div>
      <div className="mx-auto w-full max-w-6xl px-5 pb-8 sm:px-8">
        <p className="mark text-ink-soft">不装 App · 浏览器打开就是全部</p>
      </div>
    </footer>
  );
}
