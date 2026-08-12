import { createDbFromEnv } from '@pool/db'
import { PoolEngine } from '@pool/engine'
import { createModelGatewayFromEnv } from '@pool/model'

/**
 * PoolEngine 单例。
 *
 * Next.js dev 模式下模块会随每次热更新重新执行；若每次都 new 一个连接池，
 * postgres 连接会越攒越多直到打满 max_connections。挂在 globalThis 上跨热更新
 * 复用同一个实例——这是 Next.js 配长连接资源（Prisma 等）的标准写法。
 */
const globalForEngine = globalThis as unknown as { poolEngine?: PoolEngine }

export function getEngine(): PoolEngine {
  globalForEngine.poolEngine ??= new PoolEngine({
    sql: createDbFromEnv(),
    model: createModelGatewayFromEnv(),
  })
  return globalForEngine.poolEngine
}
