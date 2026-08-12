import { STAGE_LABEL, STAGE_MEANING, type GrowthStage } from '@/lib/pool-progress'

/**
 * 一件事长成的那株植物。
 *
 * 它代表的不是某个人，是**所有参与者共同推动的那件事** ——
 * 所以它只有一株，长在池塘页顶上，谁看都是同一株。
 *
 * 实现上的三条纪律：
 * 1. 纯 inline SVG。不引图片、不引动画库 —— 一个状态指示器不值得一次网络请求，
 *    也不该在手机弱网下比它要指示的内容还晚出现。
 * 2. 颜色全部走 CSS 变量。三态深浅色是在 :root 上换 token 的，
 *    这里写死任何一个色值都会在深色下变成一块脏斑。
 * 3. 克制。没有循环动画、没有粒子、没有渐变。它是刻度，不是特效 ——
 *    每天要看很多次的东西，第一眼惊艳远不如第一百眼不烦重要。
 *
 * 形态的语义（见 lib/pool-progress.ts 的推导）：
 *   种子   土里一颗籽              还没破土
 *   发芽   出土、两片子叶          双方确认
 *   长叶   拔高、两片真叶          开始沟通
 *   生长   更高、三片叶            已经有事情定下来
 *   花苞   顶端一个苞              该定的都定了，就等真的去做
 *   开花   苞绽开为花              行动真实完成；每一份回流物再开一朵
 *   结籽   花谢，蓬里留着籽        休眠，籽就是 next_hook
 */

const SOIL_Y = 50
const STEM_X = 24

interface StageShape {
  /** 茎顶的 y。越小越高。 */
  top: number
  /** 叶子：附着点 y + 朝向（-1 左 / 1 右）+ 长度 */
  leaves: { y: number; dir: 1 | -1; len: number }[]
  crown: 'none' | 'cotyledon' | 'bud' | 'flower' | 'pod'
  /** 土里那颗籽还在不在 */
  seed: 'buried' | 'spent' | 'none'
  /** 休眠时整株转灰：活体色换成弱墨色 */
  dormant?: boolean
}

const SHAPES: Record<GrowthStage, StageShape> = {
  seed: { top: SOIL_Y, leaves: [], crown: 'none', seed: 'buried' },
  sprout: { top: 40, leaves: [], crown: 'cotyledon', seed: 'spent' },
  leafing: {
    top: 32,
    leaves: [
      { y: 43, dir: -1, len: 11 },
      { y: 37, dir: 1, len: 11 },
    ],
    crown: 'none',
    seed: 'spent',
  },
  growing: {
    top: 24,
    leaves: [
      { y: 45, dir: -1, len: 12 },
      { y: 38, dir: 1, len: 13 },
      { y: 31, dir: -1, len: 11 },
    ],
    crown: 'none',
    seed: 'spent',
  },
  budding: {
    top: 20,
    leaves: [
      { y: 45, dir: -1, len: 12 },
      { y: 38, dir: 1, len: 13 },
      { y: 31, dir: -1, len: 11 },
    ],
    crown: 'bud',
    seed: 'spent',
  },
  blooming: {
    top: 20,
    leaves: [
      { y: 45, dir: -1, len: 12 },
      { y: 38, dir: 1, len: 13 },
      { y: 31, dir: -1, len: 11 },
    ],
    crown: 'flower',
    seed: 'none',
  },
  seeding: {
    top: 26,
    leaves: [
      { y: 44, dir: -1, len: 10 },
      { y: 37, dir: 1, len: 9 },
    ],
    crown: 'pod',
    seed: 'none',
    dormant: true,
  },
}

/**
 * 叶片：两段三次贝塞尔围成的柳叶形。
 *
 * 不用现成的图标字形是因为叶子要按附着高度和朝向逐片算 ——
 * 一株植物的叶子不是复制粘贴出来的，长度略有差别才不像贴纸。
 */
function leafPath(y: number, dir: 1 | -1, len: number): string {
  const bx = STEM_X
  const tipX = bx + dir * len
  const tipY = y - len * 0.5
  return [
    `M${bx} ${y}`,
    `C${bx + dir * len * 0.24} ${y - len * 0.62} ${bx + dir * len * 0.7} ${y - len * 0.74} ${tipX} ${tipY}`,
    `C${bx + dir * len * 0.72} ${y - len * 0.16} ${bx + dir * len * 0.26} ${y + len * 0.02} ${bx} ${y}`,
    'Z',
  ].join(' ')
}

