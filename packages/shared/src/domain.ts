import { z } from 'zod'

/**
 * 生活领域。Facet 按此分片，数量有界（PRD ID-3）。
 *
 * 这不是「兴趣标签」——用户永远不会看到这个列表并从中挑选。
 * 它是系统给池塘归类的内部维度，用于把 facet 的数量约束在常数级，
 * 并让检索时能按意图 domain 只取对应切面，而不是把整个人塞进 prompt。
 */
export const DOMAINS = [
  'sport', // 运动
  'study', // 学术
  'contest', // 竞赛
  'craft', // 手艺
  'show', // 演出
  'food', // 吃喝
  'travel', // 出行
  'game', // 游戏
  'volunteer', // 公益
  'career', // 求职
  'life', // 生活杂务
  'other', // 其他
] as const

export const Domain = z.enum(DOMAINS)
export type Domain = z.infer<typeof Domain>

export const DOMAIN_LABEL: Record<Domain, string> = {
  sport: '运动',
  study: '学术',
  contest: '竞赛',
  craft: '手艺',
  show: '演出',
  food: '吃喝',
  travel: '出行',
  game: '游戏',
  volunteer: '公益',
  career: '求职',
  life: '生活',
  other: '其他',
}

/**
 * 池塘种类。四种共用一张表、一套状态机（PRD ID-1）。
 *
 * dyad 退化后恰好是抖音小火人 —— 本模型是它的严格超集，不是另一个东西。
 *
 * ## 当前只有 activity 真正被创建
 *
 * `intent`：设计上保留，但意图阶段从一开始就走独立的 `intent` 表
 * （见 intent-service / 广场 `intent_read_board` 策略），不会、也不需要
 * 被写成一行 `pool`。`crew`、`dyad` 是 M6 才会落地的范围，目前全仓没有
 * 任何一条 `insert into pool` 会用到这两个值。别看到这三个枚举值就假设
 * 已经有对应的写路径或读策略在服务它们（S16 架构审查曾经因此在
 * `pool_read` 里留过一条永远不会被满足的策略分支，见对应 migration）——
 * 真正落地时，连同它们各自需要的写路径与 RLS 策略一起加。
 */
export const PoolKind = z.enum([
  'intent', // 意图池：还没成行（当前未被创建，见上）
  'activity', // 具体事件：已成行（当前唯一真正被创建的值）
  'crew', // 长期社群：从多次 activity 沉淀（M6 范围，当前未被创建）
  'dyad', // 双人关系池：小火人的载体（M6 范围，当前未被创建）
])
export type PoolKind = z.infer<typeof PoolKind>

/**
 * 池塘状态机。
 *
 * dormant 不是终态 —— 池塘持有 next_hook，到期可被唤醒并派生新池塘。
 * 关系资产不因一次事件结束而销毁，这是「沉淀了什么」的直接答案。
 */
export const PoolState = z.enum([
  'open',
  'matching',
  'forming',
  'active',
  // 花苞：计划已被全员确认，等待行动。
  // 缺了这一档，「计划确定」和「事情办完」在数据上是同一件事，
  // 于是提醒该在什么时候发、当天状态从什么时候开始，都无从判断。
  'planned',
  'done',
  'dormant',
])
export type PoolState = z.infer<typeof PoolState>

/** 合法的状态转移。非法转移必须被拒绝，不是靠调用方自觉。 */
export const POOL_TRANSITIONS: Record<PoolState, readonly PoolState[]> = {
  open: ['matching', 'done'],
  matching: ['forming', 'open', 'done'],
  forming: ['active', 'planned', 'done'],
  active: ['planned', 'done'],
  // 花苞可以退回生长：有人退出、计划有变，都该允许回到讨论
  planned: ['active', 'done'],
  done: ['dormant'],
  dormant: ['matching'], // 唤醒 → 派生新池塘走 matching
}

export function canTransition(from: PoolState, to: PoolState): boolean {
  return POOL_TRANSITIONS[from].includes(to)
}

/**
 * 切面可见度。用户逐切面自控（PRD ID-3 / ID-7 第四条）。
 *
 * 这个值在 RLS 策略里被消费，不在 prompt 里被消费 ——
 * prompt 里的约束是建议，数据库里的约束才是保证。
 */
export const Visibility = z.enum([
  'public', // 任何人
  'campus', // 同校区
  'warm', // 关系温度达阈值
  'private', // 仅自己，Agent 也取不到
])
export type Visibility = z.infer<typeof Visibility>

/**
 * 池塘内角色。互补性打分的来源（PRD ID-4）。
 *
 * 爬山队不需要五个都想带路的人 —— 纯 embedding 相似度做不到这件事。
 */
export const PoolRole = z.enum([
  'initiator', // 发起人
  'guide', // 带路 / 懂行
  'shooter', // 摄影 / 记录
  'logistics', // 后勤 / 张罗
  'participant', // 单纯参与
])
export type PoolRole = z.infer<typeof PoolRole>
