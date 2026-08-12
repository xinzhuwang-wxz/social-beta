import { acceptWakeAction } from '@/app/(app)/pool/[id]/actions'
import { PoolPlant } from './pool-plant'

/**
 * 休眠面板：花谢之后留在蓬里的那颗籽，就是 next_hook。
 *
 * `due` 由页面调 wakeCardFor(poolId) 判出来 —— 到期与否是数据库里
 * next_hook_due_at 说了算，这里不重复算时间。
 */
export function PoolDormantPanel({
  poolId,
  nextHook,
  due,
}: {
  poolId: string
  nextHook: string | null
  due: boolean
}) {
  return (
    <section className="flex gap-4 border border-border bg-surface-alt p-4 sm:p-5">
      <PoolPlant stage="fruit" label={null} className="hidden size-20 shrink-0 sm:block" />
      <div className="min-w-0">
        <p className="t-cap text-ink-soft">结果 · 它睡着了，籽还在</p>
        <p className="mt-2 text-sm leading-relaxed text-ink break-anywhere">
          {nextHook ?? '还没有具体的下次理由。'}
        </p>
        <form action={acceptWakeAction.bind(null, poolId)} className="mt-4">
          <button
            type="submit"
            disabled={!due}
            title={due ? undefined : '还没到唤醒的时间'}
            className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            再约一次
          </button>
        </form>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          {due
            ? '会长出新的一株，原来这株继续睡着——上次的记忆不会被覆盖。'
            : '还没到时间。到了之后这里会重新可点，它也会自己回来问你们一次。'}
        </p>
      </div>
    </section>
  )
}
