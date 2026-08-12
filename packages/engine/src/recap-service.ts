import type { Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'
import type { AgentCard } from '@pool/shared'
import { z } from 'zod'

/**
 * 回流闭环：关系资产真正沉淀下来的那一段。
 *
 * 事件结束 → 索要返图 → 生成共同作品 → 写 recap → 生成 next_hook → 池塘转休眠。
 *
 * `dormant` 不是终态。池塘不因事情结束而销毁，它带着 next_hook 休眠，到期被唤醒。
 * 这是「沉淀了什么关系资产」的直接答案，也是北极星指标「复现率」的前提 ——
 * 而复现率量化的正是那句话：关系之所以持续，不是因为永远有话说，
 * 而是一直有事情可以去做。
 */

/** 事件结束多久还没有返图，就发回流卡。 */
const RECAP_PROMPT_HOURS = 12

const RECAP_SYSTEM = `你在为一群刚一起做完一件事的同学写一段回顾，并留下一句下次的理由。

summary：两三句话，写他们实际做了什么。只用聊天记录里真实出现的内容，不要美化，
不要写「大家玩得很开心」这类没有信息的话。

nextHook：一句话，是他们下次可以一起做的具体的事。
它必须来自聊天记录里真实提到过的东西 —— 某个人说过想去哪、想试什么、这次没做成的事。
如果记录里确实没有任何线索，就写这次做的这件事的一个自然延续，但要具体到能直接约。
绝对不要写「下次再约」「保持联系」这类空话 —— 那样的钩子挂不住任何人。`

const RecapDraft = z.object({
  summary: z.string().min(1),
  nextHook: z.string().min(1),
})

export interface RecapDeps {
  sql: Sql
  model: ModelGateway
}

/** 该不该发回流卡：事件已结束、超过时限、且一张返图都还没有。 */
export async function needsRecapPrompt(sql: Sql, poolId: string): Promise<boolean> {
  const [row] = await sql<{ due: boolean }[]>`
    select (
      p.state = 'done'
      and p.updated_at < now() - ${`${RECAP_PROMPT_HOURS} hours`}::interval
      and not exists (select 1 from artifact a where a.pool_id = p.id)
    ) as due
    from pool p where p.id = ${poolId}
  `
  return row?.due ?? false
}

export function makeRecapCard(): AgentCard {
  return {
    kind: 'recap',
    prompt: '传张图吧？我给你们做张海报',
    offerPoster: true,
  }
}

/**
 * 收尾：写 recap、生成 next_hook、转休眠。
 *
 * 刻意要求池塘已经有内容才收尾 —— 对一个没人说过话的池塘生成回顾，
 * 只能得到编造的内容，而编造的共同记忆比没有记忆更糟。
 */
export async function sealPool(
  deps: RecapDeps,
  poolId: string,
  hookDelayDays = 14,
): Promise<{ summary: string; nextHook: string }> {
  const episodes = await deps.sql<{ kind: string; summary: string | null; actorName: string | null }[]>`
    select e.kind, e.summary, p.display_name as "actorName"
    from episode e left join person p on p.id = e.actor_id
    where e.pool_id = ${poolId} and e.kind in ('opening','message','tap')
    order by e.occurred_at asc
  `
  if (episodes.length === 0) {
    throw new Error('池塘里没有任何对话，无法生成回顾 —— 编造的共同记忆比没有记忆更糟')
  }

  const [pool] = await deps.sql<{ title: string | null }[]>`
    select title from pool where id = ${poolId}
  `
  const artifacts = await deps.sql<{ caption: string | null }[]>`
    select caption from artifact where pool_id = ${poolId}
  `

  const draft = await deps.model.generate({
    task: 'recap.seal',
    schema: RecapDraft,
    system: RECAP_SYSTEM,
    user:
      `他们一起做的事：${pool?.title ?? '（无标题）'}\n\n聊天记录：\n` +
      episodes.map((e) => `${e.actorName ?? '助手'}：${e.summary ?? ''}`).join('\n') +
      (artifacts.length > 0
        ? `\n\n回流物：${artifacts.map((a) => a.caption ?? '一张图').join('、')}`
        : '\n\n（还没有返图）'),
  })

  await deps.sql.begin(async (tx) => {
    await tx`
      insert into episode (pool_id, kind, summary, actor_id)
      values (${poolId}, 'recap', ${draft.summary}, null)
    `
    await tx`
      update pool
      set next_hook = ${draft.nextHook},
          next_hook_due_at = now() + ${`${hookDelayDays} days`}::interval,
          state = 'dormant'
      where id = ${poolId}
    `
  })

  return draft
}

/**
 * 唤醒卡：把上次的约定端出来。
 *
 * 内容直接用 next_hook —— 它在收尾时就已经是一句具体的话了。
 * 在这里再让模型改写一遍只会稀释它，还多花一次钱。
 */
export async function makeWakeCard(sql: Sql, poolId: string): Promise<AgentCard | null> {
  const [row] = await sql<{ nextHook: string | null }[]>`
    select next_hook as "nextHook" from pool
    where id = ${poolId} and state = 'dormant'
      and next_hook is not null
      and next_hook_due_at <= now()
  `
  if (!row?.nextHook) return null
  return { kind: 'wake', hook: row.nextHook, suggestedWhen: null }
}

/** 到期待唤醒的池塘。定时任务用。 */
export async function poolsDueForWake(sql: Sql, limit = 100): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select id from pool
    where state = 'dormant' and next_hook is not null and next_hook_due_at <= now()
    order by next_hook_due_at asc limit ${limit}
  `
  return rows.map((r) => r.id)
}

export { RECAP_PROMPT_HOURS }
