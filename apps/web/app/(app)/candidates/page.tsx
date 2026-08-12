import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Candidate, PoolEngine } from '@pool/engine'
import { MAX_CANDIDATES, MIN_CANDIDATES } from '@pool/shared'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { CandidateCard } from '@/components/candidate-card'
import { PageHeader, PageShell, EmptyState } from '@/components/page-header'

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
  const mine = await engine.myIntents(actor)

  if (!intentId) return <PickIntent intents={mine} />

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
    <PageShell>
      <PageHeader
        eyebrow="你的 Agent 带回来的"
        title={sourceIntent.rawText}
        lede="每张卡上的「为什么是他」都必须引用他真的写过的内容——读起来像模板句，就说明这次没匹配好，你可以直接跳过。"
        aside={
          candidates.length > 0 ? (
            <span className="mark text-ink-soft">{candidates.length} 张</span>
          ) : undefined
        }
      />

      {matchError ? (
        <MatchError message={matchError} />
      ) : candidates.length === 0 ? (
        <EmptyCandidates />
      ) : (
        <>
          <ul className="flex flex-col gap-5">
            {candidates.map((candidate, i) => (
              <li key={candidate.personId}>
                <CandidateCard
                  candidate={candidate}
                  seekerIntentId={intentId}
                  index={i + 1}
                />
              </li>
            ))}
          </ul>
          <p className="border-t border-border pt-5 text-xs leading-relaxed text-ink-soft">
            一张都不合适？什么都不做就行。不点「我来说」，对方永远不会知道你看过他——
            候选卡不是聊天记录，它只存在于你这一侧。
          </p>
        </>
      )}
    </PageShell>
  )
}

function EmptyCandidates() {
  return (
    <EmptyState>
      <p>
        校区里暂时没有合适的人可以推荐——不是没人在，是这一批凑不出
        {` ${MIN_CANDIDATES}`}–{MAX_CANDIDATES} 个靠谱的候选。
      </p>
      <Link
        href="/square"
        className="mt-3 inline-block text-accent underline decoration-dotted underline-offset-4"
      >
        去种子广场自己翻翻 →
      </Link>
    </EmptyState>
  )
}

function MatchError({ message }: { message: string }) {
  return (
    <EmptyState>
      <p>匹配暂时跑不动：{message}</p>
      <p className="mt-1">过会儿再回来看看，或者先去广场逛逛。</p>
      <Link
        href="/square"
        className="mt-3 inline-block text-accent underline decoration-dotted underline-offset-4"
      >
        去种子广场 →
      </Link>
    </EmptyState>
  )
}

/**
 * 没带意图参数时的落地形态。
 *
 * 原本这里是一句「还没有指定意图」的说明加一个去广场的链接 ——
 * 但用户多半是从导航直接点进来的，他自己种的种子就在库里，
 * 让他再跳一次广场才能选，是白白多一步。直接把他的种子列出来选。
 */
function PickIntent({ intents }: { intents: MyIntent[] }) {
  return (
    <PageShell>
      <PageHeader
        eyebrow="候选"
        title="先挑一颗你种下的种子"
        lede="候选是为某一颗具体的种子找的——不同的愿望要找的人不一样，所以没有一份「通用推荐」。"
      />
      {intents.length === 0 ? (
        <EmptyState>
          <p>你还没种下任何一颗。</p>
          <Link
            href="/square"
            className="mt-3 inline-block text-accent underline decoration-dotted underline-offset-4"
          >
            去种一颗 →
          </Link>
        </EmptyState>
      ) : (
        <IntentPicker intents={intents} />
      )}
    </PageShell>
  )
}

function IntentNotFound({ intents }: { intents: MyIntent[] }) {
  return (
    <PageShell>
      <PageHeader
        eyebrow="候选"
        title="这颗种子找不到了"
        lede="可能不是你种的，也可能链接不对。候选只能由种下它的人来看。"
      />
      {intents.length > 0 && <IntentPicker intents={intents} />}
      <Link
        href="/square"
        className="self-start text-sm text-accent underline decoration-dotted underline-offset-4"
      >
        去种子广场 →
      </Link>
    </PageShell>
  )
}

function IntentPicker({ intents }: { intents: MyIntent[] }) {
  return (
    <ul className="border-t border-border">
      {intents.slice(0, 8).map((i) => (
        <li key={i.id} className="border-b border-border">
          <Link
            href={`/candidates?intent=${i.id}`}
            className="flex items-baseline justify-between gap-4 py-3.5 transition-colors hover:bg-surface-raised"
          >
            <span className="min-w-0 text-sm leading-relaxed text-ink break-anywhere">
              {i.rawText}
            </span>
            <span className="mark shrink-0 text-accent">找人 →</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
