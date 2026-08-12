import type { PoolState } from '@pool/shared'

/**
 * 生长阶段 —— 一件事在页面上长成什么样。
 *
 * 这一层只做一件事：把 `pool.state` 翻成一个形态。它是**纯映射**，
 * 不查库、不读时间线、不做业务推断。
 *
 * 为什么可以这么简单：`planned`（花苞）这一档补上之后，状态机本身
 * 已经把「一件事走到哪」表达完整了 —— 而在它补上之前，`forming`
 * 覆盖了从破冰到计划敲定的全过程，前端只好自己去翻时间线数票数，
 * 那既是把业务判断搬进表现层，也意味着列表页和房间页可能算出两个答案。
 *
 * 「已经定了什么 / 还没定什么 / 下一步」现在全部由
 * PoolEngine.poolBoard 给出，前端直接渲染，不再自己算一遍。
 */
export type GrowthStage =
  | 'seed' // 种子：还在土里
  | 'sprout' // 发芽：组队了，破土
  | 'sapling' // 树苗：在讨论
  | 'budding' // 花苞：计划被全员确认
  | 'blooming' // 开花：行动真实完成
  | 'fruiting' // 结果：带着下次的理由休眠

export const STAGE_LABEL: Record<GrowthStage, string> = {
  seed: '种子',
  sprout: '发芽',
  sapling: '树苗',
  budding: '花苞',
  blooming: '开花',
  fruiting: '结果',
}

/** 每个阶段「凭什么是这个阶段」。看板上直接展示，用户不用猜。 */
export const STAGE_MEANING: Record<GrowthStage, string> = {
  seed: '种下了，还没破土',
  sprout: '有人确认了，破土',
  sapling: '在把细节聊定',
  budding: '所有人都确认了计划',
  blooming: '这件事真的发生了',
  fruiting: '带着下次的理由睡着',
}

const BY_STATE: Record<PoolState, GrowthStage> = {
  open: 'seed',
  matching: 'seed',
  forming: 'sprout',
  active: 'sapling',
  planned: 'budding',
  done: 'blooming',
  // 休眠不是枯萎。行动没成可能来自客观原因，产品该鼓励重新计划，
  // 而不是拿一棵死树羞辱用户 —— 籽还在，随时能再种。
  dormant: 'fruiting',
}

export function stageOf(state: string): GrowthStage {
  return BY_STATE[state as PoolState] ?? 'seed'
}

export const STATE_LABEL: Record<PoolState, string> = {
  open: '待成行',
  matching: '匹配中',
  forming: '组队中',
  active: '讨论中',
  planned: '已定下',
  done: '已办完',
  dormant: '休眠中',
}

export function stateLabel(state: string): string {
  return STATE_LABEL[state as PoolState] ?? state
}
