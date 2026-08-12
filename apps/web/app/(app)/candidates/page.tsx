import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Candidate, PoolEngine } from '@pool/engine'
import { MAX_CANDIDATES, MIN_CANDIDATES } from '@pool/shared'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { CandidateCard } from '@/components/candidate-card'

type MyIntent = Awaited<ReturnType<PoolEngine['myIntents']>>[number]

interface CandidatesPageProps {
  searchParams: Promise<{ intent?: string }>
}

/**
 * 候选卡（S3 #5）。
 *
 * 同样只做「取 actor → 调 PoolEngine → 渲染」。findCandidates 本身只认
 * 「本人的意图」，所以这里先用 myIntents 确认这条意图确实是当前用户发的——
 * 给出诚实的引导页，而不是让 PoolEngine 抛出的权限错误裸奔到用户面前。
 */
export default async function CandidatesPage({ searchParams }: CandidatesPageProps) {
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const { intent: intentId } = await searchParams
  if (!intentId) return <NoIntentSelected />

  const mine = await engine.myIntents(actor)
  const sourceIntent = mine.find((i) => i.id === intentId)
  if (!sourceIntent) return <IntentNotFound intents={mine} />

  let candidates: Candidate[] = []
  let matchError: string | null = null
  try {
    candidates = await engine.candidatesFor(actor, intentId)
  } catch (err) {
    matchError = err instanceof Error ? err.message : '匹配暂时打不开，晚点再试'
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-5 py-12 sm:px-8">
      <header>
        <p className="text-sm font-medium text-accent">为这条意图找搭子</p>
        <h1 className="mt-2 font-head text-2xl font-semibold leading-snug text-ink sm:text-3xl">
          {sourceIntent.rawText}
        </h1>
      </header>

      {matchError ? (
        <MatchError message={matchError} />
      ) : candidates.length === 0 ? (
        <EmptyCandidates />
      ) : (
        <ul className="flex flex-col gap-4">
          {candidates.map((candidate) => (
            <li key={candidate.personId}>
              <CandidateCard candidate={candidate} seekerIntentId={intentId} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function EmptyCandidates() {
  return (
    <div className="border border-dashed border-border p-6 text-sm leading-relaxed text-ink-soft">
      <p>
        校区里暂时没有合适的人可以推荐——不是没人在，是这一批凑不出
        {` ${MIN_CANDIDATES}`}–{MAX_CANDIDATES} 个靠谱的候选。
      </p>
      <Link
        href="/square"
        className="mt-3 inline-block text-accent underline decoration-dotted underline-offset-4"
      >
        去意图广场自己看看 →
      </Link>
    </div>
  )
}

function MatchError({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-border p-6 text-sm leading-relaxed text-ink-soft">
      <p>匹配暂时跑不动：{message}</p>
      <p className="mt-1">过会儿再回来看看，或者先去广场逛逛。</p>
      <Link
        href="/square"
        className="mt-3 inline-block text-accent underline decoration-dotted underline-offset-4"
      >
        去意图广场 →
      </Link>
    </div>
  )
}

function NoIntentSelected() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-5 py-12 sm:px-8">
      <h1 className="font-head text-2xl font-semibold text-ink">还没有指定意图</h1>
      <p className="text-sm leading-relaxed text-ink-muted">
        候选卡是为某一条具体的意图找的。先去广场发一句，再从那条意图旁边点「找搭子」。
      </p>
      <Link
        href="/square"
        className="self-start border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
      >
        去发一条 →
      </Link>
    </main>
  )
}

function IntentNotFound({ intents }: { intents: MyIntent[] }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-5 py-12 sm:px-8">
      <h1 className="font-head text-2xl font-semibold text-ink">这条意图找不到了</h1>
      <p className="text-sm leading-relaxed text-ink-muted">
        可能不是你发的，也可能链接不对。
        {intents.length > 0 ? '挑一条你自己发过的：' : '去广场发一条新的吧。'}
      </p>

      {intents.length > 0 && (
        <ul className="flex flex-col gap-2">
          {intents.slice(0, 5).map((i) => (
            <li key={i.id}>
              <Link
                href={`/candidates?intent=${i.id}`}
                className="block border border-border px-4 py-2.5 text-sm text-ink transition-colors hover:border-accent"
              >
                {i.rawText}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/square"
        className="self-start text-sm text-accent underline decoration-dotted underline-offset-4"
      >
        去意图广场 →
      </Link>
    </main>
  )
}
