import { toVector, type Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'
import { Domain, PoolRole } from '@pool/shared'
import { z } from 'zod'

/**
 * 蒸馏：画像与关系从事件里长出来。
 *
 * 用户从没填过资料，但三次活动之后系统比任何表单都更懂他 ——
 * 因为它知道他干过什么、在里面扮演什么角色。
 *
 * ## 只在收敛点触发
 *
 * 蒸馏在四个时机跑：池塘成行、事件回流、周期批量、关系温度重算。
 * 不在每条消息触发 —— 一个池塘全生命周期写进 L2 的次数是个位数，不是几百次。
 * 这是对「每条消息都做一次 LLM 抽取」那种设计的架构级规避。
 *
 * ## L2 必须可整体删除并从 L1 重建
 *
 * 这个文件里的一切都是 L1（person / pool / membership / episode / artifact）
 * 的下游派生物。删光 facet / relation / facet_evidence 后重跑本模块，
 * 结果必须等价 —— 这是「Postgres 是唯一真相源」这条架构承诺唯一能被证伪的地方。
 *
 * 「等价」指结构等价：同样的 (人, 领域) 组合、同样的证据池塘集合、同样的 n_pools、
 * 数值一致的关系温度。**不包括摘要文本逐字相同** —— 那是模型输出，
 * 断言它逐字可复现等于断言模型是确定性的，那样的测试就成了抽奖。
 */

const FACET_SYSTEM = `你从一个人参与过的活动里，总结他在某个生活领域的侧写。

summary：两三句话，写他实际做过什么、在里面通常扮演什么角色。
只用给到的活动记录，不要推断记录之外的性格或偏好。
不要写「他是一个热爱运动的人」这类对谁都成立的话 ——
这段话要能让一个陌生人看完知道该不该找他一起干这件事。

roles：从 initiator/guide/shooter/logistics/participant 里选，他实际承担过的。
preferences：他表现出的具体偏好，如「野线」「早出发」。没有就空数组。`

const FacetDraft = z.object({
  summary: z.string().min(1),
  roles: z.array(PoolRole),
  preferences: z.array(z.string()),
})

export interface DistillDeps {
  sql: Sql
  model: ModelGateway
}

interface PoolEvidence {
  poolId: string
  domain: string
  title: string | null
  role: string
  recap: string | null
  artifactCount: number
}

/**
 * 蒸馏一个人的全部切面。
 *
 * 按 domain 分片，数量有界 —— 检索时只取对应切面，不用把整个人塞进 prompt，
 * 且蒸馏成本随领域数而非池塘数增长。
 */
export async function distillPerson(deps: DistillDeps, personId: string): Promise<number> {
  const evidence = await deps.sql<PoolEvidence[]>`
    select p.id as "poolId", coalesce(p.domain, 'other') as domain, p.title, m.role,
           (select e.summary from episode e
             where e.pool_id = p.id and e.kind = 'recap'
             order by e.occurred_at desc limit 1) as recap,
           (select count(*)::int from artifact a where a.pool_id = p.id) as "artifactCount"
    from membership m join pool p on p.id = m.pool_id
    where m.person_id = ${personId}
      and m.state = 'joined'
      and p.state in ('active','done','dormant')
    order by p.id
  `
  if (evidence.length === 0) return 0

  const byDomain = new Map<string, PoolEvidence[]>()
  for (const e of evidence) {
    const key = Domain.safeParse(e.domain).success ? e.domain : 'other'
    ;(byDomain.get(key) ?? byDomain.set(key, []).get(key)!).push(e)
  }

  for (const [domain, pools] of byDomain) {
    const draft = await deps.model.generate({
      task: 'facet.distill',
      schema: FacetDraft,
      system: FACET_SYSTEM,
      user:
        `领域：${domain}\n他参与过的活动：\n` +
        pools
          .map(
            (p) =>
              `- ${p.title ?? '（无标题）'}｜他的角色：${p.role}｜` +
              `${p.recap ?? '（还没有回顾）'}｜返图 ${p.artifactCount} 张`,
          )
          .join('\n'),
    })

    const [embedding] = await deps.model.embed([draft.summary])

    await deps.sql.begin(async (tx) => {
      await tx`
        insert into facet (person_id, domain, summary, traits, embedding, n_pools, updated_at)
        values (${personId}, ${domain}, ${draft.summary},
                ${tx.json({ roles: draft.roles, preferences: draft.preferences } as never)},
                ${embedding ? toVector(embedding) : null}::vector,
                ${pools.length}, now())
        on conflict (person_id, domain) do update
          set summary = excluded.summary, traits = excluded.traits,
              embedding = excluded.embedding, n_pools = excluded.n_pools,
              updated_at = now()
      `
      // 证据先清后写：池塘可能已被删除或成员已退出，
      // 只增不删会让「凭什么这么说我」指向一个不存在的池塘。
      await tx`delete from facet_evidence where person_id = ${personId} and domain = ${domain}`
      await tx`
        insert into facet_evidence (person_id, domain, pool_id)
        select ${personId}, ${domain}, unnest(${pools.map((p) => p.poolId)}::uuid[])
      `
    })
  }

  return byDomain.size
}

/**
 * 重算一个人与所有共池者的关系温度。
 *
 * 熟不熟就是共同记忆的多少 —— 它是连续量，不是 is_friend 布尔值。
 * 这里刻意不打模型：温度是一个可解释的公式，交给模型只会让它不可复现、
 * 不可调参、也不可向用户解释。
 */
export async function recomputeRelations(sql: Sql, personId: string): Promise<number> {
  const rows = await sql<{ other: string; sharedPools: number; coArtifacts: number; lastCoAt: Date }[]>`
    select m2.person_id as "other",
           count(distinct p.id)::int as "sharedPools",
           coalesce(sum((select count(*) from artifact a where a.pool_id = p.id)), 0)::int as "coArtifacts",
           max(coalesce(p.occurred_at, p.created_at)) as "lastCoAt"
    from membership m1
    join pool p on p.id = m1.pool_id
    join membership m2 on m2.pool_id = p.id and m2.person_id <> m1.person_id
    where m1.person_id = ${personId}
      and m1.state = 'joined' and m2.state = 'joined'
      and p.state in ('active','done','dormant')
    group by m2.person_id
  `

  for (const r of rows) {
    const [a, b] = personId < r.other ? [personId, r.other] : [r.other, personId]
    const days = (Date.now() - r.lastCoAt.getTime()) / 86_400_000
    // 时间衰减用半衰期 90 天：一个学期没一起干过事，热度掉一半，符合直觉
    const recency = Math.pow(0.5, days / 90)
    const temperature =
      1.0 * Math.log1p(r.sharedPools) + 0.6 * Math.log1p(r.coArtifacts) + 0.4 * recency

    await sql`
      insert into relation (a_id, b_id, temperature, shared_pools, co_artifacts, last_co_at, updated_at)
      values (${a}, ${b}, ${temperature}, ${r.sharedPools}, ${r.coArtifacts}, ${r.lastCoAt}, now())
      on conflict (a_id, b_id) do update
        set temperature = excluded.temperature,
            shared_pools = excluded.shared_pools,
            co_artifacts = excluded.co_artifacts,
            last_co_at = excluded.last_co_at,
            updated_at = now()
    `
  }
  return rows.length
}

/** 一个池塘涉及的全部在册成员。收敛点触发蒸馏时用。 */
export async function membersOf(sql: Sql, poolId: string): Promise<string[]> {
  const rows = await sql<{ personId: string }[]>`
    select person_id as "personId" from membership
    where pool_id = ${poolId} and state = 'joined'
  `
  return rows.map((r) => r.personId)
}

/**
 * 清空 L2。只用于等价性回归与运维重建 —— 它不该出现在任何业务路径上。
 *
 * 可限定校区：一个多校区产品里，「重建全部画像」几乎总是运维事故的前奏，
 * 而「重建某个校区的画像」才是真实需求。范围是必选项而不是可选项，
 * 只是默认值恰好是全部。
 */
export async function wipeL2(sql: Sql, campusId?: string): Promise<void> {
  if (campusId) {
    const scope = sql`(select id from person where campus_id = ${campusId})`
    await sql`delete from facet_evidence where person_id in ${scope}`
    await sql`delete from facet where person_id in ${scope}`
    await sql`delete from relation where a_id in ${scope} or b_id in ${scope}`
    return
  }
  await sql`delete from facet_evidence`
  await sql`delete from facet`
  await sql`delete from relation`
}
