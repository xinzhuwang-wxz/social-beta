'use client'

import { useActionState, useState } from 'react'
import type { PlanRecord, PoolBoard } from '@pool/engine'
import {
  confirmPlanAction,
  draftPlanAction,
  submitPlanAction,
  type DraftState,
  type PlanDraft,
  type SubmitPlanState,
} from '@/app/(app)/pool/[id]/actions'

const DRAFT_INITIAL: DraftState = { status: 'idle' }
const SUBMIT_INITIAL: SubmitPlanState = { status: 'idle' }

type Member = PoolBoard['members'][number]

const WHEN_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * 行动确认卡 —— 从「有空一起」到「确定一起」。
 *
 * PRD 把这一步称为最重要的中间转化节点：在它之前，池塘里聊完就直接跳到
 * 「办完了」，中间那个「我们确定要一起做这件事」的时刻没有落点。
 *
 * 三条产品红线在这个组件里各有一处对应的实现：
 *
 * 1. **AI 只汇总，人来提交。** 「让 Agent 汇总一版」拿回来的是草稿，
 *    直接落进一张完全可编辑的表单，不写库、不改状态。让 AI 生成并生效，
 *    等于替一群人做了共同承诺。
 * 2. **一个人拍板不算数。** 只有全员确认，池塘才进花苞。所以这里永远
 *    显示「谁确认了 / 还差谁」，而不是一个「已确认」的绿勾。
 * 3. **改一版就作废所有确认。** 引擎侧是覆盖式提交，UI 必须把这句话说出来 ——
 *    否则改完计划的人会以为别人之前的确认还算数。
 */
