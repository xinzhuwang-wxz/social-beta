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
import { PoolMembers } from '@/components/pool-members'
import { CompletionPanel } from '@/components/completion-panel'
import { ErrorBanner, SectionHead } from '@/components/page-header'
import { confirmJoinAction, sealPoolAction, blockFromPoolAction, makePosterAction } from './actions'

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

  // 到点的提醒在这里投递。
  //
  // 提醒本该由定时任务推送，但那需要一个常驻进程；在拿到它之前，
  // 「打开房间时补投」是诚实的降级：提醒仍然只在花苞之后触发、每种只发一次
  // （markReminderSent 落库去重），只是送达时机从「准时」变成「你下次进来时」。
  // 这一点在产品上可接受 —— 三个提醒里最要紧的「集合前两小时」，
  // 用户那时本来就会打开房间看细节。
  try {
    const due = await engine.dueReminders()
    for (const r of due.filter((d) => d.poolId === poolId)) {
      await engine.deliverReminder(r)
    }
  } catch {
    // 同上：提醒送不出去不该让整个房间打不开
  }

  const [board, timeline, completion] = await Promise.all([
    engine.poolBoard(actor, poolId),
    engine.poolTimeline(actor, poolId),
    engine.completionStatus(actor, poolId),
  ])

  const stage = stageOf(board.state)
  const isOngoing = ['forming', 'active', 'planned'].includes(board.state)
  const isDone = board.state === 'done'
  const isDormant = board.state === 'dormant'
  // giveFeedback / 传回流物在引擎侧 done、dormant 两个状态都能用——
  // 封存进记忆之后仍然想补一张图、改一句反馈，不该因为点了「存进记忆」就再也够不着。
  const canRecall = isDone || isDormant
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

          <PoolMembers
            poolId={poolId}
            members={board.members}
            viewerPersonId={person.id}
            blockAction={blockFromPoolAction}
          />

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
            <CompletionPanel poolId={poolId} status={completion} viewerPersonId={person.id} />
          )}

          {canRecall && (
            <section className="flex flex-col gap-5">
              <SectionHead
                title={isDone ? '传张图，留句反馈' : '还能继续留资料、改反馈'}
                hint={
                  isDone
                    ? '每一份返图都会让这株多开一朵花——它是「这件事真的发生过」的证据。'
                    : '已经存进记忆了，但补一张照片、改一句反馈，随时都可以。'
                }
              />
              <PoolArtifactForm poolId={poolId} />

              {board.artifactCount > 0 && (
                <form
                  action={makePosterAction.bind(null, poolId)}
                  className="card flex flex-col gap-2 p-4"
                >
                  <button type="submit" className="btn btn-secondary self-start">
                    做一张海报
                  </button>
                  <p className="t-cap">
                    用你们传上来的照片生成一张属于这次的海报。会真的调用生图模型，
                    所以只有你点了才会发生。
                  </p>
                </form>
              )}

              <PoolFeedbackForm poolId={poolId} />
              {isDone && (
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
              )}
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
