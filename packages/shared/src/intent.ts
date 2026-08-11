import { z } from 'zod'
import { Domain } from './domain.js'

/**
 * 意图槽位。由 LLM 从一句人话抽取，用户可当场逐项修正。
 *
 * hard / soft 的区分是匹配漏斗第一段的依据（PRD ID-4）：
 * hard 走 SQL 硬过滤（省钱、准确、零漏网），soft 走向量召回与重排。
 * 把这个判断交给抽取阶段，而不是让匹配器去猜哪些条件不可让步。
 */
export const SLOT_KEYS = ['when', 'where', 'size', 'level', 'vibe'] as const
export const SlotKey = z.enum(SLOT_KEYS)
export type SlotKey = z.infer<typeof SlotKey>

/** 时间窗。抽取器必须给出区间而非时刻 —— 「周六」是一天，不是某一秒。 */
export const TimeWindow = z.object({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  /** 原文表述，保留用于向用户回显「我理解成了……」 */
  raw: z.string().min(1),
})
export type TimeWindow = z.infer<typeof TimeWindow>

export const PartySize = z.object({
  min: z.number().int().min(2),
  max: z.number().int().min(2),
})
export type PartySize = z.infer<typeof PartySize>

export const IntentSlots = z.object({
  when: TimeWindow.nullable(),
  where: z.string().nullable(),
  size: PartySize.nullable(),
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
  /** 不可让步的槽位 → SQL 硬过滤 */
  hard: z.array(SlotKey),
  /** 可商量的槽位 → 向量 + 重排 */
  soft: z.array(SlotKey),
})
export type IntentExtraction = z.infer<typeof IntentExtraction>

/**
 * 每个 domain 的意图默认存活时长（小时）。
 *
 * 意图有 TTL、过期即死是短期记忆的核心机制（PRD ID-2）：
 * 只有成功落到池塘的意图才有资格进入长期记忆。
 * 没成行的想法不构成你是谁 —— 这既省钱，也更符合直觉。
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
