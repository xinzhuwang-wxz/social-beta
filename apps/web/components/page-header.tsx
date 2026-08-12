import type { ReactNode } from 'react'

/**
 * 每一页开头的那一块：小标 + 标题 + 一句说明。
 *
 * 抽出来不是为了少写几行，是为了让五个页面的开头**长得一样** ——
 * 用户在页面之间跳来跳去时，标题永远出现在同一个位置、同一个字号上，
 * 这比每页各自漂亮更重要。
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  aside,
}: {
  eyebrow: string
  title: string
  lede?: ReactNode
  /** 右上角的补充信息（计数、状态）。窄屏下换行到标题下方。 */
  aside?: ReactNode
}) {
  return (
    <header className="border-b border-border pb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="mark text-accent">{eyebrow}</p>
        {aside}
      </div>
      <h1 className="mt-3 font-head text-2xl leading-snug font-semibold text-ink sm:text-3xl">
        {title}
      </h1>
      {lede && (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">{lede}</p>
      )}
    </header>
  )
}

/** 页面主体的标准栏宽。单栏、左对齐，不居中排版正文。 */
export function PageShell({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div
      className={`mx-auto flex w-full flex-col gap-8 px-5 py-10 sm:px-8 sm:py-12 ${
        wide ? 'max-w-5xl' : 'max-w-2xl'
      }`}
    >
      {children}
    </div>
  )
}

/** 空状态。永远说清「为什么是空的」和「下一步点哪」，不写「暂无数据」。 */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-border-strong p-6 text-sm leading-relaxed text-ink-soft">
      {children}
    </div>
  )
}

/** 错误条。用朱色 —— 它和「需要你处理」是同一类信号。 */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="border-l-2 border-seal bg-seal-soft px-4 py-3 text-sm text-seal-strong"
    >
      {message}
    </p>
  )
}
