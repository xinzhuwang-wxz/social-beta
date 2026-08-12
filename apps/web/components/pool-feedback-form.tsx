'use client'

import { useActionState } from 'react'
import { giveFeedbackAction, type FeedbackState } from '@/app/(app)/pool/[id]/actions'

const INITIAL: FeedbackState = { status: 'idle' }

const OPTIONS: { value: 'yes' | 'maybe' | 'no'; label: string }[] = [
  { value: 'yes', label: '还想再约' },
  { value: 'maybe', label: '看情况' },
  { value: 'no', label: '这次算了' },
]

/**
 * 留一句反馈。
 *
 * 只有本人看得见——这是 giveFeedback 背后 RLS 的保证，不是 UI 的承诺。
 * 让人知道队友怎么评价自己，所有人就只会写好话，反馈也就失去了意义。
 */
export function PoolFeedbackForm({ poolId }: { poolId: string }) {
  const action = giveFeedbackAction.bind(null, poolId)
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const formKey = state.status === 'saved' ? state.at : 'draft'

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-ink">这次怎么样</h3>
      <form key={formKey} action={formAction} className="flex flex-col gap-3">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">还想再约吗</legend>
          {OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-1.5 border border-border px-3 py-1.5 text-sm text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input type="radio" name="again" value={opt.value} required />
              {opt.label}
            </label>
          ))}
        </fieldset>
        <label htmlFor="feedback-note" className="sr-only">
          想多说两句
        </label>
        <textarea
          id="feedback-note"
          name="note"
          rows={2}
          placeholder="想多说两句就写在这里（可选）"
          className="border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? '保存中…' : '留下反馈'}
        </button>
      </form>
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-seal">
          {state.message}
        </p>
      )}
      {state.status === 'saved' && <p className="text-sm text-accent-strong">记下了，只有你自己看得见。</p>}
    </div>
  )
}
