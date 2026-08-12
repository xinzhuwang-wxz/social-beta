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
  const [rehearseState, rehearseDispatch, rehearsePending] = useActionState(boundRehearse, REHEARSE_INITIAL)

  return (
    <div className="flex flex-col gap-5">
      <form action={rehearseDispatch}>
        <button
          type="submit"
          disabled={rehearsePending}
          className="border border-accent bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition-colors hover:border-accent-strong hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rehearsePending
            ? '两边的 Agent 在聊…'
            : rehearseState.status === 'ready'
              ? '换一版提案'
              : '生成提案'}
        </button>
      </form>

      {rehearseState.status === 'error' && (
        <p role="alert" className="text-sm text-seal">
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

  return (
    <div className="flex flex-col gap-4 border border-border bg-surface-raised p-5">
      <div>
        <p className="text-xs font-medium text-ink-soft">共同话题</p>
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {proposal.sharedTopics.map((t) => (
            <li key={t} className="border border-border px-2.5 py-1 text-xs text-ink">
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-l-2 border-accent bg-accent-soft p-3">
        <p className="text-xs font-medium text-accent-strong">行动提案</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">
          {proposal.actionProposal.what} · {proposal.actionProposal.when} · {proposal.actionProposal.where}
        </p>
        <p className="mt-1 text-xs text-ink-soft">{proposal.actionProposal.rationale}</p>
      </div>

      <div className="border-l-2 border-seal bg-seal-soft/50 p-3">
        <p className="text-xs font-medium text-seal-strong">风险提示</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{proposal.riskNote}</p>
      </div>

      <button
        type="button"
        onClick={() => setShowTranscript((v) => !v)}
        className="self-start text-xs text-accent underline decoration-dotted underline-offset-4"
      >
        {showTranscript ? '收起往来记录' : '看看两边 Agent 具体聊了什么'}
      </button>
      {showTranscript && (
        <ol className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs text-ink-soft">
          {transcript.map((m, i) => (
            <li key={i}>
              <span className="font-medium text-ink-muted">
                {m.role === 'agent_a' ? '你的 Agent' : '对方的 Agent'}：
              </span>
              {m.parts.map((p) => p.text).join('')}
            </li>
          ))}
        </ol>
      )}

      <form action={dispatch} className="flex flex-col gap-2 border-t border-border pt-4">
        <label htmlFor="opening" className="text-sm font-medium text-ink">
          第一句话——草稿在下面，改成你自己的说法，或者删了重写
        </label>
        <textarea
          id="opening"
          name="opening"
          required
          rows={3}
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          className="border border-border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || opening.trim().length === 0}
            className="border border-seal bg-seal px-5 py-2.5 text-sm font-medium text-seal-ink transition-colors hover:border-seal-strong hover:bg-seal-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? '发出去…' : '我来说'}
          </button>
          <button
            type="button"
            onClick={() => setOpening(proposal.openingDraft)}
            className="text-xs text-ink-soft underline decoration-dotted underline-offset-4"
          >
            换回草稿原文
          </button>
        </div>
        {state.status === 'error' && (
          <p role="alert" className="text-sm text-seal">
            {state.message}
          </p>
        )}
        <p className="text-xs text-ink-soft">
          点「我来说」才会真的开池塘、真的把这句话发出去——在这之前，对方完全不知道有这次预演。
        </p>
      </form>
    </div>
  )
}
