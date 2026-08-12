'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PRIMARY_NAV } from './nav-links'

/**
 * 索引条：五个主要动作一字排开。
 *
 * 当前页用一枚浅绿 pill 标出来 —— 这是多页应用，页面之间长得越统一，
 * 越需要一个不用读标题就能确认位置的锚点。只有这一小块用 usePathname，
 * 页头其余部分仍是服务端渲染。
 */
export function NavIndex({ authed }: { authed: boolean }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="主要功能"
      className="mx-auto hidden w-full max-w-5xl flex-wrap items-center gap-x-1 gap-y-1 px-3 pb-2 text-sm sm:flex sm:px-5"
    >
      {PRIMARY_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-[var(--radius-pill)] px-3 py-1.5 transition-colors duration-200 ${
              active
                ? 'bg-accent-soft font-semibold text-brand'
                : 'text-ink-muted hover:bg-surface-alt hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
      {/* 已登录时不放「登录」，也不放「退出」—— 引擎里没有登出的路径，
          放一个点了什么都不会发生的按钮，比少一个按钮糟糕得多。 */}
      {!authed && (
        <Link
          href="/auth/login"
          className="ml-auto rounded-[var(--radius-pill)] px-3 py-1.5 text-ink-muted transition-colors duration-200 hover:bg-surface-alt hover:text-ink"
        >
          登录
        </Link>
      )}
    </nav>
  )
}
