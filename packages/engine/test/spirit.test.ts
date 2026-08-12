import { describe, expect, it } from 'vitest'
import {
  FORMING_CARD_CAP,
  STALL_MINUTES,
  decideIntervention,
} from '../src/spirit-service'
import type { InterventionContext } from '@pool/shared'
import { createTestContext, type TestContext } from './harness'

/**
 * S5/S6 · 群聊与池塘精灵。
 *
 * 精灵的节奏按池塘状态分段（ADR-0004）。测试的正负例配比因此也分段：
 *   active  阶段 —— 沉默是主路径，负例必须显著多于正例
 *   forming 阶段 —— 主动是主路径，沉默反而是缺陷
 *
 * 这不是两套标准，是同一条标准在两个阶段的不同表现：
 * 「该出面时出面，不该出面时闭嘴」。全程沉默和全程话痨都违反它。
 */

const ctxOf = (over: Partial<InterventionContext> = {}): InterventionContext => ({
  poolState: 'active',
  minutesSinceLastMessage: 2,
  memberCount: 3,
  cardsSent: 0,
  ...over,
})

describe('介入决策 · active 阶段沉默是主路径', () => {
  // 大量负例：正常协作中的各种情形都不该被打扰
  const silentCases: [string, Partial<InterventionContext>][] = [
    ['刚说完话', { minutesSinceLastMessage: 0 }],
    ['一分钟前', { minutesSinceLastMessage: 1 }],
    ['五分钟前', { minutesSinceLastMessage: 5 }],
    ['十分钟前', { minutesSinceLastMessage: 10 }],
    ['二十分钟前', { minutesSinceLastMessage: 20 }],
    ['刚好没到阈值', { minutesSinceLastMessage: STALL_MINUTES - 1 }],
    ['两人小池塘刚聊过', { memberCount: 2, minutesSinceLastMessage: 3 }],
    ['大池塘刚聊过', { memberCount: 8, minutesSinceLastMessage: 4 }],
    ['已经发过卡但大家在聊', { cardsSent: 2, minutesSinceLastMessage: 2 }],
    ['发过很多卡且在聊', { cardsSent: 9, minutesSinceLastMessage: 1 }],
  ]

  for (const [name, over] of silentCases) {
    it(`沉默：${name}`, () => {
      expect(decideIntervention(ctxOf(over))).toEqual({ action: 'silent' })
    })
  }

  it('只有真的卡住了才出面', () => {
    expect(decideIntervention(ctxOf({ minutesSinceLastMessage: STALL_MINUTES }))).toBe('need_roster')
  })
})

describe('介入决策 · forming 阶段主动是主路径', () => {
  it('刚组队、还没发过卡 → 主动破冰，沉默在这里是失职', () => {
    const d = decideIntervention(ctxOf({ poolState: 'forming', cardsSent: 0 }))
    expect(d).toBe('need_icebreaker')
    expect(d).not.toEqual({ action: 'silent' })
  })

  it('刚组队且刚有人说过话，仍然主动 —— 破冰不看冷场时长', () => {
    // active 阶段这个输入会沉默。同样的转录，不同的池塘状态，不同的答案 ——
    // 这正是 InterventionContext 必须带池塘状态的理由。
    expect(decideIntervention(ctxOf({ poolState: 'forming', minutesSinceLastMessage: 0 }))).toBe(
      'need_icebreaker',
    )
    expect(decideIntervention(ctxOf({ poolState: 'active', minutesSinceLastMessage: 0 }))).toEqual({
      action: 'silent',
    })
  })

  it('破冰之后补角色清单', () => {
    expect(decideIntervention(ctxOf({ poolState: 'forming', cardsSent: 1 }))).toBe('need_roster')
  })

  it('主动有上限 —— 发完就等，不追问不催促', () => {
    expect(decideIntervention(ctxOf({ poolState: 'forming', cardsSent: FORMING_CARD_CAP }))).toEqual({
      action: 'silent',
    })
    expect(
      decideIntervention(ctxOf({ poolState: 'forming', cardsSent: FORMING_CARD_CAP + 5 })),
    ).toEqual({ action: 'silent' })
  })
})

describe('介入决策 · 其余状态不走实时路径', () => {
  for (const state of ['open', 'matching', 'done', 'dormant'] as const) {
    it(`沉默：${state}（回流卡与唤醒卡由各自时机触发）`, () => {
      expect(decideIntervention(ctxOf({ poolState: state }))).toEqual({ action: 'silent' })
    })
  }
})

describe('群聊', () => {
  async function poolWithTwo(ctx: TestContext) {
    const a = await ctx.makePerson('甲')
    const b = await ctx.makePerson('乙')
    const ia = await ctx.engine.publishIntent(a.actor, '周六想去爬山，最好野线')
    const ib = await ctx.engine.publishIntent(b.actor, '周末想徒步，走没开发的路线')
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

  it('成员能发消息，时间线按序展示，人与精灵一眼可分', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await poolWithTwo(ctx)
      await ctx.engine.postMessage(a.actor, poolId, '几点集合？')
      await ctx.engine.postMessage(b.actor, poolId, '六点行吗')

      const timeline = await ctx.engine.poolTimeline(a.actor, poolId)
      const msgs = timeline.filter((e) => e.kind === 'message')
      expect(msgs.map((m) => m.summary)).toEqual(['几点集合？', '六点行吗'])
      // 人的条目一定有 actorName；精灵的条目一定没有
      expect(msgs.every((m) => m.actorName !== null)).toBe(true)
    } finally {
      await ctx.cleanup()
    }
  })

  it('非成员发不了消息', async () => {
    const ctx = await createTestContext()
    try {
      const { poolId } = await poolWithTwo(ctx)
      const outsider = await ctx.makePerson('局外人')
      await expect(ctx.engine.postMessage(outsider.actor, poolId, '我也来')).rejects.toThrow(
        /不是这个池塘的成员/,
      )
    } finally {
      await ctx.cleanup()
    }
  })

  it('精灵在 forming 阶段主动发卡，且卡不是发言', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await poolWithTwo(ctx)
      const decision = await ctx.engine.tickSpirit(poolId)
      expect(decision.action).toBe('card')

      const timeline = await ctx.engine.poolTimeline(a.actor, poolId)
      const cards = timeline.filter((e) => e.kind === 'card')
      expect(cards.length).toBe(1)
      // 精灵的产物 actor_id 为空 —— 这是它与人的发言在数据上的分界，
      // 也是 ai_sent_message 计数不会把它算进去的原因
      expect(cards[0]?.actorId).toBeNull()
      expect(timeline.filter((e) => e.kind === 'message' && e.actorId === null)).toHaveLength(0)
    } finally {
      await ctx.cleanup()
    }
  })

  it('点卡片直接写回事件流，不经二次 LLM 解析', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await poolWithTwo(ctx)
      await ctx.engine.tickSpirit(poolId)
      const timeline = await ctx.engine.poolTimeline(a.actor, poolId)
      const card = timeline.find((e) => e.kind === 'card')!

      await ctx.engine.tapCard(a.actor, poolId, card.id, 't1')
      const after = await ctx.engine.poolTimeline(a.actor, poolId)
      const tap = after.find((e) => e.kind === 'tap')
      expect(tap?.summary).toBe('t1')
      expect(tap?.actorId).toBe(a.personId)
    } finally {
      await ctx.cleanup()
    }
  })
})
