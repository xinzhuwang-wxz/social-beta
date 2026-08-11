import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 测试打真实 Postgres，单条用例可能等待模型录制，放宽超时
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 每个测试用独立 campus 隔离，可并行
    pool: 'threads',
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
