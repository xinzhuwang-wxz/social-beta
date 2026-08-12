import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // replay 模式下每条用例都在百毫秒级；这个超时是留给 record 模式的，
    // 那时一条用例可能要串行打好几次真实模型。
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // 每个测试用独立 campus 隔离，可并行
    pool: 'threads',
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
