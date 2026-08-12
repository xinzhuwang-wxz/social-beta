'use client'

import { useActionState, useState, useTransition } from 'react'
import { DOMAINS, DOMAIN_LABEL, IntentSlots, type Domain } from '@pool/shared'
import type { PublishState } from '@/app/(app)/square/actions'

type PublishedIntent = Extract<PublishState, { status: 'success' }>['intent']

interface IntentConfirmationProps {
  intent: PublishedIntent
  action: (prevState: PublishState, formData: FormData) => Promise<PublishState>
}

const EMPTY_SLOTS: IntentSlots = { when: null, where: null, size: null, level: null, vibe: [] }

/**
 * 发布后的「我理解成了」确认卡 —— 产品的关键交互。
 *
 * 模型必然会抽错，而只有用户知道错在哪。但 PoolEngine 没有单独的
 * 「改槽位」接口：抽取与写入在 publishIntent 内部是原子的一步
 * （intent-service.ts 的设计如此，且是刻意的——避免落一条没有 embedding
 * 的半成品记录）。所以这里的「编辑」不是原地打补丁，而是把改好的字段
 * 拼回一句人话，再走一遍同一个 publishIntent action，产出一条新记录。
 * 旧记录会留在广场直到自然过期，UI 里把这一点明说，不装作是原地保存。
 */
export function IntentConfirmation({ intent, action }: IntentConfirmationProps) {
  const [state, dispatch, pending] = useActionState<PublishState, FormData>(action, {
    status: 'success',
    intent,
  })

  const current = state.status === 'success' ? state.intent : intent
  const errorMessage = state.status === 'error' ? state.message : null

  return (
    <div className="border-l-2 border-accent bg-accent-soft px-4 py-4 sm:px-5">
      {/* key=当前记录 id：一旦重新发布产生新记录，整块编辑区连同内部的
          useState 一起重新挂载，天然拿到干净的初始值——不需要额外写
          effect 去手动同步「新数据进来了，把输入框也重置一下」。 */}
      <ConfirmationBody
        key={current.id}
        intent={current}
        dispatch={dispatch}
        pending={pending}
        errorMessage={errorMessage}
      />
    </div>
  )
}

function ConfirmationBody({
  intent,
  dispatch,
  pending,
  errorMessage,
}: {
  intent: PublishedIntent
  dispatch: (formData: FormData) => void
  pending: boolean
  errorMessage: string | null
}) {
  const parsed = IntentSlots.safeParse(intent.slots)
  const slots = parsed.success ? parsed.data : EMPTY_SLOTS

  const [editing, setEditing] = useState(false)
  const [domain, setDomain] = useState<Domain>(intent.domain)
  const [when, setWhen] = useState(slots.when ?? '')
  const [where, setWhere] = useState(slots.where ?? '')
  const [size, setSize] = useState(slots.size ?? '')
  const [level, setLevel] = useState(slots.level ?? '')
  const [vibe, setVibe] = useState(slots.vibe.join('、'))
  const [, startTransition] = useTransition()

  const summary = [
    DOMAIN_LABEL[intent.domain],
    slots.when,
    slots.where,
    slots.vibe.length > 0 ? slots.vibe.join('·') : null,
  ].filter((part): part is string => Boolean(part))

  const secondary = [slots.size, slots.level].filter((part): part is string => Boolean(part))

  function handleRepublish() {
    const formData = new FormData()
    formData.set('text', buildCorrectionText(domain, { when, where, size, level, vibe }))
    // dispatch 来自 useActionState，正常用法是喂给 <form action>；这里没有
    // 走原生表单提交（字段是逐个可编辑的受控输入，不是一份整体表单），
    // 所以在 startTransition 里手动调用它——这是 React 文档给出的
    // 「在表单之外触发同一个 action」的标准写法。
    startTransition(() => dispatch(formData))
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="mark text-accent-strong">种下了 · 它还在土里</p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm leading-relaxed text-ink">
          <span className="text-ink-soft">我理解成了：</span>
          {summary.join(' · ')}
        </p>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="shrink-0 text-xs font-medium text-accent-strong underline decoration-dotted underline-offset-4"
        >
          {editing ? '收起' : '不对，改一下'}
        </button>
      </div>

      {!editing && secondary.length > 0 && (
        <p className="text-xs text-ink-soft">{secondary.join(' · ')}</p>
      )}

      {editing && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs text-ink-soft">领域</legend>
            <div className="flex flex-wrap gap-1.5">
              {DOMAINS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDomain(d)}
                  aria-pressed={domain === d}
                  className={`border px-2.5 py-1 text-xs transition-colors ${
                    domain === d
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-border text-ink-muted hover:border-border-strong hover:text-ink'
                  }`}
                >
                  {DOMAIN_LABEL[d]}
                </button>
              ))}
            </div>
          </fieldset>

          <EditField label="时间" value={when} onChange={setWhen} placeholder="如「周六」" />
          <EditField label="地点" value={where} onChange={setWhere} placeholder="如「京郊」" />
          <EditField label="人数" value={size} onChange={setSize} placeholder="如「三四个」" />
          <EditField label="强度 / 门槛" value={level} onChange={setLevel} placeholder="如「新手友好」" />
          <EditField
            label="风格"
            value={vibe}
            onChange={setVibe}
            placeholder="顿号分隔，如「野线、摄影」"
          />

          {errorMessage && (
            <p role="alert" className="text-sm text-seal">
              {errorMessage}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleRepublish}
              disabled={pending}
              className="self-start border border-accent bg-accent px-4 py-2 text-xs font-medium text-accent-ink transition-colors hover:border-accent-strong hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? '重新发布中…' : '重新发布'}
            </button>
            <p className="text-xs text-ink-soft">
              会重新发一条修正后的意图；原来那条会留在广场，直到自然过期。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-soft">
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-border bg-surface px-2.5 py-1.5 text-sm text-ink focus-visible:border-accent"
      />
    </label>
  )
}

/** 把逐项编辑后的字段拼回一句人话，交给同一条 publishIntent 重新抽取。 */
function buildCorrectionText(
  domain: Domain,
  slots: { when: string; where: string; size: string; level: string; vibe: string },
): string {
  const vibeList = slots.vibe
    .split(/[,，、\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)

  const parts = [DOMAIN_LABEL[domain]]
  for (const value of [slots.when, slots.where, slots.size, slots.level]) {
    if (value.trim()) parts.push(value.trim())
  }
  if (vibeList.length > 0) parts.push(vibeList.join('、'))

  return `${parts.join('，')}，想找搭子`
}
