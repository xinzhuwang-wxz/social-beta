import type { TimelineEntry } from '@pool/engine'
import { PoolCard } from './pool-card'

/**
 * 池塘时间线：组队 → 协作 → 成行的全过程，按发生顺序展示。
 *
 * `actorName` 为 null 就是精灵产生的——这是引擎给出的唯一权威信号
 * （见 TimelineEntry 的注释），这里严格照它渲染，不额外猜测。
 * kind='tap' 的条目不单独占一行，而是聚合进它所属的那张卡片，
 * 用来算票数、算认领状态。
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
    return (
      <p className="border border-dashed border-border p-6 text-sm leading-relaxed text-ink-soft">
        这里还没有任何动静。说第一句话，或者等精灵先开口。
      </p>
    )
  }

  const taps = entries.filter((e) => e.kind === 'tap')
  const visible = entries.filter((e) => e.kind !== 'tap')

  return (
    <ol className="flex flex-col gap-3">
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
    // 都要求真人身份）——这两种条目一定是真人说的话，渲染成对话气泡，
    // 自己发的靠右、别人发的靠左，一眼能看出这是谁说的。
    const isMine = entry.actorId === viewerPersonId
    return (
      <div className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
        <span className="text-xs text-ink-soft">
          {entry.actorName}
          {entry.kind === 'opening' && ' · 开场白'}
        </span>
        <p
          className={`max-w-[85%] border px-3.5 py-2.5 text-sm leading-relaxed text-ink ${
            isMine ? 'border-accent bg-accent-soft' : 'border-border bg-surface-raised'
          }`}
        >
          {entry.summary}
        </p>
      </div>
    )
  }

  // 其余条目（happened / recap / joined / left / woken……）都是一句居中的
  // 系统性小字。actorName 为空的（目前只有 recap）标成「精灵」，斜体区分。
  const isSpirit = entry.actorName === null
  return (
    <p className={`text-center text-xs text-ink-soft ${isSpirit ? 'italic' : ''}`}>
      {isSpirit ? '精灵' : entry.actorName}
      {'：'}
      {EVENT_LABEL[entry.kind] ?? ''}
      {entry.summary}
    </p>
  )
}
