'use client'

import { useActionState, useState } from 'react'
import type { ProposalCard, RehearsalMessage } from '@pool/shared'
import type { RehearseState, TakeOverState } from '@/app/(app)/pool/new/actions'

const REHEARSE_INITIAL: RehearseState = { status: 'idle' }
const TAKEOVER_INITIAL: TakeOverState = { status: 'idle' }

type RehearseAction = (
  seekerIntentId: string,
  candidateIntentId: string,
  prevState: RehearseState,
  formData: FormData,
) => Promise<RehearseState>

type TakeOverAction = (
  rehearsalId: string,
  prevState: TakeOverState,
  formData: FormData,
) => Promise<TakeOverState>

/**
 * 接管确认页的主体：先生成提案卡，再把开场白交给真人编辑、真人拍板。
 *
 * 这不是「只读展示 + 一个发送按钮」——`textarea` 是完全可编辑的受控输入，
 * 用户可以直接用草稿、改几个字、或者全删了自己写。产品的红线在这里：
 * 表述方式的决定权必须留在真人手上，一个只能点「发送」的只读卡片
 * 就是把这条红线关掉了一半。
 *
 * 版面也在说同一件事：提案卡那几块是灰底的参考资料，只有最下面那个
 * 输入框是朱框的 —— 全站只有真人落手的地方才用朱色。
 */
export function ProposalEditor({
  seekerIntentId,
  candidateIntentId,
  rehearseAction,
  takeOverAction,
}: {
  seekerIntentId: string
  candidateIntentId: string
  rehearseAction: RehearseAction
  takeOverAction: TakeOverAction
}) {
  const boundRehearse = rehearseAction.bind(null, seekerIntentId, candidateIntentId)
  const [rehearseState, rehearseDispatch, rehearsePending] = useActionState(
    boundRehearse,
    REHEARSE_INITIAL,
  )

  return (
    <div className="flex flex-col gap-5">
      <form action={rehearseDispatch} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={rehearsePending}
          className="btn btn-primary"
        >
          {rehearsePending
            ? '两边的 Agent 在聊…'
            : rehearseState.status === 'ready'
              ? '换一版提案'
              : '让它们聊一轮'}
        </button>
        <p className="text-xs text-ink-soft">这一步只在你这一侧发生</p>
      </form>

      {rehearseState.status === 'error' && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-brand"
        >
          {rehearseState.message}
        </p>
      )}

      {rehearseState.status === 'ready' && (
        <ProposalBody
          key={rehearseState.result.rehearsalId}
          proposal={rehearseState.result.proposal}
          transcript={rehearseState.result.transcript}
          rehearsalId={rehearseState.result.rehearsalId}
          takeOverAction={takeOverAction}
        />
      )}
    </div>
  )
}

function ProposalBody({
  proposal,
  transcript,
  rehearsalId,
  takeOverAction,
}: {
  proposal: ProposalCard
  transcript: RehearsalMessage[]
  rehearsalId: string
  takeOverAction: TakeOverAction
}) {
  const boundTakeOver = takeOverAction.bind(null, rehearsalId)
  const [state, dispatch, pending] = useActionState(boundTakeOver, TAKEOVER_INITIAL)
  const [opening, setOpening] = useState(proposal.openingDraft)
  const [showTranscript, setShowTranscript] = useState(false)

  const edited = opening.trim() !== proposal.openingDraft.trim()

  return (
    <div className="flex flex-col gap-5">
      <div className="card">
        <div className="border-b border-border px-4 py-2.5">
          <span className="t-cap text-ink-soft">提案卡 · 草稿</span>
        </div>

        <div className="border-b border-border px-4 py-3">
          <p className="t-cap text-ink-soft">共同话题</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {proposal.sharedTopics.map((t) => (
              <li
                key={t}
                className="border border-border px-2 py-0.5 text-xs text-ink break-anywhere"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-b border-border px-4 py-3">
          <p className="t-cap font-semibold tracking-wide text-brand">行动提案</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink break-anywhere">
            {proposal.actionProposal.what} · {proposal.actionProposal.when} ·{' '}
            {proposal.actionProposal.where}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft break-anywhere">
            {proposal.actionProposal.rationale}
          </p>
        </div>

        <div className="border-b border-border px-4 py-3">
          <p className="t-cap text-ink-soft">风险提示</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink break-anywhere">
            {proposal.riskNote}
          </p>
        </div>

        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="text-xs text-accent-deep underline decoration-dotted underline-offset-4"
          >
            {showTranscript ? '收起往来记录' : '看看两边 Agent 具体聊了什么'}
          </button>
          {showTranscript && (
            <ol className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {transcript.map((m, i) => (
                <li key={i} className="text-xs leading-relaxed text-ink-soft break-anywhere">
                  <span className="text-ink-muted">
                    {m.role === 'agent_a' ? '你的 Agent' : '对方的 Agent'}：
                  </span>
                  {m.parts.map((p) => p.text).join('')}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* 全站只有真人落手的地方用朱色。这个框是其中之一。 */}
      <form action={dispatch} className="border border-alert">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-alert bg-alert/10 px-4 py-2.5">
          <label htmlFor="opening" className="text-sm font-medium text-ink">
            第一句话——你说了算
          </label>
          <span className="t-cap font-semibold tracking-wide text-brand">{edited ? '你改过了' : '草稿原文'}</span>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-xs leading-relaxed text-ink-soft">
            草稿在下面，改成你自己的说法、或者整段删了重写都行。发出去的是这个框里的字，不是 AI 写的那句。
          </p>
          <textarea
            id="opening"
            name="opening"
            required
            rows={4}
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            className="border border-border bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-soft focus-visible:border-alert"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="submit"
              disabled={pending || opening.trim().length === 0}
              className="btn btn-primary"
            >
              {pending ? '发出去…' : '我来说'}
            </button>
            {edited && (
              <button
                type="button"
                onClick={() => setOpening(proposal.openingDraft)}
                className="text-xs text-ink-soft underline decoration-dotted underline-offset-4"
              >
                换回草稿原文
              </button>
            )}
          </div>
          {state.status === 'error' && (
            <p role="alert" className="text-sm text-alert">
              {state.message}
            </p>
          )}
          <p className="text-xs leading-relaxed text-ink-soft">
            点「我来说」才会真的开始——这一刻种子送到对方手上，他确认了才破土。
          </p>
        </div>
      </form>
    </div>
  )
}
