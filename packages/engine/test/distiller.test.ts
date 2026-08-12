import { DOMAINS } from '@pool/shared'
import { describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './harness'

/**
 * S8 · 蒸馏：画像与关系从事件里长出来。
 *
 * 这里有本仓库最重要的一条回归：**L2 全删后从 L1 重建，结果等价**。
 * 它是「Postgres 是唯一真相源」这条架构承诺唯一能被证伪的地方 ——
 * 不测它，那条承诺就只是一句写在文档里的话。
 */

/** 造一个已完成并收尾的池塘，让蒸馏有素材可用 */
async function completedPool(ctx: TestContext, texts: [string, string]) {
  const a = await ctx.makePerson('甲')
  const b = await ctx.makePerson('乙')
  const ia = await ctx.engine.publishIntent(a.actor, texts[0])
  const ib = await ctx.engine.publishIntent(b.actor, texts[1])
  const r = await ctx.engine.rehearseWith(a.actor, {
    seekerIntentId: ia.id,
    candidateIntentId: ib.id,
  })
  const { poolId } = await ctx.engine.takeOver(a.actor, {
    rehearsalId: r.rehearsalId,
    opening: '一起？',
  })
  await ctx.engine.confirmJoin(b.actor, poolId)
  await ctx.engine.postMessage(a.actor, poolId, '六点北宫门集合，我带绳子')
  await ctx.engine.postMessage(b.actor, poolId, '好，我带相机')
  // 完成需要全员确认（S19）：两边都点了才真的转 done
  await ctx.engine.finishEvent(a.actor, poolId)
  await ctx.engine.finishEvent(b.actor, poolId)
  await ctx.engine.addArtifact(a.actor, poolId, {
    kind: 'photo',
    uri: 'https://example.invalid/1.jpg',
    caption: '山顶的日出',
  })
  await ctx.engine.sealPool(a.actor, poolId)
  return { a, b, poolId }
}

describe('切面', () => {
  it('从事件长出来，且每条都能溯源到具体池塘', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await completedPool(ctx, [
        '周六想去爬山，最好野线',
        '周末想徒步，走没开发的路线',
      ])
      // 蒸馏之前：一条画像都没有
      await expect(ctx.engine.myFacets(a.actor)).resolves.toEqual([])

      await ctx.engine.distillAfterPool(poolId)
      const facets = await ctx.engine.myFacets(a.actor)

      expect(facets.length).toBeGreaterThan(0)
      for (const f of facets) {
        expect(f.summary.length).toBeGreaterThan(4)
        // 「你凭什么这么说我」—— 答案必须指向真实存在的池塘
        expect(f.evidence.length).toBeGreaterThan(0)
        expect(f.evidence.map((e) => e.poolId)).toContain(poolId)
        expect(f.nPools).toBe(f.evidence.length)
      }
    } finally {
      await ctx.cleanup()
    }
  })

  it('逐切面可设可见度，逐条可删', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await completedPool(ctx, [
        '周六想去爬山，最好野线',
        '周末想徒步，走没开发的路线',
      ])
      await ctx.engine.distillAfterPool(poolId)
      const [first] = await ctx.engine.myFacets(a.actor)
      expect(first).toBeDefined()

      await ctx.engine.setFacetVisibility(a.actor, first!.domain, 'private')
      const afterHide = await ctx.engine.myFacets(a.actor)
      expect(afterHide.find((f) => f.domain === first!.domain)?.visibility).toBe('private')

      await ctx.engine.deleteFacet(a.actor, first!.domain)
      const afterDelete = await ctx.engine.myFacets(a.actor)
      expect(afterDelete.some((f) => f.domain === first!.domain)).toBe(false)
    } finally {
      await ctx.cleanup()
    }
  })

  it('未成行的意图不进入任何画像 —— 没成行的想法不构成你是谁', async () => {
    const ctx = await createTestContext()
    try {
      const { a } = await ctx.makePerson('只发过意图的人').then((p) => ({ a: p }))
      await ctx.engine.publishIntent(a.actor, '想学陶艺，找人一起报班')
      await ctx.engine.publishIntent(a.actor, '想去看话剧')

      // 有意图，但一个池塘都没成行
      await ctx.engine.rebuildL2(ctx.campusId)
      await expect(ctx.engine.myFacets(a.actor)).resolves.toEqual([])
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('关系温度', () => {
  it('共池之后温度为正，且不打模型 —— 它是可解释的公式', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await completedPool(ctx, [
        '周六想去爬山，最好野线',
        '周末想徒步，走没开发的路线',
      ])
      await ctx.engine.distillAfterPool(poolId)

      const [rel] = await ctx.sql<{ temperature: number; sharedPools: number }[]>`
        select temperature, shared_pools as "sharedPools" from relation
        where (a_id = ${a.personId} and b_id = ${b.personId})
           or (a_id = ${b.personId} and b_id = ${a.personId})
      `
      expect(rel?.temperature).toBeGreaterThan(0)
      expect(rel?.sharedPools).toBe(1)
    } finally {
      await ctx.cleanup()
    }
  })

  it('无向关系只存一份，不会出现 (a,b) 与 (b,a) 两行', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await completedPool(ctx, [
        '周六想去爬山，最好野线',
        '周末想徒步，走没开发的路线',
      ])
      await ctx.engine.distillAfterPool(poolId)

      const rows = await ctx.sql<{ n: number }[]>`
        select count(*)::int as n from relation
        where (a_id in (${a.personId}, ${b.personId}) and b_id in (${a.personId}, ${b.personId}))
      `
      expect(rows[0]?.n).toBe(1)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('L2 全删后从 L1 重建，结果等价', () => {
  it('结构等价：同样的 (人,领域)、同样的证据池塘集合、同样的 n_pools、数值一致的温度', async () => {
    const ctx = await createTestContext()
    try {
      const { poolId } = await completedPool(ctx, [
        '周六想去爬山，最好野线',
        '周末想徒步，走没开发的路线',
      ])
      await ctx.engine.distillAfterPool(poolId)

      const snapshot = async () => {
        const facets = await ctx.sql<
          { personId: string; domain: string; nPools: number }[]
        >`select f.person_id as "personId", f.domain, f.n_pools as "nPools" from facet f
           join person p on p.id = f.person_id where p.campus_id = ${ctx.campusId}
           order by f.person_id, f.domain`
        const evidence = await ctx.sql<
          { personId: string; domain: string; poolId: string }[]
        >`select fe.person_id as "personId", fe.domain, fe.pool_id as "poolId" from facet_evidence fe
           join person p on p.id = fe.person_id where p.campus_id = ${ctx.campusId}
           order by fe.person_id, fe.domain, fe.pool_id`
        const relations = await ctx.sql<
          { aId: string; bId: string; temperature: number; sharedPools: number }[]
        >`select r.a_id as "aId", r.b_id as "bId", round(r.temperature::numeric, 6)::float8 as temperature,
                 r.shared_pools as "sharedPools" from relation r
           join person p on p.id = r.a_id where p.campus_id = ${ctx.campusId}
           order by r.a_id, r.b_id`
        return { facets, evidence, relations }
      }

      const before = await snapshot()
      expect(before.facets.length).toBeGreaterThan(0)
      expect(before.relations.length).toBeGreaterThan(0)

      await ctx.engine.wipeL2(ctx.campusId)
      const wiped = await snapshot()
      expect(wiped.facets).toEqual([])
      expect(wiped.evidence).toEqual([])
      expect(wiped.relations).toEqual([])

      await ctx.engine.rebuildL2(ctx.campusId)
      const after = await snapshot()

      // 结构等价。刻意不比对 summary 文本 —— 那是模型输出，
      // 断言它逐字可复现等于断言模型是确定性的，那样的测试就成了抽奖。
      expect(after.facets).toEqual(before.facets)
      expect(after.evidence).toEqual(before.evidence)
      expect(after.relations).toEqual(before.relations)
    } finally {
      await ctx.cleanup()
    }
  })

  it('L2 不可用时产品仍然可用 —— 它是派生物，不是真相源', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await completedPool(ctx, [
        '周六想去爬山，最好野线',
        '周末想徒步，走没开发的路线',
      ])
      await ctx.engine.distillAfterPool(poolId)
      await ctx.engine.wipeL2(ctx.campusId)

      // L1 的一切照常：池塘在、时间线在、回流物在
      const pools = await ctx.engine.myPools(a.actor)
      expect(pools.some((p) => p.id === poolId)).toBe(true)
      const timeline = await ctx.engine.poolTimeline(a.actor, poolId)
      expect(timeline.length).toBeGreaterThan(0)
      expect(timeline.some((e) => e.kind === 'recap')).toBe(true)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('增量蒸馏与全量重建的等价性：跨领域缺口', () => {
  /**
   * S16 架构审查 P3：`distillAfterPool` 把 scope 限定为本池塘的 domain，
   * 而 `rebuildL2` 不限 domain；`distillPerson` 的证据查询此前含
   * `p.state in ('active','done','dormant')`。
   *
   * 一个人若同时在 A 域的「进行中」（active，已成行但未收尾）池塘和
   * B 域的「已收尾」（done → dormant）池塘里：B 收尾触发的增量只会重蒸
   * B（scope=[B 的 domain]），而全量对同一个人不带 onlyDomains 限制，
   * A 域此前也会一并被算进去 —— 增量产出 {B}，全量产出 {A, B}，两条路径
   * 不再等价。
   *
   * 收敛方式：让 A 域池塘「进行中未收尾」这件事本身就没有资格成为证据 ——
   * 见 distiller-service.ts 里 `distillPerson` 的证据查询，state 口径从
   * `active,done,dormant` 收紧到 `done,dormant`。收紧之后，全量重建对
   * 这个人调用 distillPerson 时，A 域的 active 池塘从一开始就不会出现在
   * 证据集合里，不需要 onlyDomains 过滤就已经产不出 A 域的画像 ——
   * 增量与全量因此在证据口径上天然一致，而不是各自维护一份「该不该算」
   * 的判断。
   */
  it('一人同时在"进行中未收尾"的 A 域池塘与"已收尾"的 B 域池塘里，增量与全量对该人产出的画像领域集合必须一致', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId: poolB } = await completedPool(ctx, [
        '周六想去爬山，最好野线',
        '周末想徒步，走没开发的路线',
      ])
      const [domRow] = await ctx.sql<{ domain: string | null }[]>`
        select domain from pool where id = ${poolB}
      `
      const domB = domRow?.domain ?? 'other'
      // 挑一个跟 B 不同的领域，不赌模型分类 —— 这条用例要测的是 SQL 层的
      // 证据口径，不是意图分类的准确度
      const domA = DOMAINS.find((d) => d !== domB) ?? 'other'

      // A 域池塘：直接落在 'active'（已成行、进行中，尚未收尾）。
      // 当前产品里没有任何写路径能把池塘自然推进到这个状态——见
      // seam.test.ts 对状态机的验收，这里跟它一样直接用原始 SQL 造数据，
      // 模拟这个真实存在、但眼下无路可达的中间态。
      const [poolARow] = await ctx.sql<{ id: string }[]>`
        insert into pool (kind, state, campus_id, domain, title)
        values ('activity', 'active', ${ctx.campusId}, ${domA}, 'A 域·进行中')
        returning id
      `
      const poolA = poolARow!.id
      await ctx.sql`
        insert into membership (pool_id, person_id, role, state)
        values (${poolA}, ${a.personId}, 'participant', 'joined')
      `

      // 增量：只对刚收尾的 B 池塘触发蒸馏
      await ctx.engine.distillAfterPool(poolB)
      const incremental = await ctx.sql<{ domain: string }[]>`
        select domain from facet where person_id = ${a.personId} order by domain
      `
      expect(incremental.map((f) => f.domain)).toEqual([domB])

      await ctx.engine.wipeL2(ctx.campusId)
      await ctx.engine.rebuildL2(ctx.campusId)
      const full = await ctx.sql<{ domain: string }[]>`
        select domain from facet where person_id = ${a.personId} order by domain
      `

      // 核心断言：A 域的池塘还「进行中」，没有资格进入任何人的长期表示 ——
      // 全量重建不该比增量多算出一个 A 域的画像。
      expect(full.map((f) => f.domain)).toEqual(incremental.map((f) => f.domain))
    } finally {
      await ctx.cleanup()
    }
  })
})
