import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { ProposalEditor } from '@/components/proposal-editor'
import { PageHeader, PageShell } from '@/components/page-header'
import { rehearseAction, takeOverAction } from './actions'

interface PoolNewPageProps {
  searchParams: Promise<{ seekerIntentId?: string; candidateIntentId?: string }>
}

/**
 * 接管确认页 —— 判据①里「亲手接管」这一步落地的地方，也是四条红线里
 * 前两条（连接对象、表述方式）唯一的执行点。
 *
 * 只做「取 actor → 调 PoolEngine → 渲染」：预演本身按需触发（点按钮才跑），
 * 不在这个 Server Component 里自动调用 rehearseWith —— 那样每次刷新页面
 * 都会重新打一遍模型、重新写一条 rehearsal 记录，白花钱。
 */
export default async function PoolNewPage({ searchParams }: PoolNewPageProps) {
  const { seekerIntentId, candidateIntentId } = await searchParams
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  if (!seekerIntentId || !candidateIntentId) {
    return <MissingIntent />
  }

  // 只能为自己的意图发起接管——用 myIntents 提前确认，给出诚实的引导页，
  // 而不是让 rehearseWith 内部的权限错误裸奔到用户面前。
  const mine = await engine.myIntents(actor)
  const sourceIntent = mine.find((i) => i.id === seekerIntentId)
  if (!sourceIntent) {
    return <IntentNotMine />
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="破土之前的最后一步"
        title="先看看两边的 Agent 商量出了什么"
        lede="它们已经聊过一轮，整理成了下面这张提案卡。这只是草稿——对方此刻完全不知道有过这次预演。连接是否成立，只看你要不要按「我来说」。"
      />

      <div className="border-l-2 border-border pl-4">
        <p className="mark text-ink-soft">你种下的那颗</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink break-anywhere">
          {sourceIntent.rawText}
        </p>
      </div>

      <ProposalEditor
        seekerIntentId={seekerIntentId}
        candidateIntentId={candidateIntentId}
        rehearseAction={rehearseAction}
        takeOverAction={takeOverAction}
      />
    </PageShell>
  )
}

function MissingIntent() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="接管确认"
        title="缺一半信息"
        lede="这一步需要两颗种子——你的和对方的——才能生成提案卡。正常情况下应该是从候选卡的「我来说」点进来的。"
      />
      <div className="flex flex-col gap-2">
        <Link
          href="/candidates"
          className="text-sm text-accent underline decoration-dotted underline-offset-4"
        >
          去候选看看 →
        </Link>
        <Link
          href="/square"
          className="text-sm text-accent underline decoration-dotted underline-offset-4"
        >
          或者去种一颗新的 →
        </Link>
      </div>
    </PageShell>
  )
}

function IntentNotMine() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="接管确认"
        title="这颗种子不是你种的"
        lede="接管只能由种下它的人本人触发，链接可能不对。"
      />
      <Link
        href="/square"
        className="self-start text-sm text-accent underline decoration-dotted underline-offset-4"
      >
        去种子广场 →
      </Link>
    </PageShell>
  )
}
