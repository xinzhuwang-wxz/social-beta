import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PoolEngine } from '../src/index.js'
import { createTestContext, type TestContext } from './harness.js'

/**
 * 「注册不接受任何画像字段」是编译期不变量。
 * 给 registerPerson 加 interests / bio 之类的入参，这里就编译不过 ——
 * 比运行时断言可靠，因为它不依赖有人记得去跑那条测试。
 */
type RegisterInput = Parameters<PoolEngine['registerPerson']>[1]
const _noProfileFields: Record<keyof RegisterInput, true> = {
  handle: true,
  displayName: true,
  campusId: true,
}
void _noProfileFields

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

    // 「注册不接受画像字段」这条不变量属于编译期，见本文件顶部的 _noProfileFields。
    // 原先在这里就地造一个对象字面量再断言它自己的键 —— 给 registerPerson
    // 加 interests 参数根本不会让它失败，是一条什么都没验的测试。
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
