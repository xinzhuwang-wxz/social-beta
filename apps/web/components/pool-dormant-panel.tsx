import { acceptWakeAction } from '@/app/(app)/pool/[id]/actions'

/**
 * 休眠池塘的横幅：next_hook 是它带着睡着的那句话，到期才能点「再约一次」。
 *
 * `due` 由页面用 wakeCardFor(poolId) 判出来——到期与否是数据库里
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
    <section className="border border-accent/40 bg-accent-soft p-4 sm:p-5">
      <p className="text-xs font-medium text-accent-strong">这个池塘睡着了，带着一句下次的理由</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">{nextHook ?? '还没有具体的下次理由。'}</p>
      <form action={acceptWakeAction.bind(null, poolId)} className="mt-3">
        <button
          type="submit"
          disabled={!due}
          title={due ? undefined : '还没到唤醒的时间'}
          className="border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:border-accent-strong hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          再约一次
        </button>
      </form>
      {!due && <p className="mt-2 text-xs text-ink-soft">还没到时间——到了之后这里会重新可点。</p>}
    </section>
  )
}
