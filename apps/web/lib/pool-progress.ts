import { AgentCard, type PoolRole } from '@pool/shared'
import type { PoolSummary, TimelineEntry } from '@pool/engine'

/**
 * 把 PoolEngine 已经返回的东西，读成「这件事长到哪一步了」。
 *
 * 这一层刻意是**纯函数**：不查库、不调引擎、不发请求。输入只有 myPools 的
 * 一行摘要和 poolTimeline 的条目，输出是页面要展示的看板。它属于表现层 ——
 * 「植物长成什么样」是设计问题，不是业务问题，不该塞进 PoolEngine。
 *
 * 一条纪律：这里出现的每一项都必须能指回时间线上的一条真实记录。
 * 没有记录支撑的结论一律不编 —— 群里口头聊定的事，系统确实不知道，
 * 看板就如实说它不知道，而不是猜一个好看的数字填上去。
 */

/**
 * 生长阶段。这就是产品世界观里那株植物的七个形态。
 *
 * 注意它不是 pool.state 的别名：引擎里 forming 覆盖了组队后的绝大部分时间
 * （没有任何路径把池塘写成 active），若直接照 state 画植物，
 * 一件事从破冰到计划敲定会一直停在同一个形态上 —— 那就不是进度指示器了。
 * 所以真正决定形态的是时间线上的实际进展。
 */
export type GrowthStage =
  | 'seed' // 种子：还在土里。意图未成行，或组队后对方还没确认
  | 'sprout' // 发芽：双方确认了，还没开口
  | 'leafing' // 长叶：开始沟通
  | 'growing' // 生长：有事情定下来了，还有没定的
  | 'budding' // 花苞：该定的都定了，就等真的去做
  | 'blooming' // 开花：行动真实完成
  | 'seeding' // 结籽：带着下次的理由休眠

export const STAGE_LABEL: Record<GrowthStage, string> = {
  seed: '种子',
  sprout: '发芽',
  leafing: '长叶',
  growing: '生长',
  budding: '花苞',
  blooming: '开花',
  seeding: '结籽',
}

/** 每个阶段「凭什么是这个阶段」。看板上直接展示，用户不用猜。 */
export const STAGE_MEANING: Record<GrowthStage, string> = {
  seed: '种下了，还没破土',
  sprout: '双方确认，破土了',
  leafing: '开始沟通',
  growing: '有事情定下来了',
  budding: '该定的都定了',
  blooming: '这件事真的发生了',
  seeding: '带着下次的理由睡着',
}

/** 看板上的一个事项。`detail` 是它的凭据，缺了它这条就只是断言。 */
export interface ProgressItem {
  id: string
  label: string
  detail: string | null
}

export interface PoolProgress {
  stage: GrowthStage
  /** 在册确认的成员名字。只收时间线上真的出现过的人，不含尚未确认的邀请。 */
  confirmedNames: string[]
  /** 在册人数减去已确认人数 —— 还没点确认的邀请。确认即过滤（ADR-0002）。 */
  pendingInvites: number
  /** 真人发过的话（含开场白）。用来区分「还没开口」和「聊起来了」。 */
  talkCount: number
  /** 精灵发过的卡片数。 */
  cardCount: number
  /** 接管那一刻的提案：目标、时间、地点、为什么。可能没有（唤醒派生的池塘就没有）。 */
  opening: OpeningProposal | null
  settled: ProgressItem[]
  unsettled: ProgressItem[]
  /** 下一步该干什么。永远只有一句，且指向一个真的能点的动作。 */
  nextStep: string
}

export interface OpeningProposal {
  what: string
  when: string
  where: string
  rationale: string
  riskNote: string
  /** 真人最终发出去的第一句话。 */
  opening: string
  actorName: string | null
}

const ROLE_LABEL: Record<PoolRole, string> = {
  initiator: '发起人',
  guide: '带路人',
  shooter: '摄影',
  logistics: '后勤',
  participant: '参与者',
}

interface TapPayload {
  cardId?: string
  optionId?: string
}

function tapOf(entry: TimelineEntry): TapPayload {
  return entry.payload as TapPayload
}

/**
 * 主入口。
 *
 * @param pool  myPools 里的那一行（state / memberCount / artifactCount / nextHook）
 * @param timeline poolTimeline 的全部条目，按发生顺序
 * @param wakeDue 休眠池塘的 next_hook 是否已到期（由页面调 wakeCardFor 判出来）
 */
