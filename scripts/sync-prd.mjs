#!/usr/bin/env node
/**
 * 从 GitHub issue 生成 .omc/prd.json。
 *
 * GitHub issue 是验收标准的唯一真相源；prd.json 只是它的本地投影，
 * 供 ralph 循环追踪进度用。改验收标准请改 issue，然后重跑本脚本。
 *
 * 已通过的 story 的 passes 状态会被保留（按 id 合并）。
 *
 *   node scripts/sync-prd.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '.omc', 'prd.json')

/** 母单，不作为 story */
const PARENT_ISSUE = 1

/** 里程碑归属：issue number -> milestone */
const MILESTONE = {
  2: 'M1', 3: 'M1',
  4: 'M2', 5: 'M2',
  6: 'M3', 7: 'M3',
  8: 'M4', 9: 'M4',
  10: 'M5', 11: 'M5',
  12: 'M6', 13: 'M6', 14: 'M6',
}

const gh = (...args) =>
  execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 })

/** 抽出 `## Acceptance criteria` 段里的 `- [ ]` 条目 */
function parseCriteria(body) {
  const lines = body.split('\n')
  const start = lines.findIndex((l) => /^##\s+Acceptance criteria/i.test(l))
  if (start === -1) return []
  const criteria = []
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break
    const m = line.match(/^\s*-\s*\[[ xX]\]\s*(.+?)\s*$/)
    if (m) criteria.push(m[1])
  }
  return criteria
}

/** 抽出 `## Blocked by` 段里引用的 issue 号 */
function parseBlockers(body) {
  const lines = body.split('\n')
  const start = lines.findIndex((l) => /^##\s+Blocked by/i.test(l))
  if (start === -1) return []
  const blockers = new Set()
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break
    for (const m of line.matchAll(/#(\d+)/g)) blockers.add(Number(m[1]))
  }
  return [...blockers].sort((a, b) => a - b)
}

const issues = JSON.parse(gh('issue', 'list', '--state', 'all', '--limit', '100', '--json', 'number,title,body,state'))
  .filter((i) => i.number !== PARENT_ISSUE)
  .sort((a, b) => a.number - b.number)

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { stories: [] }
const priorPasses = new Map(previous.stories.map((s) => [s.id, s.passes]))

const stories = issues.map((issue, index) => {
  const criteria = parseCriteria(issue.body)
  if (criteria.length === 0) {
    throw new Error(`issue #${issue.number} 没有可解析的 Acceptance criteria —— 拒绝生成空验收标准的 story`)
  }
  const id = `US-${String(issue.number).padStart(3, '0')}`
  return {
    id,
    issue: issue.number,
    milestone: MILESTONE[issue.number] ?? null,
    priority: index + 1,
    title: issue.title,
    blockedBy: parseBlockers(issue.body),
    acceptanceCriteria: criteria,
    passes: issue.state === 'CLOSED' ? true : (priorPasses.get(id) ?? false),
  }
})

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: 'GitHub issues — 唯一真相源。改验收标准请改 issue 后重跑 scripts/sync-prd.mjs',
      repo: 'xinzhuwang-wxz/social-beta',
      parentIssue: PARENT_ISSUE,
      goal: 'docs/GOAL.md',
      stories,
    },
    null,
    2,
  ) + '\n',
)

const done = stories.filter((s) => s.passes).length
console.log(`prd.json 已生成：${stories.length} stories，${stories.reduce((n, s) => n + s.acceptanceCriteria.length, 0)} 条验收标准，已通过 ${done}`)
for (const s of stories) {
  const gate = s.blockedBy.length ? `blocked by ${s.blockedBy.map((n) => '#' + n).join(', ')}` : 'ready'
  console.log(`  ${s.passes ? '✓' : ' '} ${s.id} [${s.milestone}] ${s.acceptanceCriteria.length} AC · ${gate}`)
}
