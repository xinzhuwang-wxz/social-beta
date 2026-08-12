'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { InviteResponse } from '@pool/engine'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'

function failWith(err: unknown): never {
  const message = err instanceof Error ? err.message : '操作失败，再试一次'
  redirect(`/invites?error=${encodeURIComponent(message)}`)
}

/**
 * 表态一颗种子（投递制，见 delivery-service.ts）：愿意参与，或暂不感兴趣。
 *
 * 愿意参与时可以附一句留言——那句话只给发起人挑人时参考，`replyToSeed`
 * 不拿它去做任何排序。两种表态都不跳转：愿意了也只是把状态推进到
 * 「等发起人挑」，还不是加入池塘。真正成局要等发起人调 chooseCompanion，
 * 那时才会新建池塘、把人直接置为 joined——候选人不会被问第二遍，
 * 所以这里没有「确认加入」这一步可跳转。
 */
export async function replyToSeedAction(
  intentId: string,
  willing: boolean,
  formData?: FormData,
): Promise<void> {
  const actor = await requireActor()
  const note = formData ? String(formData.get('note') ?? '').trim() : ''

  try {
    await getEngine().replyToSeed(actor, intentId, willing, note || undefined)
  } catch (err) {
    failWith(err)
  }

  revalidatePath('/invites')
}

/**
 * 回应一条池塘邀请（挑选制的残留路径，仅用于池塘唤醒派生后的再确认）。
 * 四个选项，不是一个「加入」加一个沉默。
 *
 * `adjust` 给了「想去但条件不合」一个出口，`later` 把一次拒绝转化成长期信号。
 * 只留「加入」一个按钮时，所有非加入的意图都塌缩成沉默 ——
 * 而沉默是不可区分的：系统学不到任何东西，对方也永远不知道差在哪。
 *
 * 注意 `adjust` 之后人**仍然停在邀请态**（引擎保证），所以这一条不跳转，
 * 让他还留在这一页，也还能改主意。
 */
export async function replyToInviteAction(
  poolId: string,
  response: InviteResponse,
  formData?: FormData,
): Promise<void> {
  const actor = await requireActor()
  const note = formData ? String(formData.get('note') ?? '').trim() : ''

  try {
    await getEngine().replyToInvite(actor, poolId, response, note || undefined)
  } catch (err) {
    failWith(err)
  }

  revalidatePath('/invites')
  revalidatePath('/home')
  // 只有真的加入了才进房间。其余三种都留在这一页 ——
  // 尤其是「以后再说」：把人踢去别处，会让这个选项感觉像一次驱逐。
  if (response === 'join') redirect(`/pool/${poolId}`)
}
