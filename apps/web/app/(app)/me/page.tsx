import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { FacetList } from '@/components/facet-list'
import { ForestBand, type ForestPlant } from '@/components/forest-band'
import { ColorField } from '@/components/color-field'
import { PageShell, EmptyState, ErrorBanner } from '@/components/page-header'
import { stageOf } from '@/lib/growth'
import { setFacetVisibilityAction, deleteFacetAction } from './actions'

interface MePageProps {
  searchParams: Promise<{ error?: string }>
}

/**
 * /me —— 我的森林（判据②）。
 *
 * 只做「取 actor → 调 PoolEngine → 渲染」。溯源、可见度、删除这三件事
 * 全部由 FacetView 本身的形状和 PoolEngine 的方法回答，这一层不重复判断。
 *
 * 森林里只种**已经开过花或已经结籽的**那些 —— 也就是真的发生过的事。
 * 还在长的留在「我的行动」里：森林是档案，不是待办清单。
 * 这条区分不是版面偏好，是产品主张的字面执行：
 * 你的画像由你完成过什么构成，不由你正在打算什么构成。
 *
 * 顺带一个实现上的好处：done / dormant 的植物形态只看 state 和 artifactCount
 * 就能定（见 stageFromSummary），所以这一页不需要为任何一株多查一次时间线。
 */
export default async function MePage({ searchParams }: MePageProps) {
  const { error } = await searchParams
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const [facets, pools] = await Promise.all([engine.myFacets(actor), engine.myPools(actor)])

  const finished = pools.filter((p) => p.state === 'done' || p.state === 'dormant')
  const growing = pools.length - finished.length

  const forest: ForestPlant[] = finished.map((pool) => ({
    key: pool.id,
    stage: stageOf(pool.state),
    artifacts: pool.artifactCount,
    title: pool.title ?? '（还没起名字）',
    href: `/pool/${pool.id}`,
  }))

  return (
    <div className="flex flex-col">
      <ColorField
        eyebrow="我的森林"
        title="你真正和别人完成过什么"
        stage={finished[0] ? stageOf(finished[0].state) : 'seed'}
        artifacts={finished[0]?.artifactCount ?? 0}
        meta={[person.displayName, `长成 ${finished.length} 株`, `切面 ${facets.length} 条`]}
      >
        <p className="max-w-xl text-sm leading-relaxed opacity-90">
          这里没有一条是你填的。每一句画像都从你参与过的事里长出来，点开就能看到具体是哪几株。
        </p>
      </ColorField>

      <PageShell>
        {error && <ErrorBanner message={decodeURIComponent(error)} />}

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2">
          <h2 className="font-head text-lg font-semibold text-ink">长成的</h2>
          <span className="mark text-ink-soft">{finished.length} 株</span>
        </div>
        {forest.length === 0 ? (
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            还没有一株长到开花。森林里只种真的发生过的事——正在长的那些在
            <Link href="/home" className="mx-1 text-accent underline decoration-dotted underline-offset-4">
              我的行动
            </Link>
            里。
          </p>
        ) : (
          <>
            <ForestBand plants={forest} className="mt-6 gap-x-1 gap-y-6" />
            {growing > 0 && (
              <p className="mt-6 text-xs text-ink-soft">
                另有 {growing} 株还在长，它们要等真的办成了才会进森林。
              </p>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2">
          <h2 className="font-head text-lg font-semibold text-ink">系统怎么描述你</h2>
          <span className="mark text-ink-soft">{facets.length} 条切面</span>
        </div>

        {facets.length === 0 ? (
          <EmptyFacets />
        ) : (
          <FacetList
            facets={facets}
            setVisibilityAction={setFacetVisibilityAction}
            deleteAction={deleteFacetAction}
          />
        )}
        </section>
      </PageShell>
    </div>
  )
}

function EmptyFacets() {
  return (
    <EmptyState>
      <p>
        还没有任何画像——这不是空白页，是如实反映：你还没参与过能长出画像的事。画像不是填出来的，它会在你真正和别人做成事情之后自己长出来。
      </p>
      <Link
        href="/square"
        className="mt-3 inline-block text-accent underline decoration-dotted underline-offset-4"
      >
        去种一颗 →
      </Link>
    </EmptyState>
  )
}
