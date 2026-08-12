import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { PoolEngine, WillingCandidate } from '@pool/engine'
import { DELIVERY_FANOUT } from '@pool/engine'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { SeedDispatchPanel } from '@/components/seed-dispatch-panel'
import { WillingCandidateCard } from '@/components/willing-candidate-card'
import { PageHeader, PageShell, EmptyState } from '@/components/page-header'

type MyIntent = Awaited<ReturnType<PoolEngine['myIntents']>>[number]

interface CandidatesPageProps {
  searchParams: Promise<{ intent?: string }>
}

/**
 * 候选（S3 #5，投递制版本）。
 *
 * 引擎从「挑选制」改成了「投递制」（docs/STORY.md 第②③阶段，
 * packages/engine/src/delivery-service.ts）：发起人不再从候选卡里直接挑一个
 * 去接管——那会让他把仅有的几次尝试勇气花在一次抛硬币上。现在的顺序是
 * 三步：种子先发出去（`deliverSeed`），候选各自表态愿意与否（信箱页，
 * 另一条线在做），发起人只在已经说了「愿意」的人里选（`willingFor` →
 * `chooseCompanion`）。这一页只做后两步：只做「取 actor → 调 PoolEngine →
 * 渲染」，`willingFor` 本身安全幂等，`deliverSeed`／`chooseCompanion` 都封在
 * 子组件的 `useActionState` 表单里，只有真人点击才会触发——尤其是
 * `deliverSeed`，它内部直接调 `refreshCandidates`，每次调用都真花一次匹配
 * 漏斗的钱，绝不能挂在这个页面的渲染路径上。
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

  let willing: WillingCandidate[] = []
  let willingError: string | null = null
  try {
    willing = await engine.willingFor(actor, intentId)
  } catch (err) {
    willingError = err instanceof Error ? err.message : '暂时看不到谁愿意，晚点再试'
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="你发出去的种子"
        title={sourceIntent.rawText}
        lede="种子先发给几位可能合适的人，等他们各自表态愿意，你再从愿意的人里选——选中的那一刻池塘就成立，你写的第一句话必须是你自己的。"
        aside={
          willing.length > 0 ? (
            <span className="t-cap text-ink-soft">{willing.length} 人愿意</span>
          ) : undefined
        }
      />

      <SeedDispatchPanel intentId={intentId} fanout={DELIVERY_FANOUT} />

      <div className="flex flex-col gap-5">
        <p className="t-cap font-medium tracking-wide text-accent-deep">愿意跟你一起的人</p>

        {willingError ? (
          <WillingError message={willingError} />
        ) : willing.length === 0 ? (
          <EmptyWilling />
        ) : (
          <ul className="flex flex-col gap-5">
            {willing.map((w, i) => (
              <li key={w.personId}>
                <WillingCandidateCard candidate={w} intentId={intentId} index={i + 1} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  )
}

function WillingError({ message }: { message: string }) {
  return (
    <EmptyState>
      <p>暂时看不到谁愿意：{message}</p>
      <p className="mt-1">过会儿再回来看看。</p>
    </EmptyState>
  )
}

/**
 * 诚实的空状态：这里区分不了「还没发出去」和「发出去了但没人回」——
 * `willingFor` 只认 `state = 'willing'`，两种情况看到的都是空列表，
 * 所以文案把两种可能都说清楚，而不是替用户猜一个。
 */
function EmptyWilling() {
  return (
    <EmptyState>
      <p>
        现在没有人在等你选——可能是这颗种子还没发出去，也可能发出去了，但候选还没回复。
        点上面「发出去」，然后过一会儿回来看看。
      </p>
      <Link
        href="/home"
        className="mt-3 inline-block text-accent-deep underline decoration-dotted underline-offset-4"
      >
        如果这颗种子已经成局，去我的花园看看 →
      </Link>
    </EmptyState>
  )
}

/**
 * 没带意图参数时的落地形态。
 *
 * 用户多半是从导航直接点进来的，他自己种的种子就在库里，
 * 让他再跳一次广场才能选，是白白多一步。直接把他的种子列出来选。
 */
function PickIntent({ intents }: { intents: MyIntent[] }) {
  return (
    <PageShell>
      <PageHeader
        eyebrow="候选"
        title="先挑一颗你种下的种子"
        lede="谁愿意跟你一起是分开算的——不同的种子，表态愿意的人不一样，所以没有一份「通用名单」。"
      />
      {intents.length === 0 ? (
        <EmptyState>
          <p>你还没种下任何一颗。</p>
          <Link
            href="/square"
            className="mt-3 inline-block text-accent-deep underline decoration-dotted underline-offset-4"
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
        className="self-start text-sm text-accent-deep underline decoration-dotted underline-offset-4"
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
            <span className="t-cap shrink-0 text-accent-deep">去看看 →</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
