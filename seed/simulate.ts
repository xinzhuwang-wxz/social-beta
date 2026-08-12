/**
 * 校园模拟：N 个虚拟学生 × 12 周事件流。
 *
 * ## 做法不是生成 N 份 profile
 *
 * 那样就假定了 profile 是输入，而那恰好是本产品要否定的东西。
 * 这里生成的是**事件历史**：每个人只有 handle 和校区，画像从他参与过的池塘里长出来。
 *
 * ## 驱动的是同一条 PoolEngine 缝
 *
 * 不旁路写库。所以模拟数据不是假数据，是同一条链路的产物 ——
 * 这既让它能作为最大的那个集成测试，也让下面那条冷启动曲线真的说明问题。
 *
 * ## 唯一被允许的「模拟」
 *
 * 只有「平台上的其他同学」是模拟的。他们的意图文本来自模板 + 组合，
 * 但从 publishIntent 往后的每一步 —— 抽取、向量化、召回、精排、终排、
 * 预演、接管、协作、回流、蒸馏 —— 全部是真实链路。
 *
 * 用法：
 *   pnpm tsx seed/simulate.ts --people=200 --weeks=12
 *   pnpm tsx seed/simulate.ts --people=1000 --weeks=12 --out=seed/out
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb } from '@pool/db'
import { createModelGateway } from '@pool/model'
import { DOMAINS, type Domain } from '@pool/shared'
import { PoolEngine, type ActorContext } from '@pool/engine'

// ---------------------------------------------------------------- 配置

// pnpm --filter 会把 `--` 原样传进来，过滤掉
const args = new Map(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--') && a !== '--')
    .map((a) => {
      const [k, v = 'true'] = a.replace(/^--/, '').split('=')
      return [k!, v] as const
    }),
)
const REPO_ROOT_EARLY = join(dirname(fileURLToPath(import.meta.url)), '..')
const PEOPLE = Number(args.get('people') ?? 200)
const WEEKS = Number(args.get('weeks') ?? 12)
const OUT_DIR = args.get('out') ?? join(REPO_ROOT_EARLY, 'seed/out')
/** 并发上限。抽取每条约 1.5s，串行跑 2400 条要一小时。 */
const CONCURRENCY = Number(args.get('concurrency') ?? 8)
const CAMPUS = args.get('campus') ?? `sim-${randomUUID().slice(0, 8)}`

// 按仓库根定位而非 cwd —— pnpm --filter 的 cwd 是包目录，不是仓库根
const ENV_LOCAL = join(REPO_ROOT_EARLY, '.env.local')
if (existsSync(ENV_LOCAL)) {
  for (const line of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2] ?? ''
  }
}

// ---------------------------------------------------------------- 语料

/**
 * 意图模板。每个领域若干句式 + 可替换片段。
 *
 * 刻意写成真实学生会说的话 —— 有省略、有口语、有无关细节。
 * 用规整的「我想参加运动活动」这种句子去测，抽取和召回都会虚高。
 */
const TEMPLATES: Record<Domain, string[]> = {
  sport: ['想找人打{球}，{时段}体育馆，缺一个', '{时段}想去跑步，有人一起吗', '办了健身卡没人陪，想找个搭子'],
  study: ['找人一起复习{科目}，图书馆{楼}楼', '{科目}快挂了想找人带带', '想找人一起自习，不聊天那种'],
  contest: ['{赛事}想组队，缺一个会{技能}的', '找队友参加{赛事}，我做{技能}', '{赛事}还差一个人，有意向的说一声'],
  craft: ['想学{手艺}，找个人一起报班互相监督', '有没有人一起去手作工坊', '想试试{手艺}，一个人不敢去'],
  show: ['{时段}有{演出}，想找人一起去', '买了两张{演出}的票多一张', '想去看{演出}，有人吗'],
  food: ['想去后街那家新开的{吃的}，一个人吃不划算', '有人拼个{吃的}吗', '想找人一起吃早饭，我总起不来'],
  travel: ['{时段}想去{地方}，最好{风格}', '想找人一起去{地方}，能拍照的加分', '{时段}有人去{地方}吗，想搭个伴'],
  game: ['想找人开黑，{时段}', '缺一个打{游戏}的', '{时段}有人一起玩吗'],
  volunteer: ['{时段}想去做志愿者，有人一起吗', '想找人一起去养老院', '有没有人一起参加公益活动'],
  career: ['想找人一起改简历，互相看看', '有没有人一起准备{赛事}面试', '想找人模拟面试'],
  life: ['宿舍要装{东西}，有人懂吗', '想找人一起去搬东西', '有人顺路带个快递吗'],
  other: ['想找人一起做点什么，{时段}有空', '有没有人一起{时段}出去逛逛'],
}