export function readPoolProgress(
  pool: Pick<PoolSummary, 'state' | 'memberCount' | 'artifactCount' | 'nextHook' | 'title'>,
  timeline: readonly TimelineEntry[],
  wakeDue = false,
): PoolProgress {
  const taps = timeline.filter((e) => e.kind === 'tap')
  const cards = timeline.filter((e) => e.kind === 'card')
  const talks = timeline.filter((e) => e.kind === 'message' || e.kind === 'opening')

  const confirmedNames = readConfirmedNames(timeline)
  // 成员表里 left_at 为空的人包含还没点确认的邀请，减去时间线上确认过的，
  // 剩下的就是「还在等他点头」的人数。负数说明有人在时间线之外退出了，钳到 0。
  const pendingInvites = Math.max(pool.memberCount - confirmedNames.length, 0)

  const opening = readOpening(timeline)
  const decisions = readDecisions(cards, taps, confirmedNames.length)
  const roster = readRoster(cards, taps)

  const settled: ProgressItem[] = [...decisions.settled, ...roster.settled]
  const unsettled: ProgressItem[] = [...decisions.unsettled, ...roster.unsettled]

  if (pendingInvites > 0) {
    unsettled.unshift({
      id: 'pending-invites',
      label: `还有 ${pendingInvites} 人没点确认`,
      detail: '不确认就是不合适，不用追问',
    })
  }

  const stage = readStage(pool, {
    confirmed: confirmedNames.length,
    talkCount: talks.length,
    settledCount: settled.length,
    unsettledCount: unsettled.length,
  })

  return {
    stage,
    confirmedNames,
    pendingInvites,
    talkCount: talks.length,
    cardCount: cards.length,
    opening,
    settled,
    unsettled,
    nextStep: readNextStep(pool, {
      stage,
      pendingInvites,
      talkCount: talks.length,
      unsettled,
      wakeDue,
    }),
  }
}

/**
 * 谁真的在这个池塘里。
 *
 * 依据只有三种条目：开场白的作者（接管者本人，建池时就是 joined）、
 * `joined` 条目（本人点了确认）、`left` 条目（退出）。发过言的人必然是
 * joined ——`postMessage` 会先校验成员状态，所以消息作者也算数。
 */
function readConfirmedNames(timeline: readonly TimelineEntry[]): string[] {
  const present = new Map<string, string>()
  for (const entry of timeline) {
    if (!entry.actorId || !entry.actorName) continue
    if (entry.kind === 'left') {
      present.delete(entry.actorId)
      continue
    }
    if (entry.kind === 'opening' || entry.kind === 'joined' || entry.kind === 'message') {
      present.set(entry.actorId, entry.actorName)
    }
  }
  return [...present.values()]
}

/** 接管那一刻的提案。payload 由 takeOver 写入，形状是 { proposal: ProposalCard }。 */
function readOpening(timeline: readonly TimelineEntry[]): OpeningProposal | null {
  const entry = timeline.find((e) => e.kind === 'opening')
  if (!entry) return null

  const proposal = (entry.payload as { proposal?: unknown }).proposal
  if (!proposal || typeof proposal !== 'object') return null

  const p = proposal as {
    actionProposal?: { what?: string; when?: string; where?: string; rationale?: string }
    riskNote?: string
  }
  const action = p.actionProposal
  if (!action?.what) return null

  return {
    what: action.what,
    when: action.when ?? '还没说',
    where: action.where ?? '还没说',
    rationale: action.rationale ?? '',
    riskNote: p.riskNote ?? '',
    opening: entry.summary ?? '',
    actorName: entry.actorName,
  }
}

/**
 * 决策卡收敛到什么程度。
 *
 * 判定规则：只有一个选项有票、且票数不少于已确认成员数，才算定下来。
 * 「多数人选了」不算 —— 这是一场四个人的出行，两票并不构成决定，
 * 而看板一旦把没定的事标成定了，用户就再也不会信它。
 */
