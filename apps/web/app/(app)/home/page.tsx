import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DOMAIN_LABEL } from '@pool/shared'
import type { PoolSummary } from '@pool/engine'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { ColorField } from '@/components/color-field'
import { PageShell, EmptyState } from '@/components/page-header'
import { PoolPlant } from '@/components/pool-plant'
import { stageOf, STAGE_LABEL, STAGE_MEANING } from '@/lib/growth'

/**
 * /home —— 我的行动。
 *
 * 只做「取 actor → 调 PoolEngine → 渲染」。植物形态由 pool.state 唯一决定
 * （见 lib/growth.ts），所以这一页不需要为每一株再查一次时间线 ——
 * 补上 `planned` 那一档之后，状态机本身已经把进度表达完整了。
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

  // 色域里画最靠前的那一株：手上还在推进的事优先，没有就退到已经开花的。
  const featured = growing[0] ?? bloomed[0] ?? asleep[0]

  return (
    <div className="flex flex-col">
      <ColorField
        eyebrow="我的行动"
        title={featured ? `${growing.length} 件事在长` : '还没有一株'}
        stage={featured ? stageOf(featured.state) : 'seed'}
        artifacts={featured?.artifactCount ?? 0}
        meta={[
          `${person.displayName} · ${person.campusId}`,
          `开过花 ${bloomed.length}`,
          `睡着 ${asleep.length}`,
        ]}
      >
        <p className="max-w-xl text-sm leading-relaxed opacity-90">
          每一株代表一件事，不代表一个人。它长到哪一步，就是这件事办到哪一步。
        </p>
      </ColorField>

      <PageShell>
        {invites.length > 0 && (
          <Link
            href="/invites"
            className="flex items-center justify-between gap-4 border-l-2 border-accent bg-accent-soft px-4 py-3 text-sm transition-opacity hover:opacity-80"
          >
            <span className="text-accent-strong">
              信箱里有 {invites.length} 颗种子等你回应
            </span>
            <span className="mark shrink-0 text-accent">去看看 →</span>
          </Link>
        )}

        {pools.length === 0 ? (
          <EmptyState>
            <p>
              还没有任何一株。这不是空白页，是如实反映：你还没和别人一起把哪件事做成过。
            </p>
            <Link
              href="/square"
              className="mt-3 inline-block text-accent underline decoration-dotted underline-offset-4"
            >
              去种一颗 →
            </Link>
          </EmptyState>
        ) : (
          <>
            <PoolGroup title="正在长" pools={growing} hint="需要你继续推的" />
            <PoolGroup title="开过花" pools={bloomed} hint="办成了，等着收尾" />
            <PoolGroup title="睡着了" pools={asleep} hint="带着下次的理由，到点自己醒" />
          </>
        )}
      </PageShell>
    </div>
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
    <section>
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
        <h2 className="font-head text-lg font-semibold text-ink">{title}</h2>
        <span className="mark text-ink-soft">
          {pools.length} · {hint}
        </span>
      </div>
      <ul>
        {pools.map((pool) => {
          const stage = stageOf(pool.state)
          return (
            <li key={pool.id} className="border-b border-border">
              <Link
                href={`/pool/${pool.id}`}
                className="grid grid-cols-[3.5rem_1fr] items-center gap-4 py-4 transition-colors hover:bg-surface-raised"
              >
                <PoolPlant
                  stage={stage}
                  artifacts={pool.artifactCount}
                  label={null}
                  className="size-14 justify-self-center"
                />
                <div className="min-w-0">
                  <p className="font-head text-base font-semibold text-ink break-anywhere">
                    {pool.title ?? '（还没起名字）'}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    <span className="text-accent">{STAGE_LABEL[stage]}</span>
                    {` · ${STAGE_MEANING[stage]}`}
                  </p>
                  <p className="mark mt-1.5 text-ink-soft">
                    {pool.domain
                      ? `${DOMAIN_LABEL[pool.domain as keyof typeof DOMAIN_LABEL] ?? pool.domain} · `
                      : ''}
                    {pool.memberCount} 人 · {pool.artifactCount} 份回流物
                  </p>
                  {pool.nextHook && (
                    <p className="mt-1.5 border-l-2 border-border pl-2.5 text-xs leading-relaxed text-ink-muted break-anywhere">
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
