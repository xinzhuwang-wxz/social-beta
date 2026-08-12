'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { FacetView } from '@pool/engine'
import { DOMAIN_LABEL, type Domain, type Visibility } from '@pool/shared'

const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: 'public', label: '公开', hint: '任何人都能看到' },
  { value: 'campus', label: '校内', hint: '同校区的人能看到' },
  { value: 'warm', label: '熟识', hint: '关系够近的人才能看到' },
  { value: 'private', label: '仅自己', hint: '连 Agent 也取不到' },
]

/**
 * 一条切面：写的是什么、凭什么这么写、谁能看到、怎么改怎么删。
 *
 * 「证据」区是这张卡的核心——用户问「你凭什么这么说我」，答案必须
 * 是可点进去核实的具体池塘，不是一句抽象的「基于你的活动」。
 */
export function FacetCard({
  facet,
  setVisibilityAction,
  deleteAction,
}: {
  facet: FacetView
  setVisibilityAction: (domain: Domain, visibility: Visibility) => Promise<void>
  deleteAction: (domain: Domain) => Promise<void>
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <article className="border border-border bg-surface-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-head text-base font-semibold text-ink">{DOMAIN_LABEL[facet.domain]}</h2>
        <span className="text-xs text-ink-soft">来自 {facet.nPools} 个池塘</span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink">{facet.summary}</p>

      <div className="mt-3 border-l-2 border-accent bg-accent-soft p-3">
        <p className="text-xs font-medium text-accent-strong">你凭什么这么说我</p>
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {facet.evidence.map((e) => (
            <li key={e.poolId}>
              <Link
                href={`/pool/${e.poolId}`}
                className="inline-block border border-border bg-surface px-2.5 py-1 text-xs text-ink transition-colors hover:border-accent hover:text-accent"
              >
                {e.title ?? '（未命名池塘）'}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <fieldset className="mt-4 flex flex-col gap-1.5">
        <legend className="text-xs text-ink-soft">谁能看到这条</legend>
        <div className="flex flex-wrap gap-1.5">
          {VISIBILITY_OPTIONS.map((opt) => (
            <form key={opt.value} action={setVisibilityAction.bind(null, facet.domain, opt.value)}>
              <button
                type="submit"
                aria-pressed={facet.visibility === opt.value}
                title={opt.hint}
                disabled={facet.visibility === opt.value}
                className={`border px-2.5 py-1 text-xs transition-colors disabled:cursor-default ${
                  facet.visibility === opt.value
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-border text-ink-muted hover:border-border-strong hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            </form>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 border-t border-border pt-3">
        {confirmingDelete ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="text-xs leading-relaxed text-ink-soft">
              删掉之后，如果这些池塘还在，下次蒸馏可能会重新长出同样的画像——真正要
              「别再这么说我」，得去改可见度或者退出那些池塘。确定要删？
            </p>
            <div className="flex shrink-0 gap-2">
              <form action={deleteAction.bind(null, facet.domain)}>
                <button
                  type="submit"
                  className="border border-seal px-3 py-1.5 text-xs font-medium text-seal transition-colors hover:bg-seal-soft"
                >
                  确定删除
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="border border-border px-3 py-1.5 text-xs text-ink-muted"
              >
                算了
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-ink-soft underline decoration-dotted underline-offset-4 hover:text-seal"
          >
            删除这条
          </button>
        )}
      </div>
    </article>
  )
}
