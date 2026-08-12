import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // replay 模式下每条用例都在百毫秒级；这个超时是留给 record 模式的，
    // 那时一条用例可能要串行打好几次真实模型。
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // 每个测试用独立 campus 隔离，回放时可以放心并行。
    //
    // 但**录制时必须串行**：多个用例会同时录同一个 key（例如两条用例都跑预演），
    // 最后写入者赢，于是上游产物在各用例间不一致，下游 cassette 的 key 就散了 ——
    // 回放时只有一条能命中。这不是并发 bug，是录制这件事本身不能并发。
    pool: 'threads',
    fileParallelism: process.env['TEST_CASSETTE_MODE'] !== 'record',
    maxConcurrency: process.env['TEST_CASSETTE_MODE'] === 'record' ? 1 : 5,
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
