import Link from 'next/link'
import { PoolPlant } from './pool-plant'
import { STAGE_LABEL, type GrowthStage } from '@/lib/growth'

export interface ForestPlant {
  key: string
  stage: GrowthStage
  artifacts: number
  /** 这株植物代表的那件事。 */
  title: string
  /** 点进去能看到它 —— 森林里的每一株都必须可溯源，否则它就只是插画。 */
  href?: string
}

/**
 * 森林：把一个人参与过的事并排种在同一条地平线上。
 *
 * 这是「你的画像不是你声称喜欢什么，而是你真正和别人完成过什么」的字面实现 ——
 * 每一株都是一件真的发生过的事，高矮和开花与否全部来自它自己的进度，
 * 没有一株是为了让这排好看而画上去的。
 *
 * 每株植物自带土线，并排放在一起就连成一条地平线，不需要再画一条底纹。
 */
export function ForestBand({
  plants,
  className,
}: {
  plants: readonly ForestPlant[]
  className?: string
}) {
  return (
    // 每一格宽度固定：植物高度一致，土线就自然连成一条地平线。
    // 标题长短不一时若让容器自适应，土线会被高矮不同的标签顶得参差不齐 ——
    // 地平线一歪，这排东西就不再像一片林子，而像一堆图标。
    <ul className={`flex flex-wrap ${className ?? ''}`}>
      {plants.map((plant) => {
        const body = (
          <>
            <PoolPlant
              stage={plant.stage}
              artifacts={plant.artifacts}
              label={null}
              className="h-20 w-14"
            />
            <span className="mt-1.5 line-clamp-2 text-center text-xs leading-snug text-ink-soft">
              {plant.title}
            </span>
          </>
        )
        return (
          <li key={plant.key} className="w-20 sm:w-24">
            {plant.href ? (
              <Link
                href={plant.href}
                title={`${plant.title} · ${STAGE_LABEL[plant.stage]}`}
                className="flex flex-col items-center transition-opacity hover:opacity-70"
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
  )
}
