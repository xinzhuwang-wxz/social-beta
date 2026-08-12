import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './harness'

/**
 * 四条不可协商的人类决策权。
 *
 * 这些不是「目标」而是断言：违反即为缺陷。产品的整个立场建立在它们之上 ——
 * AI 只做预演，真人签字才生效。一旦某条被绕过，本产品就退化成
 * 「AI 替你社交」，而那正是它要否定的东西。
 *
 * 这个文件里的测试如果变红，不要改测试。
 */

let ctx: TestContext

beforeAll(async () => {
  ctx = await createTestContext()
})

afterAll(async () => {
  await ctx?.cleanup()
})

/** 造一对已完成预演的用户 */
async function preparePair(name = '搭子') {
  const seeker = await ctx.makePerson('发起者')
  const candidate = await ctx.makePerson(name)
  const mine = await ctx.engine.publishIntent(seeker.actor, '周六想去爬山，最好野线')
  const theirs = await ctx.engine.publishIntent(candidate.actor, '周末想徒步，走没开发的路线')
  const rehearsal = await ctx.engine.rehearseWith(seeker.actor, {
    seekerIntentId: mine.id,
    candidateIntentId: theirs.id,
  })
  return { seeker, candidate, rehearsal }
}

describe('红线一 · 连接对象由真人决定', () => {
  it('预演本身不创建任何池塘', async () => {
    const { seeker } = await preparePair()
    const pools = await ctx.engine.myPools(seeker.actor)
    // 预演跑完了，但没有真人点接管，就不该有池塘
    expect(pools).toEqual([])
  })

  it('只有真人调用 takeOver 才创建池塘', async () => {
    const { seeker, rehearsal } = await preparePair()
    const before = await ctx.sql<{ n: number }[]>`
      select count(*)::int as n from pool where campus_id = ${ctx.campusId}
    `
    await ctx.engine.takeOver(seeker.actor, {
      rehearsalId: rehearsal.rehearsalId,
      opening: '嗨，看到你也想走野线，周六一起？',
    })
    const after = await ctx.sql<{ n: number }[]>`
      select count(*)::int as n from pool where campus_id = ${ctx.campusId}
    `
    expect(after[0]!.n).toBe(before[0]!.n + 1)
  })

  it('不能接管别人的预演', async () => {
    const { rehearsal } = await preparePair()
    const stranger = await ctx.makePerson('无关的人')
    await expect(
      ctx.engine.takeOver(stranger.actor, { rehearsalId: rehearsal.rehearsalId, opening: '你好' }),
    ).rejects.toThrow(/无权接管/)
  })

  it('同一次预演不能被接管两次', async () => {
    const { seeker, rehearsal } = await preparePair()
    await ctx.engine.takeOver(seeker.actor, { rehearsalId: rehearsal.rehearsalId, opening: '一起？' })
    await expect(
      ctx.engine.takeOver(seeker.actor, { rehearsalId: rehearsal.rehearsalId, opening: '再来一次' }),
    ).rejects.toThrow(/已经接管过/)
  })
})

describe('红线二 · 表述方式由真人决定', () => {
  it('真人可以完全不用草稿，发自己写的话', async () => {
    const { seeker, rehearsal } = await preparePair()
    const mine = '我自己写的，跟草稿完全没关系'
    expect(mine).not.toBe(rehearsal.proposal.openingDraft)

    const { poolId } = await ctx.engine.takeOver(seeker.actor, {
      rehearsalId: rehearsal.rehearsalId,
      opening: mine,
    })
    const [ep] = await ctx.sql<{ summary: string }[]>`
      select summary from episode where pool_id = ${poolId} and kind = 'opening'
    `
    // 落库的是真人提交的内容，不是草稿
    expect(ep?.summary).toBe(mine)
  })

  it('空的第一句被拒绝 —— 不会用草稿替他补上', async () => {
    const { seeker, rehearsal } = await preparePair()
    await expect(
      ctx.engine.takeOver(seeker.actor, { rehearsalId: rehearsal.rehearsalId, opening: '   ' }),
    ).rejects.toThrow(/不能为空/)
  })
})

