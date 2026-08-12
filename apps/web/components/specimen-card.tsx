import { PoolPlant } from './pool-plant'

const LABELS = [
  { k: '那件事', v: '周六去后海骑车' },
  { k: '参与', v: '4 人，都点过确认' },
  { k: '阶段', v: '开花 · 行动真实完成' },
  { k: '依据', v: '3 份返图、1 张共同海报' },
] as const

/**
 * 首屏的标本卡：一株植物 + 一张标签。
 *
 * 首屏不放产品截图也不放插画，放一张标本 —— 因为这个产品要说的第一件事
 * 不是「界面长这样」，而是「一件事被做成之后会留下什么」。
 *
 * 内容明确标注为示例：落地页可以举例，但不能让人误以为是他自己的数据。
 * 这条线在整个仓库里是硬的 —— 产品页面里一条假数据都没有。
 */
export function SpecimenCard() {
  return (
    <figure className="border border-border bg-surface-raised">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <span className="mark text-ink-soft">标本 · 示例</span>
        <span className="mark text-seal">开花</span>
      </div>

      {/* 窄屏改成上下：并排时标签列只剩一百多像素，「4 人，都点过确认」会被拆成三行 */}
      <div className="flex flex-col gap-4 px-5 pt-6 pb-4 sm:flex-row sm:items-end sm:gap-5">
        <PoolPlant stage="blooming" artifacts={3} animate label={null} className="h-36 w-27 shrink-0" />
        <dl className="min-w-0 flex-1">
          {LABELS.map((row) => (
            <div key={row.k} className="flex gap-3 border-b border-border py-2 last:border-b-0">
              <dt className="mark w-12 shrink-0 pt-0.5 text-ink-soft">{row.k}</dt>
              <dd className="min-w-0 flex-1 text-sm leading-snug text-ink">{row.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <figcaption className="border-t border-border px-5 py-4 text-sm leading-relaxed text-ink-soft">
        这株植物不代表某个人。它代表<span className="text-ink">四个人共同推动的那一件事</span>——谁都没法一个人把它养开花。
      </figcaption>
    </figure>
  )
}
