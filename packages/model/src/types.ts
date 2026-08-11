import type { z } from 'zod'

/**
 * ModelGateway —— 本仓库唯一的外部模型端口。
 *
 * 所有 LLM / embedding / 生图调用都必须经过它。这条约束的价值在于：
 * 测试只需替换这一个对象；将来若要引入多 provider 故障转移或按用户维度的
 * 成本预算（例如挂 LiteLLM proxy），可以整个接在这层背后，调用方一行不改。
 *
 * 现在不引入 LiteLLM：方舟本身就 OpenAI 兼容，一个 provider 一把 key，
 * 多一层抽象就多一个进程、一跳网络和一处配置漂移。这条缝就是为了
 * 把「以后可能要」和「现在就要付」分开。
 */
export interface ModelGateway {
  /**
   * 结构化生成。返回值由 schema 校验保证形状，而非解析自由文本。
   *
   * 实现必须在校验失败时重试，并在耗尽重试后抛错 ——
   * 绝不允许返回一个「大概对」的对象让调用方去猜。
   */
  generate<T>(req: GenerateRequest<T>): Promise<T>

  /** 自由文本生成。仅用于确实不该有固定形状的产物（如开场白草稿）。 */
  complete(req: CompleteRequest): Promise<string>

  /** 文本向量。维度由实现决定，调用方不得假设具体值。 */
  embed(texts: readonly string[]): Promise<number[][]>

  /** 图像生成。返回可直接落 Storage 的字节。 */
  image(req: ImageRequest): Promise<ImageResult>

  /** 本网关实际使用的模型与维度，用于迁移校验与成本归因。 */
  readonly info: GatewayInfo
}

export interface GatewayInfo {
  chatModel: string
  embedModel: string
  embedDimensions: number
  imageModel: string
}

/** 任务档位。便宜档是默认，贵档要显式要求 —— 省钱应该是不作为的结果。 */
export type Tier = 'cheap' | 'strong'

export interface GenerateRequest<T> {
  /** 用于 cassette 键与成本归因，例如 'intent.extract' */
  task: string
  schema: z.ZodType<T>
  system: string
  user: string
  tier?: Tier
  /** schema 校验失败时的重试次数 */
  retries?: number
}

export interface CompleteRequest {
  task: string
  system: string
  user: string
  tier?: Tier
  maxTokens?: number
}

export interface ImageRequest {
  task: string
  prompt: string
  /** 参考图，用于多图融合与主体一致性（精灵皮肤演化要靠它） */
  referenceImages?: readonly string[]
  size?: string
}

export interface ImageResult {
  /** 图像字节。由调用方决定落到哪个 Storage bucket。 */
  bytes: Uint8Array
  contentType: string
}

/** 模型调用失败。区别于业务错误 —— 这类错误应触发重试或降级，不该冒泡给用户。 */
export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly task: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ModelGatewayError'
  }
}
