import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/site-header'
import { TabBar } from '@/components/tab-bar'

/**
 * 登录后各页的外壳。
 *
 * 手机 H5 的形态：顶上只留一条身份栏，主导航在底部标签栏。
 *
 * **登录后不挂营销页脚。** 那是给还没决定要不要用的人看的；已经在用的人
 * 每翻到一页底部都被推销一次自家产品，读起来像 demo 而不是产品。
 * 何况它还被固定标签栏压掉半截，只露出几个断句 —— 更糟。
 * `pb-[4.5rem]` 给底部固定栏留位置 —— 少了它，每一页的最后一个按钮
 * 都会被标签栏压住，而那通常正是「提交」。
 *
 * `<main>` 只在这里出现一次。此前每个页面自己又套了一层 `<main>`，
 * 一页两个 main 是无障碍缺陷：屏幕阅读器的「跳到主要区域」不知道该跳哪一个。
 * tabIndex={-1} 让页头那个「跳到主要内容」的链接真的能把焦点放进来。
 *
 * authed 不需要再查一次身份：这个 layout 底下每一页都会 requireActor()，
 * 能渲染到这里就说明已经登录了。
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-[4.5rem] sm:pb-0">
      <SiteHeader authed />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <TabBar />
    </div>
  )
}
