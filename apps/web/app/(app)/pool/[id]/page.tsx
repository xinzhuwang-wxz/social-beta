import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DOMAIN_LABEL } from '@pool/shared'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { PoolTimeline } from '@/components/pool-timeline'
import { PoolMessageForm } from '@/components/pool-message-form'
import { PoolArtifactForm } from '@/components/pool-artifact-form'
import { PoolFeedbackForm } from '@/components/pool-feedback-form'
import { PoolDormantPanel } from '@/components/pool-dormant-panel'
import { confirmJoinAction, finishEventAction, sealPoolAction } from './actions'

interface PoolPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}

const STATE_LABEL: Record<string, string> = {
  open: '待成行',
  matching: '匹配中',
  forming: '组队中',
  active: '进行中',
  done: '已办完',
  dormant: '休眠中',
}

function domainLabel(domain: string | null): string {
  if (!domain) return '池塘'
  return (DOMAIN_LABEL as Record<string, string>)[domain] ?? domain
}

/**
 * /pool/[id] —— 判据①里最关键的一段：真人在这里协作、精灵在这里发卡、
 * 事件在这里回流、约定在这里休眠又醒来。
 *
 * 「这条池塘是不是我的」不在这里判断，交给 myPools 的返回结果本身回答——
 * RLS 已经替我们过滤过一遍：不是在册（joined）成员的人，myPools 里
 * 根本不会出现这条记录，即便他知道 URL 也一样。这正是把「是否有权限」
 * 这类判断整体下沉到 PoolEngine/RLS、页面这层不重复实现的意义。
 */
export default async function PoolPage({ params, searchParams }: PoolPageProps) {
  const { id: poolId } = await params
  const { error } = await searchParams
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const pools = await engine.myPools(actor)
  const pool = pools.find((p) => p.id === poolId)

  if (!pool) {
    return <NotJoinedYet poolId={poolId} error={error} />
  }

  // 精灵的心跳：每次打开池塘都让它看一眼要不要出面。
  // forming 阶段限量主动、active 阶段绝大多数时候会沉默（ADR-0004）——
  // 沉默时这一步没有任何副作用，多打开几次页面不会多花一分钱。
  // 失败了也不该拖垮整个页面：精灵这次没出面，池塘该看还是能看。
  try {
    await engine.tickSpirit(poolId)
  } catch {
    // 忽略——见上面的注释
  }

  const timeline = await engine.poolTimeline(actor, poolId)
  const isOngoing = pool.state === 'forming' || pool.state === 'active'
  const isDone = pool.state === 'done'
  const isDormant = pool.state === 'dormant'
  const wakeCard = isDormant ? await engine.wakeCardFor(poolId) : null

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-5 py-12 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">
          {domainLabel(pool.domain)} · {STATE_LABEL[pool.state] ?? pool.state}
        </p>
        <h1 className="font-head text-2xl font-semibold text-ink sm:text-3xl">
          {pool.title ?? '（未命名池塘）'}
        </h1>
        <p className="text-sm text-ink-soft">
          {pool.memberCount} 人 · {pool.artifactCount} 份回流物
        </p>
      </header>

      {error && (
        <p role="alert" className="border border-seal bg-seal-soft px-4 py-3 text-sm text-seal-strong">
          {decodeURIComponent(error)}
        </p>
      )}

      {isDormant && (
        <PoolDormantPanel poolId={poolId} nextHook={pool.nextHook} due={Boolean(wakeCard)} />
      )}

      <div>
        <p className="mb-2 text-xs text-ink-soft">
          虚线卡片是精灵发的，不是任何人说的话。
        </p>
        <PoolTimeline entries={timeline} viewerPersonId={person.id} poolId={poolId} />
      </div>

      {!isDormant && <PoolMessageForm poolId={poolId} />}

      {isOngoing && (
        <form action={finishEventAction.bind(null, poolId)} className="self-start">
          <button
            type="submit"
            className="border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
          >
            办完了
          </button>
        </form>
      )}

      {isDone && (
        <section className="flex flex-col gap-6 border-t border-border pt-6">
          <h2 className="font-head text-lg font-semibold text-ink">传张图，留句反馈</h2>
          <PoolArtifactForm poolId={poolId} />
          <PoolFeedbackForm poolId={poolId} />
          <form action={sealPoolAction.bind(null, poolId)} className="flex flex-col gap-2">
            <button
              type="submit"
              className="self-start border border-seal bg-seal px-4 py-2 text-sm font-medium text-seal-ink transition-colors hover:border-seal-strong hover:bg-seal-strong"
            >
              写完了，存进记忆
            </button>
            <p className="text-xs text-ink-soft">
              会生成一句回顾和下次的理由，池塘随后转入休眠——不是销毁，是带着这句话睡着。
            </p>
          </form>
        </section>
      )}
    </main>
  )
}

function NotJoinedYet({ poolId, error }: { poolId: string; error?: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-5 py-12">
      <h1 className="font-head text-xl font-semibold text-ink">这个池塘你还进不去</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        可能是收到了邀请但还没确认，也可能这条链接不是给你的。如果是前者，确认一下就能看到里面的内容了。
      </p>
      {error && (
        <p role="alert" className="text-sm text-seal">
          {decodeURIComponent(error)}
        </p>
      )}
      <form action={confirmJoinAction.bind(null, poolId)}>
        <button
          type="submit"
          className="border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:border-accent-strong hover:bg-accent-strong"
        >
          确认加入
        </button>
      </form>
      <Link href="/invites" className="text-sm text-accent underline decoration-dotted underline-offset-4">
        去看看收到的邀请 →
      </Link>
    </main>
  )
}
