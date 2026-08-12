import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { stageOf, stateLabel, STAGE_LABEL, STAGE_MEANING } from '@/lib/growth'
import { PoolPlant } from '@/components/pool-plant'
import { PoolBoardDetails } from '@/components/pool-board'
import { PlanCard } from '@/components/plan-card'
import { DayStatusPanel } from '@/components/day-status'
import { PoolTimeline } from '@/components/pool-timeline'
import { PoolMessageForm } from '@/components/pool-message-form'
import { PoolArtifactForm } from '@/components/pool-artifact-form'
import { PoolFeedbackForm } from '@/components/pool-feedback-form'
import { PoolDormantPanel } from '@/components/pool-dormant-panel'
import { ErrorBanner, SectionHead } from '@/components/page-header'
import { confirmJoinAction, finishEventAction, sealPoolAction } from './actions'

interface PoolPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}

/**
 * /pool/[id] —— 行动房间。B 类产品页面：80% 标准 UI + 20% 世界观。
 *
 * 这里是要读信息、做决定的地方（谁确认了、什么时候出发、还差什么），
 * 所以它不是农场地图。世界观只出现在顶部那一株植物上，
 * 且**必须配一句文字说明现在在哪一步** —— 光看植物会让人不知道自己该干什么。
 *
 * 看板内容全部来自 PoolEngine.poolBoard，页面不自己算：
 * 「已经定了什么」这种判断放在前端，迟早和引擎算出两个答案。
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
  if (!pool) return <NotJoinedYet poolId={poolId} error={error} />

  // 精灵的心跳：每次打开房间都让它看一眼要不要出面。
  // forming 阶段限量主动、active 阶段绝大多数时候会沉默（ADR-0004）——
  // 沉默时这一步没有任何副作用。失败了也不该拖垮整个页面。
  try {
    await engine.tickSpirit(poolId)
  } catch {
    // 忽略——见上面的注释
  }

  const [board, timeline] = await Promise.all([
    engine.poolBoard(actor, poolId),
    engine.poolTimeline(actor, poolId),
  ])

  const stage = stageOf(board.state)
  const isOngoing = ['forming', 'active', 'planned'].includes(board.state)
  const isDone = board.state === 'done'
  const isDormant = board.state === 'dormant'
  const wakeCard = isDormant ? await engine.wakeCardFor(poolId) : null
  const joined = board.members.filter((m) => m.state === 'joined')

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-9">
      {error && (
        <div className="mb-5">
          <ErrorBanner message={decodeURIComponent(error)} />
        </div>
      )}

      {/* 20% 的世界观：一株植物 + 一句「现在在哪一步」。 */}
      <header className="card mb-7 flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
        <PoolPlant
          stage={stage}
          artifacts={board.artifactCount}
          animate
          label={null}
          className="h-24 w-20 shrink-0 sm:h-28 sm:w-24"
        />
        <div className="min-w-0">
          <p className="t-cap font-medium tracking-wide text-accent-deep">行动房间</p>
          <h1 className="t-h1 mt-1 break-anywhere">
            {board.title ?? '（还没起名字）'}
          </h1>
          <p className="t-sec mt-1.5">
            <span className="font-semibold text-brand">{STAGE_LABEL[stage]}</span>
            {` · ${STAGE_MEANING[stage]}`}
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            <li className="pill">{stateLabel(board.state)}</li>
            <li className="pill">{joined.length} 人在做这件事</li>
            <li className="pill">{board.artifactCount} 份回流物</li>
          </ul>
        </div>
      </header>

      <div className="grid gap-7 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-9">
        {/* 看板在 DOM 里排在时间线前面：窄屏上它就在最上方（PRD 要求
            顶部持续展示），宽屏上靠 lg:sticky 一直跟着滚。 */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-32 lg:col-start-1 lg:self-start">
          <PoolBoardDetails board={board} />

          {isDormant && (
            <PoolDormantPanel poolId={poolId} nextHook={board.nextHook} due={Boolean(wakeCard)} />
          )}

          {board.state === 'planned' && (
            <DayStatusPanel
              poolId={poolId}
              members={board.members}
              statuses={board.statuses}
              viewerPersonId={person.id}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-7 lg:col-start-2 lg:row-start-1">
          {(isOngoing || board.plan) && (
            <PlanCard
              poolId={poolId}
              plan={board.plan}
              members={board.members}
              viewerPersonId={person.id}
              canEdit={isOngoing}
            />
          )}

          <section className="flex flex-col gap-3">
            <SectionHead title="时间线" hint="这件事是怎么走到这一步的" />
            <PoolTimeline entries={timeline} viewerPersonId={person.id} poolId={poolId} />
          </section>

          {!isDormant && <PoolMessageForm poolId={poolId} />}

          {isOngoing && (
            <form
              action={finishEventAction.bind(null, poolId)}
              className="flex flex-wrap items-center gap-x-4 gap-y-2"
            >
              <button type="submit" className="btn btn-quiet btn-sm">
                办完了
              </button>
              <p className="t-cap">
                点了之后这株才谈得上开花——开花的依据是事真的做成了，不是聊得热闹。
              </p>
            </form>
          )}

          {isDone && (
            <section className="flex flex-col gap-5">
              <SectionHead
                title="传张图，留句反馈"
                hint="每一份返图都会让这株多开一朵花——它是「这件事真的发生过」的证据。"
              />
              <PoolArtifactForm poolId={poolId} />
              <PoolFeedbackForm poolId={poolId} />
              <form
                action={sealPoolAction.bind(null, poolId)}
                className="card flex flex-col gap-2 p-4"
              >
                <button type="submit" className="btn btn-primary self-start">
                  写完了，存进记忆
                </button>
                <p className="t-cap">
                  会生成一句回顾和下次的理由，随后这株结果歇下——不是销毁，是把籽留下。
                </p>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function NotJoinedYet({ poolId, error }: { poolId: string; error?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-4 px-4 py-14">
      <h1 className="t-h2">这件事你还进不去</h1>
      <p className="t-sec">
        可能是收到了种子但还没回应，也可能这条链接不是给你的。
      </p>
      {error && <ErrorBanner message={decodeURIComponent(error)} />}
      <form action={confirmJoinAction.bind(null, poolId)}>
        <button type="submit" className="btn btn-primary">
          算我一个
        </button>
      </form>
      <Link
        href="/invites"
        className="t-sec font-medium text-accent-deep underline underline-offset-4"
      >
        去信箱看看 →
      </Link>
    </div>
  )
}
