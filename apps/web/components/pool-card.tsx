import type { TimelineEntry } from '@pool/engine'
import { AgentCard, type PoolRole } from '@pool/shared'
import { tapCardAction } from '@/app/(app)/pool/[id]/actions'

const ROLE_LABEL: Record<PoolRole, string> = {
  initiator: '发起人',
  guide: '带路人',
  shooter: '摄影',
  logistics: '后勤',
  participant: '参与者',
}

interface TapPayload {
  cardId?: string
  optionId?: string
}

/**
 * 精灵发的一张卡。
 *
 * 这是「AI 从不冒充人说话」这句产品立场最直接的可视化：虚线边框 + 一句
 * 显眼的说明，和真人消息的实心气泡在视觉上完全是两回事，不是靠一个小
 * 图标区分。点击选项直接调 tapCard——不经二次 LLM 解析，卡片本身已经
 * 把语义定死了。
 */
export function PoolCard({
  entry,
  poolId,
  viewerPersonId,
  taps,
}: {
  entry: TimelineEntry
  poolId: string
  viewerPersonId: string
  taps: TimelineEntry[]
}) {
  const parsed = AgentCard.safeParse(entry.payload)

  return (
    <div className="border border-dashed border-border-strong bg-surface-alt p-4 sm:p-5">
      <p className="mb-2 text-xs font-medium text-ink-soft">精灵 · 不是任何人说的话</p>
      {parsed.success ? (
        <CardBody card={parsed.data} poolId={poolId} cardId={entry.id} viewerPersonId={viewerPersonId} taps={taps} />
      ) : (
        // 结构解析失败时退到摘要文本——总有内容可看，不留一个空壳。
        <p className="text-sm text-ink">{entry.summary}</p>
      )}
    </div>
  )
}

function CardBody({
  card,
  poolId,
  cardId,
  viewerPersonId,
  taps,
}: {
  card: AgentCard
  poolId: string
  cardId: string
  viewerPersonId: string
  taps: TimelineEntry[]
}) {
  switch (card.kind) {
    case 'decision': {
      const mine = taps.find((t) => t.actorId === viewerPersonId)
      const myOptionId = mine ? (mine.payload as TapPayload).optionId : undefined
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink">{card.question}</p>
          <div className="flex flex-col gap-2">
            {card.options.map((opt) => {
              const count = taps.filter((t) => (t.payload as TapPayload).optionId === opt.id).length
              const chosen = myOptionId === opt.id
              return (
                <form key={opt.id} action={tapCardAction.bind(null, poolId, cardId, opt.id)}>
                  <button
                    type="submit"
                    disabled={Boolean(myOptionId)}
                    className={`flex w-full items-center justify-between gap-3 border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed ${
                      chosen
                        ? 'border-accent bg-accent-soft text-accent-strong'
                        : 'border-border text-ink hover:border-accent disabled:opacity-60'
                    }`}
                  >
                    <span>
                      {opt.label}
                      {opt.whenHint && <span className="ml-2 text-xs text-ink-soft">{opt.whenHint}</span>}
                    </span>
                    {count > 0 && <span className="shrink-0 text-xs text-ink-soft">{count} 人选了</span>}
                  </button>
                </form>
              )
            })}
          </div>
          {myOptionId && <p className="text-xs text-ink-soft">你选了这个。</p>}
        </div>
      )
    }

    case 'roster': {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink">还缺人手：</p>
          <ul className="flex flex-col gap-2">
            {card.slots.map((slot) => {
              const full = slot.takenBy.length >= slot.needed
              const already = slot.takenBy.some((t) => t.personId === viewerPersonId)
              const claimed = taps.some(
                (t) => t.actorId === viewerPersonId && (t.payload as TapPayload).optionId === slot.role,
              )
              return (
                <li
                  key={slot.role}
                  className="flex items-center justify-between gap-3 border border-border px-3 py-2 text-sm"
                >
                  <span className="text-ink">
                    {ROLE_LABEL[slot.role]}
                    <span className="ml-2 text-xs text-ink-soft">
                      {slot.takenBy.length}/{slot.needed}
                      {slot.takenBy.length > 0 && ` · ${slot.takenBy.map((t) => t.displayName).join('、')}`}
                    </span>
                  </span>
                  {!full && !already && (
                    <form action={tapCardAction.bind(null, poolId, cardId, slot.role)}>
                      <button
                        type="submit"
                        disabled={claimed}
                        className="shrink-0 border border-accent px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {claimed ? '已举手' : '我来'}
                      </button>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-ink-soft">举手是信号，不是自动指派——真定下来还得群里说一声。</p>
        </div>
      )
    }

    case 'recap':
      return <p className="text-sm text-ink">{card.prompt}</p>

    case 'wake':
      return <p className="text-sm text-ink">{card.hook}</p>

    case 'catchup':
      return <p className="text-sm text-ink">{card.summary}</p>
  }
}
