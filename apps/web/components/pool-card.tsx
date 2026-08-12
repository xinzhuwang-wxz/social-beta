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
 * 版面上它是**页边批注**，不是发言：通栏、虚线左界、等宽小标、没有说话人名字，
 * 和真人那种有宽度上限、会靠左靠右的气泡在形状上完全是两回事。
 * 这是「AI 从不冒充人说话」最直接的可视化 —— 不是靠一个小图标区分。
 *
 * 点击选项直接调 tapCard，不经二次 LLM 解析：卡片本身已经把语义定死了。
 * 而且这一点也是看板的数据源 —— 板上「已经定了」那几项，全部来自这里的点击。
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
    <div className="border-l-2 border-dashed border-border-strong bg-surface-alt">
      <div className="flex items-center gap-2 px-4 py-2">
        <SpiritGlyph />
        <span className="mark text-ink-soft">精灵 · 卡片，不是任何人说的话</span>
      </div>
      <div className="px-4 pb-4">
        {parsed.success ? (
          <CardBody
            card={parsed.data}
            poolId={poolId}
            cardId={entry.id}
            viewerPersonId={viewerPersonId}
            taps={taps}
          />
        ) : (
          // 结构解析失败时退到摘要文本——总有内容可看，不留一个空壳。
          <p className="text-sm leading-relaxed text-ink break-anywhere">{entry.summary}</p>
        )}
      </div>
    </div>
  )
}

/** 精灵的记号：一个空心菱形。空心 = 不是人；菱形 = 和全站的方块区分开。 */
function SpiritGlyph() {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rotate-45 border border-accent"
    />
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
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-ink break-anywhere">{card.question}</p>
          <div className="flex flex-col gap-1.5">
            {card.options.map((opt) => {
              const count = taps.filter((t) => (t.payload as TapPayload).optionId === opt.id).length
              const chosen = myOptionId === opt.id
              return (
                <form key={opt.id} action={tapCardAction.bind(null, poolId, cardId, opt.id)}>
                  <button
                    type="submit"
                    disabled={Boolean(myOptionId)}
                    className={`flex w-full items-start justify-between gap-3 border px-3 py-2 text-left text-sm leading-snug transition-colors disabled:cursor-not-allowed ${
                      chosen
                        ? 'border-accent bg-accent-soft text-ink'
                        : 'border-border bg-surface text-ink hover:border-accent disabled:opacity-60'
                    }`}
                  >
                    <span className="min-w-0 break-anywhere">
                      {opt.label}
                      {opt.whenHint && (
                        <span className="ml-2 text-xs text-ink-soft">{opt.whenHint}</span>
                      )}
                    </span>
                    {count > 0 && (
                      <span className="mark shrink-0 pt-0.5 text-ink-soft">{count} 票</span>
                    )}
                  </button>
                </form>
              )
            })}
          </div>
          {/* 说清楚投票到底算什么：它让票型可见，帮大家收敛，
              但**不会**让看板记成「已经定了」—— 看板上那两行来自行动确认卡。
              界面承诺过一次做不到的事，之后说什么用户都不会再信。 */}
          <p className="text-xs leading-relaxed text-ink-soft">
            {myOptionId
              ? '你选了这个。投票只是让大家看到票型——真要定下来，还得填一张行动确认卡。'
              : '投票帮大家收敛，但它不等于定下来。定下来靠上面那张行动确认卡。'}
          </p>
        </div>
      )
    }

    case 'roster': {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink">还缺人手：</p>
          <ul className="flex flex-col gap-1.5">
            {card.slots.map((slot) => {
              const full = slot.takenBy.length >= slot.needed
              const already = slot.takenBy.some((t) => t.personId === viewerPersonId)
              const claimed = taps.some(
                (t) =>
                  t.actorId === viewerPersonId && (t.payload as TapPayload).optionId === slot.role,
              )
              return (
                <li
                  key={slot.role}
                  className="flex items-center justify-between gap-3 border border-border bg-surface px-3 py-2 text-sm"
                >
                  <span className="min-w-0 text-ink break-anywhere">
                    {ROLE_LABEL[slot.role]}
                    <span className="ml-2 text-xs text-ink-soft">
                      {slot.takenBy.length}/{slot.needed}
                      {slot.takenBy.length > 0 &&
                        ` · ${slot.takenBy.map((t) => t.displayName).join('、')}`}
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
          <p className="text-xs leading-relaxed text-ink-soft">
            举手是信号，不是自动指派——真定下来还得群里说一声。
          </p>
        </div>
      )
    }

    case 'recap':
      return <p className="text-sm leading-relaxed text-ink break-anywhere">{card.prompt}</p>

    case 'wake':
      return <p className="text-sm leading-relaxed text-ink break-anywhere">{card.hook}</p>

    case 'catchup':
      return <p className="text-sm leading-relaxed text-ink break-anywhere">{card.summary}</p>
  }
}
