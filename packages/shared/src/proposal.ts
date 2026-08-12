import { z } from 'zod'
import { Domain, PoolRole, Visibility } from './domain'

/**
 * 可披露切面 —— Agent 在预演中能看到的全部内容。
 *
 * 关键：这个对象由数据库 RLS 依据 facet.visibility + 关系温度裁剪后产出，
 * 不是在 prompt 里叮嘱 Agent「别说私密信息」（PRD ID-5）。
 * private 切面在 SQL 层就取不到，所以泄漏在结构上不可能，而不是靠模型自觉。
 */
export const DisclosureProfile = z.object({
  personId: z.uuid(),
  displayName: z.string(),
  /** 只含通过可见度检查的切面 */
  facets: z.array(
    z.object({
      domain: Domain,
      summary: z.string(),
      roles: z.array(PoolRole),
      /** 支撑证据量 —— 少量样本得出的画像不该被当成事实 */
      nPools: z.number().int().nonnegative(),
      visibility: Visibility,
    }),
  ),
})
export type DisclosureProfile = z.infer<typeof DisclosureProfile>

/**
 * 预演中的单条消息。
 *
 * 字段刻意对齐 A2A 协议的 Message / Part 结构（PRD ID-5）：
 * 我们现在不实现 A2A（它解决跨组织 agent 互操作，而我们是同进程两个自家 agent），
 * 但将来若要与多闪「崽崽」或第三方校园服务 agent 互通，包一层 adapter 即可，
 * 不用重构。零成本买一个期权。
 */
export const RehearsalMessage = z.object({
  role: z.enum(['agent_a', 'agent_b']),
  parts: z.array(z.object({ kind: z.literal('text'), text: z.string() })),
})
export type RehearsalMessage = z.infer<typeof RehearsalMessage>

/** 预演轮次上限。封闭式，不是开放对话。 */
export const MAX_REHEARSAL_TURNS = 6

/**
 * 提案卡 —— 预演的唯一产物，形状恒定。
 *
 * 用结构化输出把 schema 钉死，比在开放式多轮里往回加约束更可靠。
 * 注意 openingDraft 是「草稿」不是「消息」：AI 永不代答（PRD ID-7），
 * 它必须经过真人签字才可能被发出去。
 */
export const ProposalCard = z.object({
  /** 恰好 3 条共同话题 —— 少了不够聊，多了就成了信息倾倒 */
  sharedTopics: z.array(z.string().min(1)).length(3),
  /**
   * 恰好 1 个具体行动提案。必须说清做什么、大概什么时候、在哪 ——
   * 「你们可以聊聊」不算提案，认识要能直接推向做事。
   *
   * when 是自由文本（「这周六上午」），不是可解析的时间区间：
   * 提案是给人看的起点，不是给系统算的约束。具体几点由他们自己聊定。
   */
  actionProposal: z.object({
    what: z.string().min(1),
    when: z.string().min(1),
    where: z.string().min(1),
    /** 一句话说明这个提案为什么对双方都成立 */
    rationale: z.string().min(1),
  }),
  /** 恰好 1 条风险提示，如「他周六下午有课，需早回」 */
  riskNote: z.string().min(1),
  /** 开场白草稿。真人可直接用、可改、可完全弃用自己写。 */
  openingDraft: z.string().min(1),
})
export type ProposalCard = z.infer<typeof ProposalCard>

/** 候选卡 —— 匹配漏斗的终产物，一次 3~5 张。 */
export const CandidateCard = z.object({
  personId: z.uuid(),
  displayName: z.string(),
  /** 「为什么是他」，必须可核验地引用对方干过的事，不能是模板句 */
  reason: z.string().min(1),
  /** 打分明细，用于调试与线上归因，不直接展示给用户 */
  score: z.object({
    total: z.number(),
    intent: z.number(),
    facet: z.number(),
    complementarity: z.number(),
    social: z.number(),
    responsiveness: z.number(),
    penalty: z.number(),
  }),
  proposal: ProposalCard.nullable(),
})
export type CandidateCard = z.infer<typeof CandidateCard>

export const MIN_CANDIDATES = 3
export const MAX_CANDIDATES = 5
