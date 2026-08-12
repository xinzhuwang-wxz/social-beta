import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 每个用到的设计 token 都必须真的定义过。
 *
 * 这个仓库栽过一次：globals.css 被整体替换时删掉了几个颜色 token，而组件里
 * 引用它们的类名还在。结果是登录和引导页的按钮**完全没有样式** —— 一块透明的
 * 可点区域。tsc 和 eslint 全绿，因为 Tailwind 类名对它们来说只是字符串。
 *
 * 这类缺陷的特点是：不报错、不崩溃、页面照常渲染，只是看起来是坏的。
 * 唯一能自动抓住它的地方就是这里 —— 把类名和 @theme 里的定义对一遍。
 */

const WEB = join(import.meta.dirname, '..')

/** Tailwind 里会拼上颜色 token 的前缀。只列颜色相关的，尺寸走内置刻度。 */
const COLOR_PREFIXES = [
  'bg',
  'text',
  'border',
  'ring',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'decoration',
  'outline',
  'divide',
  'shadow',
  'accent',
  'caret',
] as const

/** Tailwind 4 内置的颜色名与关键字，不需要在 @theme 里声明。 */
const BUILTIN = new Set([
  'inherit',
  'current',
  'transparent',
  'black',
  'white',
  'auto',
  'none',
  'left',
  'right',
  'center',
  'top',
  'bottom',
  'clip',
  'ellipsis',
  'balance',
  'pretty',
  'wrap',
  'nowrap',
  'hidden',
  'visible',
  'solid',
  'dashed',
  'dotted',
  'double',
  'sm',
  'md',
  'lg',
  'xl',
  'base',
  'xs',
  'full',
  'px',
  'start',
  'end',
  'justify',
  // border-t / border-b / border-x … 里的方位词不是颜色 token
  't',
  'b',
  'l',
  'r',
  'x',
  'y',
  's',
  'e',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'test') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(p)
  }
  return out
}

/** 从 globals.css 的 @theme 块里取出声明过的 token 名。 */
function declaredTokens(): Set<string> {
  const css = readFileSync(join(WEB, 'app/globals.css'), 'utf8')
  const tokens = new Set<string>()
  // --color-surface-raised: … → surface-raised
  for (const m of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) tokens.add(m[1]!)
  // 阴影、圆角等也可能被 shadow-/rounded- 引用
  for (const m of css.matchAll(/--shadow-([a-z0-9-]+)\s*:/g)) tokens.add(m[1]!)
  return tokens
}

/** 从源码里取出所有 `前缀-token` 形式的类名。 */
function usedTokens(): Map<string, string[]> {
  const used = new Map<string, string[]>()
  const prefixAlt = COLOR_PREFIXES.join('|')
  // 允许 hover: / dark: / sm: 之类的变体前缀，以及 /50 这样的透明度后缀
  const re = new RegExp(String.raw`(?:^|[\s"'\`:])(?:${prefixAlt})-([a-z][a-z0-9-]*)(?:/\d+)?(?=[\s"'\`]|$)`, 'g')

  for (const file of walk(WEB)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(re)) {
      const token = m[1]!
      if (BUILTIN.has(token)) continue
      // Tailwind 内置调色板（slate-500 之类）以数字结尾，跳过
      if (/-\d+$/.test(token)) continue
      const list = used.get(token) ?? []
      if (!list.includes(file)) list.push(file)
      used.set(token, list)
    }
  }
  return used
}

describe('设计 token', () => {
  it('组件引用的每个颜色 token 都在 globals.css 里定义过', () => {
    const declared = declaredTokens()
    expect(declared.size).toBeGreaterThan(5) // 先确认真的读到了 @theme

    const missing: string[] = []
    for (const [token, files] of usedTokens()) {
      if (declared.has(token)) continue
      const rel = files.map((f) => f.slice(WEB.length + 1)).join(', ')
      missing.push(`${token}（用在 ${rel}）`)
    }

    // 失败时把清单打出来 —— 这类问题肉眼在页面上只表现为「按钮怎么是透明的」，
    // 光说「有 token 缺失」等于没说。
    expect(missing, `以下 token 被引用但没有定义：\n  ${missing.join('\n  ')}`).toEqual([])
  })
})
