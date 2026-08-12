import type { PoolState } from '@pool/shared'

/**
 * 生长阶段 —— 一件事在页面上长成什么样。
 *
 * 规范定的七阶段梯子，尺寸必须明显拉开（S → XXL），
 * 不允许所有植物一样高：一排等高的植物读不出「谁走得更远」，
 * 那就等于把进度信息扔了。
 *
 *   seed      S    土里一颗籽
 *   sprout    S    两片子叶
 *   seedling  M    小苗
 *   growing   L    灌木
 *   bud       XL   小树 + 花苞
 *   bloom     XXL  成熟树 + 花
 *   fruit     XXL  成熟树 + 果与落籽
 */
export type GrowthStage =
  | 'seed'
  | 'sprout'
  | 'seedling'
  | 'growing'
  | 'bud'
  | 'bloom'
  | 'fruit'

export const STAGE_LABEL: Record<GrowthStage, string> = {
  seed: '种子',
  sprout: '发芽',
  seedling: '小苗',
  growing: '生长',
  bud: '花苞',
  bloom: '开花',
  fruit: '结果',
}

/**
 * 每个阶段「现在到底在发生什么」。
 *
 * 规范要求页面用文字说明当前状态，防止用户只看见动画、不知道自己在哪一步 ——
 * 所以这句话不是补充说明，它和植物是一对，哪儿画植物哪儿就得有它。
 */
export const STAGE_MEANING: Record<GrowthStage, string> = {
  seed: '种下了，还没破土',
  sprout: '有人回应了，刚破土',
  seedling: '正在确认时间地点',
  growing: '细节在一项项定下来',
  bud: '所有人都确认了计划，等着出发',
  bloom: '这件事真的发生了',
  fruit: '带着下次的理由歇着，籽还在',
}

/**
 * 状态 → 形态。纯映射，不查库、不读时间线。
 *
 * 目前产品的状态机能落到七档里的六档：`growing` 还没有对应的状态 ——
 * 「计划拟好了但还没全员确认」在 PRD v2 里才成为一个独立阶段。
 * 组件把七档都实现了，这里只绑已经存在的六档，
 * **不给还不存在的状态先画一个占位形态**。
 */
const BY_STATE: Record<PoolState, GrowthStage> = {
  open: 'seed',
  matching: 'seed',
  forming: 'sprout',
  active: 'seedling',
  planned: 'bud',
  done: 'bloom',
  // 休眠不画枯树。行动没成可能来自客观原因，产品该鼓励重新计划，
  // 而不是拿一棵死树羞辱用户 —— 籽还在，随时能再种。
  dormant: 'fruit',
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
  dormant: '歇着',
}

export function stateLabel(state: string): string {
  return STATE_LABEL[state as PoolState] ?? state
}
