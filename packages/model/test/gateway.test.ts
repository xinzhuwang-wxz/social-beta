import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createModelGateway, type ModelGateway } from '../src/index.js'

/**
 * ModelGateway 的真实调用验收。
 *
 * 默认以 replay 跑（读 cassette，不联网）。本地首次录制：
 *   MODEL_CASSETTE_MODE=record pnpm exec vitest run packages/model
 *
 * 录制用的是真实模型输出，不是我编的响应 —— 手写假响应会把
 * 「我以为模型会这么答」偷偷编码进测试，于是验证的是想象而非产品行为。
 */

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2] ?? ''
  }
}

function gateway(): ModelGateway {
  return createModelGateway({
    ark: {
      apiKey: process.env['ARK_API_KEY'] ?? 'replay',
      baseUrl: process.env['ARK_BASE_URL'] ?? 'https://ark.cn-beijing.volces.com/api/v3',
      cheapModel: process.env['ARK_CHAT_MODEL'] ?? 'doubao-seed-2-0-mini-260428',
      strongModel: process.env['ARK_CHAT_MODEL_STRONG'] ?? 'doubao-seed-2-0-lite-260428',
      imageModel: process.env['ARK_IMAGE_MODEL'] ?? 'doubao-seedream-4-0-250828',
    },
    ollama: {
      baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434',
      model: process.env['OLLAMA_EMBED_MODEL'] ?? 'bge-m3',
      dimensions: Number(process.env['EMBED_DIMENSIONS'] ?? 1024),
    },
    cassette: {
      mode: (process.env['MODEL_CASSETTE_MODE'] as 'record' | 'replay' | 'live') ?? 'replay',
      dir: process.env['MODEL_CASSETTE_DIR'] ?? 'test/cassettes',
    },
  })
}

describe('ModelGateway', () => {
  it('自省信息与 ADR-0001 一致', () => {
    const info = gateway().info
    expect(info.embedDimensions).toBe(1024)
    expect(info.embedModel).toBe('bge-m3')
    // 已实测不可用的模型不该出现在配置里
    expect(info.chatModel).not.toBe('doubao-seed-1-8')
  })

  it('结构化生成的产物由 schema 保证形状', async () => {
    const Slots = z.object({
      domain: z.string(),
      activity: z.string(),
      dayOfWeek: z.string(),
    })

    const result = await gateway().generate({
      task: 'test.slots',
      schema: Slots,
      system: '你从一句中文里抽取结构化信息。domain 用英文单词，activity 与 dayOfWeek 用中文。',
      user: '周六想去爬山，最好野线',
    })

    // 断言写在结构与不变量上，不写在文案上 —— 模型有随机性，措辞不该被钉死
    expect(Slots.safeParse(result).success).toBe(true)
    expect(result.dayOfWeek).toContain('六')
  })

  it('embedding 维度与配置相符，且中文语义可分', async () => {
    const [hike, trek, exam] = await gateway().embed([
      '周六想去爬山，最好野线',
      '周末一起徒步吗，走没开发的路线',
      '找人一起复习高数期末',
    ])

    expect(hike).toHaveLength(1024)

    const cos = (a: number[], b: number[]) => {
      let d = 0, na = 0, nb = 0
      for (let i = 0; i < a.length; i++) {
        d += a[i]! * b[i]!; na += a[i]! ** 2; nb += b[i]! ** 2
      }
      return d / (Math.sqrt(na) * Math.sqrt(nb))
    }

    // 这条守的是 ADR-0001 的结论：换了模型若中文区分度崩掉，这里立刻失败。
    // all-minilm 在此断言下会挂（它的无关句得分反而更高）。
    expect(cos(hike!, trek!)).toBeGreaterThan(cos(hike!, exam!) + 0.15)
  })

  it('schema 不符时重试，耗尽后抛错而非返回将就的对象', async () => {
    // 用一个恒假的 refine，而不是构造「模型应该答错」的提示词。
    // 这条测试要验的是我们的重试与抛错路径，不是模型的服从性 ——
    // 把断言建立在模型行为上，测试就会变成模型的抽奖。
    const NeverValid = z.object({ any: z.unknown() }).refine(() => false, '恒不通过')

    await expect(
      gateway().generate({
        task: 'test.never-valid',
        schema: NeverValid,
        system: '输出任意 JSON 对象。',
        user: '开始',
        retries: 1,
      }),
    ).rejects.toThrow(/不符合 schema/)
  })
})
