'use client'

import { useActionState, useEffect, useState } from 'react'
import { addArtifactAction, removeArtifactAction, type ArtifactState } from '@/app/(app)/pool/[id]/actions'

const INITIAL: ArtifactState = { status: 'idle' }

/**
 * 传一份回流物。
 *
 * uri 是一个链接，不是文件上传——这里没有接对象存储，宁可少做一个按钮，
 * 也不做一个点了上传条转半天什么都没发生的假功能。粘一个图床/相册的
 * 分享链接进来即可。
 *
 * 传上去之后立刻挂一个「撤回这张」——removeArtifact 只能删自己传的，
 * 这里也只让你撤自己刚传的那一张，不是一个完整的历史列表管理器
 * （引擎目前也没有暴露「列出这个池塘所有回流物」的读接口）。
 * `justAdded` 用本地 state 记，撤回提交时立刻乐观清空，避免撤完之后
 * 按钮还留在页面上、再点一次却因为记录已经不存在而报错。
 */
export function PoolArtifactForm({ poolId }: { poolId: string }) {
  const action = addArtifactAction.bind(null, poolId)
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const formKey = state.status === 'added' ? state.at : 'draft'

  useEffect(() => {
    if (state.status === 'added') setJustAdded(state.id)
  }, [state])

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-ink">传张图</h3>
      <form key={formKey} action={formAction} className="flex flex-col gap-2">
        <label htmlFor="artifact-uri" className="text-xs text-ink-soft">
          图片链接
        </label>
        <input
          id="artifact-uri"
          name="uri"
          type="url"
          required
          placeholder="粘贴一个图片链接"
          className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
        />
        <label htmlFor="artifact-caption" className="text-xs text-ink-soft">
          说明（可选）
        </label>
        <input
          id="artifact-caption"
          name="caption"
          type="text"
          placeholder="比如「山顶的日出」"
          className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
        />
        <button type="submit" disabled={pending} className="self-start btn btn-secondary">
          {pending ? '传中…' : '传上去'}
        </button>
      </form>
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-alert">
          {state.message}
        </p>
      )}
      {state.status === 'added' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-brand">传上去了。</p>
          {justAdded && (
            <form
              action={removeArtifactAction.bind(null, poolId, justAdded)}
              onSubmit={() => setJustAdded(null)}
            >
              <button
                type="submit"
                className="flex min-h-11 items-center px-1 text-xs text-ink-soft underline decoration-dotted underline-offset-4 transition-colors hover:text-ink"
              >
                传错了，撤回这张
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
