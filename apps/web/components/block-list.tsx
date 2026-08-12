'use client'

import { useActionState } from 'react'
import type { BlockView } from '@pool/engine'

/**
 * 不想再遇到的人。
 *
 * 这一块存在的理由，不是「拉黑」这个功能本身，而是**硬过滤必须有一扇
 * 有门把手的门**。匹配漏斗的第一段会把拉黑关系直接排除掉，双向 ——
 * 一个用户看不见的、只能进不能出的过滤器，跟系统偷偷替你决定见谁没有区别。
 *
 * 名单只有自己看得到（走 RLS，不是应用层按 id 过滤），
 * 也刻意不通知对方：「谁拉黑了我」在校园这种熟人密度下会变成真实的
 * 社交事件，而这个产品本该降低社交压力，不是制造新的。
 */
export function BlockList({
  blocks,
  unblockAction,
}: {
  blocks: readonly BlockView[]
  unblockAction: (personId: string) => Promise<void>
}) {
  if (blocks.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        名单是空的。以后如果有人你不想再遇到，可以在你们共同的池塘里把他加进来 ——
        加进来之后你们不会再出现在彼此的候选里，他不会收到任何通知。
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {blocks.map((b) => (
        <li key={b.personId}>
          <BlockRow block={b} unblockAction={unblockAction} />
        </li>
      ))}
    </ul>
  )
}

function BlockRow({
  block,
  unblockAction,
}: {
  block: BlockView
  unblockAction: (personId: string) => Promise<void>
}) {
  const [error, submit, pending] = useActionState(async () => {
    try {
      await unblockAction(block.personId)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : '撤销失败，再试一次'
    }
  }, null)

  return (
    <form action={submit} className="flex items-center gap-3 border border-border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{block.displayName}</p>
        <p className="t-cap truncate text-ink-soft">@{block.handle}</p>
        {error ? <p className="t-cap mt-1 text-alert">{error}</p> : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn btn-secondary btn-sm shrink-0 disabled:opacity-50"
      >
        {pending ? '撤销中' : '撤销'}
      </button>
    </form>
  )
}
