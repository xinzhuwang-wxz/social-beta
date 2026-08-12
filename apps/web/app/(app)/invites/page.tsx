import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import {
  PageHeader,
  PageShell,
  SectionHead,
  EmptyState,
  ErrorBanner,
} from '@/components/page-header'
import { MessengerBird } from '@/components/messenger-bird'
import { SeedInboxCard } from '@/components/seed-inbox-card'
import { replyToInviteAction } from './actions'

interface InvitesPageProps {
  searchParams: Promise<{ error?: string }>
}

const DATE_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * /invites —— 信箱：两条完全不同的回应模型收在同一个页面里。
 *
 * 「收到的种子」是投递制的入口（docs/STORY.md 第②③阶段，见
 * packages/engine/src/delivery-service.ts）：一颗种子发给多名候选，
 * 候选各自表态愿意与否，发起人只在愿意的人里选。所以这里的主按钮
 * 不叫「加入」，叫「愿意参与」——选没选中要等发起人决定，页面不预告结果，
 * 也不会在这里把人直接带进池塘。
 *
 * 「池塘邀请」是旧的挑选制确认流程，现在只剩一处还在用：池塘休眠后
 * 被派生唤醒时，原成员会重新变回 invited 状态，需要再确认一次
 * （阶段⑨，见 pool-dormant-panel.tsx 的 acceptWakeAction）。
 * `myInvites` / `replyToInvite` 因此保留，不能删——那一段的「算我一个」
 * 才是真正的加入。
 *
 * 三条不对称可见性规则在种子这一段必须守住：候选人看不到推荐理由、
 * 打分、竞争人数、以及最终被选中的是谁——`seedInbox` 走的是
 * `my_seed_inbox` 视图，这几样在 SQL 层就不存在，前端也不用另外查。
 * 落选的种子会安静地从信箱消失（转 closed 后被视图过滤掉），
 * 文案上不写「你不合适」，只是不再出现。
 */
export default async function InvitesPage({ searchParams }: InvitesPageProps) {
  const { error } = await searchParams
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const [seeds, invites] = await Promise.all([engine.seedInbox(actor), engine.myInvites(actor)])
  const pendingCount = seeds.length + invites.length

  return (
    <PageShell>
      <PageHeader
        eyebrow="信箱"
        title="有人想和你一起做一件事"
        lede="别人的信使鸟把种子送到了你这儿。不回应没有任何代价，也不需要说明理由——什么都不做本身就是最诚实的答案。"
        aside={pendingCount > 0 ? <span className="badge">{pendingCount}</span> : undefined}
        art={<MessengerBird state="delivering" className="size-20" label={null} />}
      />

      {error && <ErrorBanner message={decodeURIComponent(error)} />}

      <section className="flex flex-col gap-3">
        <SectionHead
          title="收到的种子"
          aside={seeds.length > 0 ? <span className="t-cap">{seeds.length} 颗</span> : undefined}
          hint="表个态，发起人才看得到你——愿意参与可以附一句话，不感兴趣不用说理由。"
        />

        {seeds.length === 0 ? (
          <EmptyState>
            现在没有等你回应的种子。有人的心愿和你匹配上时，它会出现在这里。
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {seeds.map((item) => (
              <SeedInboxCard key={item.intentId} item={item} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead
          title="池塘邀请"
          aside={invites.length > 0 ? <span className="t-cap">{invites.length} 个</span> : undefined}
          hint="已经成局过的池塘，因为有人醒来而重新邀请你回到原来的位置。"
        />

        {invites.length === 0 ? (
          <EmptyState>没有等你确认的池塘邀请。</EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {invites.map((invite) => (
              <li key={invite.poolId} className="card">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-base font-semibold text-ink break-anywhere">
                    {invite.title ?? '（还没起名字）'}
                  </p>
                  <p className="t-cap mt-1 text-ink-soft">
                    {DATE_FORMAT.format(invite.invitedAt)} 送到
                  </p>
                </div>

                {/* 四个选项，不是「加入」加一个沉默。
                    三个平级按钮 + 一个可展开的「想去，但要调整」——
                    「这次不了」和「以后再说」刻意做得和「加入」一样平静：
                    产品说不回应没有代价，界面就不该偷偷制造代价。 */}
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  <form action={replyToInviteAction.bind(null, invite.poolId, 'join')}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                    >
                      算我一个
                    </button>
                  </form>
                  <form action={replyToInviteAction.bind(null, invite.poolId, 'decline')}>
                    <button
                      type="submit"
                      className="btn btn-quiet"
                    >
                      这次不了
                    </button>
                  </form>
                  <form action={replyToInviteAction.bind(null, invite.poolId, 'later')}>
                    <button
                      type="submit"
                      className="btn btn-quiet"
                    >
                      以后再说
                    </button>
                  </form>
                </div>

                {/* <details> 而不是一个需要 JS 的展开：无脚本也能用，键盘可达。 */}
                <details className="border-t border-border">
                  <summary className="cursor-pointer px-4 py-2.5 text-sm text-accent-deep">
                    想去，但时间或地点要调整
                  </summary>
                  <form
                    action={replyToInviteAction.bind(null, invite.poolId, 'adjust')}
                    className="flex flex-col gap-2 px-4 pt-1 pb-4"
                  >
                    <label
                      htmlFor={`note-${invite.poolId}`}
                      className="text-xs leading-relaxed text-ink-soft"
                    >
                      写一句你的条件，它会直接发进那件事里。你仍然停在待回应，随时可以改主意。
                    </label>
                    <textarea
                      id={`note-${invite.poolId}`}
                      name="note"
                      rows={2}
                      required
                      placeholder="比如「周六下午有课，晚点出发的话我就去」"
                      className="border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
                    />
                    <button
                      type="submit"
                      className="self-start btn btn-secondary"
                    >
                      发出去
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs leading-relaxed text-ink-soft">
        种子这边的「愿意参与」不代表已经定下来——发起人会在愿意的人里挑，选中后这里会直接长成一个新的池塘，
        你就是里面的一员，不用再确认一次。池塘邀请那边的「算我一个」不一样，点了才真正加入，
        聊下来发现不合适，随时还能退出。
      </p>
    </PageShell>
  )
}
