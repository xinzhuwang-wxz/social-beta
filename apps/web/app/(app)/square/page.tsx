import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DOMAINS, DOMAIN_LABEL, Domain } from '@pool/shared'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { IntentPublishForm } from '@/components/intent-publish-form'
import { IntentBoard } from '@/components/intent-board'
import { publishIntentAction } from './actions'

interface SquarePageProps {
  searchParams: Promise<{ domain?: string }>
}

/**
 * 发意图 + 意图广场（S2 #4）。
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
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-10 px-5 py-12 sm:px-8">
      <header>
        <p className="text-sm font-medium text-accent">发一句，进广场</p>
        <h1 className="mt-2 font-head text-2xl font-semibold text-ink sm:text-3xl">你想干什么</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          怎么说话平时就怎么说，不用挑分类、不用选标签——抽错了发布之后还能改。
        </p>
      </header>

      <IntentPublishForm action={publishIntentAction} />

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-head text-lg font-semibold text-ink">
            {person.campusId} · 意图广场
          </h2>
          <span className="text-xs text-ink-soft">{board.length} 条</span>
        </div>

        <DomainFilter active={domain} />

        <IntentBoard items={board} viewerPersonId={person.id} />
      </section>
    </main>
  )
}

function DomainFilter({ active }: { active?: Domain }) {
  return (
    <nav aria-label="按领域筛选" className="flex flex-wrap gap-2 text-xs">
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
  return `border px-3 py-1.5 transition-colors ${
    isActive
      ? 'border-accent bg-accent-soft text-accent-strong'
      : 'border-border text-ink-muted hover:border-border-strong hover:text-ink'
  }`
}
