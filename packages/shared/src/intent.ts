import { z } from 'zod'
import { Domain } from './domain'

/**
 * 意图槽位。由 LLM 从一句人话抽取，用户可当场逐项修正。
 *
 * ## 为什么时间是自由文本而不是结构化时间窗
 *
 * 早期设计把 when 建模成 {start, end} 并据此做 SQL 硬过滤。已废弃，原因有二：
 *
 * 一是它解决的问题不存在。「确认加入」本身就是过滤器 —— 时间不合适的人不点确认，
 * 不需要系统替他判断。而且就算确认了也可能聊完发现不合适再退出，
 * 这本来就是正常的社交流程，不该在匹配阶段就假装能算准。
 *
 * 二是它带来的机制远比它省下的麻烦多：「周末」「下周有空的时候」「考完试」
 * 这类表述无法可靠地落成区间，时区、周期、模糊边界每一项都是坑，
 * 而误判的代价是把本来合适的人直接筛掉 —— 用户永远看不到，也无从申诉。
 *
 * 所以时间只作为语义信号参与排序与展示，不作为准入条件。
 * 真正的硬过滤只保留物理约束：同校区、未拉黑、未过期、非本人。
 */
export const IntentSlots = z.object({
  /** 时间的原文表述，如「周六」「这周末」「考完试之后」。不做区间解析。 */
  when: z.string().nullable(),
  where: z.string().nullable(),
  /** 期望人数的原文表述，如「三四个」「越多越好」。同样不做精确约束。 */
  size: z.string().nullable(),
  /** 强度 / 门槛，如「中等」「新手友好」 */
  level: z.string().nullable(),
  /** 风格偏好，如 ["野线", "摄影"] */
  vibe: z.array(z.string()).default([]),
})
export type IntentSlots = z.infer<typeof IntentSlots>

/**
 * 抽取结果。这是 ModelGateway 结构化输出的目标形状，
 * 由 zod 校验保证，而非靠解析自由文本。
 */
export const IntentExtraction = z.object({
  domain: Domain,
  slots: IntentSlots,
})
export type IntentExtraction = z.infer<typeof IntentExtraction>

/**
 * 每个 domain 的意图默认存活时长（小时）。
 *
 * 意图有 TTL、过期即死是短期记忆的核心机制：
 * 只有成功落到池塘的意图才有资格进入长期记忆。
 * 没成行的想法不构成你是谁 —— 这既省钱，也更符合直觉。
 *
 * 注意 TTL 是意图在广场上的存活时间，不是「活动必须在此之前发生」——
 * 后者又会滑回时间窗那套机制。
 */
export const DEFAULT_INTENT_TTL_HOURS: Record<Domain, number> = {
  sport: 72,
  study: 168,
  contest: 336,
  craft: 168,
  show: 168,
  food: 48,
  travel: 168,
  game: 24,
  volunteer: 168,
  career: 336,
  life: 48,
  other: 72,
}
