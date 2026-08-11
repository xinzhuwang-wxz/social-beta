import { z } from 'zod'
import { ArkClient, completeMessages, type ArkConfig } from './ark.js'
import { Cassette, type CassetteMode } from './cassette.js'
import { OllamaEmbedder, type OllamaConfig } from './ollama.js'
import {
  ModelGatewayError,
  type CompleteRequest,
  type GatewayInfo,
  type GenerateRequest,
  type ImageRequest,
  type ImageResult,
  type ModelGateway,
} from './types.js'

export * from './types.js'
export { Cassette } from './cassette.js'

class DefaultModelGateway implements ModelGateway {
  readonly info: GatewayInfo

  constructor(
    private readonly ark: ArkClient,
    private readonly embedder: OllamaEmbedder,
    private readonly cassette: Cassette,
    info: GatewayInfo,
  ) {
    this.info = info
  }

  async generate<T>(req: GenerateRequest<T>): Promise<T> {
    const retries = req.retries ?? 2
    // 把 schema 本身喂给模型，而不是指望调用方在 prompt 里用中文把形状重描一遍。
    // 实测：只在散文里写「domain 只能取以下之一」时，便宜档模型会返回「户外爬山」
    // 这种自由文本；给了 JSON Schema 之后枚举才被真正遵守。
    // 让形状只有一处定义（zod），prompt 从它派生 —— 否则两处描述必然漂移。
    const system =
      `${req.system}\n\n输出必须严格符合以下 JSON Schema：\n` +
      `${JSON.stringify(describeSchema(req.schema))}\n\n` +
      `只输出一个 JSON 对象，不要代码块围栏，不要任何解释文字。`
    let lastIssue = ''

    for (let attempt = 0; attempt <= retries; attempt++) {
      const user = attempt === 0 ? req.user : `${req.user}\n\n上次输出不符合要求：${lastIssue}\n请重新输出。`
      const payload = { system, user, tier: req.tier ?? 'cheap', attempt }

      const raw = await this.cassette.wrap(req.task, payload, () =>
        this.ark.chat(req.task, completeMessages({ ...req, system, user }), {
          tier: req.tier,
          json: true,
        }),
      )

      const parsed = safeParseJson(raw)
      if (!parsed.ok) {
        lastIssue = parsed.issue
        continue
      }
      const validated = req.schema.safeParse(parsed.value)
      if (validated.success) return validated.data
      lastIssue = z.prettifyError(validated.error)
    }

    throw new ModelGatewayError(
      `结构化生成在 ${retries + 1} 次尝试后仍不符合 schema：${lastIssue}`,
      req.task,
    )
  }

  async complete(req: CompleteRequest): Promise<string> {
    const payload = { system: req.system, user: req.user, tier: req.tier ?? 'cheap' }
    return this.cassette.wrap(req.task, payload, () =>
      this.ark.chat(req.task, completeMessages(req), {
        tier: req.tier,
        maxTokens: req.maxTokens,
      }),
    )
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    return this.cassette.wrap('embed', texts, () => this.embedder.embed(texts))
  }

  async image(req: ImageRequest): Promise<ImageResult> {
    const payload = { prompt: req.prompt, refs: req.referenceImages ?? [], size: req.size }
    return this.cassette.wrap(req.task, payload, () => this.ark.image(req))
  }
}

/**
 * 把 zod schema 转成可放进 prompt 的 JSON Schema。
 *
 * 少数 schema（含 refine 之类的运行时校验）无法完整表达，转换会抛错。
 * 那种情况下退回只给字段名 —— 有部分约束好过没有，且不该因为
 * 描述不出来就让整个调用失败。
 */
function describeSchema(schema: z.ZodType<unknown>): unknown {
  try {
    return z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' })
  } catch {
    return { type: 'object', description: '无法完整表达的 schema，请严格按上文字段要求输出' }
  }
}

/** 去掉模型偶尔套上的 ```json 围栏。便宜档模型这么干的概率更高。 */
function safeParseJson(raw: string): { ok: true; value: unknown } | { ok: false; issue: string } {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return { ok: true, value: JSON.parse(cleaned) }
  } catch (e) {
    return { ok: false, issue: `不是合法 JSON（${(e as Error).message}）` }
  }
}

export interface GatewayOptions {
  ark: ArkConfig
  ollama: OllamaConfig
  cassette: { mode: CassetteMode; dir: string }
}

export function createModelGateway(opts: GatewayOptions): ModelGateway {
  return new DefaultModelGateway(
    new ArkClient(opts.ark),
    new OllamaEmbedder(opts.ollama),
    new Cassette(opts.cassette),
    {
      chatModel: opts.ark.cheapModel,
      embedModel: opts.ollama.model,
      embedDimensions: opts.ollama.dimensions,
      imageModel: opts.ark.imageModel,
    },
  )
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    throw new Error(
      `缺少环境变量 ${name}。复制 .env.example 为 .env.local 并填入真实值；` +
        `不要用占位值绕过 —— 本项目不接受假 provider。`,
    )
  }
  return v
}

/** 从环境变量构造。所有默认值都是实测可用的模型 ID，不是文档抄来的。 */
export function createModelGatewayFromEnv(): ModelGateway {
  return createModelGateway({
    ark: {
      apiKey: required('ARK_API_KEY'),
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
      mode: (process.env['MODEL_CASSETTE_MODE'] as CassetteMode) ?? 'live',
      dir: process.env['MODEL_CASSETTE_DIR'] ?? 'test/cassettes',
    },
  })
}
