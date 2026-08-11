import { randomUUID } from 'node:crypto'
import { createDb, type Sql } from '@pool/db'
import { createModelGateway, type ModelGateway } from '@pool/model'
import { PoolEngine, type ActorContext } from '../src/index.js'

/**
 * 测试 harness。
 *
 * 两条原则，都是刻意的：
 *
 * 1. **跑在真实 Postgres 上。** 不用内存库、不 mock repo。
 *    匹配、蒸馏、RLS 全都依赖真实的语料状态与策略求值 ——
 *    mock 掉数据访问层，测的就是 mock 而不是产品。
 *    RLS 尤其如此：它是隐私边界的实现，只有真库能验证它真的拦住了。
 *
 * 2. **模型侧用录制回放，不手写假响应。** 手写假响应会悄悄编码
 *    「我以为模型会这么答」，于是测试验证的是想象而非真实行为。
 *
 * 每个测试拿到独立的 campus 与 auth 用户，互不干扰，可并行。
 */

export interface TestContext {
  engine: PoolEngine
  sql: Sql
  model: ModelGateway
  /** 本测试专属校区，保证跨测试数据隔离（campus 是硬隔离的第一道墙） */
  campusId: string
  /** 造一个已注册的人，返回其 actor 上下文 */
  makePerson(name?: string): Promise<{ actor: ActorContext; personId: string; handle: string }>
  cleanup(): Promise<void>
}

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export async function createTestContext(): Promise<TestContext> {
  const sql = createDb({ url: DATABASE_URL, max: 4 })
  const campusId = `test-${randomUUID().slice(0, 8)}`

  const model = createModelGateway({
    ark: {
      apiKey: process.env['ARK_API_KEY'] ?? 'replay-mode-no-key-needed',
      baseUrl: process.env['ARK_BASE_URL'] ?? 'https://ark.cn-beijing.volces.com/api/v3',
      cheapModel: process.env['ARK_CHAT_MODEL'] ?? 'doubao-seed-2-0-mini-260428',
      strongModel: process.env['ARK_CHAT_MODEL_STRONG'] ?? 'doubao-seed-2-0-lite-260428',
      imageModel: process.env['ARK_IMAGE_MODEL'] ?? 'doubao-seedream-4-0-250828',
    },
    ollama: {
      baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434',
      model: process.env['OLLAMA_EMBED_MODEL'] ?? 'paraphrase-multilingual',
      dimensions: Number(process.env['EMBED_DIMENSIONS'] ?? 768),
    },
    cassette: {
      // CI 默认 replay：缺条目直接抛错，绝不偷偷联网
      mode: (process.env['MODEL_CASSETTE_MODE'] as 'record' | 'replay' | 'live') ?? 'replay',
      dir: process.env['MODEL_CASSETTE_DIR'] ?? 'test/cassettes',
    },
  })

  const engine = new PoolEngine({ sql, model })
  const createdAuthUsers: string[] = []

  return {
    engine,
    sql,
    model,
    campusId,

    async makePerson(name = '同学') {
      // 直接建 auth.users：测试不走注册 UI，但必须走真实的外键与 RLS 主体
      const authUserId = randomUUID()
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
        values (${authUserId}, '00000000-0000-0000-0000-000000000000', 'authenticated',
                'authenticated', ${`${authUserId}@test.local`}, now(), now())
      `
      createdAuthUsers.push(authUserId)

      const handle = `t_${authUserId.slice(0, 8)}`
      const actor: ActorContext = { authUserId }
      const person = await engine.registerPerson(actor, {
        handle,
        displayName: name,
        campusId,
      })
      return { actor, personId: person.id, handle }
    },

    async cleanup() {
      // 级联删除会带走 person / membership / intent / facet 等全部关联行
      if (createdAuthUsers.length > 0) {
        await sql`delete from auth.users where id = any(${createdAuthUsers})`
      }
      await sql`delete from pool where campus_id = ${campusId}`
      await sql.end({ timeout: 5 })
    },
  }
}
