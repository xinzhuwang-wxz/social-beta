import postgres from 'postgres'

/**
 * 数据库连接。
 *
 * 这里不引 ORM：schema 的唯一真相源是 supabase/migrations 下的 SQL，
 * 再写一份 ORM schema 就是两处定义，必然漂移。类型由 `supabase gen types`
 * 从真实库结构生成 —— SQL 仍是唯一真相源，类型安全不打折。
 */
export type Sql = postgres.Sql<Record<string, never>>

export interface DbConfig {
  url: string
  max?: number
}

export function createDb(config: DbConfig): Sql {
  return postgres(config.url, {
    max: config.max ?? 10,
    // 向量列以 text 形态往返；驱动不认识 vector 类型，交给 SQL 侧转换
    transform: { undefined: null },
    onnotice: () => {},
  })
}

export function createDbFromEnv(): Sql {
  const url = process.env['DATABASE_URL']
  if (!url) {
    throw new Error(
      '缺少 DATABASE_URL。先 `pnpm db:start` 起本地 Supabase，再把 CLI 打印的连接串写入 .env.local。',
    )
  }
  return createDb({ url })
}

/**
 * pgvector 的字面量形式。驱动没有原生 vector 类型，必须以 '[1,2,3]' 文本传入
 * 并在 SQL 侧显式 ::vector 转换。
 *
 * 维度不在这里校验 —— 那是 ModelGateway 的职责（它知道模型实际输出多少维）。
 * 在两处都校验会让「维度从哪来」变得模糊。
 */
export function toVector(values: readonly number[]): string {
  return `[${values.join(',')}]`
}

/**
 * 以指定用户身份执行，使 RLS 策略生效。
 *
 * 这是本仓库访问用户数据的唯一正确方式。绕过它直连（service role）
 * 会跳过全部 RLS —— 而 RLS 正是隐私边界的实现，不是可选的加固。
 * 因此只有蒸馏、模拟这类明确的系统任务才允许用 service role，且必须显式声明。
 */
export async function asPerson<T>(
  sql: Sql,
  authUserId: string,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: authUserId })}, true)`
    await tx`select set_config('role', 'authenticated', true)`
    return fn(tx as Sql)
  }) as Promise<T>
}
