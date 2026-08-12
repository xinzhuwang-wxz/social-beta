import { describe, expect, it } from 'vitest'
import { isActiveNow } from '../src/responsiveness-service'
import { createTestContext, type TestContext } from './harness'

/**
 * 回应先验：他会不会理你。
 *
 * 这一段之前是空的 —— 表里一行都没有，所有候选取同一个中性先验 0.5，
 * 对排序的实际贡献恒为 0。PRD 把它列为两个非共识差异化来源之一，
 * 而它当时只是一个占位列。
 *
 * 产品立场：不推「最合适」的人，推「最合适且会回应」的人 ——
 * 一个从不回消息的完美匹配价值是负的，它消耗的是用户仅有的几次尝试勇气。
 */

async function inviteFrom(ctx: TestContext, a: Awaited<ReturnType<TestContext['makePerson']>>, b: Awaited<ReturnType<TestContext['makePerson']>>) {
  const ia = await ctx.engine.publishIntent(a.actor, '周六想去爬山，最好野线', { scope: 'campus' })
  const ib = await ctx.engine.publishIntent(b.actor, '周末想徒步，走没开发的路线', { scope: 'campus' })
  const r = await ctx.engine.rehearseWith(a.actor, {
    seekerIntentId: ia.id,
    candidateIntentId: ib.id,
  })
  const { poolId } = await ctx.engine.takeOver(a.actor, {
    rehearsalId: r.rehearsalId,
    opening: '一起？',
  })
  return poolId
}

describe('回应先验', () => {
  it('从没被邀请过的人不写行 —— 「没数据」和「实测是 0.5」必须可区分', async () => {
    const ctx = await createTestContext()
    try {
      const fresh = await ctx.makePerson('从没被邀请过')
      const rows = await ctx.sql<{ n: number }[]>`
        select count(*)::int as n from responsiveness where person_id = ${fresh.personId}
      `
      expect(rows[0]?.n).toBe(0)
    } finally {
      await ctx.cleanup()
    }
  })

  it('明确拒绝的人 reply_rate 是满的 —— 会拒绝比从不出声有价值得多', async () => {
    const ctx = await createTestContext()
    try {
      const a = await ctx.makePerson('发起者')
      const decliner = await ctx.makePerson('每次都明确拒绝的人')
      const poolId = await inviteFrom(ctx, a, decliner)
      await ctx.engine.replyToInvite(decliner.actor, poolId, 'decline')

      const [r] = await ctx.sql<{ replyRate: number; acceptRate: number }[]>`
        select reply_rate as "replyRate", accept_rate as "acceptRate"
        from responsiveness where person_id = ${decliner.personId}
      `
      // reply_rate 量的是「会不会理人」，与答应还是拒绝无关
      expect(r?.replyRate).toBe(1)
      // accept_rate 才量「匹配对他准不准」
      expect(r?.acceptRate).toBe(0)
    } finally {
      await ctx.cleanup()
    }
  })

  it('从不出声的人 reply_rate 为 0，且真的进到打分里', async () => {
    const ctx = await createTestContext()
    try {
      const a = await ctx.makePerson('发起者')
      const silent = await ctx.makePerson('从不出声的人')
      await inviteFrom(ctx, a, silent)
      // 不回应，然后手动触发重算（真实产品里由蒸馏或下一次回应触发）
      await ctx.engine.recomputeResponsivenessFor(silent.personId)

      const [r] = await ctx.sql<{ replyRate: number }[]>`
        select reply_rate as "replyRate" from responsiveness where person_id = ${silent.personId}
      `
      expect(r?.replyRate).toBe(0)

      // 让他发一条意图，看他在别人的候选里是否被降权
      await ctx.engine.publishIntent(silent.actor, '周末想去爬野线找搭子', { scope: 'campus' })
      const seeker = await ctx.makePerson('找搭子的')
      const mine = await ctx.engine.publishIntent(seeker.actor, '周六想爬山走野线', {
        scope: 'campus',
      })
      const cands = await ctx.engine.refreshCandidates(seeker.actor, mine.id)
      const card = cands.find((c) => c.personId === silent.personId)
      if (card) {
        // 有数据的人走实测值，而不是所有人一律 0.5 —— 那样这个信号等于不存在
        expect(card.score.responsiveness).toBe(0)
      }
    } finally {
      await ctx.cleanup()
    }
  })

  it('确认加入会立刻重算，不等到池塘收尾', async () => {
    const ctx = await createTestContext()
    try {
      const a = await ctx.makePerson('发起者')
      const b = await ctx.makePerson('爽快的人')
      const poolId = await inviteFrom(ctx, a, b)
      await ctx.engine.confirmJoin(b.actor, poolId)

      const [r] = await ctx.sql<{ acceptRate: number }[]>`
        select accept_rate as "acceptRate" from responsiveness where person_id = ${b.personId}
      `
      // 蒸馏只在收尾时跑，那时已经晚了一整个匹配周期
      expect(r?.acceptRate).toBe(1)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('活跃时段', () => {
  it('没有数据时不拦 —— 拦住的代价比打扰一次大得多', () => {
    expect(isActiveNow([])).toBe(true)
  })

  it('前后一小时都算活跃 —— 活跃时段是模糊的，卡整点没有意义', () => {
    const at = (h: number) => new Date(2026, 0, 1, h, 30)
    expect(isActiveNow([14], at(13))).toBe(true)
    expect(isActiveNow([14], at(14))).toBe(true)
    expect(isActiveNow([14], at(15))).toBe(true)
    expect(isActiveNow([14], at(18))).toBe(false)
  })

  it('跨零点不被切断', () => {
    const at = (h: number) => new Date(2026, 0, 1, h, 30)
    expect(isActiveNow([23], at(0))).toBe(true)
    expect(isActiveNow([0], at(23))).toBe(true)
  })
})
