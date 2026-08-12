'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { DayStatus, PoolEngine } from '@pool/engine'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'

function poolPath(poolId: string): string {
  return `/pool/${poolId}`
}

/**
 * 把引擎抛出的错误翻译成人话，塞进查询串里跳回本池塘页。
 *
 * 用于本文件里那些「没有中间态需要展示」的一次性动作（点卡片、办完了、
 * 收尾、唤醒、确认加入）——它们不需要 useActionState 那套 pending/错误
 * 状态机，一个 plain `<form action={...}>` 就够了，且无 JS 也能跑。
 *
 * 注意：这个函数必须只在 catch 块里调用，且外层不能再套 try/catch——
 * `redirect()` 本身是靠抛一个特殊错误来实现跳转的，被外层 catch 接住
 * 就会变成「跳转失败了」而不是「跳转成功了」。
 */
function failWith(poolId: string, err: unknown): never {
  const message = err instanceof Error ? err.message : '操作失败，再试一次'
  redirect(`${poolPath(poolId)}?error=${encodeURIComponent(message)}`)
}

export type PostMessageState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'sent'; at: number }

/** 发一条消息。唯一的写路径——直接转交 PoolEngine.postMessage，不重复判断。 */
export async function postMessageAction(
  poolId: string,
  _prevState: PostMessageState,
  formData: FormData,
): Promise<PostMessageState> {
  const actor = await requireActor()
  const text = String(formData.get('text') ?? '').trim()
  if (!text) return { status: 'error', message: '说点什么吧' }

  try {
    await getEngine().postMessage(actor, poolId, text)
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : '发送失败，再试一次' }
  }
  revalidatePath(poolPath(poolId))
  return { status: 'sent', at: Date.now() }
}

export type ArtifactState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'added'; at: number }

/**
 * 传一份回流物。
 *
 * uri 是一个链接，不是文件上传——这里没有接对象存储，不假装能收文件。
 * 用户把图床、相册分享出来的链接粘进来即可。
 */
export async function addArtifactAction(
  poolId: string,
  _prevState: ArtifactState,
  formData: FormData,
): Promise<ArtifactState> {
  const actor = await requireActor()
  const uri = String(formData.get('uri') ?? '').trim()
  const caption = String(formData.get('caption') ?? '').trim()
  if (!uri) return { status: 'error', message: '先粘一个图片链接' }

  try {
    await getEngine().addArtifact(actor, poolId, { kind: 'photo', uri, caption: caption || undefined })
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : '传失败了，再试一次' }
  }
  revalidatePath(poolPath(poolId))
  return { status: 'added', at: Date.now() }
}

export type FeedbackState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'saved'; at: number }

/** 留一句反馈。只有本人看得见——让人知道队友怎么评价自己，所有人就只写好话了。 */
export async function giveFeedbackAction(
  poolId: string,
  _prevState: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const actor = await requireActor()
  const again = String(formData.get('again') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  if (again !== 'yes' && again !== 'maybe' && again !== 'no') {
    return { status: 'error', message: '选一个态度吧' }
  }

  try {
    await getEngine().giveFeedback(actor, poolId, { again, note: note || undefined })
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : '保存失败，再试一次' }
  }
  revalidatePath(poolPath(poolId))
  return { status: 'saved', at: Date.now() }
}

/**
 * 点一张精灵卡片。行为直接写回 episode，这里不做二次判断——
 * cardId 就是这条 card episode 自己的 id，optionId 由卡片内容决定。
 */
export async function tapCardAction(poolId: string, cardId: string, optionId: string): Promise<void> {
  const actor = await requireActor()
  try {
    await getEngine().tapCard(actor, poolId, cardId, optionId)
  } catch (err) {
    failWith(poolId, err)
  }
  revalidatePath(poolPath(poolId))
}

/** 事件办完。转 done，之后才谈得上传返图、写反馈。 */
export async function finishEventAction(poolId: string): Promise<void> {
  const actor = await requireActor()
  try {
    await getEngine().finishEvent(actor, poolId)
  } catch (err) {
    failWith(poolId, err)
  }
  revalidatePath(poolPath(poolId))
}

/**
 * 收尾：写回顾、生成 next_hook、转休眠。
 *
 * 成员校验在 PoolEngine 里做。此前这里 `await requireActor()` 却把返回值丢掉了，
 * 引擎侧也不接 actor —— 于是任何登录用户拿到任一 pool 的 uuid，
 * 就能对全站任意已结束池塘触发一次真实 LLM 调用并伪造它的 next_hook。
 * 注释当时写着「任何在册成员都能触发」，而那个约束一行代码都没有。
 */
export async function sealPoolAction(poolId: string): Promise<void> {
  const actor = await requireActor()
  try {
    await getEngine().sealPool(actor, poolId)
  } catch (err) {
    failWith(poolId, err)
  }
  revalidatePath(poolPath(poolId))
}

