import { describe, expect, it } from 'vitest'
import { DAILY_EXPOSURE_CAP, stageFor } from '../src/matcher-service.js'
import { createTestContext, type TestContext } from './harness.js'

/**
 * S3 · 匹配四段漏斗的验收。
 *
 * 守三条：拉黑者绝不出现（安全）、曝光上限生效（防止热门用户被榨干）、
 * 越权访问被拒。匹配「准不准」不在这里断言 —— 那依赖模型，
 * 钉死措辞会让测试变成抽奖。
 *
 * ## 为什么每条用例都自己开 campus
 *
 * 终排的 prompt 里含渲染好的候选清单，而 cassette 按 payload 哈希取键。
 * 若多条用例共享 campus，某条用例的 cassette 键就编码了「在它之前跑过哪些用例」——
 * 之后任何一次插入或重排测试都会炸成一个看不懂的红灯。
 * 测试的不确定性来源要么消除，要么迟早变成偶发红灯。
 */

async function withCampus<T>(fn: (ctx: TestContext) => Promise<T>): Promise<T> {
  const ctx = await createTestContext()
  try {
    return await fn(ctx)
  } finally {
    await ctx.cleanup()
  }
}

describe('权重三段调度', () => {
  it('零池塘走 T0，此时不该凭空算社交邻近度', () => {
    expect(stageFor(0)).toBe('T0')
    expect(stageFor(1)).toBe('T1')
    expect(stageFor(3)).toBe('T1')
    expect(stageFor(4)).toBe('T2')
  })
})

describe('匹配漏斗', () => {
  it('能为一条意图找到候选，且理由不是把原文抄一遍', async () => {
    await withCampus(async (ctx) => {
      const seeker = await ctx.makePerson('找搭子的人')
      for (const [name, text] of [
        ['甲', '周末想去爬山，走野线那种'],
        ['乙', '想找人一起徒步，最好没开发过的路线'],
        ['丙', '找人一起复习高数'],
        ['丁', '想打羽毛球缺一个'],
      ] as const) {
        const p = await ctx.makePerson(name)
        await ctx.engine.publishIntent(p.actor, text)
      }

      const mine = await ctx.engine.publishIntent(seeker.actor, '周六想爬山，最好是野线')
      const candidates = await ctx.engine.refreshCandidates(seeker.actor, mine.id)

      expect(candidates.length).toBeGreaterThan(0)
      expect(candidates.length).toBeLessThanOrEqual(5)
      for (const c of candidates) {
        expect(c.reason.length).toBeGreaterThan(4)
        expect(c.reason).not.toBe(c.rawText)
      }
      expect(candidates.some((c) => c.personId === seeker.personId)).toBe(false)
    })
  })

  it('被拉黑者绝不出现 —— 双向', async () => {
    await withCampus(async (ctx) => {
      const seeker = await ctx.makePerson('拉黑的人')
      const blocked = await ctx.makePerson('被拉黑的人')
      await ctx.engine.publishIntent(blocked.actor, '周末想去爬山走野线')

      await ctx.sql`
        insert into block (blocker_id, blocked_id)
        values (${seeker.personId}, ${blocked.personId})
      `

      const mine = await ctx.engine.publishIntent(seeker.actor, '周六想爬山，最好是野线')
      const candidates = await ctx.engine.refreshCandidates(seeker.actor, mine.id)
      expect(candidates.some((c) => c.personId === blocked.personId)).toBe(false)

      // 反向也要拦住：被我拉黑的人也不该看到我
      const theirs = await ctx.engine.publishIntent(blocked.actor, '周六爬山野线找搭子')
      const reverse = await ctx.engine.refreshCandidates(blocked.actor, theirs.id)
      expect(reverse.some((c) => c.personId === seeker.personId)).toBe(false)
    })
  })

  it('达到每日曝光上限的人不再被推出去', async () => {
    await withCampus(async (ctx) => {
      const seeker = await ctx.makePerson('搜索者')
      const popular = await ctx.makePerson('热门用户')
      await ctx.engine.publishIntent(popular.actor, '周末爬山走野线，欢迎一起')

      // 唯一索引按 (seeker, shown, intent) 去重，所以造上限要用不同的 intent_id。
      // 这正好也证明了那条索引不会把真实的多次曝光误合并。
      const filler = await ctx.makePerson('陪跑的人')
      for (let i = 0; i < DAILY_EXPOSURE_CAP; i++) {
        const it = await ctx.sql<{ id: string }[]>`
          insert into intent (person_id, raw_text, domain, campus_id, expires_at)
          values (${filler.personId}, ${'占位' + i}, 'other', ${ctx.campusId}, now() + interval '1 day')
          returning id
        `
        await ctx.sql`
          insert into exposure (seeker_id, shown_person, intent_id)
          values (${seeker.personId}, ${popular.personId}, ${it[0]!.id})
        `
      }

      const mine = await ctx.engine.publishIntent(seeker.actor, '周六想爬山，野线')
      const candidates = await ctx.engine.refreshCandidates(seeker.actor, mine.id)
      expect(candidates.some((c) => c.personId === popular.personId)).toBe(false)
    })
  })

  it('不能拿别人的意图去探测全校区', async () => {
    await withCampus(async (ctx) => {
      const a = await ctx.makePerson('甲')
      const b = await ctx.makePerson('乙')
      const theirs = await ctx.engine.publishIntent(b.actor, '想找人一起吃饭')
      await expect(ctx.engine.refreshCandidates(a.actor, theirs.id)).rejects.toThrow(/无权/)
    })
  })

  it('跨校区的人不进入候选', async () => {
    await withCampus(async (ctx) => {
      const other = await createTestContext()
      try {
        const outsider = await other.makePerson('外校')
        await other.engine.publishIntent(outsider.actor, '周六爬山走野线找搭子')

        const local = await ctx.makePerson('本校')
        const mine = await ctx.engine.publishIntent(local.actor, '周六想爬山，野线')
        const candidates = await ctx.engine.refreshCandidates(local.actor, mine.id)
        expect(candidates.some((c) => c.personId === outsider.personId)).toBe(false)
      } finally {
        await other.cleanup()
      }
    })
  })

  it('校区里没有别人时返回空数组，不凑数', async () => {
    await withCampus(async (ctx) => {
      const lonely = await ctx.makePerson('校区里唯一的人')
      const mine = await ctx.engine.publishIntent(lonely.actor, '想找人一起研究量子计算')
      const candidates = await ctx.engine.refreshCandidates(lonely.actor, mine.id)
      // 凑数会让用户看到明显不合适的人，从而不再相信这份推荐
      expect(candidates).toEqual([])
    })
  })
})
