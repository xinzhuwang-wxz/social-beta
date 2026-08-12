import { describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './harness'

/**
 * S19 · 双方完成确认 + 共同回忆的双向门控（PRD v2 阶段七、八）。
 *
 * 这里守两件事：
 *
 * 1. 「完成」是双方的共同事实，不是一个人说了算 —— 一方点了「已完成」，
 *    池塘要停在「等待对方确认」，直到全员都点过才真的转 done。
 * 2. 共同回忆的双向门控必须落在 RLS/视图定义上，不是应用层「记得别查」——
 *    任一方选「不愿意再次组队」，双方都不该在森林里看到这份共同回忆，
 *    且谁选的不愿意，对方永远查不到。
 */

async function pooledPair(ctx: TestContext) {
  const a = await ctx.makePerson('甲')
  const b = await ctx.makePerson('乙')
  const ia = await ctx.engine.publishIntent(a.actor, '周六想去爬山，最好野线', { scope: 'campus' })
  const ib = await ctx.engine.publishIntent(b.actor, '周末想徒步，走没开发的路线', { scope: 'campus' })
  const r = await ctx.engine.rehearseWith(a.actor, {
    seekerIntentId: ia.id,
    candidateIntentId: ib.id,
  })
  const { poolId } = await ctx.engine.takeOver(a.actor, {
    rehearsalId: r.rehearsalId,
    opening: '周六一起走野线？',
  })
  await ctx.engine.confirmJoin(b.actor, poolId)
  return { a, b, poolId }
}

/** 走到「双方都确认完成」，之后才谈得上评价与共同回忆 */
async function bothFinished(ctx: TestContext) {
  const { a, b, poolId } = await pooledPair(ctx)
  await ctx.engine.postMessage(a.actor, poolId, '六点北宫门集合，我带绳子')
  await ctx.engine.postMessage(b.actor, poolId, '好，我带相机')
  await ctx.engine.finishEvent(a.actor, poolId)
  await ctx.engine.finishEvent(b.actor, poolId)
  return { a, b, poolId }
}

describe('双方完成确认', () => {
  it('一方确认后停在「等待对方确认」，不会单方面推进', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)

      const result = await ctx.engine.finishEvent(a.actor, poolId)
      expect(result.allConfirmed).toBe(false)

      const [pool] = await ctx.sql<{ state: string }[]>`select state from pool where id = ${poolId}`
      // 之前是一个人点了就转 done；现在一方确认不改变池塘状态
      expect(pool?.state).not.toBe('done')

      const status = await ctx.engine.completionStatus(a.actor, poolId)
      expect(status.allConfirmed).toBe(false)
      expect(status.confirmedBy.map((c) => c.personId)).toEqual([a.personId])
      expect(status.pendingBy.map((p) => p.personId)).toEqual([b.personId])
    } finally {
      await ctx.cleanup()
    }
  })

  it('全员确认后才转 done，且事件流留下一条不分谁点最后一下的共同事实', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)

      const one = await ctx.engine.finishEvent(a.actor, poolId)
      expect(one.allConfirmed).toBe(false)
      const two = await ctx.engine.finishEvent(b.actor, poolId)
      expect(two.allConfirmed).toBe(true)

      const [pool] = await ctx.sql<{ state: string }[]>`select state from pool where id = ${poolId}`
      expect(pool?.state).toBe('done')

      const status = await ctx.engine.completionStatus(a.actor, poolId)
      expect(status.allConfirmed).toBe(true)
      expect(status.pendingBy).toEqual([])
      expect(status.confirmedBy.map((c) => c.personId).sort()).toEqual(
        [a.personId, b.personId].sort(),
      )

      const timeline = await ctx.engine.poolTimeline(a.actor, poolId)
      const happened = timeline.find((e) => e.kind === 'happened')
      // actor 为空 —— 「都完成了」是共同事实，不归功于最后点确认的那个人
      expect(happened?.actorId).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  })

  it('确认是幂等的：同一个人重复点击不报错也不重复计数', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await pooledPair(ctx)
      await ctx.engine.finishEvent(a.actor, poolId)
      await ctx.engine.finishEvent(a.actor, poolId)

      const status = await ctx.engine.completionStatus(a.actor, poolId)
      expect(status.confirmedBy).toHaveLength(1)
    } finally {
      await ctx.cleanup()
    }
  })

  it('非成员不能确认完成', async () => {
    const ctx = await createTestContext()
    try {
      const { poolId } = await pooledPair(ctx)
      const outsider = await ctx.makePerson('局外人')
      await expect(ctx.engine.finishEvent(outsider.actor, poolId)).rejects.toThrow(
        /不是这个池塘的成员/,
      )
    } finally {
      await ctx.cleanup()
    }
  })

  it('一方未确认时，讨论与改计划照常能做 —— 未完成不等于池塘被冻结', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)
      await ctx.engine.finishEvent(a.actor, poolId)

      // postMessage 与 submitPlan 都不检查 pool.state，一方确认不影响这两件事
      await expect(
        ctx.engine.postMessage(b.actor, poolId, '其实周日更合适，改一下？'),
      ).resolves.toBeUndefined()
      await expect(
        ctx.engine.submitPlan(b.actor, poolId, {
          title: '改到周日爬野线',
          startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(),
          meetAt: '北宫门地铁站 A 口',
        }),
      ).resolves.toBeUndefined()
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('撤回完成确认', () => {
  it('未全部确认前可以撤回，之后仍能重新确认', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)
      await ctx.engine.finishEvent(a.actor, poolId)

      await ctx.engine.withdrawCompletion(a.actor, poolId)
      let status = await ctx.engine.completionStatus(a.actor, poolId)
      expect(status.confirmedBy).toEqual([])
      expect(status.pendingBy.map((p) => p.personId).sort()).toEqual(
        [a.personId, b.personId].sort(),
      )

      // 撤回不是终局，还能再确认一次
      const again = await ctx.engine.finishEvent(a.actor, poolId)
      expect(again.allConfirmed).toBe(false)
      status = await ctx.engine.completionStatus(a.actor, poolId)
      expect(status.confirmedBy.map((c) => c.personId)).toEqual([a.personId])
    } finally {
      await ctx.cleanup()
    }
  })

  it('全部确认转 done 之后不能再撤回 —— 那是共同事实，不是单方能推翻的', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await bothFinished(ctx)
      await expect(ctx.engine.withdrawCompletion(a.actor, poolId)).rejects.toThrow(/无法撤回/)
    } finally {
      await ctx.cleanup()
    }
  })

  it('非成员不能撤回', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await pooledPair(ctx)
      await ctx.engine.finishEvent(a.actor, poolId)
      const outsider = await ctx.makePerson('局外人')
      await expect(ctx.engine.withdrawCompletion(outsider.actor, poolId)).rejects.toThrow(
        /不是这个池塘的成员/,
      )
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('私密评价', () => {
  it('完成确认前不能评价 —— 还没到回忆与评价阶段', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await pooledPair(ctx)
      // 只有 a 确认，对方还没确认，pool 还没转 done
      await ctx.engine.finishEvent(a.actor, poolId)
      await expect(
        ctx.engine.giveFeedback(a.actor, poolId, { again: 'yes' }),
      ).rejects.toThrow(/还没被双方确认完成/)
    } finally {
      await ctx.cleanup()
    }
  })

  it('确认完成后可以评价：照片与文字都是可选的，again 是核心字段', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await bothFinished(ctx)
      // 不传 note / reflection / photoUri，只给必选的 again —— 不强制任何回忆素材
      await expect(
        ctx.engine.giveFeedback(a.actor, poolId, { again: 'maybe' }),
      ).resolves.toBeUndefined()
    } finally {
      await ctx.cleanup()
    }
  })

  it('评价内容（含新增的 photoUri / reflection）只有本人看得到', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await bothFinished(ctx)
      await ctx.engine.giveFeedback(a.actor, poolId, {
        again: 'yes',
        note: '私密备注：他总迟到',
        reflection: '这次日出很值得',
        photoUri: 'https://example.invalid/private-recall.jpg',
      })

      const seenByB = await ctx.sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: b.actor.authUserId })}, true)`
        await tx`select set_config('role', 'authenticated', true)`
        return tx<{ n: number }[]>`
          select count(*)::int as n from feedback where pool_id = ${poolId} and person_id = ${a.personId}
        `
      })
      expect(seenByB[0]?.n).toBe(0)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('共同回忆的双向门控', () => {
  async function sealedPair(ctx: TestContext) {
    const { a, b, poolId } = await bothFinished(ctx)
    await ctx.engine.sealPool(a.actor, poolId)
    return { a, b, poolId }
  }

  it('尚无人明确表示不愿意时，共同回忆默认对双方可见', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await sealedPair(ctx)

      const forestA = await ctx.engine.myForestRecaps(a.actor)
      const forestB = await ctx.engine.myForestRecaps(b.actor)
      expect(forestA.some((r) => r.poolId === poolId)).toBe(true)
      expect(forestB.some((r) => r.poolId === poolId)).toBe(true)
    } finally {
      await ctx.cleanup()
    }
  })

  it('双方都愿意再组队：共同回忆同时进入双方的森林', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await sealedPair(ctx)
      await ctx.engine.giveFeedback(a.actor, poolId, { again: 'yes' })
      await ctx.engine.giveFeedback(b.actor, poolId, { again: 'yes' })

      const forestA = await ctx.engine.myForestRecaps(a.actor)
      const forestB = await ctx.engine.myForestRecaps(b.actor)
      expect(forestA.some((r) => r.poolId === poolId)).toBe(true)
      expect(forestB.some((r) => r.poolId === poolId)).toBe(true)
    } finally {
      await ctx.cleanup()
    }
  })

  it('任一方选择不愿意再组队：双方都不生成对外可见的共同回忆', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await sealedPair(ctx)
      await ctx.engine.giveFeedback(a.actor, poolId, { again: 'yes' })
      await ctx.engine.giveFeedback(b.actor, poolId, { again: 'no' })

      const forestA = await ctx.engine.myForestRecaps(a.actor)
      const forestB = await ctx.engine.myForestRecaps(b.actor)
      // 双方都看不到 —— 不是「只有拒绝方看不到」或反过来
      expect(forestA.some((r) => r.poolId === poolId)).toBe(false)
      expect(forestB.some((r) => r.poolId === poolId)).toBe(false)
    } finally {
      await ctx.cleanup()
    }
  })

  it('池塘内部的 recap 不受门控影响 —— 成员本就都在场', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await sealedPair(ctx)
      await ctx.engine.giveFeedback(a.actor, poolId, { again: 'no' })
      await ctx.engine.giveFeedback(b.actor, poolId, { again: 'no' })

      // 森林里的那份消失了
      expect((await ctx.engine.myForestRecaps(a.actor)).some((r) => r.poolId === poolId)).toBe(
        false,
      )

      // 但池塘时间线里的 recap 双方都还看得到
      const timelineA = await ctx.engine.poolTimeline(a.actor, poolId)
      const timelineB = await ctx.engine.poolTimeline(b.actor, poolId)
      expect(timelineA.some((e) => e.kind === 'recap')).toBe(true)
      expect(timelineB.some((e) => e.kind === 'recap')).toBe(true)
    } finally {
      await ctx.cleanup()
    }
  })

  it('对方不会获知是谁选择了不愿意 —— 无论哪一方拒绝，结果对称且反馈内容读不到', async () => {
    const ctx = await createTestContext()
    try {
      // 第一局：a 拒绝
      const first = await sealedPair(ctx)
      await ctx.engine.giveFeedback(first.a.actor, first.poolId, { again: 'no' })
      await ctx.engine.giveFeedback(first.b.actor, first.poolId, { again: 'yes' })

      // 第二局：b 拒绝（对调角色）
      const second = await sealedPair(ctx)
      await ctx.engine.giveFeedback(second.a.actor, second.poolId, { again: 'yes' })
      await ctx.engine.giveFeedback(second.b.actor, second.poolId, { again: 'no' })

      // 两局里，「愿意的那一方」看到的结果完全一样：都是共同回忆消失了，
      // 而不是「谁拒绝了就对谁隐藏、对另一方保留」——不对称的可见性本身就是一种泄漏
      const firstWillingForest = await ctx.engine.myForestRecaps(first.b.actor)
      const secondWillingForest = await ctx.engine.myForestRecaps(second.a.actor)
      expect(firstWillingForest.some((r) => r.poolId === first.poolId)).toBe(false)
      expect(secondWillingForest.some((r) => r.poolId === second.poolId)).toBe(false)

      // 愿意的一方也读不到对方那条 feedback 的任何内容（RLS 挡在表这一层）
      const seenByB = await ctx.sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: first.b.actor.authUserId })}, true)`
        await tx`select set_config('role', 'authenticated', true)`
        return tx<{ again: string }[]>`
          select again::text from feedback where pool_id = ${first.poolId} and person_id = ${first.a.personId}
        `
      })
      expect(seenByB).toHaveLength(0)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('回流物各自管理', () => {
  it('上传者能删除自己上传的回流物', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await pooledPair(ctx)
      const art = await ctx.engine.addArtifact(a.actor, poolId, {
        kind: 'photo',
        uri: 'https://example.invalid/mine.jpg',
      })
      await ctx.engine.removeArtifact(a.actor, art.id)

      const left = await ctx.sql<{ n: number }[]>`select count(*)::int as n from artifact where id = ${art.id}`
      expect(left[0]?.n).toBe(0)
    } finally {
      await ctx.cleanup()
    }
  })

  it('不能删除对方上传的回流物', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)
      const art = await ctx.engine.addArtifact(a.actor, poolId, {
        kind: 'photo',
        uri: 'https://example.invalid/mine.jpg',
      })
      await expect(ctx.engine.removeArtifact(b.actor, art.id)).rejects.toThrow(/不是你上传的/)

      const left = await ctx.sql<{ n: number }[]>`select count(*)::int as n from artifact where id = ${art.id}`
      expect(left[0]?.n).toBe(1)
    } finally {
      await ctx.cleanup()
    }
  })
})
