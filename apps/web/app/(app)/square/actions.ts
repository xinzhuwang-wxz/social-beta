'use server'

import { revalidatePath } from 'next/cache'
import type { Clarification, EssentialSlot, PoolEngine } from '@pool/engine'
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
  /** 缺了通用项，问一轮。rawText 原样带回来，答完要拼回去。 */
  | { status: 'asking'; rawText: string; questions: Clarification['questions'] }
  | { status: 'success'; intent: PublishedIntent }

/** 太短的一句话抽不出什么槽位，与其让模型硬编，不如提前拦一句。 */
const MIN_LENGTH = 4

/**
 * 种下一颗种子。/square 的主写路径。
 *
 * 先让引擎看一眼缺不缺通用项（什么时候 / 在哪 / 几个人）：
 *
 *   不缺 → 直接发布，不多问一句。
 *   缺   → 返回 asking，前端问**一轮**，且整轮可跳过。
 *
 * 为什么是一轮不是多轮：PRD 要求 AI 追问必要信息，同时明确要避免
 * 「强制用户进行十几分钟的 Agent 对话」。一轮、最多三题、可整轮跳过，
 * 是这两条约束的交集。问题本身是固定模板（引擎侧决定），不是模型现编的 ——
 * 让模型出题会不受控地滑向个性化打探，那既慢又让人不适。
 */
export async function startPublishAction(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const actor = await requireActor()
  const rawText = String(formData.get('text') ?? '').trim()

  if (rawText.length < MIN_LENGTH) {
    return { status: 'error', message: '再说具体一点，比如干什么、大概什么时候' }
  }

  try {
    const clarification = await getEngine().clarifyIntent(actor, rawText)
    if (clarification.questions.length === 0) {
      const intent = await getEngine().publishIntent(actor, rawText)
      revalidatePath('/square')
      return { status: 'success', intent }
    }
    return { status: 'asking', rawText, questions: clarification.questions }
  } catch (err) {
    const message = err instanceof Error ? err.message : '种不下去，再试一次'
    return { status: 'error', message }
  }
}

/**
 * 带着答案（或者什么都不带）把种子种下去。
 *
 * 跳过和作答走的是同一条路：跳过时 answers 为空，引擎侧 mergeAnswers
 * 会原样返回原句。**没有一个「必须答完才能发」的分支** ——
 * 这是刻意的：追问是帮忙，不是关卡。
 */
export async function finishPublishAction(
  rawText: string,
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const actor = await requireActor()
  const skipped = formData.get('skip') !== null

  const answers: Partial<Record<EssentialSlot, string>> = {}
  if (!skipped) {
    for (const slot of ['when', 'where', 'size'] as const) {
      const value = String(formData.get(slot) ?? '').trim()
      if (value) answers[slot] = value
    }
  }

  try {
    const intent = await getEngine().publishClarified(actor, rawText, answers)
    revalidatePath('/square')
    return { status: 'success', intent }
  } catch (err) {
    const message = err instanceof Error ? err.message : '种不下去，再试一次'
    return { status: 'error', message }
  }
}

/**
 * 直接发布，不追问。
 *
 * 只用在「我理解成了」确认卡的重新发布：那时用户已经逐项改过槽位，
 * 再问一轮他刚刚才填过的东西，是把帮忙变成骚扰。
 *
 * PoolEngine 没有单独的「改槽位」接口——抽取与写入在 publishIntent 内部
 * 是原子的一步（见 intent-service.ts），所以修正的唯一路径是「重新说一遍」，
 * 不是原地打补丁。旧记录会留在广场直到自然过期，UI 里把这一点明说。
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
    revalidatePath('/square')
    return { status: 'success', intent }
  } catch (err) {
    const message = err instanceof Error ? err.message : '种不下去，再试一次'
    return { status: 'error', message }
  }
}
