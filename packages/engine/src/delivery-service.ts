import type { Sql } from '@pool/db'
import type { Candidate } from './matcher-service'

/**
 * 投递制：种子发给多人，候选先表态，发起人在愿意的人里选。
 *
 * ## 为什么把顺序倒过来
 *
 * 原设计是挑选制 —— 发起人拿到候选卡、挑一个、然后等对方理不理他。
 * 那让他**把仅有的几次尝试勇气花在一次抛硬币上**，而「不知道对方会不会回应」
 * 恰恰是本产品要解决的第二个痛点。
 *
 * 投递制让发起人只在已经说了「愿意」的人里选，从结构上消灭了石沉大海。
 * 代价是异步等待 —— 值得付。
 *
 * ## 三条不对称的可见性规则
 *
 * 这三条看起来是客套，其实各自防一种具体的崩坏：
 *
 * 1. **候选人看不到排名与竞争人数**。能看到自己排第几的人，下次就不会再表达
 *    愿意了 —— 而愿意表达是这整套机制的燃料。
 * 2. **候选人看不到最终被选中的是谁**。否则「我输给了谁」会变成校园里的
 *    真实社交伤害，而这个产品本该降低社交压力。
 * 3. **落选文案只说「已找到同行者」，不说「你不合适」**。前者是事实，
 *    后者是评价 —— 而系统没有资格评价一个人合不合适。
 */

/** 一次投递发给多少人。窄了等太久，宽了打扰太多。 */
const DELIVERY_FANOUT = 6

export interface InboxItem {
  intentId: string
  state: 'delivered' | 'willing' | 'declined' | 'chosen' | 'closed'
  rawText: string
  domain: string
  slots: Record<string, unknown>
  needed: number
  seekerId: string
  seekerName: string
  deliveredAt: Date
  note: string | null
}

export interface WillingCandidate {
  personId: string
  displayName: string
  note: string | null
  reason: string | null
  score: Candidate['score'] | null
  repliedAt: Date | null
}

/**
 * 把一颗种子投递出去。
 *
 * 候选来自匹配漏斗，但**投递不等于推荐**：候选人在信箱里看到的是这颗种子本身，
 * 不是「系统觉得你合适」。reason 与 score 只给发起人看。
 */
export async function deliverSeed(
  sql: Sql,
  intentId: string,
  candidates: readonly Candidate[],
): Promise<number> {
  const picked = candidates.slice(0, DELIVERY_FANOUT)
  if (picked.length === 0) return 0

  for (const c of picked) {
    await sql`
      insert into seed_delivery (intent_id, person_id, reason, score)
      values (${intentId}, ${c.personId}, ${c.reason}, ${sql.json(c.score as never)})
      on conflict (intent_id, person_id) do nothing
    `
  }
  return picked.length
}

/** 我的种子信箱。走视图 —— 它在 SQL 层就不含 reason 与 score。 */
export async function seedInbox(sql: Sql): Promise<InboxItem[]> {
  return sql<InboxItem[]>`
    select intent_id as "intentId", state, raw_text as "rawText", domain, slots,
           needed, seeker_id as "seekerId", seeker_name as "seekerName",
           delivered_at as "deliveredAt", note
    from my_seed_inbox
    where state in ('delivered','willing')
    order by delivered_at desc
  `
}

/** 表态。愿意参与可附一句留言 —— 那句话是给发起人做选择用的，不是给系统排序用的。 */
export async function replyToSeed(
  sql: Sql,
  intentId: string,
  personId: string,
  willing: boolean,
  note?: string,
): Promise<void> {
  const rows = await sql`
    update seed_delivery
    set state = ${willing ? 'willing' : 'declined'},
        note = ${note ?? null},
        replied_at = now()
    where intent_id = ${intentId} and person_id = ${personId}
      and state = 'delivered'
    returning intent_id
  `
  if (rows.length === 0) throw new Error('没有待回应的种子，或已经回应过了')
}

/** 已表达愿意的人。只有发起人调得到。 */
export async function willingFor(sql: Sql, intentId: string): Promise<WillingCandidate[]> {
  return sql<WillingCandidate[]>`
    select d.person_id as "personId", p.display_name as "displayName",
           d.note, d.reason, d.score, d.replied_at as "repliedAt"
    from seed_delivery d join person p on p.id = d.person_id
    where d.intent_id = ${intentId} and d.state = 'willing'
    order by (d.score->>'total')::float8 desc nulls last, d.replied_at asc
  `
}

/**
 * 选中一个人。
 *
 * 收满种子声明的人数后停止匹配，其余投递转 closed。
 * 返回是否已收满 —— 调用方据此决定要不要建池塘。
 */
export async function chooseCompanion(
  sql: Sql,
  intentId: string,
  personId: string,
): Promise<{ chosen: number; needed: number; filled: boolean }> {
  return sql.begin(async (tx) => {
    const [intent] = await tx<{ needed: number; chosenCount: number }[]>`
      select needed, chosen_count as "chosenCount" from intent where id = ${intentId} for update
    `
    if (!intent) throw new Error('意图不存在')
    if (intent.chosenCount >= intent.needed) throw new Error('已经收满了')

    const updated = await tx`
      update seed_delivery set state = 'chosen'
      where intent_id = ${intentId} and person_id = ${personId} and state = 'willing'
      returning person_id
    `
    if (updated.length === 0) throw new Error('这个人没有表达过愿意参与')

    const chosen = intent.chosenCount + 1
    await tx`update intent set chosen_count = ${chosen} where id = ${intentId}`

    const filled = chosen >= intent.needed
    if (filled) {
      // 收满即停止匹配。未被选中的转 closed —— 他们会收到「已找到同行者」，
      // 而不是「你不合适」。前者是事实，后者是评价，而系统没有资格评价人。
      await tx`
        update seed_delivery set state = 'closed'
        where intent_id = ${intentId} and state in ('delivered','willing')
      `
    }
    return { chosen, needed: intent.needed, filled }
  }) as Promise<{ chosen: number; needed: number; filled: boolean }>
}

export { DELIVERY_FANOUT }
