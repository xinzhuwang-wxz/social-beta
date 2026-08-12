import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './harness'

/**
 * S1 剩余两条验收标准要打的那条缝：真实登录 → 写 person、以及登录后首页
 * 「取 actor → 调 PoolEngine → 渲染」。
 *
 * 这里补的是 harness.makePerson()（注册即建档）没覆盖到的一个真实时刻：
 * Supabase Auth 已经建好 auth.users 行——用户点开魔法链接那一刻 GoTrue 就干了这件事——
 * 但这个人还没走完建档表单。apps/web 的 /home 页面靠 currentPerson 返回 null
 * 来判断「该送去 /onboarding 了」，这条必须真的是 null，不能是抛错，
 * 否则页面的重定向逻辑就是建立在一个没验证过的假设上。
 */

let ctx: TestContext

beforeAll(async () => {
  ctx = await createTestContext()
})

afterAll(async () => {
  await ctx?.cleanup()
})

describe('登录但未建档', () => {
  it('已有 auth.users 行、还没有 person 行时，currentPerson 返回 null 而不是抛错', async () => {
    // 手工模拟魔法链接刚点开、GoTrue 已经建好 auth.users、但用户还没提交建档表单的那一刻
    const authUserId = randomUUID()
    await ctx.sql`
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (${authUserId}, '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', ${`${authUserId}@test.local`}, now(), now())
    `
    try {
      const me = await ctx.engine.currentPerson({ authUserId })
      expect(me).toBeNull()
    } finally {
      await ctx.sql`delete from auth.users where id = ${authUserId}`
    }
  })

  it('建档后首页依赖的两条查询都能取到本人数据：有画像、无池塘', async () => {
    // 对应 apps/web/app/(app)/home/page.tsx 的整段实现：
    // 一次 currentPerson 取人，一次 myPools 取池塘列表，页面本身不夹带任何业务判断。
    const { actor } = await ctx.makePerson('新生')

    const me = await ctx.engine.currentPerson(actor)
    const pools = await ctx.engine.myPools(actor)

    expect(me).not.toBeNull()
    expect(me?.displayName).toBe('新生')
    expect(pools).toEqual([])
  })
})