function readDecisions(
  cards: readonly TimelineEntry[],
  taps: readonly TimelineEntry[],
  confirmedCount: number,
): { settled: ProgressItem[]; unsettled: ProgressItem[] } {
  const settled: ProgressItem[] = []
  const unsettled: ProgressItem[] = []

  for (const card of cards) {
    const parsed = AgentCard.safeParse(card.payload)
    if (!parsed.success || parsed.data.kind !== 'decision') continue

    const mine = taps.filter((t) => tapOf(t).cardId === card.id)
    const voters = new Set(mine.map((t) => t.actorId)).size
    const chosen = parsed.data.options.filter((opt) =>
      mine.some((t) => tapOf(t).optionId === opt.id),
    )

    if (voters === 0) {
      unsettled.push({ id: card.id, label: parsed.data.question, detail: '还没人选' })
      continue
    }
    if (chosen.length === 1 && voters >= Math.max(confirmedCount, 1)) {
      settled.push({ id: card.id, label: parsed.data.question, detail: chosen[0]!.label })
      continue
    }
    unsettled.push({
      id: card.id,
      label: parsed.data.question,
      detail:
        chosen.length > 1
          ? `票分散在 ${chosen.length} 个选项上`
          : `${voters}/${Math.max(confirmedCount, 1)} 人选了`,
    })
  }

  return { settled, unsettled }
}

/**
 * 角色缺口。
 *
 * 只看**最新**那张清单卡：takenBy 是发卡那一刻的数据库快照，
 * 旧卡上的缺口早就不是现在的缺口了。卡发出之后的举手（tap）另算。
 */
function readRoster(
  cards: readonly TimelineEntry[],
  taps: readonly TimelineEntry[],
): { settled: ProgressItem[]; unsettled: ProgressItem[] } {
  const settled: ProgressItem[] = []
  const unsettled: ProgressItem[] = []

  const latest = [...cards]
    .reverse()
    .find((c) => AgentCard.safeParse(c.payload).data?.kind === 'roster')
  if (!latest) return { settled, unsettled }

  const parsed = AgentCard.safeParse(latest.payload)
  if (!parsed.success || parsed.data.kind !== 'roster') return { settled, unsettled }

  const mine = taps.filter((t) => tapOf(t).cardId === latest.id)

  for (const slot of parsed.data.slots) {
    const raisedHands = mine
      .filter((t) => tapOf(t).optionId === slot.role)
      .map((t) => t.actorName)
      .filter((n): n is string => Boolean(n))
    const holders = [...slot.takenBy.map((t) => t.displayName), ...raisedHands]
    const unique = [...new Set(holders)]
    const item: ProgressItem = {
      id: `${latest.id}:${slot.role}`,
      label: ROLE_LABEL[slot.role],
      detail: unique.length > 0 ? unique.join('、') : null,
    }
    if (unique.length >= slot.needed) settled.push(item)
    else unsettled.push({ ...item, detail: unique.length > 0 ? `${unique.join('、')}，还缺 ${slot.needed - unique.length} 个` : '还没人认领' })
  }

  return { settled, unsettled }
}

function readStage(
  pool: Pick<PoolSummary, 'state' | 'artifactCount'>,
  signals: { confirmed: number; talkCount: number; settledCount: number; unsettledCount: number },
): GrowthStage {
  if (pool.state === 'dormant') return 'seeding'
  if (pool.state === 'done') return 'blooming'
  if (pool.state === 'open' || pool.state === 'matching') return 'seed'

  // forming / active：真正的进度在时间线上，不在 state 上
  if (signals.confirmed < 2) return 'seed'
  if (signals.talkCount === 0) return 'sprout'
  if (signals.settledCount === 0) return 'leafing'
  if (signals.unsettledCount > 0) return 'growing'
  return 'budding'
}

function readNextStep(
  pool: Pick<PoolSummary, 'state' | 'artifactCount' | 'nextHook'>,
  ctx: {
    stage: GrowthStage
    pendingInvites: number
    talkCount: number
    unsettled: ProgressItem[]
    wakeDue: boolean
  },
): string {
  if (pool.state === 'dormant') {
    return ctx.wakeDue
      ? '到点了 —— 想再来一次就点「再约一次」，会开一株新的。'
      : '等下次的理由到期，它会自己回来问你们。'
  }
  if (pool.state === 'done') {
    return pool.artifactCount === 0
      ? '传一张返图。这次的事要留下痕迹，才长得进你的森林。'
      : '点「写完了，存进记忆」——它会带着下次的理由睡着，不是消失。'
  }
  if (ctx.pendingInvites > 0 && ctx.talkCount <= 1) {
    return '等对方确认。他不点，就是这次不合适 —— 不用追问，也不用解释。'
  }
  if (ctx.talkCount <= 1) {
    return '破冰：随便说一句都行，先让这件事有人接话。'
  }
  const blocker = ctx.unsettled[0]
  if (blocker) {
    return `把「${blocker.label}」定下来 —— 在精灵那张卡上点一下就算数。`
  }
  return '该定的都定了。到点就去，回来点「办完了」。'
}
