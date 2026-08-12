import { STAGE_LABEL, STAGE_MEANING, type GrowthStage } from '@/lib/growth'

/**
 * 一件事长成的那株植物。
 *
 * 它代表的不是某个人，是**所有参与者共同推动的那件事** ——
 * 一个池塘只有一株，谁看都是同一株。
 *
 * 画法遵规范：
 * 1. **一个清晰轮廓 + 2～4 个主要色块。** 没有描边、没有渐变、没有纹理、
 *    没有颗粒。第一眼看到的应该是结构，不是笔触。
 * 2. **高度必须拉开。** 七个阶段跨 S → XXL，同一个 viewBox、同一条地平线，
 *    并排放在一起时高矮一眼可辨 —— 这正是「用植物自身变化表达进度」
 *    而不用进度条的前提。
 * 3. 水彩感来自**两块相叠的同色系色块**（主色 + 亮色），不是滤镜。
 *
 * 全部 inline SVG：一个状态指示器不值得一次网络请求，也不该在弱网下
 * 比它要指示的内容还晚出现。颜色一律走 CSS 变量，否则深色下会变成脏斑。
 */

const CX = 50
const GROUND = 104 // 地平线。所有阶段共用，高度才有可比性

/** 每个阶段的树冠/叶丛顶端 y。数字越小越高 —— 这张表就是那把尺子。 */
const TOP: Record<GrowthStage, number> = {
  seed: 104, // S
  sprout: 86, // S
  seedling: 70, // M
  growing: 54, // L
  bud: 34, // XL
  bloom: 14, // XXL
  fruit: 18, // XXL
}

export function PoolPlant({
  stage,
  artifacts = 0,
  className,
  animate = false,
  label,
}: {
  stage: GrowthStage
  /** 回流物数量。只在开花阶段生效：每一份多开一朵，最多四朵。 */
  artifacts?: number
  className?: string
  /** 进场时长一次。只给页面上最主要的那一株用，列表里的小图不要动。 */
  animate?: boolean
  /** 无障碍名。传 null 表示旁边已有等价文字，此图纯装饰。 */
  label?: string | null
}) {
  const top = TOP[stage]
  const a11y =
    label === null
      ? { 'aria-hidden': true as const }
      : {
          role: 'img' as const,
          'aria-label': label ?? `${STAGE_LABEL[stage]}：${STAGE_MEANING[stage]}`,
        }

  return (
    <svg viewBox="0 0 100 120" fill="none" className={className} {...a11y}>
      {/* 土丘。低信息密度：一块色，不画土粒也不画草叶。 */}
      <path
        d={`M8 ${GROUND + 14} Q50 ${GROUND - 12} 92 ${GROUND + 14} Z`}
        fill="var(--soil)"
      />

      <g className={animate ? 'animate-grow' : undefined}>
        {stage === 'seed' && (
          <ellipse cx={CX} cy={GROUND + 5} rx="6" ry="7.5" fill="var(--wood-light)" />
        )}

        {stage === 'sprout' && (
          <>
            <path
              d={`M${CX} ${GROUND} V${top + 2}`}
              stroke="var(--accent)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* 两片子叶 —— 到此为止，不再多画一片 */}
            <ellipse cx={CX - 8} cy={top} rx="8" ry="5" fill="var(--accent)" transform={`rotate(-18 ${CX - 8} ${top})`} />
            <ellipse cx={CX + 8} cy={top} rx="8" ry="5" fill="var(--grass)" transform={`rotate(18 ${CX + 8} ${top})`} />
          </>
        )}

        {stage === 'seedling' && (
          <>
            <path
              d={`M${CX} ${GROUND} V${top + 6}`}
              stroke="var(--accent)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <ellipse cx={CX - 12} cy={top + 16} rx="12" ry="7" fill="var(--accent)" transform={`rotate(-20 ${CX - 12} ${top + 16})`} />
            <ellipse cx={CX + 12} cy={top + 6} rx="12" ry="7" fill="var(--grass)" transform={`rotate(20 ${CX + 12} ${top + 6})`} />
            <ellipse cx={CX - 2} cy={top + 1} rx="9" ry="6" fill="var(--accent)" transform={`rotate(-8 ${CX - 2} ${top + 1})`} />
          </>
        )}

        {stage === 'growing' && (
          <>
            {/* 灌木：两团相叠的色块，没有树干 */}
            <ellipse cx={CX - 10} cy={top + 28} rx="24" ry="22" fill="var(--accent)" />
            <ellipse cx={CX + 13} cy={top + 22} rx="20" ry="19" fill="var(--grass)" />
          </>
        )}

        {(stage === 'bud' || stage === 'bloom' || stage === 'fruit') && (
          <Tree stage={stage} top={top} artifacts={artifacts} />
        )}
      </g>
    </svg>
  )
}