const FILL: Record<string, string[]> = {
  球: ['羽毛球', '篮球', '乒乓球', '网球'],
  时段: ['周六', '周日', '这周末', '周三晚上', '下周', '考完试之后'],
  科目: ['高数', '线代', '大物', '概率论', '数据结构'],
  楼: ['三', '四', '五'],
  赛事: ['创业大赛', '数模竞赛', '互联网+', 'ACM'],
  技能: ['前端', '后端', '写论文', 'UI 设计', '算法'],
  手艺: ['陶艺', '做咖啡', '烘焙', '木工'],
  演出: ['话剧', '乐队演出', '相声', '音乐会'],
  吃的: ['火锅', '烤肉', '日料', '小龙虾'],
  地方: ['京郊', '香山', '箭扣', '古北水镇'],
  风格: ['野线', '轻松点的', '能拍照的'],
  游戏: ['狼人杀', '剧本杀', '桌游'],
  东西: ['路由器', '投影仪'],
}

const pick = <T>(a: readonly T[], r: () => number): T => a[Math.floor(r() * a.length)]!

function renderIntent(domain: Domain, r: () => number): string {
  let s = pick(TEMPLATES[domain], r)
  for (const [key, opts] of Object.entries(FILL)) {
    s = s.replace(new RegExp(`\\{${key}\\}`, 'g'), () => pick(opts, r))
  }
  return s
}

/**
 * 一周里各领域的意图权重。
 *
 * 周中偏学术与竞赛，周末偏出行与吃喝；考试周（第 8、9 周）整体骤降，
 * 开学季（第 1 周）骤升。用均匀分布跑出来的曲线好看但没有意义 ——
 * 冷启动的难点恰恰在于活跃度本身是不均匀的。
 */
function weekProfile(week: number): { volume: number; weights: Partial<Record<Domain, number>> } {
  const examWeek = week === 8 || week === 9
  const openingWeek = week === 1
  return {
    volume: examWeek ? 0.35 : openingWeek ? 1.6 : 1,
    weights: examWeek
      ? { study: 6, food: 2, life: 1, other: 1 }
      : openingWeek
        ? { sport: 3, food: 3, travel: 2, show: 2, contest: 2, craft: 2, game: 2, volunteer: 1, career: 1, study: 1, life: 1, other: 1 }
        : { sport: 3, study: 3, travel: 3, food: 3, contest: 2, show: 2, game: 2, craft: 1, career: 1, volunteer: 1, life: 1, other: 1 },
  }
}

function pickDomain(week: number, r: () => number): Domain {
  const { weights } = weekProfile(week)
  const entries = DOMAINS.map((d) => [d, weights[d] ?? 0] as const).filter(([, w]) => w > 0)
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let x = r() * total
  for (const [d, w] of entries) {
    x -= w
    if (x <= 0) return d
  }
  return 'other'
}

/** 可复现的伪随机。模拟必须能重跑出同样的结构，否则曲线无法对照。 */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- 并发

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await fn(items[i]!, i)
      }
    }),
  )
  return out
}

// ---------------------------------------------------------------- 主流程

interface SimPerson {
  actor: ActorContext
  personId: string
  /** 已完成的池塘数 —— 冷启动曲线的横轴 */
  poolCount: number
}

/** 一次匹配的观测点，用于画冷启动拐点曲线 */
interface Observation {
  poolCountBefore: number
  candidates: number
  topScore: number
  tookOver: boolean
}

