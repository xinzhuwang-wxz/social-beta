import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * 模型响应的录制回放。
 *
 * 测试必须稳定，但不能失真 —— 所以我们不手写假响应，而是录下真实模型的输出后重放。
 * 手写假响应的问题在于：它会悄悄编码「我以为模型会这么答」，
 * 于是测试验证的是我的想象，而不是产品的真实行为。
 *
 * record 模式：打真实模型并落盘（本地跑，需要 API key）
 * replay 模式：只读盘，缺条目直接抛错（CI 默认，不会偷偷联网）
 */
export type CassetteMode = 'record' | 'replay' | 'live'

export interface CassetteConfig {
  mode: CassetteMode
  dir: string
}

export class Cassette {
  constructor(private readonly config: CassetteConfig) {}

  /** 按任务名与请求内容取稳定键。请求变了键就变，不会误用旧响应。 */
  private keyFor(task: string, payload: unknown): string {
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)
    return join(this.config.dir, task.replace(/[^\w.-]/g, '_'), `${hash}.json`)
  }

  async wrap<T>(task: string, payload: unknown, call: () => Promise<T>): Promise<T> {
    if (this.config.mode === 'live') return call()

    const path = this.keyFor(task, payload)

    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf8')
      return deserialize(JSON.parse(raw) as SerializedEntry) as T
    }

    if (this.config.mode === 'replay') {
      throw new Error(
        `cassette 缺条目：${task}\n  期望路径：${path}\n` +
          `  replay 模式不会联网。请在本地以 MODEL_CASSETTE_MODE=record 跑一次以录制。`,
      )
    }

    const result = await call()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(serialize(result), null, 2) + '\n')
    return result
  }
}

interface SerializedEntry {
  type: 'json' | 'bytes'
  value: unknown
}

/** 图像响应含二进制，JSON 存不下，单独走 base64。 */
function serialize(value: unknown): SerializedEntry {
  if (value instanceof Uint8Array) {
    return { type: 'bytes', value: Buffer.from(value).toString('base64') }
  }
  if (isImageResult(value)) {
    return {
      type: 'bytes',
      value: {
        bytes: Buffer.from(value.bytes).toString('base64'),
        contentType: value.contentType,
      },
    }
  }
  return { type: 'json', value }
}

function deserialize(entry: SerializedEntry): unknown {
  if (entry.type !== 'bytes') return entry.value
  if (typeof entry.value === 'string') {
    return Uint8Array.from(Buffer.from(entry.value, 'base64'))
  }
  const v = entry.value as { bytes: string; contentType: string }
  return { bytes: Uint8Array.from(Buffer.from(v.bytes, 'base64')), contentType: v.contentType }
}

function isImageResult(v: unknown): v is { bytes: Uint8Array; contentType: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'bytes' in v &&
    (v as { bytes: unknown }).bytes instanceof Uint8Array
  )
}
