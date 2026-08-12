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
 * 留一句私密评价。
 *
 * 只有本人看得见——这是 giveFeedback 背后 RLS 的保证，不是 UI 的一句客套话，
 * 所以文案必须把这条边界说透：again 选了什么、reflection 写了什么、
 * 这里留的照片，全部只有自己找得到；就连「这次算了」本身，对方也不会
 * 知道是不是你选的。让人知道队友怎么评价自己，所有人就只会写好话，
 * 反馈也就失去了意义。
 *
 * 这里的照片链接（photoUri）和上面「传张图」不是一回事：那份是共享回流物，
 * 池塘里所有人都看得到；这份是私密评价的一部分，只留给自己。
 */
export function PoolFeedbackForm({ poolId }: { poolId: string }) {
  const action = giveFeedbackAction.bind(null, poolId)
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const formKey = state.status === 'saved' ? state.at : 'draft'

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-ink">这次怎么样</h3>
      <p className="text-xs leading-relaxed text-ink-soft">
        只有你自己看得到——对方不会看到你写了什么，也不会知道「这次算了」是不是你选的。
      </p>
      <form key={formKey} action={formAction} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">还想再约吗</legend>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-1.5 border border-border px-3 py-1.5 text-sm text-ink has-[:checked]:border-accent-deep has-[:checked]:bg-accent-soft"
              >
                <input type="radio" name="again" value={opt.value} required />
                {opt.label}
              </label>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-ink-soft">
            双方都选了「还想再约 / 看情况」，这次的共同回忆才会进两个人的森林；有一方选「这次算了」，双方都不会生成对外可见的那一份——但不会显示是谁选的。
          </p>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor="feedback-reflection" className="text-xs text-ink-soft">
            这次的感受（可选，只有你看得到）
          </label>
          <textarea
            id="feedback-reflection"
            name="reflection"
            rows={2}
            placeholder="想记下点什么就写在这里"
            className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="feedback-photo" className="text-xs text-ink-soft">
            留一张私人照片（可选，只有你看得到）
          </label>
          <input
            id="feedback-photo"
            name="photoUri"
            type="url"
            placeholder="粘贴一个图片链接"
            className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="feedback-note" className="text-xs text-ink-soft">
            私密备注（可选，只有你看得到）
          </label>
          <textarea
            id="feedback-note"
            name="note"
            rows={2}
            placeholder="给自己留一句操作性的话，比如「下次早点约」"
            className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
          />
        </div>

        <button type="submit" disabled={pending} className="self-start btn btn-secondary">
          {pending ? '保存中…' : '留下反馈'}
        </button>
      </form>
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-alert">
          {state.message}
        </p>
      )}
      {state.status === 'saved' && <p className="text-sm text-brand">记下了，只有你自己看得见。</p>}
    </div>
  )
}
