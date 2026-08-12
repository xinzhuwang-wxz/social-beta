'use client'

import { useActionState } from 'react'
import { deliverSeedAction, type DeliverState } from '@/app/(app)/candidates/actions'

const INITIAL: DeliverState = { status: 'idle' }

/**
 * 第一步：把种子发出去（投递制，见 packages/engine/src/delivery-service.ts）。
 *
 * 这不是候选卡时代那个「点了才看」的按钮——`deliverSeed` 内部直接调
 * `refreshCandidates`，点一次就是真花一次匹配漏斗的钱、占一次今天的曝光
 * 额度。所以文案必须把这件事说明白，而不是让它看起来像一个可以随手点的
 * 「刷新」。`useActionState` 保证只有真人提交了这个表单才会调用它，
 * 页面加载本身不会碰它。
 */
export function SeedDispatchPanel({
  intentId,
  fanout,
}: {
  intentId: string
  fanout: number
}) {
  const boundAction = deliverSeedAction.bind(null, intentId)
  const [state, dispatch, pending] = useActionState(boundAction, INITIAL)

  return (
    <div className="card">
      <div className="border-b border-border px-4 py-2.5 sm:px-5">
        <span className="t-cap text-ink-soft">第一步 · 发出去</span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <p className="text-sm leading-relaxed text-ink-muted">
          点下面这个按钮，系统会挑出最多 {fanout} 位可能合适的人，把这颗种子送进他们的信箱——
          他们看到的只是种子本身，不是「系统觉得你合适」。他们各自决定要不要参与，
          你不用等在这儿，下面这栏会显示已经表态愿意的人。
        </p>

        <form action={dispatch}>
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? '发出去…' : state.status === 'done' ? '再发一批' : '发出去'}
          </button>
        </form>

        {state.status === 'done' && (
          <p className="text-sm text-accent-deep">
            {state.delivered > 0
              ? `已经发给 ${state.delivered} 位，接下来等他们表态。`
              : '这一轮没能凑出候选——校区里暂时找不到合适的人，过会儿再试。'}
          </p>
        )}

        {state.status === 'error' && (
          <p role="alert" className="text-sm text-alert">
            {state.message}
          </p>
        )}

        <p className="text-xs leading-relaxed text-ink-soft">
          每点一次都会重新跑一次匹配、占一次今天的曝光额度——不是可以随手多点几次的刷新按钮。
        </p>
      </div>
    </div>
  )
}
