import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DOMAIN_LABEL } from '@pool/shared'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'
import { FacetList } from '@/components/facet-list'
import { GardenScene, type GardenPlant } from '@/components/garden-scene'
import { PageShell, EmptyState, ErrorBanner, SectionHead } from '@/components/page-header'
import { BlockList } from '@/components/block-list'
import { setFacetVisibilityAction, deleteFacetAction, unblockPersonAction } from './actions'

const RECAP_DATE_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

interface MePageProps {
  searchParams: Promise<{ error?: string }>
}

/**
 * /me —— 回忆森林。A 类世界页面。
 *
 * 森林里只种**对外可见的共同回忆**，来自 PoolEngine.myForestRecaps ——
 * 不是简单地把 done/dormant 状态的池塘都摆出来。两条理由都必须在这里生效：
 *
 * 1. 只有真正封存过（sealPool 写过 recap）的池塘才有资格进来，
 *    还没点「写完了，存进记忆」的不算数。
 * 2. 双向门控：任一方在私密评价里选了「这次算了」，双方都不该在森林里
 *    看到这份回忆。这条判断已经下沉到 forest_recap 视图的 where 子句里，
 *    这一层直接用引擎给的结果，不再自己按 pool.state 重新判断一遍 ——
 *    两套判断迟早会算出两个答案。
 *
 * 还在长的、已经办完但还没封存的，都留在「我的花园」里：森林是档案，
 * 不是待办清单。这条区分不是版面偏好，是产品主张的字面执行 ——
 * 你的画像由你完成过什么构成，不由你正在打算什么构成。
 *
 * 只做「取 actor → 调 PoolEngine → 渲染」。溯源、可见度、删除这三件事
 * 全部由 FacetView 的形状和 PoolEngine 的方法回答，这一层不重复判断。
 *
 * ⚠️ 下面「系统怎么描述你」那一段（切面管理）不属于这次改动范围，保持原样。
 */
export default async function MePage({ searchParams }: MePageProps) {
  const { error } = await searchParams
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const [facets, pools, recaps, blocks] = await Promise.all([
    engine.myFacets(actor),
    engine.myPools(actor),
    engine.myForestRecaps(actor),
    engine.myBlocks(actor),
  ])

  // 「还在长」只看池塘是不是已经走完（done/dormant），与森林的可见度门控无关——
  // 一件事已经办完但还没封存、或者办完了但因为门控没进森林，都不该被说成「还在长」，
  // 所以这句提示只用来引导去花园看还没走完的那些，不试图解释森林为什么没显示某一株。
  const growing = pools.filter((p) => !['done', 'dormant'].includes(p.state)).length

  const forest: GardenPlant[] = recaps.map(
    (recap): GardenPlant => ({
      key: recap.poolId,
      // 能出现在 forest_recap 视图里的池塘必然已经被 sealPool 转成 dormant——
      // 森林里的植物统一是「结果」形态，不需要再查一次 pool.state。
      stage: 'fruit',
      artifacts: 0,
      title: recap.title ?? '（还没起名字）',
      href: `/pool/${recap.poolId}`,
    }),
  )

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-cap font-medium tracking-wide text-accent-deep">回忆森林</p>
          <h1 className="t-h1 mt-1">你真正和别人完成过什么</h1>
        </div>
        <span className="pill">{person.displayName}</span>
      </div>

      {/* 一句话就够。
          原文三行，把「画像是长出来的」「双方都愿意才留下」「不告诉对方是谁的决定」
          全塞在这里 —— 而这三件事在本页下面又各自被说了一遍。同一屏说四遍，
          是不相信界面本身能表达；用户要的是能用，不是听产品自辩。 */}
      <p className="t-sec max-w-2xl">每一句都从你参与过的事里长出来，点开能看到是哪几株。</p>

      <GardenScene
        plants={forest}
        bird={forest.length > 0 ? 'happy' : 'resting'}
        emptyHint="办成一件事，这里就会长出第一棵。"
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

      {recaps.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHead title="共同回忆" hint="点开每一株，能看到当时的时间线" />
          <ul className="flex flex-col gap-2.5">
            {recaps.map((recap) => (
              <li key={recap.poolId}>
                <Link
                  href={`/pool/${recap.poolId}`}
                  className="card flex flex-col gap-1.5 p-3 transition-colors duration-200 hover:bg-surface-alt sm:p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="t-hand text-base font-semibold text-ink break-anywhere">
                      {recap.title ?? '（还没起名字）'}
                    </p>
                    <span className="t-cap shrink-0">
                      {RECAP_DATE_FORMAT.format(recap.activityAt ?? recap.createdAt)}
                    </span>
                  </div>
                  {recap.domain && (
                    <span className="pill self-start">
                      {DOMAIN_LABEL[recap.domain as keyof typeof DOMAIN_LABEL] ?? recap.domain}
                    </span>
                  )}
                  <p className="text-sm leading-relaxed text-ink break-anywhere">{recap.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <SectionHead
          title="系统怎么描述你"
          aside={<span className="t-cap">{facets.length} 条切面</span>}
          hint="点开看依据。可见度和删除都由你。"
        />

        {facets.length === 0 ? (
          <EmptyState>
            <p>做成几件事之后，这里就有内容了。</p>
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

      <section className="flex flex-col gap-4">
        <SectionHead
          title="不想再遇到的人"
          aside={blocks.length > 0 ? <span className="t-cap">{blocks.length} 人</span> : undefined}
          hint="双向生效，对方不会收到任何通知。随时可以撤销。"
        />
        <BlockList blocks={blocks} unblockAction={unblockPersonAction} />
      </section>
    </PageShell>
  )
}
