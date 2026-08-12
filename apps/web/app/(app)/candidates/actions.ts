'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'

export type DeliverState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'done'; delivered: number }

/**
 * 第一步：把种子发出去。
 *
 * `PoolEngine.deliverSeed` 内部直接调 `refreshCandidates` —— 每次调用都是
 * 一次真实的匹配漏斗 + 一次曝光额度，不是幂等的读。这条铁律在这个仓库栽过
 * 一次真实的坑：绝不能让它挂在页面渲染路径上，只能由这个显式的表单提交触发。
 * 页面本身只读 `willingFor`（安全、幂等），不会在加载时碰这个函数。
 */
export async function deliverSeedAction(
  intentId: string,
  _prevState: DeliverState,
  _formData: FormData,
): Promise<DeliverState> {
  const actor = await requireActor()
  try {
    const { delivered } = await getEngine().deliverSeed(actor, intentId)
    revalidatePath('/candidates')
    return { status: 'done', delivered }
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : '发不出去，再试一次',
    }
  }
}

export type ChooseState = { status: 'idle' } | { status: 'error'; message: string }

/**
 * 第三步：从已表态愿意的人里选一个同行者。
 *
 * `opening` 完全来自这个表单——红线之一是表述方式必须由真人决定，
 * 所以这里没有像 `takeOverAction` 那样的 AI 草稿可以预填（`chooseCompanion`
 * 不像 `rehearseWith` 那样先跑一轮 Agent 对话），输入框从空白开始写，
 * 引擎只在乎这句话是不是这一刻真人提交的。
 *
 * `chooseCompanion` 返回的 `filled` 告诉调用方种子是否已经收满，但
 * `PoolEngine` 没有把 `intent.needed` / `chosen_count` 暴露给发起人这一侧
 * ——所以这里不去猜一个「还差几人」的数字。无论收满与否都直接带发起人去
 * 新成的池塘：选中的人已经加入了，池塘页会告诉他真实的成员状态；如果这颗
 * 种子确实要好几个同行者，发起人可以随时回到 `/candidates` 接着从剩下
 * 愿意的人里选。
 */
export async function chooseCompanionAction(
  intentId: string,
  personId: string,
  _prevState: ChooseState,
  formData: FormData,
): Promise<ChooseState> {
  const actor = await requireActor()
  const opening = String(formData.get('opening') ?? '').trim()
  if (!opening) return { status: 'error', message: '第一句话不能是空的' }

  let poolId: string
  try {
    const result = await getEngine().chooseCompanion(actor, intentId, personId, opening)
    poolId = result.poolId
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : '选人失败，再试一次',
    }
  }

  revalidatePath('/candidates')
  revalidatePath('/home')
  redirect(`/pool/${poolId}`)
}
