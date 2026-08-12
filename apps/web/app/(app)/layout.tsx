import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/**
 * 登录后各页的外壳。
 *
 * 补这一层之前，`/home` `/square` `/candidates` 全都没有页头 ——
 * 于是导航和主题开关只存在于落地页，用户一旦登录就再也够不着另外两个主要动作，
 * 而「主要动作三次点击内可达」正是本产品的验收标准之一。
 *
 * `<main>` 只在这里出现一次。此前每个页面自己又套了一层 `<main>`，
 * 一页两个 main 是无障碍缺陷：屏幕阅读器的「跳到主要区域」不知道该跳哪一个。
 * 页面组件从这里往下一律用 `<section>` / 片段。tabIndex={-1} 让页头那个
 * 「跳到主要内容」的链接真的能把焦点放进来。
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* authed 不需要再查一次身份：这个 layout 底下每一页都会 requireActor()，
          能渲染到这里就说明已经登录了。为了在页头藏掉「登录」而多打一次
          Auth 服务器，是拿一次网络往返换一行文案。 */}
      <SiteHeader authed />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter authed />
    </div>
  )
}
