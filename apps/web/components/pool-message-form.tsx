'use client'

import { useActionState } from 'react'
import { postMessageAction, type PostMessageState } from '@/app/(app)/pool/[id]/actions'

const INITIAL: PostMessageState = { status: 'idle' }

/**
 * 发消息的输入框。
 *
 * 用 key={formKey} 让发送成功后整个 form 重新挂载、文本框回到空值——
 * 同 intent-publish-form.tsx 的做法，不在 effect 里手动 setState 去同步。
 */
export function PoolMessageForm({ poolId }: { poolId: string }) {
  const action = postMessageAction.bind(null, poolId)
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const formKey = state.status === 'sent' ? state.at : 'draft'

  return (
    <div className="flex flex-col gap-2">
      <form key={formKey} action={formAction} className="flex items-end gap-2">
        <label htmlFor="pool-message" className="sr-only">
          发一条消息
        </label>
        <textarea
          id="pool-message"
          name="text"
          required
          rows={1}
          placeholder="说句话……"
          className="min-h-11 flex-1 resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 btn btn-primary"
        >
          {pending ? '发送中…' : '发送'}
        </button>
      </form>
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-alert">
          {state.message}
        </p>
      )}
    </div>
  )
}
