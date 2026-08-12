'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'

function failWith(err: unknown): never {
  const message = err instanceof Error ? err.message : '操作失败，再试一次'
  redirect(`/invites?error=${encodeURIComponent(message)}`)
}

/** 确认加入——这一个动作本身就是过滤器（ADR-0002）。 */
export async function confirmInviteAction(poolId: string): Promise<void> {
  const actor = await requireActor()
  try {
    await getEngine().confirmJoin(actor, poolId)
  } catch (err) {
    failWith(err)
  }
  revalidatePath('/invites')
  redirect(`/pool/${poolId}`)
}

/**
 * 忽略邀请。
 *
 * 没有单独的「拒绝」接口，也不需要——leavePool 本来就覆盖 invited 状态
 * （成员表的 state 从 invited 直接改成 left），语义上就是「不加入了」。
 * 不确认没有任何代价，这里也不问理由，只是把它从列表里拿掉。
 */
export async function declineInviteAction(poolId: string): Promise<void> {
  const actor = await requireActor()
  try {
    await getEngine().leavePool(actor, poolId)
  } catch (err) {
    failWith(err)
  }
  revalidatePath('/invites')
}