/**
 * 小树 / 成熟树。
 *
 * 结构固定成三块：树干 + 主树冠 + 亮面树冠。花、苞、果只是在树冠上
 * 加同一套位置的第四块 —— 相邻阶段之间只差这一个变量，
 * 用户看两遍就记得住「多了几个白点 = 这件事办成了」。
 */
function Tree({
  stage,
  top,
  artifacts,
}: {
  stage: 'bud' | 'bloom' | 'fruit'
  top: number
  artifacts: number
}) {
  const crownH = GROUND - top - 22
  const crownCy = top + crownH * 0.55
  const rx = stage === 'bud' ? 26 : 33
  const ry = crownH * 0.62

  const spots =
    stage === 'bud'
      ? [
          { x: CX - 12, y: crownCy - 6 },
          { x: CX + 11, y: crownCy - 12 },
          { x: CX + 4, y: crownCy + 9 },
        ]
      : [
          { x: CX - 15, y: crownCy - 4 },
          { x: CX + 13, y: crownCy - 13 },
          { x: CX + 6, y: crownCy + 12 },
          { x: CX - 6, y: crownCy - 18 },
        ].slice(0, stage === 'bloom' ? Math.min(1 + Math.max(artifacts, 0), 4) : 3)

  return (
    <>
      <path
        d={`M${CX} ${GROUND} V${crownCy}`}
        stroke="var(--wood-dark)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <ellipse cx={CX - 4} cy={crownCy} rx={rx} ry={ry} fill="var(--accent)" />
      <ellipse cx={CX + 12} cy={crownCy - 6} rx={rx * 0.62} ry={ry * 0.68} fill="var(--grass)" />

      {spots.map((p, i) => {
        if (stage === 'bud') {
          return (
            <ellipse
              key={i}
              cx={p.x}
              cy={p.y}
              rx="4"
              ry="6"
              fill="var(--surface-alt)"
              transform={`rotate(${i % 2 === 0 ? -12 : 12} ${p.x} ${p.y})`}
            />
          )
        }
        if (stage === 'fruit') {
          return <circle key={i} cx={p.x} cy={p.y} r="5" fill="var(--soil)" />
        }
        return (
          <g key={i}>
            {[0, 72, 144, 216, 288].map((deg) => (
              <ellipse
                key={deg}
                cx={p.x}
                cy={p.y - 4.4}
                rx="3"
                ry="4.4"
                fill="var(--surface-alt)"
                transform={`rotate(${deg} ${p.x} ${p.y})`}
              />
            ))}
            <circle cx={p.x} cy={p.y} r="2.2" fill="var(--wood-light)" />
          </g>
        )
      })}

      {/* 结果阶段：两颗落在土丘上的籽 —— 那就是 next_hook。
          这件事没有枯掉，它把种子留下了，随时能再种一次。 */}
      {stage === 'fruit' && (
        <>
          <ellipse cx={CX - 22} cy={GROUND + 4} rx="4.5" ry="5.5" fill="var(--wood-light)" />
          <ellipse cx={CX + 19} cy={GROUND + 7} rx="4.5" ry="5.5" fill="var(--wood-light)" />
        </>
      )}
    </>
  )
}
