'use client'

import { useActionState } from 'react'
import type { PublishState } from '@/app/(app)/square/actions'
import { IntentConfirmation } from './intent-confirmation'

const INITIAL_STATE: PublishState = { status: 'idle' }
const MIN_LENGTH = 4

type StartAction = (prevState: PublishState, formData: FormData) => Promise<PublishState>
type FinishAction = (
  rawText: string,
  prevState: PublishState,
  formData: FormData,
) => Promise<PublishState>

/**
 * 种一颗种子。
 *
 * 刻意不做成表单——没有下拉框、没有日期选择器、没有标签多选。发需求是
 * 三秒钟的冲动，任何多问一句的摩擦都可能让人直接关掉页面。
 *
 * 唯一允许的一次多问，是「一轮追问」：引擎发现缺了通用项（什么时候 /
 * 在哪 / 几个人）时，问一轮、最多三题、可以整轮跳过。它长得像一张小卡，
 * 不是一段对话 —— 做成聊天气泡会诱导用户继续聊下去，而这里根本没有第二轮。
 */
export function IntentPublishForm({
  startAction,
  finishAction,
  republishAction,
}: {
  startAction: StartAction
  finishAction: FinishAction
  republishAction: StartAction
}) {
  const [state, formAction, pending] = useActionState(startAction, INITIAL_STATE)

  // 发布成功后清空输入框：给 <form> 挂一个随最新发布 id 变化的 key，
  // 成功后 React 把整个表单当成新的重新挂载，文本框回到空的初始值——
  // 不需要 useEffect 里手动 setState 去同步（那会触发级联渲染，
  // 也是这个仓库里 theme-toggle.tsx 特意避开的写法）。
  const formKey = state.status === 'success' ? state.intent.id : 'draft'

  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <div className="border-b border-border px-4 py-2.5">
          <span className="t-cap text-ink-soft">一颗种子 · 说一句就行</span>
        </div>

        <form key={formKey} action={formAction} className="flex flex-col gap-3 p-4">
          <label htmlFor="intent-text" className="text-sm text-ink-muted">
            比如「这周六想去后海骑车，人多点热闹，谁一起」
          </label>
          <textarea
            id="intent-text"
            name="text"
            required
            minLength={MIN_LENGTH}
            rows={3}
            placeholder="说说你想干什么"
            className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
          />
          <button
            type="submit"
            disabled={pending}
            className="self-start btn btn-primary"
          >
            {pending ? '种下去…' : '种下去'}
          </button>
        </form>
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {state.status === 'error' && (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-brand"
          >
            {state.message}
          </p>
        )}
        {state.status === 'asking' && (
          <ClarifyCard
            key={state.rawText}
            rawText={state.rawText}
            questions={state.questions}
            finishAction={finishAction}
            republishAction={republishAction}
          />
        )}
        {state.status === 'success' && (
          <IntentConfirmation
            key={state.intent.id}
            intent={state.intent}
            action={republishAction}
          />
        )}
      </div>
    </div>
  )
}

/**
 * 一轮追问。
 *
 * 三条硬规则，都能在这段 JSX 里逐条对上：
 *   · 只有一轮 —— 这个组件没有「下一题」，提交完就结束。
 *   · 最多三题 —— 题目由引擎给，前端不追加。
 *   · 可以整轮跳过 —— 「跳过，直接种」和「种下去」是同一个 action，
 *     没有任何一个字段是 required。追问是帮忙，不是关卡。
 */
function ClarifyCard({
  rawText,
  questions,
  finishAction,
  republishAction,
}: {
  rawText: string
  questions: Extract<PublishState, { status: 'asking' }>['questions']
  finishAction: FinishAction
  republishAction: StartAction
}) {
  const bound = finishAction.bind(null, rawText)
  const [state, dispatch, pending] = useActionState(bound, INITIAL_STATE)

  if (state.status === 'success') {
    // 答完之后照样给「我理解成了」的确认卡：模型仍然可能抽错，
    // 而只有用户知道错在哪 —— 追问不能替代确认。
    return <IntentConfirmation intent={state.intent} action={republishAction} />
  }

  return (
    <form action={dispatch} className="border-l-2 border-accent-deep bg-accent-soft px-4 py-4">
      <p className="t-cap font-semibold tracking-wide text-brand">还差几句就更好找了</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">
        补一两句，Agent 找人时能更准。不想答就跳过——种下去照样能被人看到。
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {questions.map((q) => (
          <div key={q.slot} className="flex flex-col gap-1">
            <label htmlFor={`ask-${q.slot}`} className="text-sm text-ink">
              {q.question}
            </label>
            <input
              id={`ask-${q.slot}`}
              name={q.slot}
              type="text"
              autoComplete="off"
              className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
            />
          </div>
        ))}
      </div>

      {state.status === 'error' && (
        <p role="alert" className="mt-3 text-sm text-alert">
          {state.message}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary"
        >
          {pending ? '种下去…' : '种下去'}
        </button>
        <button
          type="submit"
          name="skip"
          value="1"
          disabled={pending}
          className="text-sm text-ink-soft underline decoration-dotted underline-offset-4 transition-colors hover:text-ink disabled:opacity-50"
        >
          跳过，直接种
        </button>
      </div>
    </form>
  )
}
