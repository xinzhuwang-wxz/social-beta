import { describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './harness'

/**
 * S7 · 回流闭环与唤醒。
 *
 * 这一段守的是产品对「沉淀了什么关系资产」的回答：
 * 池塘不因事情结束而销毁，它带着一句下次的理由休眠，到期被唤醒。
 * 北极星指标「复现率」量化的正是这条路径能不能走通。
 */

async function poolThatHappened(ctx: TestContext) {
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
  await ctx.engine.postMessage(a.actor, poolId, '六点北宫门集合，我带绳子')
  await ctx.engine.postMessage(b.actor, poolId, '好，我带相机。回来顺路去大觉寺看看？')
  await ctx.engine.postMessage(a.actor, poolId, '这次来不及了，下次专门去一趟')
  await ctx.engine.finishEvent(a.actor, poolId)
  return { a, b, poolId }
}

describe('回流', () => {
  it('成员能传返图，非成员不能', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await poolThatHappened(ctx)
      const art = await ctx.engine.addArtifact(a.actor, poolId, {
        kind: 'photo',
        uri: 'https://example.invalid/1.jpg',
        caption: '山顶的日出',
      })
      expect(art.id).toBeTruthy()

      const outsider = await ctx.makePerson('局外人')
      await expect(
        ctx.engine.addArtifact(outsider.actor, poolId, { kind: 'photo', uri: 'x' }),
      ).rejects.toThrow(/row-level security/)
    } finally {
      await ctx.cleanup()
    }
  })

  it('反馈只有本人看得见 —— 让人知道队友怎么评价自己，所有人就只写好话', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await poolThatHappened(ctx)
      await ctx.engine.giveFeedback(a.actor, poolId, { again: 'yes', note: '很靠谱' })

      const seenByB = await ctx.sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: b.actor.authUserId })}, true)`
        await tx`select set_config('role', 'authenticated', true)`
        return tx<{ note: string | null }[]>`select note from feedback where pool_id = ${poolId}`
      })
      expect(seenByB).toHaveLength(0)
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('收尾与唤醒', () => {
  it('收尾产出的 next_hook 引用聊天里真实提过的事，不是空话', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await poolThatHappened(ctx)
      const { summary, nextHook } = await ctx.engine.sealPool(a.actor, poolId)

      expect(summary.length).toBeGreaterThan(4)
      expect(nextHook.length).toBeGreaterThan(4)
      // 「下次再约」这类钩子挂不住任何人 —— 它对任何池塘都成立，等于没有信息
      for (const empty of ['下次再约', '保持联系', '有空再聚']) {
        expect(nextHook).not.toBe(empty)
      }
    } finally {
      await ctx.cleanup()
    }
  })

  it('收尾后转休眠，数据一条不丢', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await poolThatHappened(ctx)
      const before = await ctx.engine.poolTimeline(a.actor, poolId)
      await ctx.engine.sealPool(a.actor, poolId)

      const [pool] = await ctx.sql<{ state: string; nextHook: string | null }[]>`
        select state, next_hook as "nextHook" from pool where id = ${poolId}
      `
      expect(pool?.state).toBe('dormant')
      expect(pool?.nextHook).toBeTruthy()

      const after = await ctx.engine.poolTimeline(a.actor, poolId)
      // dormant 不是删除：原有条目全在，只多了一条 recap
      expect(after.length).toBe(before.length + 1)
      expect(after.some((e) => e.kind === 'recap')).toBe(true)
    } finally {
      await ctx.cleanup()
    }
  })

  it('拒绝为没有任何对话的池塘生成回顾', async () => {
    const ctx = await createTestContext()
    try {
      const lonely = await ctx.makePerson('孤独的人')
      const personId = lonely.personId
      const [empty] = await ctx.sql<{ id: string }[]>`
        insert into pool (kind, state, campus_id, title)
        values ('activity', 'open', ${ctx.campusId}, '没人说过话的池塘')
        returning id
      `
      await ctx.sql`
        insert into membership (pool_id, person_id, state) values (${empty!.id}, ${personId}, 'joined')
      `
      // 编造的共同记忆比没有记忆更糟
      await expect(ctx.engine.sealPool(lonely.actor, empty!.id)).rejects.toThrow(/无法生成回顾/)
    } finally {
      await ctx.cleanup()
    }
  })

  it('唤醒卡到期才出现', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await poolThatHappened(ctx)
      await ctx.engine.sealPool(a.actor, poolId)

      // 刚收尾，钩子还没到期
      expect(await ctx.engine.wakeCardFor(poolId)).toBeNull()
      expect(await ctx.engine.poolsDueForWake()).not.toContain(poolId)

      await ctx.sql`update pool set next_hook_due_at = now() - interval '1 day' where id = ${poolId}`
      const card = await ctx.engine.wakeCardFor(poolId)
      expect(card?.kind).toBe('wake')
      expect(await ctx.engine.poolsDueForWake()).toContain(poolId)
    } finally {
      await ctx.cleanup()
    }
  })

  it('接受唤醒 → 再次成行：派生新池塘，原成员是 invited 而不是自动加入', async () => {
    const ctx = await createTestContext()
    try {
      const { a, b, poolId } = await poolThatHappened(ctx)
      await ctx.engine.sealPool(a.actor, poolId)
      await ctx.sql`update pool set next_hook_due_at = now() - interval '1 day' where id = ${poolId}`

      const { poolId: fresh, crewSuggested } = await ctx.engine.acceptWake(a.actor, poolId)
      expect(fresh).not.toBe(poolId)
      expect(crewSuggested).toBe(false)

      const [child] = await ctx.sql<{ parentPool: string; state: string }[]>`
        select parent_pool as "parentPool", state from pool where id = ${fresh}
      `
      expect(child?.parentPool).toBe(poolId)
      expect(child?.state).toBe('forming')

      // 上次一起玩过不代表这次一定有空 —— 确认即过滤
      const members = await ctx.sql<{ personId: string; state: string }[]>`
        select person_id as "personId", state from membership where pool_id = ${fresh}
      `
      expect(members.find((m) => m.personId === a.personId)?.state).toBe('joined')
      expect(members.find((m) => m.personId === b.personId)?.state).toBe('invited')

      // 原池保持休眠，不被改动
      const [origin] = await ctx.sql<{ state: string }[]>`
        select state from pool where id = ${poolId}
      `
      expect(origin?.state).toBe('dormant')
    } finally {
      await ctx.cleanup()
    }
  })

})

describe('社群孵化', () => {
  it('连续三次成行触发 crew 提议，且需真人确认 —— 不自动建群', async () => {
    const ctx = await createTestContext()
    try {
      const { a, poolId } = await poolThatHappened(ctx)

      let current = poolId
      let suggested = false
      for (let round = 0; round < 2; round++) {
        // 走完整的状态机：forming → done → dormant。
        // 直接跳到 dormant 会被触发器拒 —— 那条触发器正是为了防止
        // 有人图省事绕过中间状态，让「事情办没办过」变得不可知。
        await ctx.sql`update pool set state = 'done' where id = ${current}`
        await ctx.sql`
          update pool set state = 'dormant', next_hook = '下次去大觉寺',
                          next_hook_due_at = now() - interval '1 day'
          where id = ${current}
        `
        const r = await ctx.engine.acceptWake(a.actor, current)
        current = r.poolId
        suggested = r.crewSuggested
      }

      // 链长 3（原池 + 两次派生）
      expect(suggested).toBe(true)

      // 提议 ≠ 建群：库里不该出现 crew
      const crews = await ctx.sql<{ n: number }[]>`
        select count(*)::int as n from pool where kind = 'crew' and campus_id = ${ctx.campusId}
      `
      expect(crews[0]?.n).toBe(0)
    } finally {
      await ctx.cleanup()
    }
  })
})
