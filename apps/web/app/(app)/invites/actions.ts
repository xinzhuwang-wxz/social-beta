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
 * 回应一颗种子。四个选项，不是一个「加入」加一个沉默。
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
