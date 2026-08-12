'use client'

import { useActionState } from 'react'
import { addArtifactAction, type ArtifactState } from '@/app/(app)/pool/[id]/actions'

const INITIAL: ArtifactState = { status: 'idle' }

/**
 * 传一份回流物。
 *
 * uri 是一个链接，不是文件上传——这里没有接对象存储，宁可少做一个按钮，
 * 也不做一个点了上传条转半天什么都没发生的假功能。粘一个图床/相册的
 * 分享链接进来即可。
 */
export function PoolArtifactForm({ poolId }: { poolId: string }) {
  const action = addArtifactAction.bind(null, poolId)
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const formKey = state.status === 'added' ? state.at : 'draft'

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
          className="border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent"
        />
        <label htmlFor="artifact-caption" className="text-xs text-ink-soft">
          说明（可选）
        </label>
        <input
          id="artifact-caption"
          name="caption"
          type="text"
          placeholder="比如「山顶的日出」"
          className="border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? '传中…' : '传上去'}
        </button>
      </form>
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-seal">
          {state.message}
        </p>
      )}
      {state.status === 'added' && <p className="text-sm text-accent-strong">传上去了。</p>}
    </div>
  )
}
