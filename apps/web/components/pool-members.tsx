'use client'

import { useActionState, useState } from 'react'

/**
 * 池塘成员，以及「不再遇到」的入口。
 *
 * 入口放在这里而不是一个全局搜索框，是刻意的：这是你真的认识对方的地方。
 * 让人凭 handle 去拉黑素未谋面的人，等于把产品变成一个可以主动去找人
 * 「处理掉」的工具，而它本该只是给硬过滤配一扇有门把手的门 ——
 * 匹配漏斗第一段就会双向排除拉黑关系，一个用户看不见、只能进不能出的
 * 过滤器，跟系统偷偷替你决定见谁没有区别。
 *
 * 三件事在文案里说清楚，因为它们都不是想当然的：
 * 双向生效、对方收不到通知、已经发生过的事不会被删掉。
 */
export function PoolMembers({
  poolId,
  members,
  viewerPersonId,
  blockAction,
}: {
  poolId: string
  members: readonly { personId: string; displayName: string; role: string; state: string }[]
  viewerPersonId: string
  blockAction: (poolId: string, personId: string) => Promise<void>
}) {
  const others = members.filter((m) => m.personId !== viewerPersonId && m.state === 'joined')
  if (others.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <p className="t-cap font-medium tracking-wide text-accent-deep">一起的人</p>
      <ul className="flex flex-col gap-2">
        {others.map((m) => (
          <li key={m.personId}>
            <MemberRow
              poolId={poolId}
              member={m}
              blockAction={blockAction}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function MemberRow({
  poolId,
  member,
  blockAction,
}: {
  poolId: string
  member: { personId: string; displayName: string; role: string }
  blockAction: (poolId: string, personId: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [error, submit, pending] = useActionState(async () => {
    try {
      await blockAction(poolId, member.personId)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : '操作失败，再试一次'
    }
  }, null)

  return (
    <div className="flex flex-col gap-2 border border-border px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{member.displayName}</p>
          <p className="t-cap text-ink-soft">
            {member.role === 'initiator' ? '发起人' : '同行者'}
          </p>
        </div>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn btn-secondary btn-sm shrink-0"
          >
            不再遇到
          </button>
        )}
      </div>

      {confirming && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <p className="text-sm leading-relaxed text-ink-muted">
            以后你们不会再出现在彼此的候选里。他不会收到任何通知。
            已经一起做过的事不会被删掉 —— 那是发生过的事实。
          </p>
          {error ? <p className="t-cap text-alert">{error}</p> : null}
          <div className="flex gap-2">
            <form action={submit}>
              <button
                type="submit"
                disabled={pending}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                {pending ? '处理中' : '确认'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn btn-ghost btn-sm"
            >
              算了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
