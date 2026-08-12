import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DOMAINS, DOMAIN_LABEL, Domain } from '@pool/shared'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { PageHeader, PageShell } from '@/components/page-header'
import { MessengerBird } from '@/components/messenger-bird'
import { IntentPublishForm } from '@/components/intent-publish-form'
import { IntentBoard } from '@/components/intent-board'
import { finishPublishAction, publishIntentAction, startPublishAction } from './actions'

interface SquarePageProps {
  searchParams: Promise<{ domain?: string }>
}

/**
 * 发种子 + 种子广场（S2 #4）。
 *
 * 结构约束沿用 S1 定死的规矩：这个 Server Component 只做
 * 「取 actor → 调 PoolEngine → 渲染」。真正的业务判断——槽位怎么抽、
 * 广场怎么过滤——全在 PoolEngine 内部，这里不重复实现。
 */
export default async function SquarePage({ searchParams }: SquarePageProps) {
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const { domain: rawDomain } = await searchParams
  const parsedDomain = Domain.safeParse(rawDomain)
  const domain = parsedDomain.success ? parsedDomain.data : undefined

  const board = await engine.board(actor, { domain })

  return (
    <PageShell>
      <PageHeader
        eyebrow="种一颗"
        title="你想干什么"
        lede="一颗种子就是一个还没发生的行动愿望。怎么说话平时就怎么说——不用挑分类、不用选标签，抽错了当场就能改。"
        art={<MessengerBird state="carrying" className="size-20" label={null} />}
      />
      <>
        <IntentPublishForm
          startAction={startPublishAction}
          finishAction={finishPublishAction}
          republishAction={publishIntentAction}
        />

        <section className="flex flex-col gap-4 border-t border-border pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold text-ink">
              {person.campusId} · 种子广场
            </h2>
            <span className="t-cap text-ink-soft">{board.length} 颗</span>
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">
            别人埋下的、还没长起来的愿望。冷启动期先让人自己翻，而不是给一个空推荐位假装智能。
          </p>

          <DomainFilter active={domain} />

          <IntentBoard items={board} viewerPersonId={person.id} />
        </section>
      </>
    </PageShell>
  )
}

function DomainFilter({ active }: { active?: Domain }) {
  return (
    <nav aria-label="按领域筛选" className="flex flex-wrap gap-1.5">
      <Link href="/square" className={chipClass(!active)}>
        全部
      </Link>
      {DOMAINS.map((d) => (
        <Link key={d} href={`/square?domain=${d}`} className={chipClass(active === d)}>
          {DOMAIN_LABEL[d]}
        </Link>
      ))}
    </nav>
  )
}

function chipClass(isActive: boolean): string {
  return `flex min-h-11 items-center rounded-[var(--radius-pill)] border px-4 text-sm transition-colors duration-200 ${
    isActive
      ? 'border-accent-deep bg-accent-deep font-semibold text-accent-ink'
      : 'border-border-strong text-ink-muted'
  }`
}
