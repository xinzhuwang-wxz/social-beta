import Link from 'next/link'
import { PoolPlant } from './pool-plant'
import { MessengerBird, type BirdState } from './messenger-bird'
import { STAGE_LABEL, type GrowthStage } from '@/lib/growth'

export interface GardenPlant {
  key: string
  stage: GrowthStage
  artifacts: number
  /** 这株植物代表的那件事。 */
  title: string
  /** 点进去能看到它 —— 花园里的每一株都必须可溯源，否则它就只是插画。 */
  href?: string
}

/**
 * 花园场景 —— A 类世界页面的主体（我的花园 / 回忆森林）。
 *
 * 规范里最重要的一条在这里执行：**背景低信息密度，可交互主体高信息密度。**
 *   草地是一整块浅绿色块，不是几百根小草 + 小花 + 石头 + 阴影 + 颗粒；
 *   远景森林是几组简单色块表示的树冠，不画树干也不画枝条。
 * 目标是第一眼看到结构，而不是笔触。
 *
 * 于是这张图里只有四层：远景树冠、草地色块、一排植物、一只信使鸟。
 * 植物是唯一「精细」的东西，因为它们是唯一可点、且承载状态的东西。
 *
 * 所有植物共用同一个 viewBox 与同一条地平线，容器再按底对齐 ——
 * 高矮差异因此是真实的、可比的，而不是各自缩放出来的错觉。
 */
export function GardenScene({
  plants,
  bird = 'idle',
  emptyHint,
}: {
  plants: readonly GardenPlant[]
  bird?: BirdState
  /** 一株都没有时说什么。世界页面不该是一块空绿地配「暂无数据」。 */
  emptyHint?: ReactNodeLike
}) {
  return (
    <section
      aria-label="我的花园"
      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-alt"
    >
      {/* 背景两层色块。preserveAspectRatio=none 让它随容器拉伸，
          不需要为不同屏宽准备第二张图。 */}
      <svg
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      >
        {/* 远景树冠：四团色块，没有树干没有枝条 */}
        <g fill="var(--grass-far)" opacity="0.85">
          <ellipse cx="46" cy="118" rx="52" ry="30" />
          <ellipse cx="150" cy="112" rx="64" ry="34" />
          <ellipse cx="268" cy="118" rx="56" ry="30" />
          <ellipse cx="368" cy="114" rx="50" ry="32" />
        </g>
        {/* 草地：一整块 */}
        <path d="M0 138 Q200 122 400 138 L400 200 L0 200 Z" fill="var(--grass)" />
      </svg>

      <div className="relative flex min-h-[13rem] flex-col justify-end gap-3 p-4 sm:min-h-[15rem] sm:p-5">
        {plants.length === 0 ? (
          <p className="t-hand max-w-sm rounded-[var(--radius-md)] bg-surface-raised/90 px-4 py-3 text-base leading-relaxed text-ink">
            {emptyHint ?? '这里还空着。种下第一颗，它就会长出来。'}
          </p>
        ) : (
          <ul className="flex flex-wrap items-end gap-x-1 gap-y-2">
            {plants.map((plant) => {
              const body = (
                <>
                  <PoolPlant
                    stage={plant.stage}
                    artifacts={plant.artifacts}
                    label={null}
                    className="h-20 w-16 sm:h-24 sm:w-20"
                  />
                  <span className="t-hand line-clamp-2 w-full rounded-[var(--radius-sm)] bg-surface-raised/85 px-1.5 py-0.5 text-center text-xs leading-snug text-ink">
                    {plant.title}
                  </span>
                </>
              )
              return (
                <li key={plant.key} className="w-[4.5rem] sm:w-20">
                  {plant.href ? (
                    <Link
                      href={plant.href}
                      title={`${plant.title} · ${STAGE_LABEL[plant.stage]}`}
                      className="flex flex-col items-center transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex flex-col items-center">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 信使鸟站在花园一角。它是角色，不是装饰 —— 状态由页面传进来。 */}
      <MessengerBird
        state={bird}
        animate
        label={null}
        className="pointer-events-none absolute top-3 right-3 size-16 sm:size-20"
      />
    </section>
  )
}

type ReactNodeLike = string | null | undefined
