/**
 * 判据⑤的现场取证：L2 全删后从 L1 重建，结果等价。
 *
 * 这条判据是「Postgres 是唯一真相源」唯一能被证伪的地方。如果 L2（画像、
 * 关系）里存着任何 L1（池塘、事件、回流物）推不出来的东西，那它就不是
 * 派生物而是真相的一部分 —— 而那意味着我们其实有两个真相源，
 * 它们迟早会分叉。
 *
 * 跑在模拟产生的真实数据上，不是测试里那几个人造样本。
 *
 *   pnpm tsx seed/l2-rebuild.ts
 */

import { createDb } from '@pool/db'
import { createModelGatewayFromEnv } from '@pool/model'
import { PoolEngine } from '@pool/engine'

interface Snapshot {
  facets: { personId: string; domain: string; nPools: number; visibility: string }[]
  relations: { a: string; b: string; sharedPools: number }[]
}

async function snapshot(sql: ReturnType<typeof createDb>): Promise<Snapshot> {
  const facets = await sql<Snapshot['facets']>`
    select person_id as "personId", domain::text, n_pools as "nPools", visibility::text
    from facet order by person_id, domain
  `
  const relations = await sql<Snapshot['relations']>`
    select a_id as a, b_id as b, shared_pools as "sharedPools"
    from relation order by a_id, b_id
  `
  return { facets, relations }
}

/**
 * 比较两次快照的结构。
 *
 * 刻意**不**比较 summary 文本：那是模型生成的，同样的证据两次蒸馏
 * 措辞不会一模一样。要求逐字相同就是把断言建立在模型的确定性上，
 * 而那个前提本来就不成立。有意义的等价是结构等价：
 * 谁在哪些领域有画像、每条画像背后压着几个池塘、可见度是什么、
 * 关系的强度如何。这些全都是从 L1 数出来的，必须分毫不差。
 */
function diff(before: Snapshot, after: Snapshot): string[] {
  const problems: string[] = []

  const key = (f: Snapshot['facets'][number]) => `${f.personId}|${f.domain}`
  const mapBefore = new Map(before.facets.map((f) => [key(f), f]))
  const mapAfter = new Map(after.facets.map((f) => [key(f), f]))

  for (const [k, f] of mapBefore) {
    const g = mapAfter.get(k)
    if (!g) {
      problems.push(`重建后少了画像 ${k}（原本压着 ${f.nPools} 个池塘）`)
      continue
    }
    if (g.nPools !== f.nPools) {
      problems.push(`画像 ${k} 的池塘数变了：${f.nPools} → ${g.nPools}`)
    }
    // 可见度是用户自己设的，不是推导出来的 —— 重建时会回到默认值。
    // 这不是缺陷，但必须说出来：它意味着「重建」不是无损操作。
    if (g.visibility !== f.visibility) {
      problems.push(`画像 ${k} 的可见度从 ${f.visibility} 变成 ${g.visibility}（用户设置不是 L1 的派生物）`)
    }
  }
  for (const k of mapAfter.keys()) {
    if (!mapBefore.has(k)) problems.push(`重建后多出画像 ${k}`)
  }

  const rk = (r: Snapshot['relations'][number]) => `${r.a}|${r.b}`
  const relBefore = new Map(before.relations.map((r) => [rk(r), r]))
  const relAfter = new Map(after.relations.map((r) => [rk(r), r]))
  for (const [k, r] of relBefore) {
    const s = relAfter.get(k)
    if (!s) problems.push(`重建后少了关系 ${k}（原本 ${r.sharedPools} 个共同池塘）`)
    else if (s.sharedPools !== r.sharedPools) {
      problems.push(`关系 ${k} 的共同池塘数变了：${r.sharedPools} → ${s.sharedPools}`)
    }
  }
  for (const k of relAfter.keys()) {
    if (!relBefore.has(k)) problems.push(`重建后多出关系 ${k}`)
  }

  return problems
}

async function main() {
  const sql = createDb({ url: process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', max: 8 })
  const engine = new PoolEngine({ sql, model: createModelGatewayFromEnv() })

  try {
    const [l1] = await sql<{ pools: number; episodes: number }[]>`
      select (select count(*) from pool)::int as pools,
             (select count(*) from episode)::int as episodes
    `
    console.log(`\nL1：${l1?.pools ?? 0} 个池塘 · ${l1?.episodes ?? 0} 条事件`)

    const before = await snapshot(sql)
    console.log(`L2（重建前）：${before.facets.length} 条画像 · ${before.relations.length} 条关系`)
    if (before.facets.length === 0) {
      console.log('\nL2 是空的，这轮取证没有意义 —— 先跑 pnpm simulate。\n')
      process.exit(1)
    }

    console.log('\n全删 L2 …')
    const t0 = Date.now()
    await engine.wipeL2()
    const [mid] = await sql<{ f: number; r: number }[]>`
      select (select count(*) from facet)::int as f, (select count(*) from relation)::int as r
    `
    console.log(`  facet ${mid?.f ?? -1} · relation ${mid?.r ?? -1}`)
    if ((mid?.f ?? -1) !== 0 || (mid?.r ?? -1) !== 0) {
      console.log('\n没删干净 —— 后面的比较不成立。\n')
      process.exit(1)
    }

    console.log('从 L1 重建 …（要跑蒸馏，会调模型，慢）')
    await engine.rebuildL2()
    const after = await snapshot(sql)
    console.log(`L2（重建后）：${after.facets.length} 条画像 · ${after.relations.length} 条关系`)
    console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)

    const problems = diff(before, after)
    console.log('')
    if (problems.length === 0) {
      console.log('✓ 结构等价：谁在哪些领域有画像、每条压着几个池塘、关系强度，全部分毫不差。')
      console.log('  （不比 summary 文本 —— 那是模型生成的，要求逐字相同等于把断言')
      console.log('   建立在模型的确定性上，而那个前提本来就不成立。）\n')
      process.exit(0)
    }
    console.log(`✗ 发现 ${problems.length} 处不等价：`)
    for (const p of problems.slice(0, 20)) console.log(`  · ${p}`)
    if (problems.length > 20) console.log(`  … 还有 ${problems.length - 20} 处`)
    console.log('')
    process.exit(1)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

void main()
