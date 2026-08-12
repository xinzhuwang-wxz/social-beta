import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DOMAIN_LABEL } from '@pool/shared'
import type { PoolSummary } from '@pool/engine'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { GardenScene, type GardenPlant } from '@/components/garden-scene'
import { PageShell, EmptyState, SectionHead } from '@/components/page-header'
import { PoolPlant } from '@/components/pool-plant'
import { stageOf, stateLabel, STAGE_LABEL, STAGE_MEANING } from '@/lib/growth'

/**
 * /home —— 我的花园。A 类世界页面：先是一片花园，再是可读的清单。
 *
 * 花园那一屏承担情绪（这些事都还活着、长得高矮不一），
 * 下面的清单承担信息（哪一步、几个人、下次是什么）。
 * 规范的优先级是「功能信息 > 世界观表达 > 装饰」，所以清单不能省 ——
 * 光看植物，用户知道它在长，但不知道自己该干什么。
 *
 * 只做「取 actor → 调 PoolEngine → 渲染」。植物形态由 pool.state 唯一决定
 * （见 lib/growth.ts），这一页不需要为每一株再查一次时间线。
 */
export default async function HomePage() {
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const [pools, invites] = await Promise.all([engine.myPools(actor), engine.myInvites(actor)])

  const growing = pools.filter((p) => !['done', 'dormant'].includes(p.state))
  const bloomed = pools.filter((p) => p.state === 'done')
  const asleep = pools.filter((p) => p.state === 'dormant')

  const garden: GardenPlant[] = growing.map((pool) => ({
    key: pool.id,
    stage: stageOf(pool.state),
    artifacts: pool.artifactCount,
    title: pool.title ?? '（还没起名字）',
    href: `/pool/${pool.id}`,
  }))

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-cap font-medium tracking-wide text-accent-deep">我的花园</p>
          <h1 className="t-h1 mt-1">{person.displayName}，这些事还在长</h1>
        </div>
        <span className="pill">
          @{person.handle} · {person.campusId}
        </span>
      </div>

      <GardenScene
        plants={garden}
        bird={invites.length > 0 ? 'delivering' : growing.length > 0 ? 'idle' : 'resting'}
        emptyHint="花园还空着。说一句你想干什么，就种下第一颗。"
      />

      {invites.length > 0 && (
        <Link
          href="/invites"
          className="card flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-200 hover:bg-surface-alt"
        >
          <span className="flex items-center gap-2 text-sm text-ink">
            <span className="badge">{invites.length}</span>
            信使鸟送来了新的种子，等你回应
          </span>
          <span className="t-cap shrink-0 text-accent-deep">去信箱 →</span>
        </Link>
      )}

      {pools.length === 0 ? (
        <EmptyState>
          <p>还没有任何一株。这不是空白页，是如实反映：你还没和别人一起把哪件事做成过。</p>
          <Link
            href="/square"
            className="btn btn-secondary btn-sm mt-3 inline-flex"
          >
            去种一颗
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-7">
          <PoolGroup title="正在长" pools={growing} hint="需要你继续推的" />
          <PoolGroup title="开过花" pools={bloomed} hint="办成了，等着收尾" />
          <PoolGroup title="歇着" pools={asleep} hint="带着下次的理由，到点自己醒" />
        </div>
      )}
    </PageShell>
  )
}

function PoolGroup({
  title,
  pools,
  hint,
}: {
  title: string
  pools: PoolSummary[]
  hint: string
}) {
  if (pools.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title={title}
        aside={<span className="t-cap">{pools.length} 株 · {hint}</span>}
      />
      <ul className="flex flex-col gap-2.5">
        {pools.map((pool) => {
          const stage = stageOf(pool.state)
          return (
            <li key={pool.id}>
              <Link
                href={`/pool/${pool.id}`}
                className="card flex items-center gap-4 p-3 transition-colors duration-200 hover:bg-surface-alt sm:p-4"
              >
                <PoolPlant
                  stage={stage}
                  artifacts={pool.artifactCount}
                  label={null}
                  className="h-16 w-13 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="t-hand text-base font-semibold text-ink break-anywhere">
                    {pool.title ?? '（还没起名字）'}
                  </p>
                  {/* 规范要求页面用文字说明当前状态，光有植物不够 */}
                  <p className="t-cap mt-0.5">
                    <span className="font-semibold text-accent-deep">
                      {STAGE_LABEL[stage]}
                    </span>
                    {` · ${STAGE_MEANING[stage]}`}
                  </p>
                  <p className="t-cap mt-1 text-ink-soft">
                    {pool.domain
                      ? `${DOMAIN_LABEL[pool.domain as keyof typeof DOMAIN_LABEL] ?? pool.domain} · `
                      : ''}
                    {stateLabel(pool.state)} · {pool.memberCount} 人 · {pool.artifactCount} 份回流物
                  </p>
                  {pool.nextHook && (
                    <p className="t-cap mt-1.5 rounded-[var(--radius-sm)] bg-surface-alt px-2.5 py-1.5 break-anywhere">
                      下次：{pool.nextHook}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
