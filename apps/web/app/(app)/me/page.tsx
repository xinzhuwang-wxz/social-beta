import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { FacetList } from '@/components/facet-list'
import { setFacetVisibilityAction, deleteFacetAction } from './actions'

interface MePageProps {
  searchParams: Promise<{ error?: string }>
}

/**
 * /me —— 我的切面（判据②）。
 *
 * 只做「取 actor → 调 PoolEngine.myFacets → 渲染」。溯源、可见度、删除
 * 这三件事全部由 FacetView 本身的形状和 PoolEngine 的方法回答，
 * 这一层不重复判断任何东西。
 */
export default async function MePage({ searchParams }: MePageProps) {
  const { error } = await searchParams
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const facets = await engine.myFacets(actor)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-5 py-12 sm:px-8">
      <header>
        <p className="text-sm font-medium text-accent">我的切面</p>
        <h1 className="mt-2 font-head text-2xl font-semibold text-ink sm:text-3xl">
          系统眼里的你，逐条可查、可改、可删
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          这里没有一条是你填的——每一条画像都是从你参与过的池塘里长出来的，点开就能看到具体是哪几次。
        </p>
      </header>

      {error && (
        <p role="alert" className="border border-seal bg-seal-soft px-4 py-3 text-sm text-seal-strong">
          {decodeURIComponent(error)}
        </p>
      )}

      {facets.length === 0 ? (
        <EmptyFacets />
      ) : (
        <FacetList facets={facets} setVisibilityAction={setFacetVisibilityAction} deleteAction={deleteFacetAction} />
      )}
    </main>
  )
}

function EmptyFacets() {
  return (
    <div className="border border-dashed border-border p-6 text-sm leading-relaxed text-ink-soft">
      <p>
        还没有任何画像——这不是空白页，是如实反映：你还没参与过能长出画像的池塘。
        画像不是填出来的，它会在你真正一起做成事情之后自己长出来。
      </p>
      <Link href="/square" className="mt-3 inline-block text-accent underline decoration-dotted underline-offset-4">
        去发一条意图 →
      </Link>
    </div>
  )
}
