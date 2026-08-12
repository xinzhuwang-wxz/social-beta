import Link from 'next/link'
import type { Candidate } from '@pool/engine'

/**
 * 一张候选卡。
 *
 * 「为什么是他」是整张卡的核心价值证明——LLM 终排时被要求必须引用双方
 * 意图里真实出现的内容（见 matcher-service.ts 的 RANK_SYSTEM），所以这里
 * 用视觉上最重的处理突出它，而不是当成卡片里普通的一行文字。
 */
export function CandidateCard({
  candidate,
  seekerIntentId,
}: {
  candidate: Candidate
  seekerIntentId: string
}) {
  return (
    <article className="border border-border bg-surface-raised p-4 sm:p-5">
      <h2 className="font-head text-base font-semibold text-ink">{candidate.displayName}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{candidate.rawText}</p>

      <div className="mt-3 border-l-2 border-seal bg-seal-soft/50 p-3">
        <p className="text-xs font-medium text-seal-strong">为什么是他</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{candidate.reason}</p>
      </div>

      {/* 判据①的闭环就断在这一步：这个按钮一度是禁用的占位，
          于是「候选卡 → 亲手接管」只能靠手工拼 URL 走通。
          它指向接管确认页而不是直接建池 —— 连接对象与表述方式都要真人签字。 */}
      <Link
        href={`/pool/new?seekerIntentId=${encodeURIComponent(seekerIntentId)}&candidateIntentId=${encodeURIComponent(candidate.intentId)}`}
        className="mt-4 flex w-fit items-center gap-2 border border-seal bg-seal px-4 py-2 text-sm font-medium text-seal-ink transition hover:bg-seal-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
      >
        我来说
      </Link>
    </article>
  )
}
