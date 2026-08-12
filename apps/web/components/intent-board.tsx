import Link from 'next/link'
import type { PoolEngine } from '@pool/engine'
import { DOMAIN_LABEL, IntentSlots } from '@pool/shared'
import { EmptyState } from './page-header'

type BoardEntry = Awaited<ReturnType<PoolEngine['board']>>[number]

const EMPTY_SLOTS: IntentSlots = { when: null, where: null, size: null, level: null, vibe: [] }

/**
 * 同校区种子广场。
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
      <EmptyState>
        这个筛选下暂时没有种子。校区里人还不多，换个领域看看，或者做第一个种下的人。
      </EmptyState>
    )
  }

  return (
    <ul className="border-t border-border">
      {items.map((item) => (
        <IntentBoardItem key={item.id} item={item} isMine={item.personId === viewerPersonId} />
      ))}
    </ul>
  )
}

function IntentBoardItem({ item, isMine }: { item: BoardEntry; isMine: boolean }) {
  const parsed = IntentSlots.safeParse(item.slots)
  const slots = parsed.success ? parsed.data : EMPTY_SLOTS
  const tags = [
    slots.when,
    slots.where,
    slots.size,
    slots.level,
    slots.vibe.length > 0 ? slots.vibe.join('·') : null,
  ].filter((part): part is string => Boolean(part))

  return (
    <li className="grid grid-cols-1 gap-x-5 gap-y-2 border-b border-border py-4 sm:grid-cols-[5rem_1fr]">
      {/* 左栏是标本册的页边：领域 + 是谁的。正文永远从同一条竖线开始。 */}
      <div className="flex items-baseline gap-2 sm:flex-col sm:gap-1">
        <span className="t-cap text-ink-soft">{DOMAIN_LABEL[item.domain]}</span>
        <span className="text-xs text-ink-muted break-anywhere">
          {item.displayName}
          {isMine && <span className="ml-1.5 text-accent-deep">你</span>}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-sm leading-relaxed text-ink break-anywhere">{item.rawText}</p>

        {tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
            {tags.map((tag) => (
              <li key={tag} className="border border-border px-2 py-0.5 text-xs text-ink-soft">
                {tag}
              </li>
            ))}
          </ul>
        )}

        {/* 只有自己的种子能去找候选——findCandidates 只认「本人的意图」，
            给别人的挂这个入口点进去只会撞上权限错误，不如干脆不放。 */}
        {isMine && (
          <Link
            href={`/candidates?intent=${item.id}`}
            className="btn btn-secondary btn-sm mt-3 inline-flex"
          >
            让 Agent 去找人 →
          </Link>
        )}
      </div>
    </li>
  )
}
