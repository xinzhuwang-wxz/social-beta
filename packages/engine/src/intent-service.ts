import { toVector, type Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'
import { DEFAULT_INTENT_TTL_HOURS, Domain, IntentExtraction } from '@pool/shared'

/**
 * 意图的发布与广场。
 *
 * 这是产品的入口动作：用户说一句人话，系统抽出结构，落库，进入同校区广场。
 * 广场本身就是 T0 冷启动期的产品形态 —— 没有匹配数据时主打人肉浏览，
 * 而不是给一个空推荐位假装智能。
 */

const EXTRACT_SYSTEM = `你从一句中文里抽取校园社交意图的结构化信息。

domain 只能取以下之一：
sport(运动) study(学术) contest(竞赛) craft(手艺) show(演出) food(吃喝)
travel(出行) game(游戏) volunteer(公益) career(求职) life(生活杂务) other(其他)

slots 各字段：
- when: 时间的原文表述，如「周六」「这周末」「考完试之后」。原样保留，不要换算成日期。
- where: 地点的原文表述。没提就是 null。
- size: 期望人数的原文表述，如「三四个」「越多越好」。没提就是 null。
- level: 强度或门槛，如「中等」「新手友好」。没提就是 null。
- vibe: 风格偏好数组，如 ["野线","摄影"]。没有就是空数组。

只抽原文里真实存在的信息。用户没说的一律 null 或空数组 ——
补全会让匹配基于并不存在的条件，而用户看不到也无从纠正。`

export interface IntentDeps {
  sql: Sql
  model: ModelGateway
}

export interface IntentRecord {
  id: string
  rawText: string
  domain: Domain
  slots: Record<string, unknown>
  expiresAt: Date
}

export interface BoardItem {
  id: string
  personId: string
  displayName: string
  rawText: string
  domain: Domain
  slots: Record<string, unknown>
  createdAt: Date
}

/**
 * 发布一条意图。
 *
 * 抽取与向量化都在写入之前完成 —— 若模型不可用就整体失败，
 * 而不是先落一条没有 embedding 的记录。半成品记录会悄悄从广场和召回里消失，
 * 用户以为发出去了，实际没人看得见。
 */
export async function publishIntent(
  deps: IntentDeps,
  personId: string,
  campusId: string,
  rawText: string,
): Promise<IntentRecord> {
  const trimmed = rawText.trim()
  if (trimmed.length === 0) throw new Error('意图不能为空')

  const extraction = await deps.model.generate({
    task: 'intent.extract',
    schema: IntentExtraction,
    system: EXTRACT_SYSTEM,
    user: trimmed,
  })

  // 向量化的是原文而非抽取结果：原文承载了抽取会丢掉的语气与细节，
  // 而召回靠的正是这些细节（「野线」「能拍照的加分」）。
  const [embedding] = await deps.model.embed([trimmed])
  if (!embedding) throw new Error('embedding 生成失败')

  const ttlHours = DEFAULT_INTENT_TTL_HOURS[extraction.domain]
  const rows = await deps.sql<IntentRecord[]>`
    insert into intent (person_id, raw_text, domain, slots, embedding, campus_id, expires_at)
    values (
      ${personId}, ${trimmed}, ${extraction.domain},
      ${deps.sql.json(extraction.slots as never)},
      ${toVector(embedding)}::vector,
      ${campusId},
      now() + ${`${ttlHours} hours`}::interval
    )
    returning id, raw_text as "rawText", domain, slots, expires_at as "expiresAt"
  `
  const record = rows[0]
  if (!record) throw new Error('意图写入失败')
  return record
}

/**
 * 意图广场。
 *
 * 可见性完全交给 RLS 的 intent_read_board 策略 —— 这里不写任何过滤条件。
 * 若在应用层再补一遍过滤，就会出现两套规则，而它们迟早不一致；
 * 到那时以哪套为准会变成一个没人答得上来的问题。
 */
export async function listBoard(
  sql: Sql,
  opts: { domain?: Domain; limit?: number } = {},
): Promise<BoardItem[]> {
  const limit = Math.min(opts.limit ?? 50, 200)
  return sql<BoardItem[]>`
    select i.id, i.person_id as "personId", p.display_name as "displayName",
           i.raw_text as "rawText", i.domain, i.slots, i.created_at as "createdAt"
    from intent i
    join person p on p.id = i.person_id
    where i.pool_id is null
      and i.expires_at > now()
      ${opts.domain ? sql`and i.domain = ${opts.domain}` : sql``}
    order by i.created_at desc
    limit ${limit}
  `
}

/** 我发过的意图，含已过期的 —— 用户要能看到自己发过什么，即便已经不在广场上。 */
export async function listMyIntents(sql: Sql, personId: string): Promise<BoardItem[]> {
  return sql<BoardItem[]>`
    select i.id, i.person_id as "personId", p.display_name as "displayName",
           i.raw_text as "rawText", i.domain, i.slots, i.created_at as "createdAt"
    from intent i
    join person p on p.id = i.person_id
    where i.person_id = ${personId}
    order by i.created_at desc
    limit 100
  `
}
