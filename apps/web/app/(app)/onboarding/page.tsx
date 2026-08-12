import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { PageHeader, PageShell, ErrorBanner } from '@/components/page-header'
import { registerPerson } from './actions'

interface OnboardingPageProps {
  searchParams: Promise<{ error?: string }>
}

const FIELDS = [
  {
    name: 'handle',
    label: 'handle',
    hint: '唯一，别人 @ 你用这个',
    placeholder: 'linlin',
    minLength: 2,
  },
  { name: 'displayName', label: '显示名', hint: '别人看到的称呼', placeholder: '林同学' },
  { name: 'campusId', label: '校区', hint: '同校区的人才互相看得到', placeholder: '如 pku' },
] as const

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const actor = await requireActor()
  const params = await searchParams

  // 已经建过档的人不该再看见这张表单——直接送回首页，避免破坏 auth_user_id 的唯一约束。
  const existing = await getEngine().currentPerson(actor)
  if (existing) redirect('/home')

  return (
    <PageShell>
      <PageHeader
        eyebrow="建个档"
        title="只要这三项"
        lede="没有兴趣标签、没有自我介绍、没有技能列表——注册接口连接收它们的字段都没有。画像是结果不是输入，它会从你参与过的事里自己长出来。"
      />

      {params.error && <ErrorBanner message={params.error} />}

      <form action={registerPerson} className="flex max-w-md flex-col gap-5">
        {FIELDS.map((field) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label htmlFor={field.name} className="text-sm font-medium text-ink">
              {field.label}
              <span className="ml-2 text-xs font-normal text-ink-soft">{field.hint}</span>
            </label>
            <input
              id={field.name}
              name={field.name}
              required
              minLength={'minLength' in field ? field.minLength : undefined}
              placeholder={field.placeholder}
              className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
            />
          </div>
        ))}

        <button
          type="submit"
          className="self-start border border-accent-deep bg-accent-deep px-5 py-2.5 text-sm font-medium text-accent-ink transition-colors hover:border-accent-hover hover:bg-accent-hover"
        >
          进池塘
        </button>
      </form>
    </PageShell>
  )
}
