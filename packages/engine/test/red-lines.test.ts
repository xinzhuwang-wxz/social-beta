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

describe('越权：注释描述的约束必须真的存在', () => {
  it('非成员不能给别人的池塘收尾', async () => {
    const { seeker, candidate, rehearsal } = await preparePair()
    const { poolId } = await ctx.engine.takeOver(seeker.actor, {
      rehearsalId: rehearsal.rehearsalId,
      opening: '一起',
    })
    await ctx.engine.confirmJoin(candidate.actor, poolId)
    await ctx.engine.postMessage(seeker.actor, poolId, '几点')
    // 完成需要全员确认（S19）：两边都点了才真的转 done
    await ctx.engine.finishEvent(seeker.actor, poolId)
    await ctx.engine.finishEvent(candidate.actor, poolId)

    const outsider = await ctx.makePerson('局外人')
    // 收尾会触发真实模型调用并改写 next_hook 与状态。
    // 此前这条只有注释在描述，任何人拿到 uuid 就能对全站任意池塘触发。
    await expect(ctx.engine.sealPool(outsider.actor, poolId)).rejects.toThrow(/不是这个池塘的成员/)
  })

  it('非成员不能唤醒别人的休眠池塘', async () => {
    const { seeker, candidate, rehearsal } = await preparePair()
    const { poolId } = await ctx.engine.takeOver(seeker.actor, {
      rehearsalId: rehearsal.rehearsalId,
      opening: '一起',
    })
    await ctx.engine.confirmJoin(candidate.actor, poolId)
    await ctx.engine.postMessage(seeker.actor, poolId, '六点集合')
    // 完成需要全员确认（S19）：两边都点了才真的转 done
    await ctx.engine.finishEvent(seeker.actor, poolId)
    await ctx.engine.finishEvent(candidate.actor, poolId)
    await ctx.engine.sealPool(seeker.actor, poolId)
    await ctx.sql`update pool set next_hook_due_at = now() - interval '1 day' where id = ${poolId}`

    const outsider = await ctx.makePerson('局外人')
    // 此前陌生人可以派生新池并把原池全员写成 invited，
    // 而邀请标题正是 next_hook —— 池塘的私有内容被当推送外发。
    await expect(ctx.engine.acceptWake(outsider.actor, poolId)).rejects.toThrow(/不是它的成员/)
  })

  it('成行之后双方意图下架，不再被别人召回', async () => {
    const { seeker, rehearsal } = await preparePair()
    const before = await ctx.sql<{ n: number }[]>`
      select count(*)::int as n from intent where pool_id is not null and campus_id = ${ctx.campusId}
    `
    await ctx.engine.takeOver(seeker.actor, {
      rehearsalId: rehearsal.rehearsalId,
      opening: '一起',
    })
    const after = await ctx.sql<{ n: number }[]>`
      select count(*)::int as n from intent where pool_id is not null and campus_id = ${ctx.campusId}
    `
    // 不下架的话，已经组好队的人的意图仍挂在广场上、仍占别人的候选位
    expect(after[0]!.n).toBe(before[0]!.n + 2)
  })
})

