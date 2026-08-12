import type { TimelineEntry } from '@pool/engine'
import { PoolCard } from './pool-card'
import { EmptyState } from './page-header'

/**
 * 时间线。
 *
 * 人和精灵必须一眼可分，而且**分在结构上，不分在图标上**：
 *
 *   我说的话   右对齐、深绿实心气泡、有宽度上限
 *   别人说的话 左对齐、浅色卡片气泡、有宽度上限
 *   精灵发的卡 通栏、浅绿信息块、带信使鸟、文案用文楷
 *
 * 只靠一个小图标区分的方案，在扫读时等于没区分；形状、对齐和宽度的差别
 * 用余光就能看出来。这是「AI 从不冒充人说话」这条产品立场的版面实现。
 *
 * `actorName` 为 null 就是精灵产生的 —— 这是引擎给出的唯一权威信号。
 * kind='tap' 的条目不单独占一行，而是聚合进它所属的那张卡片。
 */
export function PoolTimeline({
  entries,
  viewerPersonId,
  poolId,
}: {
  entries: TimelineEntry[]
  viewerPersonId: string
  poolId: string
}) {
  if (entries.length === 0) {
    return <EmptyState>这里还没有任何动静。说第一句话，或者等信使鸟先开口。</EmptyState>
  }

  const taps = entries.filter((e) => e.kind === 'tap')
  const visible = entries.filter((e) => e.kind !== 'tap')

  return (
    <ol className="flex flex-col gap-4">
      {visible.map((entry) => (
        <li key={entry.id}>
          <TimelineRow entry={entry} viewerPersonId={viewerPersonId} poolId={poolId} taps={taps} />
        </li>
      ))}
    </ol>
  )
}

// happened / joined / left 写库时 summary 本身已经是一句完整的话
// （见 pool-engine.ts 里对应的 insert），这里不需要再加前缀。
// recap / woken 的 summary 是原始内容，需要一个前缀才读得通。
const EVENT_LABEL: Record<string, string> = {
  recap: '回顾：',
  woken: '发起了再约：',
}

function TimelineRow({
  entry,
  viewerPersonId,
  poolId,
  taps,
}: {
  entry: TimelineEntry
  viewerPersonId: string
  poolId: string
  taps: TimelineEntry[]
}) {
  if (entry.kind === 'card') {
    const cardTaps = taps.filter((t) => (t.payload as { cardId?: string }).cardId === entry.id)
    return <PoolCard entry={entry} poolId={poolId} viewerPersonId={viewerPersonId} taps={cardTaps} />
  }

  if (entry.kind === 'message' || entry.kind === 'opening') {
    // message / opening 的 actor_id 在引擎里必然非空（postMessage、takeOver
    // 都要求真人身份）—— 这两种条目一定是真人说的话。
    const isMine = entry.actorId === viewerPersonId
    return (
      <div className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
        <span className="t-cap px-1 text-ink-soft">
          {entry.actorName}
          {entry.kind === 'opening' && ' · 第一句话'}
        </span>
        <p
          className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed break-anywhere ${
            isMine
              ? 'rounded-[var(--radius-md)] rounded-br-[var(--radius-sm)] bg-accent-deep text-accent-ink'
              : 'rounded-[var(--radius-md)] rounded-bl-[var(--radius-sm)] card text-ink'
          }`}
        >
          {entry.summary}
        </p>
      </div>
    )
  }

  // 其余条目（happened / recap / joined / left / woken……）是系统性的一行小字。
  const isSpirit = entry.actorName === null
  return (
    <p className="t-cap flex justify-center gap-1.5 px-4 text-center break-anywhere">
      <span className={isSpirit ? 'font-medium text-accent-deep' : 'font-medium text-ink-muted'}>
        {isSpirit ? '信使鸟' : entry.actorName}
      </span>
      <span className="text-ink-soft">
        {EVENT_LABEL[entry.kind] ?? ''}
        {entry.summary}
      </span>
    </p>
  )
}
