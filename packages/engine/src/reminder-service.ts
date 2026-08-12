import type { Sql } from '@pool/db'

/**
 * 线下转化：把「计划确定了」推到「事情真的发生了」。
 *
 * PRD 的判断是：已经形成计划却因为缺少提醒和承诺而临时取消，
 * 是行动失败的一大来源。这一层存在的意义就是补上那段。
 *
 * ## 三个刻意的克制
 *
 * 一、**首版不做持续定位**。只提供轻量状态（已准备/已出发/已到达/临时有变），
 *     因为定位的隐私代价远高于它带来的协调收益。
 *
 * 二、**每种提醒只发一次**。`reminder_sent` 记录已发过什么 ——
 *     重复提醒比不提醒更让人想直接关掉通知。
 *
 * 三、**提醒只在 planned（花苞）之后有意义**。计划都没确认就提醒集合，
 *     是在替一群人假设一件他们还没同意的事。
 */

export type ReminderKind = 'day_before' | 'morning_of' | 'gather_soon'

export interface DueReminder {
  poolId: string
  kind: ReminderKind
  title: string
  startsAt: Date
  meetAt: string
  /** 还没表态的成员。提醒里要点名，泛泛地说「大家确认一下」没人会动 */
  silentMembers: { personId: string; displayName: string }[]
}

/**
 * 到期该发的提醒。
 *
 * 三个时间点：行动前一天、当天早上、集合前两小时。
 * 用 SQL 一次算完，不在应用层遍历所有池塘 ——
 * 定时任务扫全表的成本会随池塘数线性增长。
 */
export async function dueReminders(sql: Sql, limit = 200): Promise<DueReminder[]> {
  const rows = await sql<{ poolId: string; kind: ReminderKind; title: string; startsAt: Date; meetAt: string }[]>`
    with candidates as (
      select p.id as pool_id, ap.title, ap.starts_at, ap.meet_at,
             k.kind, k.window_start, k.window_end
      from pool p
      join action_plan ap on ap.pool_id = p.id
      cross join lateral (values
        ('day_before'::reminder_kind,  ap.starts_at - interval '30 hours', ap.starts_at - interval '18 hours'),
        ('morning_of'::reminder_kind,  date_trunc('day', ap.starts_at) + interval '7 hours', ap.starts_at - interval '2 hours'),
        ('gather_soon'::reminder_kind, ap.starts_at - interval '2 hours',  ap.starts_at)
      ) as k(kind, window_start, window_end)
      where p.state = 'planned'
        and now() between k.window_start and k.window_end
    )
    select c.pool_id as "poolId", c.kind, c.title, c.starts_at as "startsAt", c.meet_at as "meetAt"
    from candidates c
    where not exists (
      select 1 from reminder_sent r where r.pool_id = c.pool_id and r.kind = c.kind
    )
    order by c.starts_at asc
    limit ${limit}
  `

  const out: DueReminder[] = []
  for (const r of rows) {
    const silent = await sql<{ personId: string; displayName: string }[]>`
      select m.person_id as "personId", p.display_name as "displayName"
      from membership m join person p on p.id = m.person_id
      where m.pool_id = ${r.poolId} and m.state = 'joined'
        and not exists (
          select 1 from participant_status s
          where s.pool_id = ${r.poolId} and s.person_id = m.person_id
        )
    `
    out.push({ ...r, silentMembers: silent })
  }
  return out
}

/** 记录已发，避免重复打扰。 */
export async function markReminderSent(sql: Sql, poolId: string, kind: ReminderKind): Promise<void> {
  await sql`
    insert into reminder_sent (pool_id, kind) values (${poolId}, ${kind})
    on conflict do nothing
  `
}

/** 提醒的文案。不打模型 —— 这几句话的结构是固定的，交给模型只会让它每次不一样。 */
export function reminderText(r: DueReminder): string {
  const when = r.startsAt.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const names = r.silentMembers.map((m) => m.displayName).join('、')
  switch (r.kind) {
    case 'day_before':
      return `明天就是「${r.title}」了，${when} 在${r.meetAt}。` +
        (names ? `${names} 还没说自己的状态，方便的话点一下。` : '有变化的话现在说还来得及。')
    case 'morning_of':
      return `今天 ${when} 在${r.meetAt}。` + (names ? `${names} 还没确认。` : '')
    case 'gather_soon':
      return `还有两小时就集合了 —— ${r.meetAt}。` + (names ? `${names} 还没出发？` : '')
  }
}
