'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { PoolEngine } from '@pool/engine'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'

export type Rehearsal = Awaited<ReturnType<PoolEngine['rehearseWith']>>

export type RehearseState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: Rehearsal }

/**
 * 触发一次预演：两边的 Agent 交换几句，产出一张提案卡 + 一份往来记录。
 *
 * 按需触发（用户点「生成提案」时），不在渲染路径上自动跑——rehearseWith
 * 本身要打好几次模型，挂在 GET 上意味着刷新、返回、RSC 重渲染都会重花钱。
 */
export async function rehearseAction(
  seekerIntentId: string,
  candidateIntentId: string,
): Promise<RehearseState> {
  const actor = await requireActor()
  try {
    const result = await getEngine().rehearseWith(actor, { seekerIntentId, candidateIntentId })
    return { status: 'ready', result }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : '预演打不开，再试一次' }
  }
}

export type TakeOverState = { status: 'idle' } | { status: 'error'; message: string }

/**
 * 接管——真人签字，连接才成立。
 *
 * opening 完全来自这个表单：可能是草稿原文，也可能被改过、或整段删了重写。
 * 引擎不关心它来自哪里，只关心它是真人在这一刻提交的。
 */
export async function takeOverAction(
  rehearsalId: string,
  _prevState: TakeOverState,
  formData: FormData,
): Promise<TakeOverState> {
  const actor = await requireActor()
  const opening = String(formData.get('opening') ?? '').trim()
  if (!opening) return { status: 'error', message: '第一句话不能是空的' }

  let poolId: string
  try {
    const result = await getEngine().takeOver(actor, { rehearsalId, opening })
    poolId = result.poolId
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : '接管失败，再试一次' }
  }
  revalidatePath('/home')
  redirect(`/pool/${poolId}`)
}
