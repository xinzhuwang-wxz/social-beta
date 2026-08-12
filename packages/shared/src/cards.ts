import { z } from 'zod'
import { PoolRole, PoolState } from './domain'

/**
 * Agent 在池塘里的介入产物。
 *
 * 介入形式不是「说话」而是「发卡」（PRD ID-6）：卡片是结构化的，
 * 点击行为直接写回 episode，不需要二次 LLM 解析 —— 既省钱又准确，
 * 且不抢占用户之间的互动空间。
 */

/** 决策卡：时间/地点出现 ≥2 个未收敛提案时，一键投票收敛。 */
export const DecisionCard = z.object({
  kind: z.literal('decision'),
  question: z.string().min(1),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        // 时间是给人看的提示，不是可解析的约束
        whenHint: z.string().nullable(),
      }),
    )
    .min(2),
})

/** 清单卡：显示角色缺口，让人知道自己能补哪个位置。 */
export const RosterCard = z.object({
  kind: z.literal('roster'),
  slots: z
    .array(
      z.object({
        role: PoolRole,
        needed: z.number().int().positive(),
        takenBy: z.array(z.object({ personId: z.uuid(), displayName: z.string() })),
      }),
    )
    .min(1),
})

/** 回流卡：事件结束但零 artifact 时，索要返图。 */
export const RecapCard = z.object({
  kind: z.literal('recap'),
  prompt: z.string().min(1),
  /** 是否顺带提议生成共同海报 */
  offerPoster: z.boolean(),
})

/** 唤醒卡：池塘休眠且 next_hook 到期时，把上次的约定端出来。 */
export const WakeCard = z.object({
  kind: z.literal('wake'),
  /** 必须引用上次约定的具体内容，不能是「好久没聚了」这种空话 */
  hook: z.string().min(1),
  suggestedWhen: z.string().nullable(),
})

/** 新成员摘要卡：让人不用爬三百条聊天记录。 */
export const CatchUpCard = z.object({
  kind: z.literal('catchup'),
  summary: z.string().min(1),
})

export const AgentCard = z.discriminatedUnion('kind', [
  DecisionCard,
  RosterCard,
  RecapCard,
  WakeCard,
  CatchUpCard,
])
export type AgentCard = z.infer<typeof AgentCard>

/**
 * 介入触发器。
 *
 * 精灵的节奏按池塘状态分段（ADR-0004），不是全程统一沉默：
 *
 *   forming 刚组队 —— 主动：破冰话题卡、角色清单卡、未收敛项的决策卡
 *   active  事情定了 —— 沉默为主：仅 stall / undecided / newcomer 三个断点
 *   done    事件结束 —— 主动一次：回流卡
 *   dormant 休眠     —— 主动一次：唤醒卡
 *
 * 原设计是全程默认沉默，依据是 CHI 2026 关于群聊 agent 何时发言的研究。
 * 但那条结论针对的是已在正常运转的群聊，没覆盖「刚把五个陌生人凑到一起」——
 * 那时没人说话不是正常协作，恰恰是破冰失败，而破冰失败正是本产品要解决的痛点。
 */
export const InterventionTrigger = z.enum([
  'stall', // 冷场且关键槽位未定
  'undecided', // 出现 ≥2 个未收敛提案
  'newcomer', // 新成员入池且无人 onboard
  'no_recap', // 事件结束但零 artifact
  'hook_due', // 休眠池塘的 next_hook 到期
])
export type InterventionTrigger = z.infer<typeof InterventionTrigger>

/**
 * 介入决策的入参。
 *
 * 必须含池塘状态：同样一段「二十分钟没人说话」的转录，
 * 在 forming 阶段是破冰失败（该介入），在 active 阶段是大家各忙各的（该沉默）。
 * 只看转录内容的策略表达不出这个区别。
 */
export const InterventionContext = z.object({
  poolState: PoolState,
  /** 距上一条消息的分钟数 */
  minutesSinceLastMessage: z.number().nonnegative(),
  /**
   * 距上一张卡的分钟数。
   *
   * 没有这个字段时，active 阶段的冷场判定只看消息时钟，而卡片不重置那个时钟 ——
   * 于是一旦冷场超阈值，每刷新一次页面就多插一张卡，无上限。
   * 反指标「Agent 发言占比」会被自己刷爆。
   */
  minutesSinceLastCard: z.number().nonnegative(),
  memberCount: z.number().int().positive(),
  /** 本池塘已发出的卡片数，用于给 forming 阶段的主动性封顶 */
  cardsSent: z.number().int().nonnegative(),
})
export type InterventionContext = z.infer<typeof InterventionContext>

/**
 * 介入决策。
 *
 * 注意这个类型的形状：silent 分支不携带任何数据。
 * 「不说话」不需要理由字段 —— 一旦给它加上 reason，
 * 就会诱导实现去为沉默编造解释，进而诱导它少沉默。
 */
export const InterventionDecision = z.discriminatedUnion('action', [
  z.object({ action: z.literal('silent') }),
  z.object({
    action: z.literal('card'),
    trigger: InterventionTrigger,
    card: AgentCard,
  }),
])
export type InterventionDecision = z.infer<typeof InterventionDecision>

export const SILENT: InterventionDecision = { action: 'silent' }