describe('红线四 · 记忆内容由真人掌控', () => {
  it('我自己的 private 切面也不会进我自己 Agent 的嘴', async () => {
    const seeker = await ctx.makePerson('有私密切面的发起者')
    const candidate = await ctx.makePerson('候选人')

    const SECRET = '这段绝对不能出现在任何对外内容里'
    await ctx.sql`
      insert into facet (person_id, domain, summary, visibility, n_pools)
      values
        (${seeker.personId}, 'travel', '常走野线，习惯早出发', 'campus', 3),
        (${seeker.personId}, 'life',   ${SECRET}, 'private', 2)
    `

    const mine = await ctx.engine.publishIntent(seeker.actor, '周六想去爬山，最好野线')
    const theirs = await ctx.engine.publishIntent(candidate.actor, '周末想徒步，走没开发的路线')
    const r = await ctx.engine.rehearseWith(seeker.actor, {
      seekerIntentId: mine.id,
      candidateIntentId: theirs.id,
    })

    // 红线四此前只验了「我看候选人」那一侧。「我的 Agent 替我说」这一侧无人看守 ——
    // 而产品承诺的原文是「我的 AI 只带我授权可披露的切面去和对方 AI 交流」。
    const everything = JSON.stringify({ proposal: r.proposal, transcript: r.transcript })
    expect(everything).not.toContain(SECRET)
  })


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

/**
 * 建池路径的完备性。
 *
 * 红线一二说的是「真人决定连接对象、真人决定表述」。此前只有 takeOver 一条
 * 路径被守着 —— 但那是挑选制时代的唯一入口。投递制上线后 chooseCompanion
 * 也能建池，唤醒派生 acceptWake 也能建池，而它们当时没有任何红线断言。
 *
 * 一条红线只在它覆盖了**所有**入口时才成立。漏掉一个入口的红线不是红线，
 * 是一种关于我们记得住多少的乐观。这个 describe 的职责是：
 * 每当引擎里多出一条 `insert into pool`，这里就必须多一组断言。
 */
describe('红线一二 · 每一条建池路径都要真人签字', () => {
  it('引擎里创建 pool 的路径只有三条 —— 多出一条就要在这里补断言', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = join(import.meta.dirname, '../src')
    const sites: string[] = []
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8')
      for (const _ of src.matchAll(/insert\s+into\s+pool\s*\(/gi)) sites.push(f)
    }
    // takeover-service(接管) + pool-engine(投递选人、唤醒派生)
    expect(sites.sort()).toEqual(['pool-engine.ts', 'pool-engine.ts', 'takeover-service.ts'])
  })

  it('投递制选人：空的第一句话建不出池塘', async () => {
    const seeker = await ctx.makePerson('发起人')
    const other = await ctx.makePerson('候选')
    await ctx.engine.publishIntent(other.actor, '周末想找人一起打球')
    const seed = await ctx.engine.publishIntent(seeker.actor, '周末想打球，缺一个')
    await ctx.engine.deliverSeed(seeker.actor, seed.id)
    await ctx.engine.replyToSeed(other.actor, seed.id, true)

    // 空白开场白 —— 系统不替人开口
    await expect(
      ctx.engine.chooseCompanion(seeker.actor, seed.id, other.personId, '   '),
    ).rejects.toThrow(/第一句话不能为空/)

    const pools = await ctx.engine.myPools(seeker.actor)
    expect(pools).toEqual([])
  })

  it('投递制选人：开场白落库时署的是真人，不是系统', async () => {
    const seeker = await ctx.makePerson('发起人')
    const other = await ctx.makePerson('候选')
    await ctx.engine.publishIntent(other.actor, '想找人一起去看展')
    const seed = await ctx.engine.publishIntent(seeker.actor, '周日想去看展，有人一起吗')
    await ctx.engine.deliverSeed(seeker.actor, seed.id)
    await ctx.engine.replyToSeed(other.actor, seed.id, true)

    const { poolId } = await ctx.engine.chooseCompanion(
      seeker.actor,
      seed.id,
      other.personId,
      '周日下午两点美术馆门口？',
    )
    const [opening] = await ctx.sql<{ actorId: string | null; summary: string }[]>`
      select actor_id as "actorId", summary from episode
      where pool_id = ${poolId} and kind = 'opening'
    `
    // 红线三在这条路径上：第一句话必须有真人署名。
    // chooseCompanion 整段跑在 asSystem 里（要写别人的 membership），
    // RLS 的 with-check 拦不住它 —— 所以这条断言是这条路径唯一的守卫。
    expect(opening?.actorId).toBe(seeker.personId)
    expect(opening?.summary).toBe('周日下午两点美术馆门口？')
  })

  it('投递制选人：不能处置别人的种子', async () => {
    const seeker = await ctx.makePerson('发起人')
    const other = await ctx.makePerson('候选')
    const stranger = await ctx.makePerson('路人')
    await ctx.engine.publishIntent(other.actor, '想找人一起夜跑')
    const seed = await ctx.engine.publishIntent(seeker.actor, '想找人夜跑')
    await ctx.engine.deliverSeed(seeker.actor, seed.id)
    await ctx.engine.replyToSeed(other.actor, seed.id, true)

    await expect(
      ctx.engine.chooseCompanion(stranger.actor, seed.id, other.personId, '一起？'),
    ).rejects.toThrow(/无权/)
  })

  it('唤醒派生：非成员建不出派生池塘', async () => {
    const { seeker, candidate, rehearsal } = await preparePair()
    const stranger = await ctx.makePerson('路人')
    const { poolId } = await ctx.engine.takeOver(seeker.actor, {
      rehearsalId: rehearsal.rehearsalId,
      opening: '周六六点见？',
    })
    await ctx.engine.confirmJoin(candidate.actor, poolId)
    await ctx.engine.finishEvent(seeker.actor, poolId)
    await ctx.engine.finishEvent(candidate.actor, poolId)
    await ctx.engine.sealPool(seeker.actor, poolId)

    // next_hook 是池塘的私有内容。陌生人既不能据此建池，
    // 也不该借派生把私有约定当推送外发。
    await expect(ctx.engine.acceptWake(stranger.actor, poolId)).rejects.toThrow()
  })
})
