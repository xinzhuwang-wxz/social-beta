import type { DayStatus, PoolBoard } from '@pool/engine'
import { setDayStatusAction } from '@/app/(app)/pool/[id]/actions'

const OPTIONS: { value: DayStatus; label: string }[] = [
  { value: 'ready', label: '准备好了' },
  { value: 'departed', label: '出发了' },
  { value: 'arrived', label: '到了' },
  { value: 'changed', label: '有变' },
]

const LABEL: Record<string, string> = {
  ready: '准备好了',
  departed: '出发了',
  arrived: '到了',
  changed: '有变',
}

/**
 * 当天状态。
 *
 * 首版刻意不做定位：为了一句「我到了」去要一次定位权限，是拿一个
 * 隐私上很重的授权换一个用户自己点一下就能表达的信息。
 * 而且定位只能证明人在哪，证明不了他准备好了没有 —— 那恰恰是同伴想知道的。
 */
export function DayStatusPanel({
  poolId,
  members,
  statuses,
  viewerPersonId,
}: {
  poolId: string
  members: PoolBoard['members']
  statuses: PoolBoard['statuses']
  viewerPersonId: string
}) {
  const mine = statuses.find((s) => s.personId === viewerPersonId)
  const others = members.filter((m) => m.state === 'joined' && m.personId !== viewerPersonId)

  return (
    <section className="border border-border">
      <div className="border-b border-border px-4 py-2.5">
        <span className="t-cap text-ink-soft">当天状态</span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {OPTIONS.map((opt) => {
            const active = mine?.status === opt.value
            return (
              <form key={opt.value} action={setDayStatusAction.bind(null, poolId, opt.value)}>
                <button
                  type="submit"
                  aria-pressed={active}
                  className={`flex min-h-11 items-center rounded-[var(--radius-pill)] border px-4 text-sm transition-colors duration-200 ${
                    active
                      ? 'border-accent-deep bg-accent-deep font-semibold text-accent-ink'
                      : 'border-border-strong text-ink-muted'
                  }`}
                >
                  {opt.label}
                </button>
              </form>
            )
          })}
        </div>

        {others.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {others.map((m) => {
              const s = statuses.find((x) => x.personId === m.personId)
              return (
                <li key={m.personId} className="text-xs text-ink-soft break-anywhere">
                  {m.displayName}
                  {'：'}
                  <span className={s ? 'text-ink' : undefined}>
                    {s ? (LABEL[s.status] ?? s.status) : '还没说'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <p className="text-xs leading-relaxed text-ink-soft">
          点一下就行，不用定位。「有变」不是失约——提前说一声比准时到更有用。
        </p>
      </div>
    </section>
  )
}
