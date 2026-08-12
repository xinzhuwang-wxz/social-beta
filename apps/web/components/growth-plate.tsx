import { PoolPlant } from './pool-plant'
import { STAGE_LABEL, type GrowthStage } from '@/lib/growth'

/**
 * 生长图谱 —— 落地页的主图，也是全站视觉语言的说明书。
 *
 * 它做的事只有一件：把「一次行动的完整生命周期」一次性摊开给人看。
 * 用户在池塘页看到的那株植物，形态全部出自这张图；这里先教一遍，
 * 之后每个页面上的植物就不用再解释。
 *
 * 排版参照植物标本册的一页：编号在上、图在中、名与释义在下，
 * 全部左对齐、方角、细线分栏 —— 不是居中的图标网格。
 */
const PLATE: { stage: GrowthStage; artifacts?: number; meaning: string }[] = [
  { stage: 'seed', meaning: '你说了一句人话，愿望落进土里' },
  { stage: 'sprout', meaning: '有人回了「算我一个」，破土' },
  { stage: 'sapling', meaning: '在把时间、地点、谁带什么聊定' },
  { stage: 'budding', meaning: '一张行动确认卡，所有人都点了确认' },
  { stage: 'blooming', artifacts: 2, meaning: '事真的做成了，每张返图多开一朵' },
  { stage: 'fruiting', meaning: '带着「下次去大觉寺」这句话睡着，籽还在' },
]

export function GrowthPlate() {
  return (
    <ol className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
      {PLATE.map((item, i) => (
        <li
          key={item.stage}
          className="animate-rise-in flex flex-col gap-3 bg-surface p-4"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <p className="mark text-ink-soft">{String(i + 1).padStart(2, '0')}</p>
          <PoolPlant
            stage={item.stage}
            artifacts={item.artifacts}
            label={null}
            className="size-16 shrink-0"
          />
          <div>
            <p className="font-head text-base font-semibold text-ink">
              {STAGE_LABEL[item.stage]}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{item.meaning}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