export function PoolPlant({
  stage,
  artifacts = 0,
  className,
  animate = false,
  label,
}: {
  stage: GrowthStage
  /** 回流物数量。只在开花阶段生效：每一份多开一朵，最多再开三朵。 */
  artifacts?: number
  className?: string
  /** 进场时让茎长出来一次。只给页面上最主要的那一株用，列表里的小图不要动。 */
  animate?: boolean
  /** 无障碍名。传 null 表示旁边已有等价文字，此图纯装饰。 */
  label?: string | null
}) {
  const shape = SHAPES[stage]
  const live = shape.dormant ? 'var(--ink-soft)' : 'var(--accent)'
  const stemLength = SOIL_Y - shape.top + 6
  const extraBlooms = stage === 'blooming' ? Math.min(Math.max(artifacts, 0), 3) : 0
  const a11y =
    label === null
      ? { 'aria-hidden': true as const }
      : { role: 'img' as const, 'aria-label': label ?? `${STAGE_LABEL[stage]}：${STAGE_MEANING[stage]}` }

  return (
    <svg viewBox="0 0 48 64" fill="none" className={className} {...a11y}>
      {/* 土线。地平线以下是种子的世界，以上才是长出来的东西 ——
          没有这条线，所有阶段都会浮在空中，看不出「破土」这件事。 */}
      <path
        d={`M3 ${SOIL_Y} H45`}
        stroke="var(--soil)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray={shape.dormant ? '3 3.5' : undefined}
      />

      {shape.seed === 'buried' && (
        <ellipse cx={STEM_X} cy={56} rx="4.4" ry="5.4" fill="var(--soil)" transform={`rotate(-14 ${STEM_X} 56)`} />
      )}
      {shape.seed === 'spent' && (
        <ellipse cx={STEM_X} cy={56.5} rx="3.4" ry="4.2" fill="var(--soil)" opacity="0.42" transform={`rotate(-14 ${STEM_X} 56.5)`} />
      )}

      {shape.top < SOIL_Y && (
        <path
          d={`M${STEM_X} ${SOIL_Y} C${STEM_X - 1.6} ${SOIL_Y - (SOIL_Y - shape.top) * 0.4} ${STEM_X + 1.6} ${shape.top + (SOIL_Y - shape.top) * 0.3} ${STEM_X} ${shape.top}`}
          stroke={live}
          strokeWidth="2"
          strokeLinecap="round"
          className={animate ? 'animate-stem' : undefined}
          style={animate ? ({ '--stem-length': stemLength } as React.CSSProperties) : undefined}
        />
      )}

      <g className={animate ? 'animate-bloom' : undefined} style={animate ? { animationDelay: '420ms' } : undefined}>
        {shape.leaves.map((leaf) => (
          <path key={`${leaf.y}-${leaf.dir}`} d={leafPath(leaf.y, leaf.dir, leaf.len)} fill={live} />
        ))}

        {shape.crown === 'cotyledon' && (
          <>
            <ellipse cx={STEM_X - 4.6} cy={shape.top - 1} rx="4.4" ry="2.8" fill={live} transform={`rotate(-24 ${STEM_X - 4.6} ${shape.top - 1})`} />
            <ellipse cx={STEM_X + 4.6} cy={shape.top - 1} rx="4.4" ry="2.8" fill={live} transform={`rotate(24 ${STEM_X + 4.6} ${shape.top - 1})`} />
          </>
        )}

        {shape.crown === 'bud' && (
          <>
            {/* 花萼：两笔向上收拢的短线，让苞不像一颗浮在杆上的蛋 */}
            <path d={`M${STEM_X - 3.6} ${shape.top} L${STEM_X} ${shape.top - 3} L${STEM_X + 3.6} ${shape.top}`} stroke={live} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <ellipse cx={STEM_X} cy={shape.top - 5.6} rx="3.6" ry="5.2" fill="var(--seal-soft)" stroke="var(--seal)" strokeWidth="1.5" />
          </>
        )}

        {shape.crown === 'flower' && <Bloom cx={STEM_X} cy={shape.top - 4} scale={1} />}

        {shape.crown === 'pod' && (
          <>
            {/* 蓬：花谢之后留下的那只小碗，籽在里面。籽就是 next_hook ——
                池塘不销毁，它带着下次的理由睡着。 */}
            <path
              d={`M${STEM_X - 6} ${shape.top - 4} Q${STEM_X} ${shape.top + 4} ${STEM_X + 6} ${shape.top - 4}`}
              fill="var(--surface-raised)"
              stroke="var(--ink-soft)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx={STEM_X - 3} cy={shape.top - 4} r="1.5" fill="var(--soil)" />
            <circle cx={STEM_X} cy={shape.top - 5} r="1.5" fill="var(--soil)" />
            <circle cx={STEM_X + 3} cy={shape.top - 4} r="1.5" fill="var(--soil)" />
          </>
        )}

        {/* 回流物：每传一张返图就多开一朵。花不是装饰 ——
            它是「这件事真的发生过」的证据，有几份证据就开几朵。 */}
        {Array.from({ length: extraBlooms }, (_, i) => {
          const dir = i % 2 === 0 ? -1 : 1
          const by = shape.top + 6 + i * 6
          const bx = STEM_X + dir * (7 + (i % 2) * 1.5)
          return (
            <g key={`bloom-${i}`}>
              <path d={`M${STEM_X} ${by + 3} Q${STEM_X + dir * 4} ${by + 2} ${bx} ${by}`} stroke={live} strokeWidth="1.4" strokeLinecap="round" />
              <Bloom cx={bx} cy={by} scale={0.62} />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

/** 一朵花：五瓣朱色，中心留白。朱是印泥色 —— 真人落手的地方才配用它。 */
function Bloom({ cx, cy, scale }: { cx: number; cy: number; scale: number }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse
          key={deg}
          cx={cx}
          cy={cy - 3.4 * scale}
          rx={2.4 * scale}
          ry={3.6 * scale}
          fill="var(--seal)"
          transform={`rotate(${deg} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={1.7 * scale} fill="var(--surface-raised)" />
    </g>
  )
}
