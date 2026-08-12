import { describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './harness'

/**
 * 行动确认卡 · 邀请四选项 · 当天状态 · 提醒。
 *
 * PRD 把行动确认卡称为最重要的中间转化节点：
 * 从一句模糊的「有空一起」，转化为一项明确的共同承诺。
 * 此前整个产品缺这一环 —— 聊完直接跳到「办完了」。
 */

async function pooledPair(ctx: TestContext) {
  const a = await ctx.makePerson('甲')
  const b = await ctx.makePerson('乙')
  const ia = await ctx.engine.publishIntent(a.actor, '周六想去爬山，最好野线', { scope: 'campus' })
  const ib = await ctx.engine.publishIntent(b.actor, '周末想徒步，走没开发的路线', {
    scope: 'campus',
  })
  const r = await ctx.engine.rehearseWith(a.actor, {
    seekerIntentId: ia.id,
    candidateIntentId: ib.id,
  })
  const { poolId } = await ctx.engine.takeOver(a.actor, {
    rehearsalId: r.rehearsalId,
    opening: '周六一起走野线？',
  })
  return { a, b, poolId }
}

describe('邀请的四个选项', () => {
  it('join 之外的三个选项都留下可区分的信号', async () => {
    const ctx = await createTestContext()
    try {
      for (const [response, expectState] of [
        ['join', 'joined'],
        ['adjust', 'invited'],
        ['decline', 'left'],
        ['later', 'left'],
      ] as const) {
        const { b, poolId } = await pooledPair(ctx)
        await ctx.engine.replyToInvite(b.actor, poolId, response, '时间对不上')

        const [m] = await ctx.sql<{ state: string }[]>`
          select state from membership where pool_id = ${poolId} and person_id = ${b.personId}
        `
        expect(m?.state).toBe(expectState)

        const [reply] = await ctx.sql<{ response: string }[]>`
          select response from invite_reply where pool_id = ${poolId} and person_id = ${b.personId}
        `
        // 只有「加入」一个选项时，所有非加入的意图都塌缩成沉默 ——
        // 而沉默是不可区分的，系统学不到任何东西
        expect(reply?.response).toBe(response)
      }
    } finally {
      await ctx.cleanup()
    }
  })

  it('adjust 留在邀请态并把诉求带进池塘 —— 直接判成拒绝会丢掉一个本可以成的连接', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)
      await ctx.engine.replyToInvite(b.actor, poolId, 'adjust', '周六下午有课，能改上午吗')

      const timeline = await ctx.engine.poolTimeline(a.actor, poolId)
      const adjust = timeline.find((e) => e.kind === 'adjust')
      expect(adjust?.summary).toContain('周六下午有课')
      expect(adjust?.actorId).toBe(b.personId)
    } finally {
      await ctx.cleanup()
    }
  })

  it('发起方看不到别人的拒绝明细 —— 否则所有人会倾向于不回应', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)
      await ctx.engine.replyToInvite(b.actor, poolId, 'decline')

      const seenByA = await ctx.sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.actor.authUserId })}, true)`
        await tx`select set_config('role', 'authenticated', true)`
        return tx<{ response: string }[]>`select response from invite_reply where pool_id = ${poolId}`
      })
      // 沉默比明确的拒绝更糟：拒绝至少是一条信号，沉默什么都不是
      expect(seenByA).toHaveLength(0)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('行动确认卡', () => {
  it('AI 汇总草稿，但必须有人提交 —— 草稿本身不改变任何状态', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)
      await ctx.engine.replyToInvite(b.actor, poolId, 'join')
      await ctx.engine.postMessage(a.actor, poolId, '周六早上六点北宫门集合，我带绳子')
      await ctx.engine.postMessage(b.actor, poolId, '好，我带相机和水')

      const draft = await ctx.engine.draftPlan(a.actor, poolId)
      expect(draft.title.length).toBeGreaterThan(0)
      expect(draft.meetAt.length).toBeGreaterThan(0)

      // 草稿不落库：池塘状态没变，也没有确认卡
      const [pool] = await ctx.sql<{ state: string }[]>`select state from pool where id = ${poolId}`
      expect(pool?.state).toBe('forming')
      await expect(ctx.engine.plan(a.actor, poolId)).resolves.toBeNull()
    } finally {
      await ctx.cleanup()
    }
  })

  it('全员确认后才进花苞 —— 一个人拍板不算共同承诺', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)
      await ctx.engine.replyToInvite(b.actor, poolId, 'join')
      await ctx.engine.postMessage(a.actor, poolId, '周六六点北宫门')

      await ctx.engine.submitPlan(a.actor, poolId, {
        title: '周六爬野线',
        startsAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
        meetAt: '北宫门地铁站 A 口',
        bring: ['水', '手套'],
        tasks: [{ what: '查路线', ownerId: a.personId }],
      })

      const one = await ctx.engine.confirmPlan(a.actor, poolId)
      expect(one.allConfirmed).toBe(false)
      let [pool] = await ctx.sql<{ state: string }[]>`select state from pool where id = ${poolId}`
      expect(pool?.state).toBe('forming')

      const two = await ctx.engine.confirmPlan(b.actor, poolId)
      expect(two.allConfirmed).toBe(true)
      ;[pool] = await ctx.sql<{ state: string }[]>`select state from pool where id = ${poolId}`
      expect(pool?.state).toBe('planned')
    } finally {
      await ctx.cleanup()
    }
  })

  it('改计划会作废此前的确认 —— 大家确认的是那一版，不是这一版', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)
      await ctx.engine.replyToInvite(b.actor, poolId, 'join')
      await ctx.engine.postMessage(a.actor, poolId, '周六六点')

      const base = {
        title: '周六爬野线',
        startsAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
        meetAt: '北宫门',
      }
      await ctx.engine.submitPlan(a.actor, poolId, base)
      await ctx.engine.confirmPlan(a.actor, poolId)
      await ctx.engine.confirmPlan(b.actor, poolId)

      await ctx.engine.submitPlan(a.actor, poolId, { ...base, meetAt: '改成香山北门' })
      const plan = await ctx.engine.plan(a.actor, poolId)
      expect(plan?.confirmedBy).toHaveLength(0)
      expect(plan?.pendingBy).toHaveLength(2)
    } finally {
      await ctx.cleanup()
    }
  })

  it('没有任何讨论时拒绝汇总 —— 编出来的计划没有人同意过', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await pooledPair(ctx)
      // 只有 opening，把它删掉模拟零讨论
      await ctx.sql`delete from episode where pool_id = ${poolId}`
      await expect(ctx.engine.draftPlan(a.actor, poolId)).rejects.toThrow(/无法汇总计划/)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('状态看板', () => {
  it('区分「已经定了什么」和「还没定什么」，并给出确定性的下一步', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)

      // 还有人没回应邀请
      let board = await ctx.engine.poolBoard(a.actor, poolId)
      expect(board.open.some((x) => x.includes('还没回应邀请'))).toBe(true)
      expect(board.nextStep).toContain('还有人没回应邀请')

      await ctx.engine.replyToInvite(b.actor, poolId, 'join')
      board = await ctx.engine.poolBoard(a.actor, poolId)
      expect(board.open.some((x) => x.includes('时间、地点还没定'))).toBe(true)

      await ctx.engine.postMessage(a.actor, poolId, '周六六点')
      await ctx.engine.submitPlan(a.actor, poolId, {
        title: '周六爬野线',
        startsAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
        meetAt: '北宫门',
      })
      board = await ctx.engine.poolBoard(a.actor, poolId)
      expect(board.settled.some((x) => x.includes('集合'))).toBe(true)
      expect(board.nextStep).toContain('确认')
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('当天状态与提醒', () => {
  it('轻量状态可写可改，且只能改自己那份', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)
      await ctx.engine.replyToInvite(b.actor, poolId, 'join')

      await ctx.engine.setDayStatus(a.actor, poolId, 'ready')
      await ctx.engine.setDayStatus(a.actor, poolId, 'departed', '路上堵车')

      const rows = await ctx.sql<{ status: string; note: string | null }[]>`
        select status::text, note from participant_status
        where pool_id = ${poolId} and person_id = ${a.personId}
      `
      expect(rows[0]?.status).toBe('departed')
      expect(rows[0]?.note).toBe('路上堵车')

      // 冒充别人写状态：RLS 的 with check 拦住
      await expect(
        ctx.sql.begin(async (tx) => {
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.actor.authUserId })}, true)`
          await tx`select set_config('role', 'authenticated', true)`
          return tx`
            insert into participant_status (pool_id, person_id, status)
            values (${poolId}, ${b.personId}, 'arrived')
          `
        }),
      ).rejects.toThrow(/row-level security/)
    } finally {
      await ctx.cleanup()
    }
  })

  it('提醒只在花苞之后触发，且每种只发一次', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await pooledPair(ctx)
      await ctx.engine.replyToInvite(b.actor, poolId, 'join')
      await ctx.engine.postMessage(a.actor, poolId, '周六六点')

      // 计划提交但没全员确认 → 还不是花苞 → 不该有提醒
      await ctx.engine.submitPlan(a.actor, poolId, {
        title: '爬野线',
        startsAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
        meetAt: '北宫门',
      })
      let due = await ctx.engine.dueReminders()
      expect(due.some((r) => r.poolId === poolId)).toBe(false)

      await ctx.engine.confirmPlan(a.actor, poolId)
      await ctx.engine.confirmPlan(b.actor, poolId)

      due = await ctx.engine.dueReminders()
      const mine = due.filter((r) => r.poolId === poolId)
      expect(mine.length).toBeGreaterThan(0)

      await ctx.engine.deliverReminder(mine[0]!)
      const after = await ctx.engine.dueReminders()
      // 重复提醒比不提醒更让人想直接关掉通知
      expect(after.some((r) => r.poolId === poolId && r.kind === mine[0]!.kind)).toBe(false)

      const timeline = await ctx.engine.poolTimeline(a.actor, poolId)
      const card = timeline.filter((e) => e.kind === 'card').at(-1)
      expect(card?.actorId).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  })
})
