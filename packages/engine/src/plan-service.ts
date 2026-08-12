import type { Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'
import { z } from 'zod'

/**
 * 行动确认卡：从「有空一起」到「确定一起」。
 *
 * PRD 把这一步称为最重要的中间转化节点。此前整个产品缺这一环 ——
 * 池塘里聊完就直接跳到「办完了」，中间那个「我们确定要一起做这件事」
 * 的时刻没有落点，于是提醒该在什么时候发、当天状态从什么时候开始，都无从判断。
 *
 * ## 为什么这里的时间是具体值，而意图阶段是自由文本
 *
 * 意图阶段说「这周末」是对的（ADR-0002：那时逼人精确只会把合适的人筛掉）。
 * 但到了确认卡，含糊就是没确认 —— 这张卡存在的全部意义，
 * 就是把「有空一起」变成「周六 6:00 北宫门」。
 *
 * ## 草稿由 AI 汇总，但必须有人提交
 *
 * AI 从聊天记录里把已经聊定的东西汇总成一张卡，人来改、来提交、来逐个确认。
 * 让 AI 直接生成并生效，就等于替一群人做了共同承诺 —— 那是红线。
 */

const PLAN_SYSTEM = `你从一群人的聊天记录里，汇总出一张行动确认卡的草稿。

只填聊天里**真的聊到过**的内容。没聊到的字段留空 ——
编一个「北门集合」出来，比留空更糟：它看起来像已经商定了，
而实际上没有人同意过。

title：这件事叫什么，短，像他们自己会说的话
startsAt：具体的日期与时间。聊天里若只说了「周六」而没说几点，
  就取那天的一个合理时刻并在 route 里注明还需确认
meetAt：集合地点，具体到能导航
route：路线或流程，没聊到就留空字符串
bring：需要带的东西，数组，没聊到就空数组
budget：费用说明，没聊到就留空字符串
tasks：任务分工数组，每项 { what, ownerHint }。
  ownerHint 是聊天里认领过的人的名字；没人认领就留空字符串，不要指派。`

const PlanDraft = z.object({
  title: z.string().min(1),
  startsAt: z.string().min(1),
  meetAt: z.string().min(1),
  route: z.string(),
  bring: z.array(z.string()),
  budget: z.string(),
  tasks: z.array(z.object({ what: z.string().min(1), ownerHint: z.string() })),
})
export type PlanDraft = z.infer<typeof PlanDraft>

export interface PlanDeps {
  sql: Sql
  model: ModelGateway
}

/** 从聊天记录汇总一张草稿。不落库 —— 提交是人的动作。 */
export async function draftPlan(deps: PlanDeps, poolId: string): Promise<PlanDraft> {
  const [pool] = await deps.sql<{ title: string | null }[]>`
    select title from pool where id = ${poolId}
  `
  const lines = await deps.sql<{ actorName: string | null; summary: string | null }[]>`
    select p.display_name as "actorName", e.summary
    from episode e left join person p on p.id = e.actor_id
    where e.pool_id = ${poolId} and e.kind in ('opening','message','tap')
    order by e.occurred_at asc
  `
  if (lines.length === 0) {
    throw new Error('还没有任何讨论，无法汇总计划 —— 编出来的计划没有人同意过')
  }

  return deps.model.generate({
    task: 'plan.draft',
    schema: PlanDraft,
    system: PLAN_SYSTEM,
    user:
      `他们要做的事：${pool?.title ?? '（无标题）'}\n今天是 ${new Date().toISOString().slice(0, 10)}\n\n聊天记录：\n` +
      lines.map((l) => `${l.actorName ?? '助手'}：${l.summary ?? ''}`).join('\n'),
  })
}

export interface PlanRecord {
  poolId: string
  title: string
  startsAt: Date
  meetAt: string
  route: string | null
  bring: string[]
  budget: string | null
  changePolicy: string | null
  tasks: { id: string; what: string; ownerId: string | null; ownerName: string | null; doneAt: Date | null }[]
  confirmedBy: { personId: string; displayName: string }[]
  /** 还没确认的在册成员。全部确认后池塘才进花苞 */
  pendingBy: { personId: string; displayName: string }[]
}

/** 提交一张确认卡。覆盖式 —— 计划有变就重新提交，而不是攒一堆版本。 */
export async function submitPlan(
  sql: Sql,
  poolId: string,
  authorId: string,
  input: {
    title: string
    startsAt: string
    meetAt: string
    route?: string
    bring?: string[]
    budget?: string
    changePolicy?: string
    tasks?: { what: string; ownerId?: string }[]
  },
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      insert into action_plan (pool_id, title, starts_at, meet_at, route, bring, budget, change_policy, drafted_by)
      values (${poolId}, ${input.title}, ${input.startsAt}, ${input.meetAt},
              ${input.route ?? null}, ${input.bring ?? []}, ${input.budget ?? null},
              ${input.changePolicy ?? null}, ${authorId})
      on conflict (pool_id) do update
        set title = excluded.title, starts_at = excluded.starts_at, meet_at = excluded.meet_at,
            route = excluded.route, bring = excluded.bring, budget = excluded.budget,
            change_policy = excluded.change_policy, drafted_by = excluded.drafted_by,
            updated_at = now()
    `
    await tx`delete from plan_task where pool_id = ${poolId}`
    for (const t of input.tasks ?? []) {
      await tx`
        insert into plan_task (pool_id, what, owner_id)
        values (${poolId}, ${t.what}, ${t.ownerId ?? null})
      `
    }
    // 计划改了，之前的确认作废 —— 大家确认的是那一版，不是这一版
    await tx`delete from plan_confirmation where pool_id = ${poolId}`
    await tx`
      insert into episode (pool_id, kind, summary, actor_id)
      values (${poolId}, 'plan', ${input.title}, ${authorId})
    `
  })
}

/**
 * 确认计划。全员确认后池塘进入 planned（花苞）。
 *
 * 一个人拍板不算共同承诺 —— 这是「植物代表所有参与者共同推动的那件事」
 * 在数据上的体现。
 */
export async function confirmPlan(
  sql: Sql,
  poolId: string,
  personId: string,
): Promise<{ allConfirmed: boolean }> {
  return sql.begin(async (tx) => {
    await tx`
      insert into plan_confirmation (pool_id, person_id) values (${poolId}, ${personId})
      on conflict do nothing
    `
    const pendingRows = await tx<{ pending: number }[]>`
      select count(*)::int as pending
      from membership m
      where m.pool_id = ${poolId} and m.state = 'joined'
        and not exists (
          select 1 from plan_confirmation c
          where c.pool_id = ${poolId} and c.person_id = m.person_id
        )
    `
    const allConfirmed = (pendingRows[0]?.pending ?? 1) === 0
    if (allConfirmed) {
      await tx`update pool set state = 'planned' where id = ${poolId} and state in ('forming','active')`
      await tx`
        insert into episode (pool_id, kind, summary, actor_id)
        values (${poolId}, 'planned', '所有人都确认了，这件事定下来了', null)
      `
    }
    return { allConfirmed }
  }) as Promise<{ allConfirmed: boolean }>
}

/** 读一张确认卡，含谁确认了、谁还没。 */
export async function readPlan(sql: Sql, poolId: string): Promise<PlanRecord | null> {
  const [plan] = await sql<
    {
      poolId: string
      title: string
      startsAt: Date
      meetAt: string
      route: string | null
      bring: string[]
      budget: string | null
      changePolicy: string | null
    }[]
  >`
    select pool_id as "poolId", title, starts_at as "startsAt", meet_at as "meetAt",
           route, bring, budget, change_policy as "changePolicy"
    from action_plan where pool_id = ${poolId}
  `
  if (!plan) return null

  const tasks = await sql<PlanRecord['tasks']>`
    select t.id, t.what, t.owner_id as "ownerId", p.display_name as "ownerName", t.done_at as "doneAt"
    from plan_task t left join person p on p.id = t.owner_id
    where t.pool_id = ${poolId} order by t.created_at asc
  `
  const confirmedBy = await sql<PlanRecord['confirmedBy']>`
    select c.person_id as "personId", p.display_name as "displayName"
    from plan_confirmation c join person p on p.id = c.person_id
    where c.pool_id = ${poolId}
  `
  const pendingBy = await sql<PlanRecord['pendingBy']>`
    select m.person_id as "personId", p.display_name as "displayName"
    from membership m join person p on p.id = m.person_id
    where m.pool_id = ${poolId} and m.state = 'joined'
      and not exists (
        select 1 from plan_confirmation c where c.pool_id = ${poolId} and c.person_id = m.person_id
      )
  `
  return { ...plan, tasks, confirmedBy, pendingBy }
}
