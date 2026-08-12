import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { FacetList } from '@/components/facet-list'
import { GardenScene, type GardenPlant } from '@/components/garden-scene'
import { PageShell, EmptyState, ErrorBanner, SectionHead } from '@/components/page-header'
import { stageOf } from '@/lib/growth'
import { setFacetVisibilityAction, deleteFacetAction } from './actions'

interface MePageProps {
  searchParams: Promise<{ error?: string }>
}

/**
 * /me —— 回忆森林。A 类世界页面。
 *
 * 森林里只种**已经开过花或已经结果的**那些，也就是真的发生过的事。
 * 还在长的留在「我的花园」里：森林是档案，不是待办清单。
 * 这条区分不是版面偏好，是产品主张的字面执行 ——
 * 你的画像由你完成过什么构成，不由你正在打算什么构成。
 *
 * 只做「取 actor → 调 PoolEngine → 渲染」。溯源、可见度、删除这三件事
 * 全部由 FacetView 的形状和 PoolEngine 的方法回答，这一层不重复判断。
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

  const forest: GardenPlant[] = finished.map((pool) => ({
    key: pool.id,
    stage: stageOf(pool.state),
    artifacts: pool.artifactCount,
    title: pool.title ?? '（还没起名字）',
    href: `/pool/${pool.id}`,
  }))

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-cap font-medium tracking-wide text-accent-deep">回忆森林</p>
          <h1 className="t-h1 mt-1">你真正和别人完成过什么</h1>
        </div>
        <span className="pill">{person.displayName}</span>
      </div>

      <p className="t-sec max-w-2xl">
        这里没有一条是你填的。每一句画像都从你参与过的事里长出来，点开就能看到具体是哪几株。
      </p>

      <GardenScene
        plants={forest}
        bird={finished.length > 0 ? 'happy' : 'resting'}
        emptyHint="森林里还没有树。真的办成过的事，才会长到这里来。"
      />

      {growing > 0 && (
        <p className="t-cap">
          另有 {growing} 株还在长，它们要等真的办成了才会进森林 ——
          <Link href="/home" className="ml-1 inline-flex min-h-11 items-center font-medium text-accent-deep underline underline-offset-4">
            去我的花园看看
          </Link>
        </p>
      )}

      {error && <ErrorBanner message={decodeURIComponent(error)} />}

      <section className="flex flex-col gap-4">
        <SectionHead
          title="系统怎么描述你"
          aside={<span className="t-cap">{facets.length} 条切面</span>}
          hint="每一条都能点回它的依据。改可见度、删掉，都由你。"
        />

        {facets.length === 0 ? (
          <EmptyState>
            <p>
              还没有任何画像——这不是空白页，是如实反映：你还没参与过能长出画像的事。画像不是填出来的，它会在你真正和别人做成事情之后自己长出来。
            </p>
            <Link href="/square" className="btn btn-secondary btn-sm mt-3 inline-flex">
              去种一颗
            </Link>
          </EmptyState>
        ) : (
          <FacetList
            facets={facets}
            setVisibilityAction={setFacetVisibilityAction}
            deleteAction={deleteFacetAction}
          />
        )}
      </section>
    </PageShell>
  )
}
