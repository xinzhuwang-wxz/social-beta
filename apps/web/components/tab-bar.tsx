'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PRIMARY_NAV } from './nav-links'

/**
 * 底部标签栏 —— 手机 H5 的主导航。
 *
 * 放底部不是风格选择：375×812 的屏幕上拇指够不到顶部，
 * 顶部导航等于把五个主要动作都放进「要换手才点得到」的区域。
 *
 * 三条硬约束都在这里：
 * 1. 触摸目标 ≥ 44×44pt —— 每个标签是 min-h-[3.25rem] 的整块，
 *    不是一个只有图标大小的可点区。
 * 2. 安全区 —— padding-bottom 加 env(safe-area-inset-bottom)，
 *    否则在刘海屏上被 Home Indicator 压住。
 * 3. 不依赖 hover —— 当前页用填色 + 加粗 + 图标实心表示，
 *    手机上根本没有 hover 这一态。
 *
 * 宽屏（sm 以上）隐藏，改回页头那条横向导航：底部固定栏在桌面上
 * 会一直占着视口底部，那是手机的解法，不是桌面的。
 */
export function TabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="主要功能"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface-raised/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {PRIMARY_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.6875rem] leading-tight ${
                  active ? 'font-semibold text-brand' : 'text-ink-soft'
                }`}
              >
                <TabIcon name={item.icon} active={active} />
                <span>{item.tab}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * UI icon 用简洁线性，线宽 2 —— 世界里的东西（房屋、信箱、鸟、植物）
 * 才用手绘资产。当前页填实心，让「我在哪」不只靠颜色区分。
 */
function TabIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = 'currentColor'
  const fill = active ? 'currentColor' : 'none'
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="none">
      {name === 'seed' && (
        <>
          <path d="M12 21v-7" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path
            d="M12 14c0-4 3-6 7-6 0 4-3 6-7 6Z"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
            fill={fill}
          />
          <path d="M4 21h16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {name === 'candidates' && (
        <>
          <circle cx="9" cy="9" r="3.2" stroke={stroke} strokeWidth="2" fill={fill} />
          <path
            d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M17 8.5h4M19 6.5v4" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {name === 'inbox' && (
        <>
          <rect x="3" y="6" width="18" height="13" rx="3" stroke={stroke} strokeWidth="2" fill={fill} />
          <path d="M3.5 8.5 12 14l8.5-5.5" stroke={active ? 'var(--surface-raised)' : stroke} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {name === 'garden' && (
        <>
          <path d="M4 20h16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="9.5" r="5.5" stroke={stroke} strokeWidth="2" fill={fill} />
          <path d="M12 20v-5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {name === 'forest' && (
        <>
          <path d="M4 20h16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M8 16 5 16 8 4l3 12Z" stroke={stroke} strokeWidth="2" strokeLinejoin="round" fill={fill} />
          <path d="M16 16h3L16 6l-3 10Z" stroke={stroke} strokeWidth="2" strokeLinejoin="round" fill={fill} />
          <path d="M8 20v-4M16 20v-4" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
