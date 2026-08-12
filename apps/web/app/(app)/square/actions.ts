'use server'

import { revalidatePath } from 'next/cache'
import type { PoolEngine } from '@pool/engine'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'

/**
 * publishIntent 的返回类型。
 *
 * `@pool/engine` 没有单独导出 IntentRecord ——用 PoolEngine 方法本身的
 * 返回类型反推，比在这里重新抄一份形状更不容易跟实现脱节。
 */
export type PublishedIntent = Awaited<ReturnType<PoolEngine['publishIntent']>>

export type PublishState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; intent: PublishedIntent }

/** 太短的一句话抽不出什么槽位，与其让模型硬编，不如提前拦一句。 */
const MIN_LENGTH = 4

/**
 * 发布一条意图 —— /square 唯一的写路径。
 *
 * 校验完直接转交 PoolEngine.publishIntent，槽位怎么抽、TTL 怎么定，
 * 全部是它内部的职责，这里不重复判断。
 *
 * 兼作「编辑重发」的动作：确认卡片里改完 when/where/vibe 等字段后，
 * 客户端会把它们拼回一句人话，再调用这同一个函数——PoolEngine 没有单独的
 * 「改槽位」接口，抽取与写入在 publishIntent 内部是原子的一步（见
 * intent-service.ts），所以修正的唯一路径是「重新说一遍」，不是原地打补丁。
 * 旧的那条记录会留在广场直到自然过期，这是已知的、明说出来的 T0 取舍。
 */
export async function publishIntentAction(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const actor = await requireActor()
  const rawText = String(formData.get('text') ?? '').trim()

  if (rawText.length < MIN_LENGTH) {
    return { status: 'error', message: '再说具体一点，比如干什么、大概什么时候' }
  }

  try {
    const intent = await getEngine().publishIntent(actor, rawText)
    // 让广场列表在同一次响应里带上刚发的这条，用户不用手动刷新就能看到自己发的话。
    revalidatePath('/square')
    return { status: 'success', intent }
  } catch (err) {
    const message = err instanceof Error ? err.message : '发布失败，再试一次'
    return { status: 'error', message }
  }
}
