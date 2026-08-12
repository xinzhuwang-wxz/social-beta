'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PRIMARY_NAV } from './nav-links'

/**
 * 索引条：五个主要动作一字排开，像刊物的目录页，不是居中的 navbar。
 *
 * 不做汉堡菜单 —— 校园用户在手机浏览器里用，藏起来的菜单直接违反
 * 「主要动作三次点击内可达」。窄屏下换行，不做横向滚动。
 *
 * 之所以要为「当前在哪一页」单独做一个客户端组件：这是多页应用，
 * 页面之间长得越统一，越需要一个不用读标题就能确认位置的锚点。
 * 只有这一小块用 usePathname，页头其余部分仍是服务端渲染。
 */
export function NavIndex() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="主要功能"
      className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border px-5 py-2.5 text-sm sm:px-8"
    >
      {PRIMARY_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-1.5 transition-colors ${
              active ? 'text-ink' : 'text-ink-muted hover:text-accent'
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-1.5 ${active ? 'bg-accent' : 'bg-transparent'}`}
            />
            {item.label}
          </Link>
        )
      })}
      <Link
        href="/auth/login"
        className="ml-auto text-ink-soft transition-colors hover:text-accent"
      >
        登录
      </Link>
    </nav>
  )
}