export function PlanCard({
  poolId,
  plan,
  members,
  viewerPersonId,
  canEdit,
}: {
  poolId: string
  plan: PlanRecord | null
  members: Member[]
  viewerPersonId: string
  /** 已办完 / 休眠的池塘只读 —— 事情都过去了，改计划没有意义。 */
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const joined = members.filter((m) => m.state === 'joined')

  if (editing && canEdit) {
    return (
      <PlanForm
        poolId={poolId}
        plan={plan}
        members={joined}
        onClose={() => setEditing(false)}
      />
    )
  }

  if (!plan) {
    return canEdit ? (
      <PlanStarter poolId={poolId} members={joined} />
    ) : (
      <section className="rounded-[var(--radius-md)] border border-border p-4">
        <p className="t-cap text-ink-soft">行动确认卡</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">这件事没有留下确认卡。</p>
      </section>
    )
  }

  const iConfirmed = plan.confirmedBy.some((p) => p.personId === viewerPersonId)

  return (
    <section className="border border-accent-deep">
      <div className="flex items-baseline justify-between gap-3 border-b border-accent-deep bg-accent-soft px-4 py-2.5">
        <span className="t-cap font-semibold tracking-wide text-brand">行动确认卡</span>
        <span className="t-cap font-semibold tracking-wide text-brand">
          {plan.pendingBy.length === 0 ? '全员已确认' : `还差 ${plan.pendingBy.length} 人`}
        </span>
      </div>

      <dl className="px-4 py-3">
        <Field label="做什么">{plan.title}</Field>
        <Field label="什么时候">{WHEN_FORMAT.format(new Date(plan.startsAt))}</Field>
        <Field label="在哪集合">{plan.meetAt}</Field>
        {plan.route && <Field label="路线">{plan.route}</Field>}
        {plan.bring.length > 0 && <Field label="带什么">{plan.bring.join('、')}</Field>}
        {plan.budget && <Field label="费用">{plan.budget}</Field>}
        {plan.changePolicy && <Field label="变更约定">{plan.changePolicy}</Field>}
      </dl>

      {plan.tasks.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="t-cap text-ink-soft">分工</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {plan.tasks.map((t) => (
              <li key={t.id} className="flex gap-2.5 text-sm leading-snug">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-2 shrink-0 border ${
                    t.ownerName ? 'border-accent-deep bg-accent-deep' : 'border-border-strong'
                  }`}
                />
                <span className="min-w-0 break-anywhere">
                  <span className="text-ink">{t.what}</span>
                  <span className="text-ink-soft">
                    {' · '}
                    {t.ownerName ?? '还没人认领'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-border px-4 py-3">
        <p className="t-cap text-ink-soft">确认情况</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {plan.confirmedBy.map((p) => (
            <li
              key={p.personId}
              className="border border-accent-deep bg-accent-soft px-2 py-0.5 text-xs text-brand"
            >
              {p.displayName} 已确认
            </li>
          ))}
          {plan.pendingBy.map((p) => (
            <li
              key={p.personId}
              className="border border-dashed border-border-strong px-2 py-0.5 text-xs text-ink-soft"
            >
              {p.displayName} 还没确认
            </li>
          ))}
        </ul>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3">
          {!iConfirmed && (
            <form action={confirmPlanAction.bind(null, poolId)}>
              <button
                type="submit"
                className="btn btn-primary"
              >
                我确认
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex min-h-11 items-center px-1 text-sm text-ink-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-ink"
          >
            改一版
          </button>
          <p className="text-xs leading-relaxed text-ink-soft">
            {iConfirmed
              ? '你已经确认了。所有人都确认，这件事才结成花苞。'
              : '确认之前先看清时间地点——所有人都确认之后，这就是共同承诺了。'}
          </p>
        </div>
      )}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border py-2 last:border-b-0">
      <dt className="t-cap w-16 shrink-0 pt-0.5 text-ink-soft">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm leading-snug text-ink break-anywhere">{children}</dd>
    </div>
  )
}

/** 还没有卡时的入口：AI 汇总一版，或者自己从空白填。 */
function PlanStarter({ poolId, members }: { poolId: string; members: Member[] }) {
  const [state, dispatch, pending] = useActionState(draftPlanAction, DRAFT_INITIAL)
  const [blank, setBlank] = useState(false)

  if (state.status === 'ready') {
    return <PlanForm poolId={poolId} draft={state.draft} members={members} onClose={() => {}} />
  }
  if (blank) {
    return <PlanForm poolId={poolId} members={members} onClose={() => setBlank(false)} />
  }

  return (
    <section className="rounded-[var(--radius-md)] border border-dashed border-border-strong p-4">
      <p className="t-cap text-ink-soft">行动确认卡</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">
        聊到差不多了，就把它定下来：具体几点、在哪集合、谁带什么。
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
        意图阶段说「这周末」是对的，但到了这一步，含糊就等于没确认。所有人都确认之后，这件事才算真的定下来。
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form action={dispatch}>
          <input type="hidden" name="poolId" value={poolId} />
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? 'Agent 在翻聊天记录…' : '让 Agent 汇总一版'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setBlank(true)}
          className="border border-border px-4 py-2 text-sm text-ink transition-colors hover:border-accent-deep hover:text-accent-deep"
        >
          自己填
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        汇总出来的只是草稿，它只填聊天里真的聊到过的东西，剩下的留空给你补。提交与否由你。
      </p>
      {state.status === 'error' && (
        <p role="alert" className="mt-3 text-sm text-alert">
          {state.message}
        </p>
      )}
    </section>
  )
}

interface TaskRow {
  what: string
  ownerId: string
}

/**
 * 可编辑的确认卡表单。
 *
 * 草稿里的 ownerHint 是聊天里出现的名字，不是 id —— 引擎只接受 ownerId，
 * 所以这里按名字去在册成员里对一次，对不上就留空不认领，
 * 而不是硬塞一个人进去。「猜错了谁负责」比「没人负责」糟糕得多。
 */
function PlanForm({
  poolId,
  plan,
  draft,
  members,
  onClose,
}: {
  poolId: string
  plan?: PlanRecord | null
  draft?: PlanDraft
  members: Member[]
  onClose: () => void
}) {
  const [state, dispatch, pending] = useActionState(
    submitPlanAction.bind(null, poolId),
    SUBMIT_INITIAL,
  )

  const [tasks, setTasks] = useState<TaskRow[]>(() => {
    if (plan) {
      return plan.tasks.map((t) => ({ what: t.what, ownerId: t.ownerId ?? '' }))
    }
    if (draft) {
      return draft.tasks.map((t) => ({
        what: t.what,
        ownerId: members.find((m) => m.displayName === t.ownerHint)?.personId ?? '',
      }))
    }
    return []
  })

  const defaults = {
    title: plan?.title ?? draft?.title ?? '',
    startsAt: toLocalInput(plan?.startsAt ?? draft?.startsAt),
    meetAt: plan?.meetAt ?? draft?.meetAt ?? '',
    route: plan?.route ?? draft?.route ?? '',
    bring: (plan?.bring ?? draft?.bring ?? []).join('、'),
    budget: plan?.budget ?? draft?.budget ?? '',
    changePolicy: plan?.changePolicy ?? '',
  }

  if (state.status === 'saved') {
    return (
      <section className="border border-accent-deep bg-accent-soft px-4 py-4">
        <p className="text-sm leading-relaxed text-ink">
          卡提交了。现在等所有人逐个确认——全部确认之后，这件事才结成花苞。
        </p>
      </section>
    )
  }

  return (
    <form action={dispatch} className="border border-accent-deep">
      <div className="flex items-baseline justify-between gap-3 border-b border-accent-deep bg-accent-soft px-4 py-2.5">
        <span className="t-cap font-semibold tracking-wide text-brand">
          {plan ? '改一版确认卡' : '填一张确认卡'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-brand underline decoration-dotted underline-offset-4"
        >
          收起
        </button>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {draft && (
          <p className="border-l-2 border-border pl-3 text-xs leading-relaxed text-ink-soft">
            下面是 Agent 从你们的聊天里汇总的草稿。它只填聊天里真的聊到过的东西，空着的地方是因为你们还没聊到——改完再提交。
          </p>
        )}
        {plan && (
          <p className="border-l-2 border-alert pl-3 text-xs leading-relaxed text-ink">
            改完提交之后，之前所有人的确认都会作废，需要重新确认一轮——大家确认的是那一版，不是这一版。
          </p>
        )}

        <Input name="title" label="做什么" required defaultValue={defaults.title} placeholder="爬香山走野线" />
        <Input
          name="startsAt"
          label="什么时候"
          type="datetime-local"
          required
          defaultValue={defaults.startsAt}
          hint="具体到几点。含糊就等于没确认"
        />
        <Input name="meetAt" label="在哪集合" required defaultValue={defaults.meetAt} placeholder="香山北门地铁站 A 口" hint="具体到能导航" />
        <Input name="route" label="路线（可选）" defaultValue={defaults.route} />
        <Input name="bring" label="带什么（可选）" defaultValue={defaults.bring} placeholder="顿号分隔，如「水、防晒、充电宝」" />
        <Input name="budget" label="费用（可选）" defaultValue={defaults.budget} />
        <Input
          name="changePolicy"
          label="有变怎么办（可选）"
          defaultValue={defaults.changePolicy}
          placeholder="如「下雨就改下周同一时间」"
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">分工（可选）</legend>
          <p className="text-xs text-ink-soft">没人认领就留空——认领是自愿的，不该在这里替人指派。</p>
          {tasks.map((task, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input
                name="taskWhat"
                value={task.what}
                onChange={(e) =>
                  setTasks((rows) => rows.map((r, j) => (j === i ? { ...r, what: e.target.value } : r)))
                }
                placeholder="要做的事"
                className="min-w-0 flex-1 border border-border bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
              />
              <select
                name="taskOwner"
                value={task.ownerId}
                onChange={(e) =>
                  setTasks((rows) => rows.map((r, j) => (j === i ? { ...r, ownerId: e.target.value } : r)))
                }
                aria-label="谁来做"
                className="border border-border bg-surface px-2.5 py-1.5 text-sm text-ink focus-visible:border-accent-deep"
              >
                <option value="">还没人认领</option>
                {members.map((m) => (
                  <option key={m.personId} value={m.personId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTasks((rows) => [...rows, { what: '', ownerId: '' }])}
            className="self-start text-xs text-accent-deep underline decoration-dotted underline-offset-4"
          >
            加一项
          </button>
        </fieldset>

        {state.status === 'error' && (
          <p role="alert" className="text-sm text-alert">
            {state.message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? '提交中…' : '提交这张卡'}
          </button>
          <p className="text-xs text-ink-soft">提交后每个人都要自己点确认</p>
        </div>
      </div>
    </form>
  )
}

function Input({
  name,
  label,
  hint,
  ...rest
}: {
  name: string
  label: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`plan-${name}`} className="text-sm font-medium text-ink">
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-ink-soft">{hint}</span>}
      </label>
      <input
        id={`plan-${name}`}
        name={name}
        {...rest}
        className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
      />
    </div>
  )
}

/**
 * 转成 <input type="datetime-local"> 认的本地时间字符串。
 *
 * 不能直接用 toISOString()：那是 UTC，东八区的用户会看到时间少了八小时，
 * 而且他多半不会意识到是时区问题，只会觉得这个表单填不对。
 */
function toLocalInput(value: Date | string | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
