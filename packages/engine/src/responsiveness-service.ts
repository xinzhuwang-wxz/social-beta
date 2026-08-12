import type { Sql } from '@pool/db'

/**
 * 回应先验：他会不会理你。
 *
 * 直接回应赛题的第二个痛点 —— 不知道对方是否有可能回应。
 * 产品的立场是：**不推「最合适」的人，推「最合适且会回应」的人**。
 * 一个从不回消息的完美匹配，价值是负的：它消耗的是用户仅有的几次尝试勇气。
 *
 * ## 为什么是重算而不是增量维护
 *
 * 这四个指标全都是对历史的聚合，没有一个需要「事件发生的那一刻」才能算准。
 * 增量维护会引入一堆「漏更新一次就永久偏了」的路径，而重算的成本是一次
 * 索引扫描 —— 在收敛点跑，和蒸馏一起，成本可以忽略。
 *
 * ## 三个指标各自量什么
 *
 * reply_rate  收到邀请后**有没有表态**（任何一种表态都算）。
 *             它量的是「这个人会不会理人」，与他答应还是拒绝无关 ——
 *             一个每次都明确拒绝的人，比一个从不出声的人有价值得多。
 * accept_rate 表态之后**真的加入**的比例。它量的是匹配对他而言准不准。
 * median_ttr  从被邀请到表态的中位时长。用中位数而非均值 ——
 *             一次出门旅游两周没看手机，会把均值彻底带偏。
 */

export interface ResponsivenessSnapshot {
  personId: string
  replyRate: number
  acceptRate: number
  medianTtrHours: number | null
  activeHours: number[]
  /** 样本量。太小的样本不该被当成事实 */
  invitations: number
}

/**
 * 重算一个人的回应先验。
 *
 * 没有任何邀请历史时**不写行** —— 让 recall 那边的 left join 返回 NULL，
 * 由打分侧统一落到中性先验。在这里写一个 0 或 0.5 进去，
 * 会让「没数据」和「实测就是 0.5」在下游不可区分。
 */
export async function recomputeResponsiveness(
  sql: Sql,
  personId: string,
): Promise<ResponsivenessSnapshot | null> {
  const [agg] = await sql<
    {
      invitations: number
      replied: number
      joined: number
      medianTtrHours: number | null
    }[]
  >`
    with invites as (
      select m.pool_id, m.person_id, m.invited_at, m.joined_at,
             exists (
               select 1 from invite_reply r
               where r.pool_id = m.pool_id and r.person_id = m.person_id
             ) as replied,
             -- 「加入了」不看 invite_reply，看 membership 的实际状态：
             -- 早期通过 confirmJoin 加入的人没有 invite_reply 行，
             -- 只认 reply 会把他们全算成没回应
             (m.state = 'joined') as joined
      from membership m
      where m.person_id = ${personId} and m.invited_at is not null
    )
    select count(*)::int                                            as invitations,
           count(*) filter (where replied or joined)::int           as replied,
           count(*) filter (where joined)::int                      as joined,
           (
             select percentile_cont(0.5) within group (
               order by extract(epoch from (joined_at - invited_at)) / 3600.0
             )
             from invites where joined_at is not null
           )::float8                                                as "medianTtrHours"
    from invites
  `

  if (!agg || agg.invitations === 0) return null

  // 活跃时段：他实际发过言的小时。不做定位、不做在线状态 ——
  // 这一条只用来避免在别人睡觉时推送。
  const hours = await sql<{ hour: number }[]>`
    select distinct extract(hour from occurred_at)::int as hour
    from episode
    where actor_id = ${personId} and occurred_at > now() - interval '60 days'
    order by hour
  `

  const snapshot: ResponsivenessSnapshot = {
    personId,
    replyRate: agg.replied / agg.invitations,
    acceptRate: agg.joined / agg.invitations,
    medianTtrHours: agg.medianTtrHours,
    activeHours: hours.map((h) => h.hour),
    invitations: agg.invitations,
  }

  // 用 make_interval 传秒数，不用 '${n} hours'::interval 拼字符串：
  // 极小的数值（测试里确认几乎是瞬间完成的）会被 JS 输出成科学计数法
  // 「9.4e-7 hours」，而 Postgres 的 interval 解析器认不了这种写法。
  await sql`
    insert into responsiveness (person_id, reply_rate, accept_rate, median_ttr, active_hours, updated_at)
    values (${personId}, ${snapshot.replyRate}, ${snapshot.acceptRate},
            ${snapshot.medianTtrHours === null
              ? null
              : sql`make_interval(secs => ${snapshot.medianTtrHours * 3600})`},
            ${snapshot.activeHours}, now())
    on conflict (person_id) do update
      set reply_rate = excluded.reply_rate, accept_rate = excluded.accept_rate,
          median_ttr = excluded.median_ttr, active_hours = excluded.active_hours,
          updated_at = now()
  `
  return snapshot
}

/**
 * 现在是不是他的活跃时段。
 *
 * 用于避免在别人睡觉时推送。没有数据时返回 true —— 不知道就别拦，
 * 拦住的代价（一条永远发不出去的邀请）比打扰一次大得多。
 */
export function isActiveNow(activeHours: readonly number[], now = new Date()): boolean {
  if (activeHours.length === 0) return true
  const h = now.getHours()
  // 前后一小时都算 —— 活跃时段是个模糊的东西，卡到整点没有意义
  return activeHours.some((a) => Math.abs(a - h) <= 1 || Math.abs(a - h) >= 23)
}
