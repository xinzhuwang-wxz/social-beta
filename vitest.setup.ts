import { existsSync, readFileSync } from 'node:fs'

/**
 * 从 .env.local 载入环境变量。
 *
 * 不引 dotenv：这里只需要读一个文件，多一个依赖不划算。
 * 已存在的环境变量优先 —— CI 里由流水线注入的值不该被本地文件覆盖。
 */
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, rawValue] = m
    if (!key || process.env[key] !== undefined) continue
    process.env[key] = rawValue?.replace(/^["']|["']$/g, '') ?? ''
  }
}
