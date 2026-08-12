import type { PoolBoard as Board } from '@pool/engine'

/**
 * 行动看板的明细。
 *
 * 「已经定了什么 / 还没定什么 / 下一步」全部来自 PoolEngine.poolBoard，
 * 前端**不再自己算一遍**。这条很重要：这三项曾经在前端靠翻时间线、
 * 数票数推出来，于是同一个池塘在列表页和房间页可能给出两个答案，
 * 而看板一旦出现过一次自相矛盾，用户就再也不会信它 —— 那还不如没有。
 *
 * 引擎侧的 nextStep 也是确定性规则算出来的，不打模型：它每次刷新都要显示，
 * 让模型来算既贵又会前后不一致。
 */
export function PoolBoardDetails({ board }: { board: Board }) {
  const joined = board.members.filter((m) => m.state === 'joined')
  const invited = board.members.filter((m) => m.state === 'invited')

  return (
    <aside aria-label="行动看板" className="border border-border bg-surface-raised">
      <div className="border-b border-border px-4 py-2.5">
        <span className="mark text-ink-soft">行动看板</span>
      </div>

      <Row label="目标">
        <p className="text-sm leading-relaxed text-ink break-anywhere">
          {board.title ?? '（还没起名字）'}
        </p>
      </Row>

      <Row label={`成员 · ${joined.length} 人`}>
        <ul className="flex flex-wrap gap-1.5">
          {joined.map((m) => (
            <li
              key={m.personId}
              className="border border-border px-2 py-0.5 text-xs text-ink break-anywhere"
            >
              {m.displayName}
            </li>
          ))}
          {invited.map((m) => (
            <li
              key={m.personId}
              className="border border-dashed border-border-strong px-2 py-0.5 text-xs text-ink-soft break-anywhere"
            >
              {m.displayName} 还没回应
            </li>
          ))}
        </ul>
      </Row>

      <Row label={`已经定了 · ${board.settled.length}`}>
        <Items items={board.settled} settled empty="还没有任何一项定下来。" />
      </Row>

      <Row label={`还没定 · ${board.open.length}`}>
        <Items items={board.open} settled={false} empty="没有待定项了。" />
      </Row>

      <div className="border-l-2 border-seal bg-seal-soft px-4 py-3">
        <p className="mark text-seal-strong">下一步</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink break-anywhere">{board.nextStep}</p>
      </div>
    </aside>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <p className="mark text-ink-soft">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Items({
  items,
  settled,
  empty,
}: {
  items: string[]
  settled: boolean
  empty: string
}) {
  if (items.length === 0) return <p className="text-xs text-ink-soft">{empty}</p>
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm leading-snug">
          {/* 实心方块 = 定了，空心 = 没定。不用对勾也不用 emoji ——
              方块在小字号下比对勾更容易分辨，也和全站的方角语言一致。 */}
          <span
            aria-hidden="true"
            className={`mt-1.5 size-2 shrink-0 border ${
              settled ? 'border-accent bg-accent' : 'border-border-strong'
            }`}
          />
          <span className="min-w-0 text-ink break-anywhere">{item}</span>
        </li>
      ))}
    </ul>
  )
}
