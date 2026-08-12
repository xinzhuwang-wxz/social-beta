import type { CompletionStatus } from '@pool/engine'
import { finishEventAction, withdrawCompletionAction } from '@/app/(app)/pool/[id]/actions'

/**
 * 完成确认 —— 双方分别点「办完了」，都点过才真的转 done。
 *
 * 手法与 PlanCard 的「全员确认」一致，理由也一样：只给一个孤零零的
 * 「已确认」绿勾会让人以为自己点了就结束了，必须永远同时显示
 * 「谁确认了 / 还差谁」。这正是引擎这次改的地方——此前一个人点「办完了」
 * 就直接转 done，现在必须停在「等待对方确认」。
 *
 * 这张卡从不检查有没有传图、有没有写反馈：照片是可选的回忆素材，
 * 不是完成的凭证，两件事在这里刻意不挂钩。
 */
export function CompletionPanel({
  poolId,
  status,
  viewerPersonId,
}: {
  poolId: string
  status: CompletionStatus
  viewerPersonId: string
}) {
  const iConfirmed = status.confirmedBy.some((p) => p.personId === viewerPersonId)

  return (
    <section className="border border-accent-deep">
      <div className="flex items-baseline justify-between gap-3 border-b border-accent-deep bg-accent-soft px-4 py-2.5">
        <span className="t-cap font-semibold tracking-wide text-brand">完成确认</span>
        <span className="t-cap font-semibold tracking-wide text-brand">
          {status.pendingBy.length === 0 ? '全员已确认' : `还差 ${status.pendingBy.length} 人`}
        </span>
      </div>

      <div className="px-4 py-3">
        <p className="text-sm leading-relaxed text-ink">
          双方都点过「办完了」，这件事才算真的结束、才会进入回忆阶段。不用等传了照片或写了反馈再点——那些都是事后可选的回忆素材，不是完成的前提。
        </p>

        <ul className="mt-3 flex flex-wrap gap-1.5">
          {status.confirmedBy.map((p) => (
            <li
              key={p.personId}
              className="border border-accent-deep bg-accent-soft px-2 py-0.5 text-xs text-brand"
            >
              {p.displayName} 已确认
            </li>
          ))}
          {status.pendingBy.map((p) => (
            <li
              key={p.personId}
              className="border border-dashed border-border-strong px-2 py-0.5 text-xs text-ink-soft"
            >
              {p.displayName} 还没确认
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3">
        {iConfirmed ? (
          <form action={withdrawCompletionAction.bind(null, poolId)}>
            <button type="submit" className="btn btn-quiet btn-sm">
              撤回确认
            </button>
          </form>
        ) : (
          <form action={finishEventAction.bind(null, poolId)}>
            <button type="submit" className="btn btn-primary">
              办完了
            </button>
          </form>
        )}
        <p className="text-xs leading-relaxed text-ink-soft">
          {iConfirmed
            ? '你已经确认了，正等对方确认——点错了可以撤回。'
            : '点了之后要等对方也确认，不是你点了就立刻结束。'}
        </p>
      </div>
    </section>
  )
}
