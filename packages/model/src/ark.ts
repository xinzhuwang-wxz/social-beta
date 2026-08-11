import { ModelGatewayError, type CompleteRequest, type ImageRequest, type ImageResult, type Tier } from './types.js'

/**
 * 火山方舟客户端。方舟与 OpenAI 协议兼容，所以这里不引 SDK ——
 * 一个 fetch 就够，少一个依赖少一处版本漂移。
 *
 * 模型 ID 全部经过实测（`GET /models` + 真实调用），不采信文档或搜索结果：
 * 账号里大量模型处于 Shutdown / Retiring / 未开通状态，
 * 照着博客抄一个 ID 上去就是 404。
 */
export interface ArkConfig {
  apiKey: string
  baseUrl: string
  /** 便宜档：日常主力。实测 doubao-seed-2-0-mini-260428 可用，约 ¥0.3/M */
  cheapModel: string
  /** 贵档：复杂推理。实测 doubao-seed-2-0-lite-260428 可用，约 ¥0.6/M */
  strongModel: string
  imageModel: string
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class ArkClient {
  constructor(private readonly config: ArkConfig) {}

  modelFor(tier: Tier = 'cheap'): string {
    return tier === 'strong' ? this.config.strongModel : this.config.cheapModel
  }

  async chat(
    task: string,
    messages: readonly ChatMessage[],
    opts: { tier?: Tier; maxTokens?: number; json?: boolean } = {},
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.modelFor(opts.tier),
      messages,
    }
    if (opts.maxTokens !== undefined) body['max_tokens'] = opts.maxTokens
    if (opts.json) body['response_format'] = { type: 'json_object' }

    const res = await this.post(`${this.config.baseUrl}/chat/completions`, body, task)
    const content = (res as ChatResponse).choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.length === 0) {
      throw new ModelGatewayError('方舟返回了空的 message.content', task)
    }
    return content
  }

  async image(req: ImageRequest): Promise<ImageResult> {
    const body: Record<string, unknown> = {
      model: this.config.imageModel,
      prompt: req.prompt,
      response_format: 'b64_json',
      size: req.size ?? '2K',
      watermark: false,
    }
    // 多图融合：精灵皮肤随事件演化靠这个保持主体一致性
    if (req.referenceImages?.length) body['image'] = req.referenceImages

    const res = (await this.post(
      `${this.config.baseUrl}/images/generations`,
      body,
      req.task,
    )) as ImageResponse
    const b64 = res.data?.[0]?.b64_json
    if (!b64) throw new ModelGatewayError('方舟未返回图像数据', req.task)
    return { bytes: Uint8Array.from(Buffer.from(b64, 'base64')), contentType: 'image/jpeg' }
  }

  private async post(url: string, body: unknown, task: string): Promise<unknown> {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      })
    } catch (cause) {
      throw new ModelGatewayError(`方舟请求失败：${url}`, task, cause)
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ModelGatewayError(
        `方舟返回 HTTP ${res.status}：${detail.slice(0, 300)}`,
        task,
      )
    }
    return res.json()
  }
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[]
}

interface ImageResponse {
  data?: { b64_json?: string }[]
}

export function completeMessages(req: CompleteRequest): ChatMessage[] {
  return [
    { role: 'system', content: req.system },
    { role: 'user', content: req.user },
  ]
}
