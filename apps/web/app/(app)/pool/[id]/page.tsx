import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { stageOf, stateLabel, STAGE_LABEL } from '@/lib/growth'
import { ColorField } from '@/components/color-field'
import { PoolBoardDetails } from '@/components/pool-board'
import { PlanCard } from '@/components/plan-card'
import { DayStatusPanel } from '@/components/day-status'
import { PoolTimeline } from '@/components/pool-timeline'
import { PoolMessageForm } from '@/components/pool-message-form'
import { PoolArtifactForm } from '@/components/pool-artifact-form'
import { PoolFeedbackForm } from '@/components/pool-feedback-form'
import { PoolDormantPanel } from '@/components/pool-dormant-panel'
import { ErrorBanner } from '@/components/page-header'
import { confirmJoinAction, finishEventAction, sealPoolAction } from './actions'

interface PoolPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}

/**
 * /pool/[id] —— 行动房间。真人在这里协作、精灵在这里发卡、
 * 计划在这里被逐个确认、事件在这里回流、约定在这里休眠又醒来。
 *
 * 版面分两层：
 *   上层是主色域 —— 一块纯色 + 一个圆 + 圆里那株植物 + 阶段名 + 几个 pill。
 *     它是这一屏的情绪，也是「这件事活着」的那一眼。
 *   下层是编辑区 —— 看板明细、确认卡、时间线，全部方角细线，安静到底。
 *
 * 看板的内容全部来自 PoolEngine.poolBoard，页面不自己算 ——
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

  const meta = [
    `${board.members.filter((m) => m.state === 'joined').length} 人在做这件事`,
    `${board.artifactCount} 份回流物`,
    stateLabel(board.state),
  ]

  return (
    <div className="flex flex-col">
      <ColorField
        eyebrow="行动房间"
        title={STAGE_LABEL[stage]}
        stage={stage}
        artifacts={board.artifactCount}
        meta={meta}
      >
        <p className="max-w-xl text-sm leading-relaxed opacity-90 break-anywhere">
          {board.title ?? '（还没起名字）'}
        </p>
      </ColorField>

      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        {error && (
          <div className="mb-6">
            <ErrorBanner message={decodeURIComponent(error)} />
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-10">
          {/* 看板在 DOM 里排在时间线前面：窄屏上它就出现在最上方（PRD 要求
              顶部持续展示），宽屏上它靠 lg:sticky 一直跟着滚。 */}
          <div className="flex flex-col gap-6 lg:sticky lg:top-32 lg:col-start-1 lg:self-start">
            <PoolBoardDetails board={board} />

            {isDormant && (
              <PoolDormantPanel
                poolId={poolId}
                nextHook={board.nextHook}
                due={Boolean(wakeCard)}
              />
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

          <div className="flex min-w-0 flex-col gap-8 lg:col-start-2 lg:row-start-1">
            {(isOngoing || board.plan) && (
              <PlanCard
                poolId={poolId}
                plan={board.plan}
                members={board.members}
                viewerPersonId={person.id}
                canEdit={isOngoing}
              />
            )}

            <section>
              <h2 className="mark border-b border-border pb-2 text-ink-soft">
                时间线 · 这件事是怎么走到这一步的
              </h2>
              <div className="mt-4">
                <PoolTimeline entries={timeline} viewerPersonId={person.id} poolId={poolId} />
              </div>
            </section>

            {!isDormant && <PoolMessageForm poolId={poolId} />}

            {isOngoing && (
              <form
                action={finishEventAction.bind(null, poolId)}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-5"
              >
                <button
                  type="submit"
                  className="border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  办完了
                </button>
                <p className="text-xs text-ink-soft">
                  点了之后这株才谈得上开花——开花的依据是事真的做成了，不是聊得热闹。
                </p>
              </form>
            )}

            {isDone && (
              <section className="flex flex-col gap-6 border-t border-border pt-6">
                <div>
                  <h2 className="font-head text-lg font-semibold text-ink">传张图，留句反馈</h2>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                    每一份返图都会让这株多开一朵花——它是「这件事真的发生过」的证据。
                  </p>
                </div>
                <PoolArtifactForm poolId={poolId} />
                <PoolFeedbackForm poolId={poolId} />
                <form
                  action={sealPoolAction.bind(null, poolId)}
                  className="flex flex-col gap-2 border-t border-border pt-5"
                >
                  <button
                    type="submit"
                    className="self-start border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:border-accent-strong hover:bg-accent-strong"
                  >
                    写完了，存进记忆
                  </button>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    会生成一句回顾和下次的理由，随后这株结果休眠——不是销毁，是把籽留下。
                  </p>
                </form>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function NotJoinedYet({ poolId, error }: { poolId: string; error?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-4 px-5 py-16">
      <h1 className="font-head text-xl font-semibold text-ink">这件事你还进不去</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        可能是收到了种子但还没回应，也可能这条链接不是给你的。
      </p>
      {error && <ErrorBanner message={decodeURIComponent(error)} />}
      <form action={confirmJoinAction.bind(null, poolId)}>
        <button
          type="submit"
          className="border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:border-accent-strong hover:bg-accent-strong"
        >
          确认加入
        </button>
      </form>
      <Link
        href="/invites"
        className="text-sm text-accent underline decoration-dotted underline-offset-4"
      >
        去看看收到的种子 →
      </Link>
    </div>
  )
}
