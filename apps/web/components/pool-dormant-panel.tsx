import { acceptWakeAction } from '@/app/(app)/pool/[id]/actions'
import { PoolPlant } from './pool-plant'

/**
 * 休眠面板：花谢之后留在蓬里的那颗籽，就是 next_hook。
 *
 * `due` 由页面调 wakeCardFor(poolId) 判出来 —— 到期与否是数据库里
 * next_hook_due_at 说了算，这里不重复算时间。
 *
 * **到期与否只决定文案，不决定按钮能不能点。**
 *
 * 这里原本是 `disabled={!due}`，理由看起来很正当：还没到日子。
 * 但那把两件事混成了一件 —— 到期时间该管的是**系统什么时候主动来提醒**，
 * 不是**用户什么时候可以行动**。一个人记得他们说过还想去夜爬、现在就想约，
 * 产品没有任何理由拦着他说「还没到唤醒的时间」。
 *
 * 引擎侧从来没有这道限制（acceptWake 只查成员身份与休眠状态），
 * 所以这一版不是放宽了规则，是把一条本来就不该有的规则从界面上撤掉。
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
          <button type="submit" className="btn btn-primary">
            {due ? '再约一次' : '现在就再约'}
          </button>
        </form>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          {due
            ? '会长出新的一株，原来这株继续睡着——上次的记忆不会被覆盖。'
            : '到点它会自己回来问你们一次。等不及也可以现在就约——会长出新的一株，原来这株继续睡着。'}
        </p>
      </div>
    </section>
  )
}
