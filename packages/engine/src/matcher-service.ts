import { toVector, type Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'
import { MAX_CANDIDATES, MIN_CANDIDATES } from '@pool/shared'
import { z } from 'zod'

/**
 * 匹配漏斗。
 *
 * ```
 * 硬过滤(SQL) → 向量召回(HNSW) → 精排(加权) → LLM 终排 + 生成理由
 * ```
 *
 * 硬过滤只保留物理约束：同校区、未拉黑、未过期、非本人（ADR-0002）。
 * 不筛时间、不筛人数、不筛强度 —— 确认加入本身就是过滤器，
 * 而误判的代价是不对称的：筛掉一个合适的人，用户永远看不到也无从申诉。
 */

/** 召回宽度。窄了漏人，宽了让精排变贵；先取 200，等有线上数据再调。 */
const RECALL_LIMIT = 200
/** 进入 LLM 终排的候选数 */
const RERANK_LIMIT = 20
/** 每人每天最多被推荐几次。防止热门用户被榨干到卸载。 */
const DAILY_EXPOSURE_CAP = 12

/**
 * 打分权重的三段调度。
 *
 * T0 的 w_social=0 不是欠账，是真实的产品行为：一个零池塘的新用户
 * 确实没有社交数据，凭空给他算社交邻近度就是编造。
 */
export type WeightStage = 'T0' | 'T1' | 'T2'

interface Weights {
  intent: number
  facet: number
  complementarity: number
  social: number
  responsiveness: number
}

const WEIGHTS: Record<WeightStage, Weights> = {
  T0: { intent: 0.7, facet: 0, complementarity: 0, social: 0, responsiveness: 0.3 },
  T1: { intent: 0.5, facet: 0.25, complementarity: 0, social: 0.1, responsiveness: 0.15 },
  T2: { intent: 0.35, facet: 0.25, complementarity: 0.15, social: 0.1, responsiveness: 0.15 },
}

export function stageFor(poolCount: number): WeightStage {
  if (poolCount === 0) return 'T0'
  return poolCount <= 3 ? 'T1' : 'T2'
}

export interface MatchDeps {
  sql: Sql
  model: ModelGateway
}

interface RecalledIntent {
  intentId: string
  personId: string
  displayName: string
  rawText: string
  domain: string
  similarity: number
  replyRate: number | null
  exposureToday: number
}

export interface Candidate {
  personId: string
  displayName: string
  intentId: string
  rawText: string
  reason: string
  score: {
    total: number
    intent: number
    facet: number
    complementarity: number
    social: number
    responsiveness: number
    penalty: number
  }
}

/**
 * 第一、二段：硬过滤 + 向量召回。
 *
 * 两段合成一条 SQL —— pgvector 的 HNSW 在带谓词时仍走索引，
 * 分两步反而要把候选集拉回应用层再过滤，那才是真的慢。
 */
async function recall(
  sql: Sql,
  seekerId: string,
  campusId: string,
  embedding: readonly number[],
): Promise<RecalledIntent[]> {
  return sql<RecalledIntent[]>`
    select i.id  as "intentId",
           i.person_id as "personId",
           p.display_name as "displayName",
           i.raw_text as "rawText",
           i.domain,
           1 - (i.embedding <=> ${toVector(embedding)}::vector) as similarity,
           r.reply_rate as "replyRate",
           coalesce(e.n, 0)::int as "exposureToday"
    from intent i
    join person p on p.id = i.person_id
    left join responsiveness r on r.person_id = i.person_id
    left join lateral (
      select count(*) as n from exposure x
      where x.shown_person = i.person_id and x.created_at > now() - interval '1 day'
    ) e on true
    where i.campus_id = ${campusId}
      and i.person_id <> ${seekerId}
      and i.pool_id is null
      and i.expires_at > now()
      and i.embedding is not null
      and not exists (
        select 1 from block b
        where (b.blocker_id = ${seekerId} and b.blocked_id = i.person_id)
           or (b.blocker_id = i.person_id and b.blocked_id = ${seekerId})
      )
    order by i.embedding <=> ${toVector(embedding)}::vector
    limit ${RECALL_LIMIT}
  `
}

/**
 * 第三段：精排。
 *
 * responsiveness 直接回应赛题痛点「不知道对方是否有可能回应」。
 * 没有历史数据的人给 0.5 的中性先验 —— 给 0 会让新用户永远排不上，
 * 而新用户恰恰是最需要被看见的那批。
 */
function score(row: RecalledIntent, w: Weights): Candidate['score'] {
  const intent = row.similarity * w.intent
  const responsiveness = (row.replyRate ?? 0.5) * w.responsiveness
  // 曝光饱和惩罚：接近上限时快速衰减，超过上限直接出局（在调用方过滤）
  const penalty = Math.min(row.exposureToday / DAILY_EXPOSURE_CAP, 1) * 0.3

  return {
    total: intent + responsiveness - penalty,
    intent,
    facet: 0,
    complementarity: 0,
    social: 0,
    responsiveness,
    penalty,
  }
}

/**
 * 终排结果用序号引用候选，不用 UUID。
 *
 * 三个理由：UUID 占大量 token 却不携带任何语义；模型会编造看起来合法的 UUID，
 * 而序号越界一眼可查；以及 UUID 每次运行都不同，会让 cassette 键失效，
 * 测试在回放模式下必然全挂。
 */
const FinalRanking = z.object({
  picks: z.array(
    z.object({
      index: z.number().int().min(1),
      reason: z.string().min(1),
    }),
  ),
})

const RANK_SYSTEM = `你在帮一个大学生挑选可能合得来的同学。

给你他的意图，以及若干候选同学的意图。挑出 3 到 5 个最值得他主动打招呼的人，
并为每个人写一句「为什么是他」。

「为什么是他」必须引用双方意图里真实出现的内容，让人一眼看出你不是在套模板。
不要写「你们都喜欢运动」这种任何人都成立的话。
不要编造候选人没说过的信息。

时间对不上不是排除理由 —— 具体几点由他们自己聊定。`

/**
 * 第四段：LLM 终排并生成理由。
 *
 * 理由必须可核验地引用双方意图里的内容。模板句（「你们都喜欢运动」）
 * 对任何人都成立，等于没有信息，而用户一眼就能看出是敷衍。
 */
async function finalRank(
  model: ModelGateway,
  seekerIntent: string,
  shortlist: readonly (RecalledIntent & { score: Candidate['score'] })[],
): Promise<Candidate[]> {
  if (shortlist.length === 0) return []

  const listing = shortlist.map((c, i) => `${i + 1}. ${c.displayName}：${c.rawText}`).join('\n')

  const ranked = await model.generate({
    task: 'match.final-rank',
    schema: FinalRanking,
    system: RANK_SYSTEM,
    user: `他的意图：${seekerIntent}\n\n候选：\n${listing}\n\n用上面的序号引用候选。`,
  })

  const picked: Candidate[] = []
  for (const pick of ranked.picks) {
    const row = shortlist[pick.index - 1]
    // 序号越界或重复选同一个人，静默丢弃 —— 少一个候选好过展示一个不存在的人
    if (!row || picked.some((p) => p.personId === row.personId)) continue
    picked.push({
      personId: row.personId,
      displayName: row.displayName,
      intentId: row.intentId,
      rawText: row.rawText,
      reason: pick.reason,
      score: row.score,
    })
    if (picked.length >= MAX_CANDIDATES) break
  }
  return picked
}

/**
 * 完整漏斗。返回 3–5 张候选卡；候选不足时返回实际数量，不补齐 ——
 * 凑数会让用户看到明显不合适的人，从而不再相信这份推荐。
 */
export async function findCandidates(
  deps: MatchDeps,
  seeker: { personId: string; campusId: string; poolCount: number },
  intent: { id: string; rawText: string },
): Promise<Candidate[]> {
  const [embedding] = await deps.model.embed([intent.rawText])
  if (!embedding) throw new Error('embedding 生成失败')

  const recalled = await recall(deps.sql, seeker.personId, seeker.campusId, embedding)
  const weights = WEIGHTS[stageFor(seeker.poolCount)]

  const shortlist = recalled
    .filter((r) => r.exposureToday < DAILY_EXPOSURE_CAP)
    .map((r) => ({ ...r, score: score(r, weights) }))
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, RERANK_LIMIT)

  const candidates = await finalRank(deps.model, intent.rawText, shortlist)

  if (candidates.length > 0) {
    await deps.sql`
      insert into exposure (seeker_id, shown_person, intent_id)
      select ${seeker.personId}, x.person, ${intent.id}
      from unnest(${candidates.map((c) => c.personId)}::uuid[]) as x(person)
    `
  }
  return candidates
}

export { MIN_CANDIDATES, MAX_CANDIDATES, DAILY_EXPOSURE_CAP }
