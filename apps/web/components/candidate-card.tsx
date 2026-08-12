import Link from 'next/link'
import type { Candidate } from '@pool/engine'

/**
 * 一张候选卡。
 *
 * 版面上最大的那块字是「为什么是他」，不是名字，也不是按钮 ——
 * 这是刻意反过来的。名字对用户毫无信息量（校区里的陌生人），
 * 真正要判断的只有一件事：凭什么是这个人。终排时 LLM 被要求必须引用
 * 双方意图里真实出现的内容（见 matcher-service.ts 的 RANK_SYSTEM），
 * 所以这段话是可核验的，值得占整张卡最重的位置。
 *
 * 反过来说：如果这段话读起来像模板句，那是匹配质量的问题，
 * 而版面把它放大，正好让这个问题藏不住。
 */
export function CandidateCard({
  candidate,
  seekerIntentId,
  index,
}: {
  candidate: Candidate
  seekerIntentId: string
  index: number
}) {
  return (
    <article className="card">
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-2.5 sm:px-5">
        <span className="t-cap text-ink-soft">候选 {String(index).padStart(2, '0')}</span>
        <span className="text-base font-semibold text-ink break-anywhere">
          {candidate.displayName}
        </span>
      </div>

      <div className="border-b border-border px-4 py-3 sm:px-5">
        <p className="t-cap text-ink-soft">他种下的</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted break-anywhere">
          {candidate.rawText}
        </p>
      </div>

      <div className="rounded-[var(--radius-md)] border border-alert/40 bg-alert/10 px-4 py-4 sm:px-5">
        <p className="t-cap font-semibold tracking-wide text-brand">为什么是他</p>
        <p className="mt-2 text-base leading-relaxed text-ink break-anywhere">
          {candidate.reason}
        </p>
      </div>

      {/* 判据①的闭环就断在这一步：这个按钮一度是禁用的占位，
          于是「候选卡 → 亲手接管」只能靠手工拼 URL 走通。
          它指向接管确认页而不是直接建池 —— 连接对象与表述方式都要真人签字。 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-4 sm:px-5">
        <Link
          href={`/pool/new?seekerIntentId=${encodeURIComponent(seekerIntentId)}&candidateIntentId=${encodeURIComponent(candidate.intentId)}`}
          className="border border-accent-deep bg-accent-deep px-5 py-2.5 text-sm font-medium text-accent-ink transition-colors hover:border-accent-hover hover:bg-accent-hover"
        >
          我来说
        </Link>
        <p className="text-xs text-ink-soft">下一步只是看草稿，还不会发出去</p>
      </div>
    </article>
  )
}
