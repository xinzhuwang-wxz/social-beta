import { randomUUID } from 'node:crypto'
import { createDb, type Sql } from '@pool/db'
import { createModelGateway, type ModelGateway } from '@pool/model'
import { PoolEngine, type ActorContext } from '../src/index'

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

/**
 * 开跑前确认库是干净的。
 *
 * 意图默认是 open scope，而 open 跨校区可见 —— 所以库里任何一条别人的
 * 未过期意图都会进入本次测试的候选召回，改变终排 prompt，让 cassette
 * 打不中。那时的失败信息是「cassette 缺条目」，指向录制回放，
 * 而真正的原因是库里有别的数据。我自己被这条信息误导过一次。
 *
 * 与其让每个人各踩一遍，不如在这里把隐含假设说出来。
 *
 * **只在进程内第一次建 context 时查一次。** 跨校区的用例本来就要同时开
 * 两个 context（一个校区一个），第二个开的时候当然看得见第一个的意图 ——
 * 那是用例自己造的数据，不是污染。查一次就够：外部污染在开跑前就在那里，
 * 而用例造的数据只会在那之后出现。
 */
let pristineChecked = false

async function assertPristine(sql: Sql, myCampus: string): Promise<void> {
  if (pristineChecked) return
  pristineChecked = true

  const [row] = await sql<{ n: number; campuses: string[] }[]>`
    select count(*)::int as n, coalesce(array_agg(distinct campus_id), '{}') as campuses
    from intent
    where expires_at > now() and campus_id <> ${myCampus}
  `
  if (!row || row.n === 0) return
  throw new Error(
    `测试库里有 ${row.n} 条来自其他 campus 的未过期意图（${row.campuses.slice(0, 3).join(', ')}${
      row.campuses.length > 3 ? ' …' : ''
    }）。\n` +
      `  意图默认 open scope、跨校区可见，它们会进入候选召回并改变终排 prompt，\n` +
      `  症状会表现为「cassette 缺条目」—— 那是假象，真正的原因是库不干净。\n` +
      `  常见来源：pnpm simulate 正在跑，或上一次跑到一半被中断。\n` +
      `  处理：等模拟跑完，或执行 pnpm db:reset 后重跑（它自己会跑迁移）。`,
  )
}

export async function createTestContext(): Promise<TestContext> {
  const sql = createDb({ url: DATABASE_URL, max: 4 })
  const campusId = `test-${randomUUID().slice(0, 8)}`
  await assertPristine(sql, campusId)

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
      model: process.env['OLLAMA_EMBED_MODEL'] ?? 'bge-m3',
      dimensions: Number(process.env['EMBED_DIMENSIONS'] ?? 1024),
    },
    cassette: {
      // CI 默认 replay：缺条目直接抛错，绝不偷偷联网
      mode: (process.env['TEST_CASSETTE_MODE'] as 'record' | 'replay' | 'live') ?? 'replay',
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
