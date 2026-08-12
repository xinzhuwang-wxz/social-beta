import type { TimelineEntry } from '@pool/engine'
import { PoolCard } from './pool-card'
import { EmptyState } from './page-header'

/**
 * 时间线：组队 → 协作 → 成行的全过程，按发生顺序展示。
 *
 * 人和精灵在这里必须一眼可分，而且**分在结构上，不分在图标上**：
 *
 *   真人说话  → 气泡。有宽度上限、会靠左靠右、有说话人名字。
 *   精灵发卡  → 通栏。虚线左边框、等宽小标、永远不靠边、没有说话人。
 *
 * 一个只靠小图标区分的方案，在扫读时等于没区分；而形状和对齐方式的差别，
 * 用余光就能看出来。这是「AI 从不冒充人说话」这条产品立场的版面实现。
 *
 * `actorName` 为 null 就是精灵产生的 —— 这是引擎给出的唯一权威信号
 * （见 TimelineEntry 的注释），这里严格照它渲染，不额外猜测。
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
    return <EmptyState>这里还没有任何动静。说第一句话，或者等精灵先开口。</EmptyState>
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
// recap / woken 的 summary 是原始内容（回顾正文 / 上次的约定），
// 需要一个前缀才读得通。
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
        <span className="mark px-0.5 text-ink-soft">
          {entry.actorName}
          {entry.kind === 'opening' && ' · 第一句话'}
        </span>
        <p
          className={`max-w-[85%] border px-3.5 py-2.5 text-sm leading-relaxed break-anywhere ${
            isMine
              ? 'border-accent bg-accent-soft text-ink'
              : 'border-border bg-surface-raised text-ink'
          }`}
        >
          {entry.summary}
        </p>
      </div>
    )
  }

  // 其余条目（happened / recap / joined / left / woken……）是系统性的一行小字。
  // 左对齐 + 一条短横，读起来像页边的记事，不抢正文的注意力。
  const isSpirit = entry.actorName === null
  return (
    <p className="flex gap-2 py-0.5 text-xs leading-relaxed text-ink-soft break-anywhere">
      <span aria-hidden="true" className="mt-2 h-px w-4 shrink-0 bg-border-strong" />
      <span>
        <span className={isSpirit ? 'text-accent' : 'text-ink-muted'}>
          {isSpirit ? '精灵' : entry.actorName}
        </span>
        {'：'}
        {EVENT_LABEL[entry.kind] ?? ''}
        {entry.summary}
      </span>
    </p>
  )
}
