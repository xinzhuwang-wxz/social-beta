import type { InboxItem } from '@pool/engine'
import { DOMAIN_LABEL, IntentSlots } from '@pool/shared'
import { replyToSeedAction } from '@/app/(app)/invites/actions'

const EMPTY_SLOTS: IntentSlots = { when: null, where: null, size: null, level: null, vibe: [] }

const DELIVERED_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * 一颗投递到我信箱的种子（`InboxItem`）。
 *
 * 只有两种状态会出现在这里 —— `seedInbox` 走的 `my_seed_inbox` 视图本身就
 * 把 declined/closed 过滤掉了：落选没有额外提示，那条记录只是安静地
 * 不再出现，文案上不写「你不合适」。
 *
 * `delivered`：还没表态，给「愿意参与」「暂不感兴趣」两个平级按钮，
 * 外加一个可选的「先说一句再答应」——那句话是发起人挑人时的参考，
 * 不是必填项，也不参与排序。
 * `willing`：已经说过愿意，回来这里就是等发起人挑，不重复问第二遍，
 * 也不告诉他现在排第几、还有谁一起在等——推荐理由、打分、竞争人数、
 * 最终选中的是谁，这四样 SQL 层就没给候选人这边留列，前端也不用另外查。
 */
export function SeedInboxCard({ item }: { item: InboxItem }) {
  const parsed = IntentSlots.safeParse(item.slots)
  const slots = parsed.success ? parsed.data : EMPTY_SLOTS
  const tags = [
    slots.when,
    slots.where,
    slots.size,
    slots.level,
    slots.vibe.length > 0 ? slots.vibe.join('·') : null,
  ].filter((part): part is string => Boolean(part))
  const domainLabel = DOMAIN_LABEL[item.domain as keyof typeof DOMAIN_LABEL] ?? item.domain

  return (
    <li className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <p className="text-base font-semibold text-ink break-anywhere">
          {item.seekerName} 想找人一起
        </p>
        <span className="t-cap shrink-0 text-ink-soft">
          {DELIVERED_FORMAT.format(item.deliveredAt)} 送到
        </span>
      </div>

      <div className="px-4 py-3">
        <span className="pill">{domainLabel}</span>
        <p className="mt-2 text-sm leading-relaxed text-ink break-anywhere">{item.rawText}</p>
        {tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
            {tags.map((tag) => (
              <li key={tag} className="border border-border px-2 py-0.5 text-xs text-ink-soft">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>

      {item.state === 'willing' ? (
        // 已经表态：不再给按钮，也不暗示进度——「等发起人挑」是唯一诚实的说法。
        <div className="border-t border-border px-4 py-3">
          <p className="t-cap font-medium text-accent-deep">已表示愿意参与 · 等发起人挑</p>
          {item.note && (
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted break-anywhere">
              你说的：{item.note}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <form action={replyToSeedAction.bind(null, item.intentId, true)}>
              <button type="submit" className="btn btn-primary">
                愿意参与
              </button>
            </form>
            <form action={replyToSeedAction.bind(null, item.intentId, false)}>
              <button type="submit" className="btn btn-quiet">
                暂不感兴趣
              </button>
            </form>
          </div>

          {/* <details> 而不是一个需要 JS 的展开：无脚本也能用，键盘可达。
              留言可选——不写也能直接愿意参与，上面那个按钮就够。 */}
          <details className="border-t border-border">
            <summary className="cursor-pointer px-4 py-2.5 text-sm text-accent-deep">
              想先说一句，再答应
            </summary>
            <form
              action={replyToSeedAction.bind(null, item.intentId, true)}
              className="flex flex-col gap-2 px-4 pt-1 pb-4"
            >
              <label
                htmlFor={`seed-note-${item.intentId}`}
                className="text-xs leading-relaxed text-ink-soft"
              >
                这句话只有发起人看得到，帮他判断要不要选你。
              </label>
              <textarea
                id={`seed-note-${item.intentId}`}
                name="note"
                rows={2}
                placeholder="比如「我去过箭扣，可以带路」"
                className="border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
              />
              <button type="submit" className="self-start btn btn-secondary">
                愿意参与，带上这句话
              </button>
            </form>
          </details>
        </>
      )}
    </li>
  )
}
