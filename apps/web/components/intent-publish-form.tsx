'use client'

import { useActionState } from 'react'
import type { PublishState } from '@/app/(app)/square/actions'
import { IntentConfirmation } from './intent-confirmation'

const INITIAL_STATE: PublishState = { status: 'idle' }
const MIN_LENGTH = 4

interface IntentPublishFormProps {
  action: (prevState: PublishState, formData: FormData) => Promise<PublishState>
}

/**
 * 单输入框发布意图。
 *
 * 刻意不做成表单——没有下拉框、没有日期选择器、没有标签多选。发需求是
 * 三秒钟的冲动，任何多问一句的摩擦都可能让人直接关掉页面。
 */
export function IntentPublishForm({ action }: IntentPublishFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)

  // 发布成功后清空输入框：给 <form> 挂一个随最新发布 id 变化的 key，
  // 成功后 React 把整个表单当成新的重新挂载，文本框回到空的初始值——
  // 不需要 useEffect 里手动 setState 去同步（那会触发级联渲染，
  // 也是这个仓库里 theme-toggle.tsx 特意避开的写法）。
  const formKey = state.status === 'success' ? state.intent.id : 'draft'

  return (
    <div className="flex flex-col gap-4">
      <form key={formKey} action={formAction} className="flex flex-col gap-3">
        <label htmlFor="intent-text" className="text-sm text-ink-muted">
          说一句就行，比如「这周六想去后海骑车，人多点热闹，谁一起」
        </label>
        <textarea
          id="intent-text"
          name="text"
          required
          minLength={MIN_LENGTH}
          rows={3}
          placeholder="说说你想干什么"
          className="border border-border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start border border-seal bg-seal px-5 py-2.5 text-sm font-medium text-seal-ink transition-colors hover:border-seal-strong hover:bg-seal-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? '发布中…' : '发布'}
        </button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-3">
        {state.status === 'error' && (
          <p role="alert" className="text-sm text-seal">
            {state.message}
          </p>
        )}
        {state.status === 'success' && (
          <IntentConfirmation key={state.intent.id} intent={state.intent} action={action} />
        )}
      </div>
    </div>
  )
}
