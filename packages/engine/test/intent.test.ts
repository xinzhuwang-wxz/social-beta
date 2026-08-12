import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './harness'

/**
 * S2 · 发意图 → 意图广场的验收。
 *
 * 广场是 T0 冷启动期的产品形态本身：没有匹配数据时主打人肉浏览，
 * 而不是给一个空推荐位假装智能。所以这些测试守的是「零历史用户也能用」。
 */

let ctx: TestContext

beforeAll(async () => {
  ctx = await createTestContext()
})

afterAll(async () => {
  await ctx?.cleanup()
})

describe('发意图', () => {
  it('一句人话即可发布，抽出结构化槽位并落库', async () => {
    const { actor } = await ctx.makePerson('发意图的人')

    const intent = await ctx.engine.publishIntent(actor, '周六想去爬山，最好野线，能拍照的加分')

    expect(intent.id).toBeTruthy()
    expect(intent.rawText).toBe('周六想去爬山，最好野线，能拍照的加分')
    // domain 必须落在固定枚举内 —— 模型自由发挥会让 facet 分片失控
    expect(['travel', 'sport']).toContain(intent.domain)
    expect(intent.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('时间是自由文本，不做区间解析（ADR-0002）', async () => {
    const { actor } = await ctx.makePerson()
    const intent = await ctx.engine.publishIntent(actor, '考完试之后想找人一起去看展')

    const slots = intent.slots as { when?: unknown }
    // 若有人把 when 改回结构化区间，这条会失败。
    // 「考完试之后」无法可靠落成区间，而误判的代价是把合适的人直接筛掉。
    expect(typeof slots.when === 'string' || slots.when === null).toBe(true)
  })

  it('空意图被拒绝，不产生半条记录', async () => {
    const { actor } = await ctx.makePerson()
    await expect(ctx.engine.publishIntent(actor, '   ')).rejects.toThrow(/不能为空/)
  })

  it('未建档的人不能发意图', async () => {
    await expect(
      ctx.engine.publishIntent({ authUserId: '00000000-0000-0000-0000-000000000000' }, '想爬山'),
    ).rejects.toThrow(/尚未建档/)
  })
})

describe('意图广场', () => {
  it('零历史的新用户也能看到同校区的意图 —— T0 阶段产品可用', async () => {
    const author = await ctx.makePerson('发布者')
    await ctx.engine.publishIntent(author.actor, '想找人一起打羽毛球，缺一个')

    // 全新用户，零池塘零画像
    const newcomer = await ctx.makePerson('刚注册的人')
    await expect(ctx.engine.myPools(newcomer.actor)).resolves.toEqual([])

    const board = await ctx.engine.board(newcomer.actor)
    expect(board.some((i) => i.rawText.includes('羽毛球'))).toBe(true)
  })

  it('跨校区看不到 —— 见面成本决定了匹配必须在同校区内', async () => {
    const other = await createTestContext()
    try {
      const outsider = await other.makePerson('外校的人')
      await other.engine.publishIntent(outsider.actor, '想去爬山找搭子')

      const local = await ctx.makePerson('本校的人')
      const board = await ctx.engine.board(local.actor)
      expect(board.some((i) => i.personId === outsider.personId)).toBe(false)
    } finally {
      await other.cleanup()
    }
  })

  it('过期意图不出现在广场，但本人仍看得到自己发过什么', async () => {
    const { actor, personId } = await ctx.makePerson()
    const intent = await ctx.engine.publishIntent(actor, '想找人一起自习')

    await ctx.sql`update intent set expires_at = now() - interval '1 hour' where id = ${intent.id}`

    const board = await ctx.engine.board(actor)
    expect(board.some((i) => i.id === intent.id)).toBe(false)

    const mine = await ctx.engine.myIntents(actor)
    expect(mine.some((i) => i.id === intent.id)).toBe(true)
    expect(mine[0]?.personId).toBe(personId)
  })

  it('按 domain 过滤', async () => {
    const { actor } = await ctx.makePerson()
    await ctx.engine.publishIntent(actor, '找人一起复习高数期末')

    const board = await ctx.engine.board(actor, { domain: 'study' })
    expect(board.every((i) => i.domain === 'study')).toBe(true)
  })
})
