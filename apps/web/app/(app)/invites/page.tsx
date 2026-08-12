import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { confirmInviteAction, declineInviteAction } from './actions'

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
 * /invites —— 收到的邀请，ADR-0002「确认即过滤」的落地页。
 *
 * 只做「取 actor → 调 PoolEngine.myInvites → 渲染」。每条邀请只有两个
 * 出口：确认加入，或者不理它。「忽略」按钮背后调用的是 leavePool 而不是
 * 某个要求填理由的接口——不确认本身就是答案，系统不需要知道为什么。
 */
export default async function InvitesPage({ searchParams }: InvitesPageProps) {
  const { error } = await searchParams
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const invites = await engine.myInvites(actor)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-5 py-12 sm:px-8">
      <header>
        <p className="text-sm font-medium text-accent">收到的邀请</p>
        <h1 className="mt-2 font-head text-2xl font-semibold text-ink sm:text-3xl">要不要一起</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          不确认没有任何代价，也不需要说明理由——时间不合适、不感兴趣，随便什么原因都行，
          什么都不做本身就是最诚实的答案。
        </p>
      </header>

      {error && (
        <p role="alert" className="border border-seal bg-seal-soft px-4 py-3 text-sm text-seal-strong">
          {decodeURIComponent(error)}
        </p>
      )}

      {invites.length === 0 ? (
        <p className="border border-dashed border-border p-6 text-sm leading-relaxed text-ink-soft">
          现在没有等你确认的邀请。有人接管、跟你的意图匹配上时，会出现在这里。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {invites.map((invite) => (
            <li
              key={invite.poolId}
              className="flex flex-col gap-3 border border-border bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
            >
              <div>
                <p className="text-sm font-medium text-ink">{invite.title ?? '（未命名池塘）'}</p>
                <p className="mt-1 text-xs text-ink-soft">{DATE_FORMAT.format(invite.invitedAt)} 邀请你加入</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <form action={confirmInviteAction.bind(null, invite.poolId)}>
                  <button
                    type="submit"
                    className="border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:border-accent-strong hover:bg-accent-strong"
                  >
                    确认加入
                  </button>
                </form>
                <form action={declineInviteAction.bind(null, invite.poolId)}>
                  <button
                    type="submit"
                    className="border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                  >
                    忽略
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
