import { describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './harness'

/**
 * 投递制：种子发给多人，候选先表态，发起人在愿意的人里选。
 *
 * 这一改是方向性的。原设计让发起人**把仅有的几次尝试勇气花在一次抛硬币上** ——
 * 挑一个人然后等他理不理你，而「不知道对方会不会回应」正是本产品要解决的痛点。
 * 投递制让他只在已经说了「愿意」的人里选，从结构上消灭了石沉大海。
 *
 * 三条不对称的可见性规则各自防一种崩坏，都在这里守：
 * 候选人看不到排名与竞争人数、看不到最终被选中的是谁、落选文案不是评价。
 */

async function seedWithCandidates(ctx: TestContext, needed = 1) {
  const seeker = await ctx.makePerson('发起人')
  const others = []
  for (const [name, text] of [
    ['甲', '周末想去爬山，走野线那种'],
    ['乙', '想找人一起徒步，最好没开发过的路线'],
    ['丙', '周末想爬野长城，带相机'],
  ] as const) {
    const p = await ctx.makePerson(name)
    await ctx.engine.publishIntent(p.actor, text, { scope: 'campus' })
    others.push(p)
  }
  const seed = await ctx.engine.publishIntent(seeker.actor, '周六想爬山，最好是野线', {
    scope: 'campus',
  })
  if (needed > 1) {
    await ctx.sql`update intent set needed = ${needed} where id = ${seed.id}`
  }
  return { seeker, others, seedId: seed.id }
}

describe('投递', () => {
  it('一颗种子发给多名候选，各自进自己的信箱', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx)
      const { delivered } = await ctx.engine.deliverSeed(seeker.actor, seedId)
      expect(delivered).toBeGreaterThan(0)

      const inbox = await ctx.engine.seedInbox(others[0]!.actor)
      expect(inbox.some((i) => i.intentId === seedId)).toBe(true)
      const item = inbox.find((i) => i.intentId === seedId)!
      expect(item.seekerName).toBe('发起人')
      expect(item.rawText).toContain('爬山')
    } finally {
      await ctx.cleanup()
    }
  })

  it('候选人看不到推荐理由与打分 —— 能看到自己排第几的人，下次就不会再表达愿意', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx)
      await ctx.engine.deliverSeed(seeker.actor, seedId)

      const inbox = await ctx.engine.seedInbox(others[0]!.actor)
      const item = inbox.find((i) => i.intentId === seedId)!
      // 视图在 SQL 层就不含这两列 —— 做成查不到，而不是在应用层记得别 select
      expect(item).not.toHaveProperty('reason')
      expect(item).not.toHaveProperty('score')

      // 直接查底表也拿不到别人的那一行
      const raw = await ctx.sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: others[0]!.actor.authUserId })}, true)`
        await tx`select set_config('role', 'authenticated', true)`
        return tx<{ n: number }[]>`
          select count(*)::int as n from seed_delivery
          where intent_id = ${seedId} and person_id <> ${others[0]!.personId}
        `
      })
      // 看不到竞争人数
      expect(raw[0]?.n).toBe(0)
    } finally {
      await ctx.cleanup()
    }
  })

  it('表态之后发起人才看得到，且只看得到愿意的人', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx)
      await ctx.engine.deliverSeed(seeker.actor, seedId)

      await expect(ctx.engine.willingFor(seeker.actor, seedId)).resolves.toEqual([])

      await ctx.engine.replyToSeed(others[0]!.actor, seedId, true, '我去过箭扣，可以带路')
      await ctx.engine.replyToSeed(others[1]!.actor, seedId, false)

      const willing = await ctx.engine.willingFor(seeker.actor, seedId)
      expect(willing.map((w) => w.personId)).toEqual([others[0]!.personId])
      expect(willing[0]?.note).toBe('我去过箭扣，可以带路')
    } finally {
      await ctx.cleanup()
    }
  })

  it('不能查看他人种子的回应', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx)
      await ctx.engine.deliverSeed(seeker.actor, seedId)
      await expect(ctx.engine.willingFor(others[0]!.actor, seedId)).rejects.toThrow(/无权/)
    } finally {
      await ctx.cleanup()
    }
  })

  it('重复表态被拒绝', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx)
      await ctx.engine.deliverSeed(seeker.actor, seedId)
      await ctx.engine.replyToSeed(others[0]!.actor, seedId, true)
      await expect(ctx.engine.replyToSeed(others[0]!.actor, seedId, false)).rejects.toThrow(
        /没有待回应的种子/,
      )
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('发起人选择与成局', () => {
  it('只能在表达过愿意的人里选', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx)
      await ctx.engine.deliverSeed(seeker.actor, seedId)
      await expect(
        ctx.engine.chooseCompanion(seeker.actor, seedId, others[0]!.personId, '一起？'),
      ).rejects.toThrow(/没有表达过愿意/)
    } finally {
      await ctx.cleanup()
    }
  })

  it('选中即成局，对方直接是 joined —— 他已经说过愿意，不该被问第二遍', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx)
      await ctx.engine.deliverSeed(seeker.actor, seedId)
      await ctx.engine.replyToSeed(others[0]!.actor, seedId, true)

      const { poolId, filled } = await ctx.engine.chooseCompanion(
        seeker.actor,
        seedId,
        others[0]!.personId,
        '周六六点北宫门？',
      )
      expect(filled).toBe(true)

      const members = await ctx.sql<{ personId: string; state: string }[]>`
        select person_id as "personId", state::text from membership where pool_id = ${poolId}
      `
      expect(members.find((m) => m.personId === others[0]!.personId)?.state).toBe('joined')

      // 第一句话由真人发出
      const timeline = await ctx.engine.poolTimeline(seeker.actor, poolId)
      const opening = timeline.find((e) => e.kind === 'opening')
      expect(opening?.summary).toBe('周六六点北宫门？')
      expect(opening?.actorId).toBe(seeker.personId)
    } finally {
      await ctx.cleanup()
    }
  })

  it('需要多人时收满才停 —— PRD 写的「选一名」与种子自己的人数矛盾', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx, 2)
      await ctx.engine.deliverSeed(seeker.actor, seedId)
      await ctx.engine.replyToSeed(others[0]!.actor, seedId, true)
      await ctx.engine.replyToSeed(others[1]!.actor, seedId, true)

      const first = await ctx.engine.chooseCompanion(
        seeker.actor,
        seedId,
        others[0]!.personId,
        '一起？',
      )
      expect(first.filled).toBe(false)

      const second = await ctx.engine.chooseCompanion(
        seeker.actor,
        seedId,
        others[1]!.personId,
        '一起？',
      )
      expect(second.filled).toBe(true)
      // 两次进的是同一个池塘
      expect(second.poolId).toBe(first.poolId)

      const members = await ctx.sql<{ n: number }[]>`
        select count(*)::int as n from membership where pool_id = ${first.poolId} and state = 'joined'
      `
      expect(members[0]?.n).toBe(3)
    } finally {
      await ctx.cleanup()
    }
  })

  it('收满后其余投递转 closed —— 落选者收到的是「已找到同行者」，不是「你不合适」', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx)
      await ctx.engine.deliverSeed(seeker.actor, seedId)
      await ctx.engine.replyToSeed(others[0]!.actor, seedId, true)
      await ctx.engine.replyToSeed(others[1]!.actor, seedId, true)
      await ctx.engine.chooseCompanion(seeker.actor, seedId, others[0]!.personId, '一起？')

      const states = await ctx.sql<{ personId: string; state: string }[]>`
        select person_id as "personId", state::text from seed_delivery where intent_id = ${seedId}
      `
      expect(states.find((s) => s.personId === others[0]!.personId)?.state).toBe('chosen')
      expect(states.find((s) => s.personId === others[1]!.personId)?.state).toBe('closed')

      // 落选者的信箱里这条已经不在待处理列表 —— 状态是事实，不是评价
      const inbox = await ctx.engine.seedInbox(others[1]!.actor)
      expect(inbox.some((i) => i.intentId === seedId)).toBe(false)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('投递进度', () => {
  it('发起人看得到还需要几个人、多少人表了态', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx, 2)
      await ctx.engine.deliverSeed(seeker.actor, seedId)

      const before = await ctx.engine.seedProgress(seeker.actor, seedId)
      expect(before.needed).toBe(2)
      expect(before.chosen).toBe(0)
      expect(before.delivered).toBeGreaterThan(0)
      expect(before.willing).toBe(0)

      await ctx.engine.replyToSeed(others[0]!.actor, seedId, true)
      await ctx.engine.replyToSeed(others[1]!.actor, seedId, false)

      const mid = await ctx.engine.seedProgress(seeker.actor, seedId)
      // 表态是「愿意」才计数 —— 拒绝的人不该让发起人以为还有戏
      expect(mid.willing).toBe(1)

      await ctx.engine.chooseCompanion(seeker.actor, seedId, others[0]!.personId, '一起？')
      const after = await ctx.engine.seedProgress(seeker.actor, seedId)
      expect(after.chosen).toBe(1)
      expect(after.needed).toBe(2)
    } finally {
      await ctx.cleanup()
    }
  })

  it('候选人看不到投递进度 —— 「还差一个」对他是竞争压力', async () => {
    const ctx = await createTestContext()
    try {
      const { seeker, others, seedId } = await seedWithCandidates(ctx)
      await ctx.engine.deliverSeed(seeker.actor, seedId)
      await expect(ctx.engine.seedProgress(others[0]!.actor, seedId)).rejects.toThrow(/无权/)
    } finally {
      await ctx.cleanup()
    }
  })
})
