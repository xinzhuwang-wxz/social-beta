import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { ColorField } from '@/components/color-field'
import { PageShell, EmptyState, ErrorBanner } from '@/components/page-header'
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
 * /invites —— 收到的种子，ADR-0002「确认即过滤」的落地页。
 *
 * 只做「取 actor → 调 PoolEngine.myInvites → 渲染」。每颗种子只有两个出口：
 * 确认加入，或者不理它。「忽略」背后调用的是 leavePool 而不是某个要求填理由的接口 ——
 * 不确认本身就是答案，系统不需要知道为什么。
 *
 * 版面上刻意不给「忽略」任何负罪感：它和「确认」一样是一个平静的按钮，
 * 没有二次确认、没有「确定要放弃这次机会吗」。产品在这里的立场是
 * 「不确认没有任何代价」，那么界面就不该偷偷制造代价。
 */
export default async function InvitesPage({ searchParams }: InvitesPageProps) {
  const { error } = await searchParams
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const invites = await engine.myInvites(actor)

  return (
    <div className="flex flex-col">
      <ColorField
        eyebrow="收到的种子"
        title="有人想和你一起做一件事"
        stage="seed"
        meta={[`${invites.length} 颗待回应`]}
      >
        <p className="max-w-xl text-sm leading-relaxed opacity-90">
          别人的 Agent 把它送到了你这儿。不回应没有任何代价，也不需要说明理由——什么都不做本身就是最诚实的答案。
        </p>
      </ColorField>

      <PageShell>
        {error && <ErrorBanner message={decodeURIComponent(error)} />}

        {invites.length === 0 ? (
          <EmptyState>
            现在没有等你回应的种子。有人接管了和你匹配上的意图时，它会出现在这里。
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {invites.map((invite) => (
              <li key={invite.poolId} className="border border-border bg-surface-raised">
                <div className="border-b border-border px-4 py-3">
                  <p className="font-head text-base font-semibold text-ink break-anywhere">
                    {invite.title ?? '（还没起名字）'}
                  </p>
                  <p className="mark mt-1 text-ink-soft">
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
                      className="border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:border-accent-strong hover:bg-accent-strong"
                    >
                      算我一个
                    </button>
                  </form>
                  <form action={replyToInviteAction.bind(null, invite.poolId, 'decline')}>
                    <button
                      type="submit"
                      className="border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                    >
                      这次不了
                    </button>
                  </form>
                  <form action={replyToInviteAction.bind(null, invite.poolId, 'later')}>
                    <button
                      type="submit"
                      className="border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                    >
                      以后再说
                    </button>
                  </form>
                </div>

                {/* <details> 而不是一个需要 JS 的展开：无脚本也能用，键盘可达。 */}
                <details className="border-t border-border">
                  <summary className="cursor-pointer px-4 py-2.5 text-sm text-accent">
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
                      className="border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-soft focus-visible:border-accent"
                    />
                    <button
                      type="submit"
                      className="self-start border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
                    >
                      发出去
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs leading-relaxed text-ink-soft">
          「算我一个」之后它才会破土——两个人都点头，那件事才开始长。加入之后聊下来发现不合适，随时还能退出。
        </p>
      </PageShell>
    </div>
  )
}
