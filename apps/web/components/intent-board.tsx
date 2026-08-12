import Link from 'next/link'
import type { PoolEngine } from '@pool/engine'
import { DOMAIN_LABEL, IntentSlots } from '@pool/shared'

type BoardEntry = Awaited<ReturnType<PoolEngine['board']>>[number]

const EMPTY_SLOTS: IntentSlots = { when: null, where: null, size: null, level: null, vibe: [] }

/**
 * 同校区意图广场。
 *
 * T0 冷启动期的主打形态：没有匹配数据时让人自己浏览，而不是给一个
 * 空推荐位假装智能。可见性已经由 PoolEngine.board 内部的 RLS 决定，
 * 这里只负责渲染，不重复任何过滤判断。
 */
export function IntentBoard({
  items,
  viewerPersonId,
}: {
  items: BoardEntry[]
  viewerPersonId: string
}) {
  if (items.length === 0) {
    return (
      <p className="border border-dashed border-border p-6 text-sm leading-relaxed text-ink-soft">
        这个筛选下暂时没有意图。校区里人还不多，换个领域看看，或者做第一个发的人。
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <IntentBoardItem key={item.id} item={item} isMine={item.personId === viewerPersonId} />
      ))}
    </ul>
  )
}

function IntentBoardItem({ item, isMine }: { item: BoardEntry; isMine: boolean }) {
  const parsed = IntentSlots.safeParse(item.slots)
  const slots = parsed.success ? parsed.data : EMPTY_SLOTS
  const tags = [slots.when, slots.where, slots.size, slots.vibe.length > 0 ? slots.vibe.join('·') : null].filter(
    (part): part is string => Boolean(part),
  )

  return (
    <li className="border border-border bg-surface-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-ink">
          {item.displayName}
          {isMine && <span className="ml-2 text-xs font-normal text-accent">你发的</span>}
        </p>
        <span className="text-xs text-ink-soft">{DOMAIN_LABEL[item.domain]}</span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink">{item.rawText}</p>

      {tags.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </p>
      )}

      {/* 只有自己的意图能去找候选——findCandidates 只认「本人的意图」，
          给别人的意图挂这个入口点进去只会撞上权限错误，不如干脆不放。 */}
      {isMine && (
        <Link
          href={`/candidates?intent=${item.id}`}
          className="mt-3 inline-block border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          找搭子 →
        </Link>
      )}
    </li>
  )
}
