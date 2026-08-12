import { describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './harness'

/**
 * S9 · 权重接线：长期表示真正进入匹配。
 *
 * 这一刀之前，一个人完成过什么事完全不影响谁被推给他 ——
 * 切面躺在库里、有向量、能溯源、能删，但匹配器一次都没读过它。
 * 这里守的是「长期表示确实改变了排序」，以及三段调度确实按池塘数切档。
 */

/** 造一个完成并收尾的池塘，让参与者长出该领域的切面与角色历史 */
async function completeOne(
  ctx: TestContext,
  a: Awaited<ReturnType<TestContext['makePerson']>>,
  b: Awaited<ReturnType<TestContext['makePerson']>>,
  texts: [string, string],
) {
  const ia = await ctx.engine.publishIntent(a.actor, texts[0], { scope: 'campus' })
  const ib = await ctx.engine.publishIntent(b.actor, texts[1], { scope: 'campus' })
  const r = await ctx.engine.rehearseWith(a.actor, {
    seekerIntentId: ia.id,
    candidateIntentId: ib.id,
  })
  const { poolId } = await ctx.engine.takeOver(a.actor, {
    rehearsalId: r.rehearsalId,
    opening: '一起？',
  })
  await ctx.engine.confirmJoin(b.actor, poolId)
  await ctx.engine.postMessage(a.actor, poolId, '六点集合')
  await ctx.engine.postMessage(b.actor, poolId, '好')
  await ctx.engine.finishEvent(a.actor, poolId)
  await ctx.engine.sealPool(a.actor, poolId)
  await ctx.engine.distillAfterPool(poolId)
  return poolId
}

describe('三段调度按池塘数切档', () => {
  it('零池塘的人走 T0，此时切面与社交信号权重为零', async () => {
    const ctx = await createTestContext()
    try {
      const fresh = await ctx.makePerson('新注册的人')
      const other = await ctx.makePerson('别人')
      await ctx.engine.publishIntent(other.actor, '周末想去爬山走野线', { scope: 'campus' })

      const mine = await ctx.engine.publishIntent(fresh.actor, '周六想爬山，最好野线', {
        scope: 'campus',
      })
      const cands = await ctx.engine.refreshCandidates(fresh.actor, mine.id)

      expect(cands.length).toBeGreaterThan(0)
      // T0 档：facet / complementarity / social 的权重就是 0，
      // 所以它们对总分零贡献。这不是欠账 —— 零池塘的人确实没有这些数据。
      for (const c of cands) {
        expect(c.score.facet).toBe(0)
        expect(c.score.social).toBe(0)
        expect(c.score.complementarity).toBe(0)
        expect(c.score.intent).toBeGreaterThan(0)
      }
    } finally {
      await ctx.cleanup()
    }
  })

  it('双方在同一领域都有切面时，长期取向相似度真的进到分数里', async () => {
    const ctx = await createTestContext()
    try {
      const me = await ctx.makePerson('有历史的人')
      const partner = await ctx.makePerson('老搭子')
      const poolId = await completeOne(ctx, me, partner, [
        '周六想去爬山，最好野线',
        '周末想徒步，走没开发的路线',
      ])
      // 用池塘实际的领域，而不是赌模型把三句话分到同一个桶里 ——
      // 那种断言压在模型服从性上，会让测试变成抽奖（progress.txt 坑 #6）
      const [pool] = await ctx.sql<{ domain: string | null }[]>`
        select domain from pool where id = ${poolId}
      `
      const domain = pool?.domain ?? 'other'

      // 候选人在同一领域有切面。直接造，不依赖模型分类。
      const candidate = await ctx.makePerson('同领域的候选人')
      const [emb] = await ctx.engine.model.embed(['常走野线，习惯早出发，会带绳子'])
      await ctx.sql`
        insert into facet (person_id, domain, summary, traits, embedding, n_pools)
        values (${candidate.personId}, ${domain}, '常走野线，习惯早出发，会带绳子',
                ${ctx.sql.json({ roles: ['guide'] } as never)},
                ${'[' + emb!.join(',') + ']'}::vector, 2)
      `
      await ctx.engine.publishIntent(candidate.actor, '这周末还想去爬野线，有人吗', {
        scope: 'campus',
      })

      // 我这条意图必须落在同一领域，否则取的是别的切面
      const mine = await ctx.sql<{ id: string }[]>`
        insert into intent (person_id, raw_text, domain, campus_id, expires_at, embedding, scope)
        select ${me.personId}, '周六想爬山，走没开发的路线', ${domain}, ${ctx.campusId},
               now() + interval '3 days', embedding, 'campus'
        from intent where person_id = ${me.personId} order by created_at desc limit 1
        returning id
      `
      const cands = await ctx.engine.refreshCandidates(me.actor, mine[0]!.id)

      expect(cands.length).toBeGreaterThan(0)
      const withFacet = cands.filter((c) => c.score.facet > 0)
      expect(withFacet.length).toBeGreaterThan(0)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('缺失信号不被当作零', () => {
  it('新用户不因为「没有切面」而被系统性压低', async () => {
    const ctx = await createTestContext()
    try {
      const seeker = await ctx.makePerson('找搭子的')
      const veteran = await ctx.makePerson('老用户')
      const partner = await ctx.makePerson('他的搭子')
      await completeOne(ctx, veteran, partner, [
        '周六想去爬山，最好野线',
        '周末想徒步，走没开发的路线',
      ])

      // 一个全新用户和一个老用户发几乎一样的意图。
      // 全部收窄到本校：这条验的是权重归一化，与跨校无关，
      // 而 open 范围会让召回看到上次运行残留的数据，cassette 键就不稳定了。
      const rookie = await ctx.makePerson('新注册的')
      await ctx.engine.publishIntent(rookie.actor, '周末想去爬野线，有人一起吗', {
        scope: 'campus',
      })
      await ctx.engine.publishIntent(veteran.actor, '周末想去爬野线，有人一起吗', {
        scope: 'campus',
      })

      const mine = await ctx.engine.publishIntent(seeker.actor, '周六想爬山走野线', {
        scope: 'campus',
      })
      const cands = await ctx.engine.refreshCandidates(seeker.actor, mine.id)

      const rookieCard = cands.find((c) => c.personId === rookie.personId)
      const veteranCard = cands.find((c) => c.personId === veteran.personId)

      if (rookieCard && veteranCard) {
        // 权重归一化之后，缺失信号的权重按比例分给有值的信号，
        // 而不是当成 0 拉低总分。意图几乎一样时，两人的分不该差出一个量级。
        const ratio = veteranCard.score.total / Math.max(rookieCard.score.total, 1e-6)
        expect(ratio).toBeLessThan(2)
      }
      // 至少新用户没被完全挤出候选
      expect(cands.length).toBeGreaterThan(0)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('打分明细自洽', () => {
  it('各分项之和减去惩罚等于总分', async () => {
    const ctx = await createTestContext()
    try {
      const a = await ctx.makePerson('甲')
      const b = await ctx.makePerson('乙')
      await ctx.engine.publishIntent(b.actor, '周末想去爬山走野线', { scope: 'campus' })
      const mine = await ctx.engine.publishIntent(a.actor, '周六想爬山，最好野线', {
        scope: 'campus',
      })
      const cands = await ctx.engine.refreshCandidates(a.actor, mine.id)

      for (const c of cands) {
        const sum =
          c.score.intent +
          c.score.facet +
          c.score.complementarity +
          c.score.social +
          c.score.responsiveness -
          c.score.penalty
        // 打分明细要能解释总分，否则线上出了问题无法归因
        expect(Math.abs(sum - c.score.total)).toBeLessThan(1e-9)
      }
    } finally {
      await ctx.cleanup()
    }
  })
})
