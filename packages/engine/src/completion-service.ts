import type { Sql } from '@pool/db'

/**
 * 双方完成确认 + 共同回忆的双向门控（PRD v2 阶段七、八）。
 *
 * ## 为什么完成也要「全员确认」而不是一个人点了就算
 *
 * 此前 `finishEvent` 是一个成员点了就转 `done`——但事情到底有没有办完，
 * 不该由单方面决定：一个人先走了、觉得「差不多了」，另一个人可能还在等,
 * 或者压根这次没成行。这与 0011/0012 里 `action_plan` 的「全员确认才进花苞」
 * 是同一个理由，手法也照搬：一张「谁确认了」的表，全员确认才推进状态机。
 *
 * ## 为什么不新开一个 pool_state
 *
 * 「等待对方确认」不需要单独的状态——池塘就停在原来的状态（forming/active/planned）,
 * 讨论、改计划本来就不检查 pool.state，天然可以继续。真正需要状态机保证的只有
 * 一件事：sealPool（收尾进回忆）与 giveFeedback（评价）不能在全员确认之前发生。
 * 这两者都直接借用「pool.state 是否已经是 done」这个既有约束当门槛——
 * sealPool 把状态转到 dormant 要求 old.state='done'（数据库触发器保证），
 * PoolEngine.giveFeedback 同样要求 done/dormant。不用另开一张「能不能评价」的判断表。
 */

export interface CompletionStatus {
  poolId: string
  allConfirmed: boolean
  confirmedBy: { personId: string; displayName: string }[]
  /** 还没点「已完成」的在册成员 —— 池塘停在「等待对方确认」的直接体现 */
  pendingBy: { personId: string; displayName: string }[]
}

/**
 * 记录一次完成确认。全员（在册成员）都确认过，池塘才转 done。
 *
 * 幂等：同一个人确认两次不报错也不重复计数（`on conflict do nothing`）——
 * 手滑多点一次不该是一个需要处理的错误。
 */
export async function confirmCompletion(
  sql: Sql,
  poolId: string,
  personId: string,
): Promise<{ allConfirmed: boolean }> {
  return sql.begin(async (tx) => {
    const inserted = await tx`
      insert into completion_confirmation (pool_id, person_id) values (${poolId}, ${personId})
      on conflict do nothing
      returning person_id
    `

    const pendingRows = await tx<{ pending: number }[]>`
      select count(*)::int as pending
      from membership m
      where m.pool_id = ${poolId} and m.state = 'joined'
        and not exists (
          select 1 from completion_confirmation c
          where c.pool_id = ${poolId} and c.person_id = m.person_id
        )
    `
    const allConfirmed = (pendingRows[0]?.pending ?? 1) === 0

    if (allConfirmed) {
      // 全员确认才推进——一个人的判断不构成「这件事办完了」这一共同事实
      await tx`
        update pool set state = 'done', occurred_at = coalesce(occurred_at, now())
        where id = ${poolId} and state in ('forming', 'active', 'planned')
      `
      await tx`
        insert into episode (pool_id, kind, summary, actor_id)
        values (${poolId}, 'happened', '大家都确认这件事办完了', null)
      `
    } else if (inserted.length > 0) {
      // 只有真的新记了一条确认才写事件流，重复点击不重复刷屏
      await tx`
        insert into episode (pool_id, kind, summary, actor_id)
        values (${poolId}, 'completion_confirm', '确认这件事办完了，等对方确认', ${personId})
      `
    }
    return { allConfirmed }
  }) as Promise<{ allConfirmed: boolean }>
}

/**
 * 撤回完成确认。
 *
 * 只在事情还没被全员确认完成时有意义：点完才发现对方其实还没到、
 * 或者活动被取消了，这时撤回能让池塘继续留在讨论/改计划的状态，
 * 而不是被自己一次误点推着往回忆与评价走。
 *
 * 一旦全员确认、池塘已经转 done，那是「大家」共同确认过的事实，
 * 不再是任何单方能单独推翻的东西——真要反悔，去池塘里继续讨论怎么处理，
 * 而不是让状态在 done 和「没办完」之间静默地来回跳。
 */
export async function withdrawCompletion(sql: Sql, poolId: string, personId: string): Promise<void> {
  const [pool] = await sql<{ state: string }[]>`select state from pool where id = ${poolId}`
  if (!pool) throw new Error('池塘不存在')
  if (pool.state === 'done' || pool.state === 'dormant') {
    throw new Error('事情已经被双方确认完成，无法撤回——如果实际没办成，去池塘里继续讨论')
  }

  await sql`delete from completion_confirmation where pool_id = ${poolId} and person_id = ${personId}`
  await sql`
    insert into episode (pool_id, kind, summary, actor_id)
    values (${poolId}, 'completion_confirm', '撤回了「已完成」的确认', ${personId})
  `
}

/** 读一份完成确认状态，含谁确认了、谁还没——「等待对方确认」的数据来源。 */
export async function readCompletionStatus(sql: Sql, poolId: string): Promise<CompletionStatus> {
  const confirmedBy = await sql<CompletionStatus['confirmedBy']>`
    select c.person_id as "personId", p.display_name as "displayName"
    from completion_confirmation c join person p on p.id = c.person_id
    where c.pool_id = ${poolId}
  `
  const pendingBy = await sql<CompletionStatus['pendingBy']>`
    select m.person_id as "personId", p.display_name as "displayName"
    from membership m join person p on p.id = m.person_id
    where m.pool_id = ${poolId} and m.state = 'joined'
      and not exists (
        select 1 from completion_confirmation c
        where c.pool_id = ${poolId} and c.person_id = m.person_id
      )
  `
  return { poolId, allConfirmed: pendingBy.length === 0, confirmedBy, pendingBy }
}

/** 森林里对外可见的一条共同回忆。 */
export interface ForestRecapEntry {
  poolId: string
  title: string | null
  domain: string | null
  summary: string
  activityAt: Date | null
  createdAt: Date
}

/**
 * 我的森林里，对外可见的共同回忆。走 `forest_recap` 视图——
 * 双向门控（任一方选了不愿意再次组队就不出现）在视图的 where 子句里兑现，
 * 这里不重复判断一遍，两套规则迟早不一致。
 */
export async function myForestRecaps(sql: Sql): Promise<ForestRecapEntry[]> {
  return sql<ForestRecapEntry[]>`
    select pool_id as "poolId", title, domain, summary,
           "activityAt", "createdAt"
    from forest_recap
    order by "createdAt" desc
  `
}
