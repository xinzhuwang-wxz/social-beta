import type { Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'
import {
  SILENT,
  type AgentCard,
  type InterventionContext,
  type InterventionDecision,
  type PoolState,
} from '@pool/shared'
import { z } from 'zod'

/**
 * 池塘精灵：群聊里的那个 N+1。
 *
 * 节奏按池塘状态分段（ADR-0004），不是全程统一沉默：
 *
 *   forming 刚组队 —— 主动：破冰话题卡、角色清单卡
 *   active  事情定了 —— 沉默为主：仅在协作断点介入
 *   done / dormant —— 各主动一次（回流卡、唤醒卡，分别在别处触发）
 *
 * 原设计是全程默认沉默，依据是「只在协作断点介入，其余都是骚扰」。
 * 但那条结论针对的是已在正常运转的群聊，没覆盖「刚把五个陌生人凑到一起」——
 * 那时没人说话不是正常协作，恰恰是破冰失败。
 * 一个把人凑齐然后自己闭嘴的精灵是失职，不是克制。
 */

/**
 * forming 阶段的卡片上限。
 *
 * 主动不等于话痨：把选择摆出来就停，不追问不催促。
 *
 * 值是 2 而不是 3：实际产卡分支只有两条（破冰话题、角色清单），
 * 写 3 会让这个常量永远够不着 —— 一个永远为真的上限不是上限，
 * 而守着它的那条测试也就什么都没验。
 */
const FORMING_CARD_CAP = 2

/** active 阶段判定冷场的阈值（分钟）。 */
const STALL_MINUTES = 30
/**
 * 两张卡之间的最小间隔（分钟）。
 *
 * 冷场是持续状态而不是一次性事件：只看「距上一条消息多久」的话，
 * 冷场期间每次求值都会说该介入。没有这个冷却，用户每刷新一次页面
 * 就多一张卡，而他什么都没做。
 */
const CARD_COOLDOWN_MINUTES = 60

const ICEBREAKER_SYSTEM = `你是一支刚组好队的小队里的助手。这群人多半互不认识。

你的目标只有一个：让他们尽快开口，尽快把该定的定下来。
不是让他们聊得开心，是让这件事真的能办成。

给出 3 个破冰话题。每个都必须：
- 和他们要一起做的这件事直接相关，不是泛泛的「大家自我介绍一下」
- 能引出具体信息（谁去过、谁有装备、谁时间紧），而不是引出客套
- 一句话，口语，像队里某个人随口问的

不要写「大家好呀」这类开场白，直接给话题。`

const IcebreakerTopics = z.object({
  topics: z.array(z.string().min(1)).length(3),
})

export interface SpiritDeps {
  sql: Sql
  model: ModelGateway
}

/**
 * 判断此刻该不该出面，出面该发什么卡。
 *
 * 这个函数是纯决策：不写库、不打模型。把「决定」和「执行」分开，
 * 才能用大量便宜的负例测试覆盖沉默路径 —— 而沉默在 active 阶段是主路径。
 */
export function decideIntervention(ctx: InterventionContext): InterventionDecision | 'need_icebreaker' | 'need_roster' {
  switch (ctx.poolState) {
    case 'forming': {
      // 主动，但有上限。发完就等。
      if (ctx.cardsSent >= FORMING_CARD_CAP) return SILENT
      if (ctx.cardsSent === 0) return 'need_icebreaker'
      if (ctx.cardsSent === 1) return 'need_roster'
      return SILENT
    }

    case 'active': {
      // 沉默为主。只有真的卡住了才出面 ——
      // 「大家各忙各的暂时没说话」和「没人牵头所以停了」在转录上长得一样，
      // 区别只在池塘状态，这正是 InterventionContext 必须带状态的原因。
      if (ctx.minutesSinceLastMessage < STALL_MINUTES) return SILENT
      // 冷场是持续状态：不加冷却的话，冷场期间每次求值都会说该介入
      if (ctx.minutesSinceLastCard < CARD_COOLDOWN_MINUTES) return SILENT
      return 'need_roster'
    }

    // done 的回流卡与 dormant 的唤醒卡由各自的时机触发，不走这条实时路径
    default:
      return SILENT
  }
}

/** 生成破冰话题卡。只在 decideIntervention 说需要时才调用 —— 它要打模型。 */
export async function makeIcebreaker(
  deps: SpiritDeps,
  pool: { title: string | null; brief: string | null },
  members: readonly string[],
): Promise<AgentCard> {
  const { topics } = await deps.model.generate({
    task: 'spirit.icebreaker',
    schema: IcebreakerTopics,
    system: ICEBREAKER_SYSTEM,
    user: `他们要一起做的事：${pool.title ?? '（还没定）'}\n${pool.brief ?? ''}\n成员：${members.join('、')}`,
  })

  return {
    kind: 'decision',
    question: '先聊起来 —— 挑一个说说？',
    options: topics.map((t, i) => ({ id: `t${i + 1}`, label: t, whenHint: null })),
  }
}

/**
 * 生成角色清单卡。
 *
 * 不打模型：角色是固定枚举，缺口是一次 SQL 聚合。
 * 这类确定性的东西交给模型，只会让它变慢、变贵、还偶尔编造。
 */
export async function makeRoster(sql: Sql, poolId: string): Promise<AgentCard> {
  const taken = await sql<{ role: string; personId: string; displayName: string }[]>`
    select m.role, m.person_id as "personId", p.display_name as "displayName"
    from membership m join person p on p.id = m.person_id
    where m.pool_id = ${poolId} and m.state = 'joined'
  `

  const roles = ['guide', 'shooter', 'logistics'] as const
  return {
    kind: 'roster',
    slots: roles.map((role) => ({
      role,
      needed: 1,
      takenBy: taken
        .filter((t) => t.role === role)
        .map((t) => ({ personId: t.personId, displayName: t.displayName })),
    })),
  }
}

export interface PoolPulse {
  poolId: string
  state: PoolState
  title: string | null
  brief: string | null
  memberCount: number
  cardsSent: number
  minutesSinceLastMessage: number
  minutesSinceLastCard: number
  members: string[]
}

/** 读一个池塘的当前节律，喂给 decideIntervention。 */
export async function readPulse(sql: Sql, poolId: string): Promise<PoolPulse> {
  const [row] = await sql<
    {
      state: PoolState
      title: string | null
      brief: string | null
      memberCount: number
      cardsSent: number
      lastMessageAt: Date | null
      lastCardAt: Date | null
    }[]
  >`
    select p.state, p.title, p.brief,
           (select count(*)::int from membership m where m.pool_id = p.id and m.state = 'joined') as "memberCount",
           (select count(*)::int from episode e where e.pool_id = p.id and e.kind = 'card') as "cardsSent",
           (select max(e.occurred_at) from episode e where e.pool_id = p.id and e.actor_id is not null) as "lastMessageAt",
           (select max(e.occurred_at) from episode e where e.pool_id = p.id and e.kind = 'card') as "lastCardAt"
    from pool p where p.id = ${poolId}
  `
  if (!row) throw new Error('池塘不存在')

  const members = await sql<{ displayName: string }[]>`
    select p.display_name as "displayName" from membership m
    join person p on p.id = m.person_id
    where m.pool_id = ${poolId} and m.state = 'joined'
  `

  return {
    poolId,
    state: row.state,
    title: row.title,
    brief: row.brief,
    memberCount: row.memberCount,
    cardsSent: row.cardsSent,
    minutesSinceLastMessage: row.lastMessageAt
      ? (Date.now() - row.lastMessageAt.getTime()) / 60000
      : 0,
    // 从没发过卡时给一个足够大的值，让冷却不成为首次介入的阻碍
    minutesSinceLastCard: row.lastCardAt
      ? (Date.now() - row.lastCardAt.getTime()) / 60000
      : Number.POSITIVE_INFINITY,
    members: members.map((m) => m.displayName),
  }
}

export { FORMING_CARD_CAP, STALL_MINUTES, CARD_COOLDOWN_MINUTES }