/** 到期后再约一次：派生新池塘，原池保持休眠。 */
export async function acceptWakeAction(poolId: string): Promise<void> {
  const actor = await requireActor()
  let fresh: string
  try {
    const result = await getEngine().acceptWake(actor, poolId)
    fresh = result.poolId
  } catch (err) {
    failWith(poolId, err)
  }
  revalidatePath('/home')
  redirect(poolPath(fresh))
}

/**
 * 确认加入——ADR-0002「确认即过滤」。
 *
 * 用在「这个池塘你还进不去」的引导页：不管背后是不是真的有一条待确认的
 * 邀请，都交给 confirmJoin 自己去认——没有就如实报错，不在这里猜。
 */
export async function confirmJoinAction(poolId: string): Promise<void> {
  const actor = await requireActor()
  try {
    await getEngine().confirmJoin(actor, poolId)
  } catch (err) {
    failWith(poolId, err)
  }
  redirect(poolPath(poolId))
}

// ==========================================================
// 行动确认卡：从「有空一起」到「确定一起」
// ==========================================================

export type PlanDraft = Awaited<ReturnType<PoolEngine['draftPlan']>>

export type DraftState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'ready'; draft: PlanDraft }

/**
 * 让 AI 从聊天记录里汇总一版草稿。
 *
 * 只汇总、不落库、不改状态 —— 引擎侧就是这么设计的，这里也不越权：
 * 拿到草稿之后必须由真人在表单里改、由真人按提交。AI 直接生成并生效，
 * 等于替一群人做了共同承诺，那是红线。
 *
 * 按需触发（点按钮才跑），不挂在渲染路径上：它要打一次模型，
 * 挂在 GET 上意味着刷新、返回、RSC 重渲染都会重花钱。
 */
export async function draftPlanAction(
  _prevState: DraftState,
  formData: FormData,
): Promise<DraftState> {
  const actor = await requireActor()
  const poolId = String(formData.get('poolId') ?? '')
  try {
    return { status: 'ready', draft: await getEngine().draftPlan(actor, poolId) }
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : '汇总不出来，先在群里多聊两句',
    }
  }
}

export type SubmitPlanState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'saved'; at: number }

/**
 * 提交确认卡。
 *
 * 覆盖式：改一版就作废之前所有人的确认（引擎保证）——
 * 大家确认的是那一版，不是这一版。这条语义必须在 UI 上说出来，
 * 否则改完计划的人会以为别人的确认还算数。
 */
export async function submitPlanAction(
  poolId: string,
  _prevState: SubmitPlanState,
  formData: FormData,
): Promise<SubmitPlanState> {
  const actor = await requireActor()

  const title = String(formData.get('title') ?? '').trim()
  const startsAt = String(formData.get('startsAt') ?? '').trim()
  const meetAt = String(formData.get('meetAt') ?? '').trim()
  if (!title) return { status: 'error', message: '给这件事起个名字' }
  if (!startsAt) return { status: 'error', message: '定个具体时间——含糊就等于没确认' }
  if (!meetAt) return { status: 'error', message: '定个集合地点，具体到能导航' }

  // 任务行：what[] 与 ownerId[] 一一对应，空的 what 直接丢掉
  const whats = formData.getAll('taskWhat').map((v) => String(v).trim())
  const owners = formData.getAll('taskOwner').map((v) => String(v))
  const tasks = whats
    .map((what, i) => ({ what, ownerId: owners[i] || undefined }))
    .filter((t) => t.what.length > 0)

  try {
    await getEngine().submitPlan(actor, poolId, {
      title,
      startsAt,
      meetAt,
      route: String(formData.get('route') ?? '').trim() || undefined,
      bring: String(formData.get('bring') ?? '')
        .split(/[,，、\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      budget: String(formData.get('budget') ?? '').trim() || undefined,
      changePolicy: String(formData.get('changePolicy') ?? '').trim() || undefined,
      tasks,
    })
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : '提交失败，再试一次' }
  }
  revalidatePath(poolPath(poolId))
  return { status: 'saved', at: Date.now() }
}

/** 确认这一版计划。全员确认后池塘才进花苞 —— 一个人拍板不算共同承诺。 */
export async function confirmPlanAction(poolId: string): Promise<void> {
  const actor = await requireActor()
  try {
    await getEngine().confirmPlan(actor, poolId)
  } catch (err) {
    failWith(poolId, err)
  }
  revalidatePath(poolPath(poolId))
}

/** 当天状态。首版不做定位 —— 自己点一下就够，不值得为它要一次定位权限。 */
export async function setDayStatusAction(poolId: string, status: DayStatus): Promise<void> {
  const actor = await requireActor()
  try {
    await getEngine().setDayStatus(actor, poolId, status)
  } catch (err) {
    failWith(poolId, err)
  }
  revalidatePath(poolPath(poolId))
}
