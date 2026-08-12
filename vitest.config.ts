import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // replay 模式下每条用例都在百毫秒级；这个超时是留给 record 模式的，
    // 那时一条用例可能要串行打好几次真实模型。
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // 全程串行。两个各自独立、都成立的理由：
    //
    // 一、录制不能并发。多个用例会同时录同一个 key（例如两条用例都跑预演），
    //    最后写入者赢，于是上游产物在各用例间不一致，下游 cassette 的 key 全散。
    //
    // 二、匹配现在是全局的（migration 0010：校区不再是硬墙，默认跨校可见），
    //    于是「每个用例一个 campus」不再构成隔离 —— 并行用例的意图会互相进入
    //    对方的召回集，改变候选顺序、改变 prompt、改变 cassette 键。
    //    这是产品语义的必然结果，不是测试写坏了。
    //
    // 代价可接受：回放模式下 89 条用例串行也只要几秒。
    pool: 'threads',
    fileParallelism: false,
    maxConcurrency: 1,
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
