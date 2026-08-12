'use client'

import { useActionState, useState } from 'react'
import type { WillingCandidate } from '@pool/engine'
import { chooseCompanionAction, type ChooseState } from '@/app/(app)/candidates/actions'

const INITIAL: ChooseState = { status: 'idle' }

const REPLIED_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * 一个已经对这颗种子表态「愿意」的人（第三步，见 delivery-service.ts willingFor）。
 *
 * 版面语言借用 candidate-card.tsx：「为什么是他」仍然占最重的位置，
 * 但这里多了一块 TA 自己留的话——那是候选在信箱里主动写下的，
 * 排在 AI 的推荐理由前面，因为它更值得信。
 *
 * 「选TA同行」展开后是一个必填的开场白输入框，和接管确认页
 * （proposal-editor.tsx）守的是同一条红线：连接是否成立、说什么话，
 * 必须是这一刻真人敲下的字，不能是系统生成后直接发出。这里没有草稿可
 * 预填——`chooseCompanion` 不像 `rehearseWith` 那样先跑一轮 Agent 对话，
 * 所以框从空白开始写，不是「改一改草稿」。
 */
export function WillingCandidateCard({
  candidate,
  intentId,
  index,
}: {
  candidate: WillingCandidate
  intentId: string
  index: number
}) {
  const boundAction = chooseCompanionAction.bind(null, intentId, candidate.personId)
  const [state, dispatch, pending] = useActionState(boundAction, INITIAL)
  const [expanded, setExpanded] = useState(false)
  const [opening, setOpening] = useState('')

  return (
    <article className="card">
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-2.5 sm:px-5">
        <span className="t-cap text-ink-soft">愿意 {String(index).padStart(2, '0')}</span>
        <span className="text-base font-semibold text-ink break-anywhere">
          {candidate.displayName}
        </span>
      </div>

      {candidate.note && (
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <p className="t-cap text-ink-soft">TA自己写的</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted break-anywhere">
            {candidate.note}
          </p>
        </div>
      )}

      {candidate.reason && (
        <div className="rounded-[var(--radius-md)] border border-alert/40 bg-alert/10 px-4 py-4 sm:px-5">
          <p className="t-cap font-semibold tracking-wide text-brand">为什么是他</p>
          <p className="mt-2 text-base leading-relaxed text-ink break-anywhere">
            {candidate.reason}
          </p>
        </div>
      )}

      {candidate.repliedAt && (
        <p className="border-t border-border px-4 py-2 text-xs text-ink-soft sm:px-5">
          {REPLIED_FORMAT.format(candidate.repliedAt)} 表态愿意
        </p>
      )}

      {!expanded ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="btn btn-primary"
          >
            选TA同行
          </button>
          <p className="text-xs text-ink-soft">下一步要写第一句话，还不会发出去</p>
        </div>
      ) : (
        // 全站只有真人落手的地方用朱色。这个框是其中之一。
        <form action={dispatch} className="border-t border-alert">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-alert bg-alert/10 px-4 py-2.5 sm:px-5">
            <label
              htmlFor={`opening-${candidate.personId}`}
              className="text-sm font-medium text-ink"
            >
              第一句话——你说了算
            </label>
          </div>

          <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
            <p className="text-xs leading-relaxed text-ink-soft">
              选定 TA 之后池塘立刻成立，这句话就是你们之间的第一条消息——发出去的是这个框里的字。
            </p>
            <textarea
              id={`opening-${candidate.personId}`}
              name="opening"
              required
              rows={4}
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="比如「看到你也想爬山，周六一起？」"
              className="border border-border bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-soft focus-visible:border-alert"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="submit"
                disabled={pending || opening.trim().length === 0}
                className="btn btn-primary"
              >
                {pending ? '发出去…' : '选定TA，发出去'}
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-xs text-ink-soft underline decoration-dotted underline-offset-4"
              >
                先不选了
              </button>
            </div>
            {state.status === 'error' && (
              <p role="alert" className="text-sm text-alert">
                {state.message}
              </p>
            )}
          </div>
        </form>
      )}
    </article>
  )
}
