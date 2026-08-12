import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { registerPerson } from './actions'

interface OnboardingPageProps {
  searchParams: Promise<{ error?: string }>
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const actor = await requireActor()
  const params = await searchParams

  // 已经建过档的人不该再看见这张表单——直接送回首页，避免破坏 auth_user_id 的唯一约束。
  const existing = await getEngine().currentPerson(actor)
  if (existing) redirect('/home')

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold">建个档</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          只要这三项。画像不是填出来的——它会在你参与的池塘里自己长出来。
        </p>
      </div>

      <form action={registerPerson} className="flex flex-col gap-3">
        <label htmlFor="handle" className="text-sm text-ink-soft">
          handle（唯一，别人 @ 你用这个）
        </label>
        <input
          id="handle"
          name="handle"
          required
          minLength={2}
          placeholder="linlin"
          className="rounded border border-border-strong px-3 py-2"
        />

        <label htmlFor="displayName" className="text-sm text-ink-soft">
          显示名
        </label>
        <input
          id="displayName"
          name="displayName"
          required
          placeholder="林同学"
          className="rounded border border-border-strong px-3 py-2"
        />

        <label htmlFor="campusId" className="text-sm text-ink-soft">
          校区
        </label>
        <input
          id="campusId"
          name="campusId"
          required
          placeholder="如 pku"
          className="rounded border border-border-strong px-3 py-2"
        />

        <button
          type="submit"
          className="mt-2 rounded border border-seal bg-seal px-4 py-2 text-seal-ink transition hover:bg-seal-strong"
        >
          进池塘
        </button>

        {params.error && (
          <p role="alert" className="text-sm text-red-600">
            {params.error}
          </p>
        )}
      </form>
    </main>
  )
}
