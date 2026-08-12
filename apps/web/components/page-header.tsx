import type { ReactNode } from 'react'

/**
 * B 类产品页面的页头：80% 标准 UI + 20% 世界观元素。
 *
 * 规范明确写着「不能把所有页面都做成农场地图」—— 发种子、信箱、匹配、
 * 行动房间这些是要读信息、做决定的地方，世界观在这里只出现一次
 * （一个小图标或一只鸟），其余交给清晰的层级。
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  aside,
  art,
}: {
  eyebrow: string
  title: string
  lede?: ReactNode
  /** 右上角的补充信息（计数、状态）。窄屏下换行到标题下方。 */
  aside?: ReactNode
  /** 那 20% 的世界观：一只鸟或一株植物。缺省不放。 */
  art?: ReactNode
}) {
  return (
    <header className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="t-cap font-medium tracking-wide text-accent-deep">{eyebrow}</p>
          {aside}
        </div>
        <h1 className="t-h1 mt-1.5 break-anywhere">{title}</h1>
        {lede && <p className="t-sec mt-2 max-w-2xl">{lede}</p>}
      </div>
      {art && <div className="hidden shrink-0 sm:block">{art}</div>}
    </header>
  )
}

/** 页面主体的标准栏宽。 */
export function PageShell({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div
      className={`mx-auto flex w-full flex-col gap-7 px-4 py-6 sm:px-6 sm:py-9 ${
        wide ? 'max-w-5xl' : 'max-w-2xl'
      }`}
    >
      {children}
    </div>
  )
}

/** 空状态。永远说清「为什么是空的」和「下一步点哪」，不写「暂无数据」。 */
/**
 * 空状态。
 *
 * 用实线卡片，不用虚线框：虚线在界面语言里是「占位、未完成、可拖入」的意思，
 * 而空状态是一个**正常且成立**的状态 —— 你还没做过这件事，仅此而已。
 * 把它画成线框图，等于告诉用户这一块还没做完。
 */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-alt p-5 text-sm leading-relaxed text-ink-muted">
      {children}
    </div>
  )
}

/** 错误条。橙红只在这里和 badge 上出现 —— 规范禁止它做主按钮色。 */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-md)] border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-ink"
    >
      {message}
    </p>
  )
}

/** 分区小标题。B 类页面里用来切段落。 */
export function SectionHead({
  title,
  aside,
  hint,
}: {
  title: string
  aside?: ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="t-h3">{title}</h2>
        {aside}
      </div>
      {hint && <p className="t-cap">{hint}</p>}
    </div>
  )
}
