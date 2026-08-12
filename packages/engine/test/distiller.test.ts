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
  await ctx.engine.finishEvent(a.actor, poolId)
  await ctx.engine.addArtifact(a.actor, poolId, {
    kind: 'photo',
    uri: 'https://example.invalid/1.jpg',
    caption: '山顶的日出',
  })
  await ctx.engine.sealPool(poolId)
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
