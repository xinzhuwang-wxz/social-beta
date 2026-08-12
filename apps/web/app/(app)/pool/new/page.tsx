import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { ProposalEditor } from '@/components/proposal-editor'
import { rehearseAction, takeOverAction } from './actions'

interface PoolNewPageProps {
  searchParams: Promise<{ seekerIntentId?: string; candidateIntentId?: string }>
}

/**
 * 接管确认页——判据①里「亲手接管」这一步落地的地方。
 *
 * 候选卡页面（不归这一刀改）目前还没把「我来说」接到 rehearseWith/takeOver，
 * 这里补一个独立入口：带上 `?seekerIntentId=...&candidateIntentId=...` 打开，
 * 生成一次预演，草稿放进可编辑的文本框，用户可以直接用、改几个字、或者
 * 整段删了重写——点「我来说」才真正调用 takeOver 开池塘。
 *
 * 只做「取 actor → 调 PoolEngine → 渲染」：预演本身按需触发（点按钮才跑），
 * 不在这个 Server Component 里自动调用 rehearseWith——那样每次刷新页面
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
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-5 py-12 sm:px-8">
      <header>
        <p className="text-sm font-medium text-accent">接管前的最后一步</p>
        <h1 className="mt-2 font-head text-2xl font-semibold text-ink sm:text-3xl">
          先看看 Agent 商量出了什么
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          你的 Agent 和对方的 Agent 已经聊过一轮，整理成了下面这张提案卡。
          它只是草稿——连接是否成立，只看你要不要按「我来说」。
        </p>
      </header>

      <ProposalEditor
        seekerIntentId={seekerIntentId}
        candidateIntentId={candidateIntentId}
        rehearseAction={rehearseAction}
        takeOverAction={takeOverAction}
      />
    </main>
  )
}

function MissingIntent() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-5 py-12">
      <h1 className="font-head text-xl font-semibold text-ink">缺一半信息</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        接管确认页需要两条意图——你的和对方的——才能生成提案卡。正常情况下应该是从候选卡
        「我来说」点进来的。
      </p>
      <div className="flex flex-col gap-2">
        <Link href="/candidates" className="text-sm text-accent underline decoration-dotted underline-offset-4">
          去候选卡看看 →
        </Link>
        <Link href="/square" className="text-sm text-accent underline decoration-dotted underline-offset-4">
          或者去意图广场发一条 →
        </Link>
      </div>
    </main>
  )
}

function IntentNotMine() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-5 py-12">
      <h1 className="font-head text-xl font-semibold text-ink">这条意图不是你发的</h1>
      <p className="text-sm leading-relaxed text-ink-soft">接管只能由发起方本人触发，链接可能不对。</p>
      <Link href="/square" className="text-sm text-accent underline decoration-dotted underline-offset-4">
        去意图广场 →
      </Link>
    </main>
  )
}