describe('红线三 · AI 永不代答', () => {
  it('ai_sent_message 恒为 0 —— 池塘里没有任何 actor 为空的发言', async () => {
    const { seeker, candidate, rehearsal } = await preparePair()
    const { poolId } = await ctx.engine.takeOver(seeker.actor, {
      rehearsalId: rehearsal.rehearsalId,
      opening: '周六一起走野线？',
    })
    await ctx.engine.confirmJoin(candidate.actor, poolId)

    const rows = await ctx.sql<{ n: number }[]>`
      select count(*)::int as n from episode
      where pool_id = ${poolId}
        and actor_id is null
        and kind in ('opening','message','joined','left')
    `
    // actor_id 为空表示这条由 Agent 产生。发言类 episode 里出现它，
    // 就意味着 AI 替某个真人说了话。
    expect(rows[0]!.n).toBe(0)
  })

  it('数据库层就拒绝「以精灵身份发言」和「冒充他人发言」', async () => {
    const { seeker, candidate, rehearsal } = await preparePair()
    const { poolId } = await ctx.engine.takeOver(seeker.actor, {
      rehearsalId: rehearsal.rehearsalId,
      opening: '一起吗',
    })
    await ctx.engine.confirmJoin(candidate.actor, poolId)

    const asSeeker = async (fn: (tx: typeof ctx.sql) => Promise<unknown>) =>
      ctx.sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: seeker.actor.authUserId })}, true)`
        await tx`select set_config('role', 'authenticated', true)`
        return fn(tx as typeof ctx.sql)
      })

    // actor_id 为空 = 以精灵身份发言
    await expect(
      asSeeker((tx) => tx`
        insert into episode (pool_id, kind, summary, actor_id)
        values (${poolId}, 'message', '我是 AI 替他说的', null)
      `),
    ).rejects.toThrow(/row-level security/)

    // 冒充另一个成员发言
    await expect(
      asSeeker((tx) => tx`
        insert into episode (pool_id, kind, summary, actor_id)
        values (${poolId}, 'message', '假装是他说的', ${candidate.personId})
      `),
    ).rejects.toThrow(/row-level security/)

    // 这条红线此前只由 TypeScript 保证 ——「引擎里不存在写空 actor 的路径」
    // 是关于我们没写那样的代码的断言，不是关于那样的写入不可能的保证。
  })

  it('被邀请者不确认，池塘就停在 forming，没有人替他答应', async () => {
    const { seeker, candidate, rehearsal } = await preparePair()
    const { poolId } = await ctx.engine.takeOver(seeker.actor, {
      rehearsalId: rehearsal.rehearsalId,
      opening: '一起吗',
    })

    const [m] = await ctx.sql<{ state: string }[]>`
      select state from membership
      where pool_id = ${poolId} and person_id = ${candidate.personId}
    `
    expect(m?.state).toBe('invited')

    // 被邀请者在确认前读不到池塘内容 ——
    // 否则任何人都能靠发邀请来窥探别人的对话
    const visible = await ctx.sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: candidate.actor.authUserId })}, true)`
      await tx`select set_config('role', 'authenticated', true)`
      return tx<{ id: string }[]>`select id from episode where pool_id = ${poolId}`
    })
    expect(visible).toHaveLength(0)
  })

  it('确认之后才读得到，且退出是正常流程', async () => {
    const { seeker, candidate, rehearsal } = await preparePair()
    const { poolId } = await ctx.engine.takeOver(seeker.actor, {
      rehearsalId: rehearsal.rehearsalId,
      opening: '一起吗',
    })
    await ctx.engine.confirmJoin(candidate.actor, poolId)

    const pools = await ctx.engine.myPools(candidate.actor)
    expect(pools.some((p) => p.id === poolId)).toBe(true)

    // 聊下来发现不合适再走，是正常的社交流程，不是异常
    await ctx.engine.leavePool(candidate.actor, poolId)
    const after = await ctx.engine.myPools(candidate.actor)
    expect(after.some((p) => p.id === poolId)).toBe(false)
  })
})

describe('红线四 · 记忆内容由真人掌控', () => {
  it('private 切面不进入可披露视图 —— 由 RLS 保证，不是靠 prompt', async () => {
    const owner = await ctx.makePerson('有私密切面的人')
    const viewer = await ctx.makePerson('看的人')

    await ctx.sql`
      insert into facet (person_id, domain, summary, visibility, n_pools)
      values
        (${owner.personId}, 'sport',  '常爬野线，带相机', 'campus',  3),
        (${owner.personId}, 'life',   '这条绝不能被别人看到', 'private', 2)
    `

    const seen = await ctx.sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: viewer.actor.authUserId })}, true)`
      await tx`select set_config('role', 'authenticated', true)`
      return tx<{ domain: string; summary: string }[]>`
        select domain, summary from facet where person_id = ${owner.personId}
      `
    })

    expect(seen.map((f) => f.domain)).toContain('sport')
    // 在 SQL 层就取不到 —— 泄漏在结构上不可能，而不是靠模型自觉
    expect(seen.map((f) => f.domain)).not.toContain('life')
    expect(JSON.stringify(seen)).not.toContain('绝不能被别人看到')
  })

  it('用户可以删除自己的画像条目', async () => {
    const { actor, personId } = await ctx.makePerson()
    await ctx.sql`
      insert into facet (person_id, domain, summary, n_pools)
      values (${personId}, 'sport', '系统蒸馏出来的描述', 2)
    `
    await ctx.sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor.authUserId })}, true)`
      await tx`select set_config('role', 'authenticated', true)`
      await tx`delete from facet where person_id = ${personId} and domain = 'sport'`
    })
    const left = await ctx.sql<{ n: number }[]>`
      select count(*)::int as n from facet where person_id = ${personId}
    `
    expect(left[0]!.n).toBe(0)
  })
})
