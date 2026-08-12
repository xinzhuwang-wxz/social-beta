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
 * 「凭什么这么说我」那一块是整张卡的核心 —— 用户问出这句话时，
 * 答案必须是可点进去核实的具体几株植物，不是一句抽象的「基于你的活动」。
 * 所以那一块不是脚注，它和正文一样重，且每条依据都是链接。
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
    <article className="card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <h3 className="text-base font-semibold text-ink">
          {DOMAIN_LABEL[facet.domain]}
        </h3>
        <span className="t-cap text-ink-soft">长自 {facet.nPools} 株</span>
      </div>

      <p className="px-4 py-4 text-sm leading-relaxed text-ink break-anywhere">{facet.summary}</p>

      <div className="border-l-2 border-accent-deep bg-accent-soft px-4 py-3">
        <p className="t-cap font-semibold tracking-wide text-brand">你凭什么这么说我</p>
        {facet.evidence.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink-soft">
            这条暂时找不到对应的池塘——可能相关的那些已经被退出了。
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {facet.evidence.map((e) => (
              <li key={e.poolId}>
                <Link
                  href={`/pool/${e.poolId}`}
                  className="flex min-h-11 items-center rounded-[var(--radius-pill)] border border-border-strong bg-surface-raised px-4 text-sm text-ink transition-colors duration-200"
                >
                  {e.title ?? '（还没起名字）'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <fieldset className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <legend className="t-cap text-ink-soft">谁能看到这条</legend>
        <div className="flex flex-wrap gap-1.5">
          {VISIBILITY_OPTIONS.map((opt) => (
            <form key={opt.value} action={setVisibilityAction.bind(null, facet.domain, opt.value)}>
              <button
                type="submit"
                aria-pressed={facet.visibility === opt.value}
                title={opt.hint}
                disabled={facet.visibility === opt.value}
                className={`flex min-h-11 items-center rounded-[var(--radius-pill)] border px-4 text-sm transition-colors duration-200 disabled:cursor-default ${
                  facet.visibility === opt.value
                    ? 'border-accent-deep bg-accent-deep font-semibold text-accent-ink'
                    : 'border-border-strong text-ink-muted'
                }`}
              >
                {opt.label}
              </button>
            </form>
          ))}
        </div>
        <p className="text-xs text-ink-soft">
          {VISIBILITY_OPTIONS.find((o) => o.value === facet.visibility)?.hint}
        </p>
      </fieldset>

      <div className="px-4 py-3">
        {confirmingDelete ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs leading-relaxed text-ink-soft">
              删掉之后，如果那几株还在，下次蒸馏可能会基于同样的事实重新长出同一条画像——切面是事实的投影，不是可以单独否认的声明。真要「别再这么说我」，得去改可见度，或者退出那些池塘。
            </p>
            <div className="flex gap-2">
              <form action={deleteAction.bind(null, facet.domain)}>
                <button
                  type="submit"
                  className="flex min-h-11 items-center rounded-[var(--radius-pill)] border border-alert px-4 text-sm font-semibold text-alert transition-colors duration-200"
                >
                  确定删除
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="btn btn-quiet btn-sm"
              >
                算了
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex min-h-11 items-center px-1 text-sm text-ink-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-alert"
          >
            删除这条
          </button>
        )}
      </div>
    </article>
  )
}
