import { z } from 'zod'
import { PoolRole } from './domain.js'
import { TimeWindow } from './intent.js'

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
        when: TimeWindow.nullable(),
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
  suggestedWhen: TimeWindow.nullable(),
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
 * 介入触发器。只有这五种情形 Agent 才出面，其余一律沉默。
 *
 * 默认沉默是主路径而不是边缘情况 —— 测试里负例数量应显著多于正例。
 * 依据：CHI 2026 关于群聊中 agent 何时该发言的研究，
 * 结论是只在出现「协作断点」时介入，其余时刻的介入都是骚扰。
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
 * 介入决策。SILENT 是绝大多数情况下的正确答案。
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
