import type { PoolBoard as Board } from '@pool/engine'

/**
 * 行动看板的明细。
 *
 * 「已经定了什么 / 还没定什么 / 下一步」全部来自 PoolEngine.poolBoard，
 * 前端**不再自己算一遍**。这条很重要：它们曾经在前端靠翻时间线、数票数
 * 推出来，于是同一个池塘在列表页和房间页可能给出两个答案，
 * 而看板一旦自相矛盾一次，用户就再也不会信它 —— 那还不如没有。
 */
export function PoolBoardDetails({ board }: { board: Board }) {
  const joined = board.members.filter((m) => m.state === 'joined')
  const invited = board.members.filter((m) => m.state === 'invited')

  return (
    <aside aria-label="行动看板" className="card overflow-hidden">
      <div className="border-b border-border px-4 py-2.5">
        <span className="t-cap font-semibold tracking-wide text-brand">行动看板</span>
      </div>

      <Row label="目标">
        <p className="text-sm leading-relaxed text-ink break-anywhere">
          {board.title ?? '（还没起名字）'}
        </p>
      </Row>

      <Row label={`成员 · ${joined.length} 人`}>
        <ul className="flex flex-wrap gap-1.5">
          {joined.map((m) => (
            <li key={m.personId} className="pill break-anywhere">
              {m.displayName}
            </li>
          ))}
          {invited.map((m) => (
            <li
              key={m.personId}
              className="inline-flex items-center rounded-[var(--radius-pill)] border border-dashed border-border-strong px-2.5 py-0.5 text-xs text-ink-muted break-anywhere"
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

      <div className="bg-accent-soft px-4 py-3">
        <p className="t-cap font-semibold tracking-wide text-brand">下一步</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink break-anywhere">
          {board.nextStep}
        </p>
      </div>
    </aside>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <p className="t-cap text-ink-soft">{label}</p>
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
  if (items.length === 0) return <p className="t-cap">{empty}</p>
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm leading-snug">
          {/* 实心圆点 = 定了，空心 = 没定。简洁线性 UI icon，不用对勾也不用 emoji。 */}
          <span
            aria-hidden="true"
            className={`mt-1.5 size-2.5 shrink-0 rounded-full border-2 ${
              settled ? 'border-accent-deep bg-accent-deep' : 'border-border-strong'
            }`}
          />
          <span className="min-w-0 text-ink break-anywhere">{item}</span>
        </li>
      ))}
    </ul>
  )
}
