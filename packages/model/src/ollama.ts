import { ModelGatewayError } from './types'

/**
 * 本地 Ollama embedding。
 *
 * 为什么不用方舟的 embedding：该账号下所有文本 embedding 模型实测均返回 404
 * （平台有、账号未开通），且它们全部处于 Retiring 状态 —— 接上去等于刚上线就要迁移。
 *
 * 为什么本地跑得起：我们要 embed 的文本都很短（一句意图、一段切面摘要），
 * 不需要长上下文模型。1000 人模拟要生成几十万条向量，走 API 又慢又贵，
 * 本地推理没有配额限制，也不受模型下线影响。
 *
 * 模型选择必须实测中文区分度，不能看参数量拍板：
 * all-minilm（英文语料）在中文上「无关句」得分反而高于「同义句」，
 * 差值 -0.015 —— 用它做召回等于随机排序。
 */
export interface OllamaConfig {
  baseUrl: string
  model: string
  /**
   * 期望维度。首次调用会与模型实际输出比对，不一致立即抛错。
   *
   * 这个断言存在的理由：维度写死在 pgvector 的列定义里，
   * 一旦模型被换成不同维度而没人发现，向量会被静默写坏，
   * 而症状要到召回质量下降时才显现 —— 那时已经很难归因。
   */
  dimensions: number
}

export class OllamaEmbedder {
  private verified = false

  constructor(private readonly config: OllamaConfig) {}

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    let res: Response
    try {
      res = await fetch(`${this.config.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, input: texts }),
      })
    } catch (cause) {
      throw new ModelGatewayError(
        `Ollama 不可达（${this.config.baseUrl}）。本地是否已 ollama serve？`,
        'embed',
        cause,
      )
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ModelGatewayError(
        `Ollama 返回 HTTP ${res.status}：${detail.slice(0, 300)}`,
        'embed',
      )
    }

    const body = (await res.json()) as { embeddings?: number[][] }
    const embeddings = body.embeddings
    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
      throw new ModelGatewayError(
        `Ollama 返回的向量条数与输入不符：期望 ${texts.length}，得到 ${embeddings?.length ?? 0}`,
        'embed',
      )
    }

    if (!this.verified) {
      const actual = embeddings[0]?.length ?? 0
      if (actual !== this.config.dimensions) {
        throw new ModelGatewayError(
          `embedding 维度不符：配置 ${this.config.dimensions}，模型 ${this.config.model} 实际输出 ${actual}。` +
            `pgvector 的列定义依赖这个值，继续写入会静默写坏向量索引。`,
          'embed',
        )
      }
      this.verified = true
    }

    return embeddings
  }
}
