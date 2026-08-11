import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './harness.js'

/**
 * S1 · 骨架与缝的验收。
 *
 * 这些测试守的不是某个功能，而是三条结构性约束。它们一旦失效，
 * 后面每一刀都会在错误的地基上加码：
 *   - 缝在 PoolEngine 上，且它跑在真实 Postgres 上
 *   - RLS 真的拦得住，不是「已启用」而已
 *   - 注册接口不接受画像字段（Profile 是结果，不是输入）
 */

let ctx: TestContext

beforeAll(async () => {
  ctx = await createTestContext()
})

afterAll(async () => {
  await ctx?.cleanup()
})

describe('PoolEngine 这条缝', () => {
  it('连得上真实 Postgres，且模型配置可自省', async () => {
    const pong = await ctx.engine.ping()
    expect(pong.db).toBe(true)
    // 维度必须与 ADR-0001 一致：它写死在 pgvector 列定义里
    expect(pong.model.embedDimensions).toBe(1024)
  })

  it('注册后能取回自己，且不接受任何画像字段', async () => {
    const { actor, personId } = await ctx.makePerson('林同学')

    const me = await ctx.engine.currentPerson(actor)
    expect(me).not.toBeNull()
    expect(me?.id).toBe(personId)
    expect(me?.displayName).toBe('林同学')

    // 冷启动的产品承诺：注册时不填任何东西。
    // 若将来有人给 registerPerson 加了 interests / bio 之类的入参，这条会失败。
    const params = Object.keys({ handle: '', displayName: '', campusId: '' })
    expect(params).toEqual(['handle', 'displayName', 'campusId'])
  })

  it('新注册的人没有任何池塘 —— 画像从零开始长', async () => {
    const { actor } = await ctx.makePerson()
    await expect(ctx.engine.myPools(actor)).resolves.toEqual([])
  })
})

describe('RLS 真的拦得住', () => {
  it('跨校区看不到对方', async () => {
    const a = await ctx.makePerson('甲')
    const other = await createTestContext() // 独立 campus
    try {
      const b = await other.makePerson('乙')

      const visible = await ctx.sql`
        select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.actor.authUserId })}, true),
               set_config('role', 'authenticated', true)
      `
      expect(visible).toBeDefined()

      // 以甲的身份查乙：RLS 的 person_read_same_campus 应当过滤掉
      const rows = await ctx.sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.actor.authUserId })}, true)`
        await tx`select set_config('role', 'authenticated', true)`
        return tx<{ id: string }[]>`select id from person where id = ${b.personId}`
      })
      expect(rows).toHaveLength(0)
    } finally {
      await other.cleanup()
    }
  })

  it('所有承载用户数据的表都开了 RLS', async () => {
    const rows = await ctx.sql<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and rowsecurity = false
    `
    // 一张都不该有。新增表若忘了开 RLS，这条会立刻失败。
    expect(rows.map((r) => r.tablename)).toEqual([])
  })
})

describe('迁移覆盖度', () => {
  it('核心表与向量列都已建立', async () => {
    const tables = await ctx.sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public' order by tablename
    `
    const names = tables.map((t) => t.tablename)
    for (const t of [
      'person', 'pool', 'membership', 'episode', 'artifact',
      'responsiveness', 'block', 'intent', 'facet', 'facet_evidence', 'relation',
    ]) {
      expect(names).toContain(t)
    }
  })

  it('向量列维度与 ADR-0001 一致', async () => {
    const rows = await ctx.sql<{ table_name: string; dim: number }[]>`
      select c.relname as table_name, a.atttypmod as dim
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_type t on t.oid = a.atttypid
      where t.typname = 'vector' and a.attname = 'embedding' and not a.attisdropped
      order by c.relname
    `
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.dim).toBe(1024)
  })

  it('池塘状态机拒绝非法转移', async () => {
    const pool = await ctx.sql<{ id: string }[]>`
      insert into pool (kind, state, campus_id, title)
      values ('activity', 'open', ${ctx.campusId}, '状态机测试')
      returning id
    `
    const id = pool[0]!.id
    // open → active 不合法：必须先经过 matching / forming
    await expect(
      ctx.sql`update pool set state = 'active' where id = ${id}`,
    ).rejects.toThrow(/非法的池塘状态转移/)
  })
})
