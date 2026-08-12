import type { Candidate } from '@pool/engine'

/**
 * 一张候选卡。
 *
 * 「为什么是他」是整张卡的核心价值证明——LLM 终排时被要求必须引用双方
 * 意图里真实出现的内容（见 matcher-service.ts 的 RANK_SYSTEM），所以这里
 * 用视觉上最重的处理突出它，而不是当成卡片里普通的一行文字。
 */
export function CandidateCard({ candidate }: { candidate: Candidate }) {
  return (
    <article className="border border-border bg-surface-raised p-4 sm:p-5">
      <h2 className="font-head text-base font-semibold text-ink">{candidate.displayName}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{candidate.rawText}</p>

      <div className="mt-3 border-l-2 border-seal bg-seal-soft/50 p-3">
        <p className="text-xs font-medium text-seal-strong">为什么是他</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{candidate.reason}</p>
      </div>

      {/* 接管流程是 M3 的范围（真人签字才能开池塘）。这里先如实标注
          「即将开放」并禁用，不做一个点了没反应的假按钮。 */}
      <button
        type="button"
        disabled
        title="接管流程即将开放"
        className="mt-4 flex w-fit cursor-not-allowed items-center gap-2 border border-border px-4 py-2 text-sm font-medium text-ink-soft opacity-60"
      >
        我来说
        <span className="text-xs">· 即将开放</span>
      </button>
    </article>
  )
}
