import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/**
 * 登录后各页的外壳。
 *
 * 补这一层之前，`/home` `/square` `/candidates` 全都没有页头 ——
 * 于是导航和主题开关只存在于落地页，用户一旦登录就再也够不着另外两个主要动作，
 * 而「主要动作三次点击内可达」正是本产品的验收标准之一。
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
