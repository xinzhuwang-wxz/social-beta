import { PoolPlant } from './pool-plant'
import { STAGE_LABEL, type GrowthStage } from '@/lib/growth'

/**
 * 生长图谱 —— 落地页的主图，也是全站视觉语言的说明书。
 *
 * 它做的事只有一件：把「一次行动的一生」摊开给人看。用户在花园和行动房间里
 * 看到的植物，形态全部出自这张图；这里教一遍，之后就不用再解释。
 *
 * 只列产品今天真的会出现的六档 —— 组件实现了七档，但 `growing`
 * （计划拟好了、还没全员确认）在后端还没有对应状态，
 * **不在这里先画一个用户永远遇不到的阶段**。
 */
const PLATE: { stage: GrowthStage; artifacts?: number; meaning: string }[] = [
  { stage: 'seed', meaning: '你说了一句人话，愿望落进土里' },
  { stage: 'sprout', meaning: '有人回了「算我一个」，破土' },
  { stage: 'seedling', meaning: '正在把时间、地点、谁带什么定下来' },
  { stage: 'bud', meaning: '一张行动确认卡，所有人都点了确认' },
  { stage: 'bloom', artifacts: 2, meaning: '事真的做成了，每张返图多开一朵' },
  { stage: 'fruit', meaning: '带着「下次去大觉寺」这句话歇着，籽还在' },
]

export function GrowthPlate() {
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {PLATE.map((item, i) => (
        <li
          key={item.stage}
          className="card animate-rise-in flex flex-col items-center gap-2 p-4 text-center"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          {/* 同一个 viewBox、同一条地平线 —— 高矮差异因此是真的，不是各自缩放 */}
          <PoolPlant
            stage={item.stage}
            artifacts={item.artifacts}
            label={null}
            className="h-24 w-20 shrink-0"
          />
          <p className="t-hand text-base font-semibold text-brand">
            {STAGE_LABEL[item.stage]}
          </p>
          <p className="t-cap">{item.meaning}</p>
        </li>
      ))}
    </ol>
  )
}