async function main() {
  const sql = createDb({ url: process.env['DATABASE_URL']!, max: CONCURRENCY + 4 })
  const model = createModelGateway({
    ark: {
      apiKey: process.env['ARK_API_KEY']!,
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
    // 模拟跑的是真实链路，不读也不写 cassette
    cassette: { mode: 'live', dir: 'test/cassettes' },
  })
  const engine = new PoolEngine({ sql, model })

  const t0 = Date.now()
  console.log(`校区 ${CAMPUS}｜${PEOPLE} 人 × ${WEEKS} 周｜并发 ${CONCURRENCY}`)

  // ---- 1. 建人。只有 handle 与校区，profile 全空 ----
  const people = await mapLimit(
    Array.from({ length: PEOPLE }, (_, i) => i),
    CONCURRENCY,
    async (i): Promise<SimPerson> => {
      const authUserId = randomUUID()
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
        values (${authUserId}, '00000000-0000-0000-0000-000000000000', 'authenticated',
                'authenticated', ${`${authUserId}@sim.local`}, now(), now())
      `
      const actor: ActorContext = { authUserId }
      const p = await engine.registerPerson(actor, {
        handle: `sim_${i}_${authUserId.slice(0, 6)}`,
        displayName: `同学${i}`,
        campusId: CAMPUS,
      })
      return { actor, personId: p.id, poolCount: 0 }
    },
  )
  console.log(`  建档完成 ${people.length} 人  ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  const observations: Observation[] = []

  // ---- 2. 逐周跑事件流 ----
  for (let week = 1; week <= WEEKS; week++) {
    const wt = Date.now()
    const { volume } = weekProfile(week)
    const rand = mulberry32(week * 7919)

    // 本周发意图的人
    const actives = people.filter(() => rand() < 0.22 * volume)
    const intents = await mapLimit(actives, CONCURRENCY, async (person) => {
      const domain = pickDomain(week, rand)
      try {
        const intent = await engine.publishIntent(person.actor, renderIntent(domain, rand))
        return { person, intentId: intent.id }
      } catch {
        return null
      }
    })

    // 其中一部分去找候选。这一步花钱（embed + LLM 终排），所以只让一部分人做，
    // 与真实产品里「发了意图但没点找搭子」的比例一致。
    const seekers = intents.filter((x): x is NonNullable<typeof x> => x !== null).filter(() => rand() < 0.55)

    await mapLimit(seekers, CONCURRENCY, async ({ person, intentId }) => {
      try {
        const candidates = await engine.refreshCandidates(person.actor, intentId)
        const obs: Observation = {
          poolCountBefore: person.poolCount,
          candidates: candidates.length,
          topScore: candidates[0]?.score.total ?? 0,
          tookOver: false,
        }

        // 接管的概率随候选质量上升 —— 模拟真人「看着靠谱才点」
        const top = candidates[0]
        if (top && rand() < Math.min(0.15 + top.score.total, 0.75)) {
          const r = await engine.rehearseWith(person.actor, {
            seekerIntentId: intentId,
            candidateIntentId: top.intentId,
          })
          const { poolId } = await engine.takeOver(person.actor, {
            rehearsalId: r.rehearsalId,
            opening: r.proposal.openingDraft,
          })
          obs.tookOver = true

          // 被邀请方确认的概率
          const other = people.find((p) => p.personId === top.personId)
          if (other && rand() < 0.6) {
            await engine.confirmJoin(other.actor, poolId)
            await engine.postMessage(person.actor, poolId, '几点集合？')
            await engine.postMessage(other.actor, poolId, '定了我提前说')

            // 成行并回流
            if (rand() < 0.7) {
              // 完成需要全员确认（S19）：两边都点了才真的转 done
              await engine.finishEvent(person.actor, poolId)
              await engine.finishEvent(other.actor, poolId)
              if (rand() < 0.5) {
                await engine.addArtifact(person.actor, poolId, {
                  kind: 'photo',
                  uri: `https://sim.invalid/${poolId}.jpg`,
                  caption: '当天拍的',
                })
              }
              await engine.sealPool(person.actor, poolId)
              await engine.distillAfterPool(poolId)
              person.poolCount++
              other.poolCount++
            }
          }
        }
        observations.push(obs)
      } catch {
        /* 单个用户失败不该中断整周 */
      }
    })

    console.log(
      `  第 ${String(week).padStart(2)} 周  意图 ${intents.filter(Boolean).length}  ` +
        `匹配 ${seekers.length}  累计观测 ${observations.length}  ${((Date.now() - wt) / 1000).toFixed(1)}s`,
    )
  }

  // ---- 3. 冷启动拐点曲线 ----
  const buckets = new Map<number, Observation[]>()
  for (const o of observations) {
    const k = Math.min(o.poolCountBefore, 6)
    ;(buckets.get(k) ?? buckets.set(k, []).get(k)!).push(o)
  }

  const curve = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([poolCount, obs]) => ({
      poolCount,
      n: obs.length,
      avgCandidates: obs.reduce((s, o) => s + o.candidates, 0) / obs.length,
      avgTopScore: obs.reduce((s, o) => s + o.topScore, 0) / obs.length,
      takeoverRate: obs.filter((o) => o.tookOver).length / obs.length,
    }))

  mkdirSync(OUT_DIR, { recursive: true })
  const report = {
    campus: CAMPUS,
    people: PEOPLE,
    weeks: WEEKS,
    observations: observations.length,
    durationSeconds: Math.round((Date.now() - t0) / 1000),
    curve,
  }
  writeFileSync(`${OUT_DIR}/cold-start.json`, JSON.stringify(report, null, 2) + '\n')

  console.log('\n冷启动拐点曲线（横轴 = 匹配发生时该用户已完成的池塘数）')
  console.log('  池塘数  样本   平均候选数   平均首位得分   接管率')
  for (const c of curve) {
    console.log(
      `  ${String(c.poolCount).padStart(5)}  ${String(c.n).padStart(5)}` +
        `  ${c.avgCandidates.toFixed(2).padStart(10)}` +
        `  ${c.avgTopScore.toFixed(4).padStart(12)}` +
        `  ${(c.takeoverRate * 100).toFixed(1).padStart(6)}%`,
    )
  }
  console.log(`\n报告已写入 ${OUT_DIR}/cold-start.json`)

  await sql.end({ timeout: 10 })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
