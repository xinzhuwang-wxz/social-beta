import { STAGE_LABEL, STAGE_MEANING, type GrowthStage } from '@/lib/growth'

/**
 * 一件事长成的那株植物。
 *
 * 它代表的不是某个人，是**所有参与者共同推动的那件事** ——
 * 所以它只有一株，长在行动房间顶上，谁看都是同一株。
 *
 * 画法参照 Forest：**每个阶段最多四个形状**。
 * Forest 的「发芽」就是一个半圆土丘 + 一根茎 + 两片叶子，没了。
 * 那种克制不是省事，是让形态差异一眼可辨 —— 形状一多，
 * 相邻两个阶段就会长得差不多，状态指示器也就失去了作用。
 *
 * 三条实现纪律：
 * 1. 纯 inline SVG。不引图片、不引动画库 —— 一个状态指示器不值得一次网络请求。
 * 2. 颜色全部走 CSS 变量。三态深浅色是在 :root 上换 token 的，
 *    这里写死任何一个色值都会在深色下变成一块脏斑。
 *    注意圆盘 --disc 本身也随主题翻转，所以画在它上面的绿/棕/朱
 *    在两个主题下都够对比 —— 这是「圆盘固定用米色」那个方案做不到的。
 * 3. 扁平。没有描边、没有渐变、没有阴影、没有循环动画。
 *
 * 形态的语义（阶段由 pool.state 唯一决定，见 lib/growth.ts）：
 *   种子 open/matching   土丘里一颗籽
 *   发芽 forming         茎 + 两片子叶
 *   树苗 active          细干 + 一小片树冠
 *   花苞 planned         成树 + 三个花苞（计划被全员确认）
 *   开花 done            成树 + 花（每份回流物再开一朵）
 *   结果 dormant         成树 + 果 + 掉在土上的籽
 *
 * `dormant` 刻意**不画枯树**。行动没成可能来自客观原因，
 * 产品该鼓励重新计划，而不是拿一棵死树羞辱用户。籽还在，随时能再种。
 */

const CX = 50 // 圆心 x
const GROUND = 74 // 土丘顶面的 y —— 植物从这里长出来

/**
 * 土丘：一个扁半椭圆，底边刚好落在圆盘内缘上（半宽 32 ≈ y=88 处的圆半弦长）。
 * 它必须扁：土丘一高，树干就被埋掉，六个阶段看上去只剩「棕色小山 + 一点绿」。
 */
const MOUND = `M18 88 A32 14 0 0 1 82 88 Z`

interface StageShape {
  /** 树干/茎顶端的 y。越小越高。 */
  top: number
  kind: 'seed' | 'sprout' | 'tree'
  /** 树冠半宽。kind==='tree' 时有效 */
  crownW?: number
  crownH?: number
  ornament: 'none' | 'bud' | 'bloom' | 'fruit'
}

const SHAPES: Record<GrowthStage, StageShape> = {
  seed: { top: GROUND, kind: 'seed', ornament: 'none' },
  sprout: { top: 52, kind: 'sprout', ornament: 'none' },
  sapling: { top: 40, kind: 'tree', crownW: 15, crownH: 16, ornament: 'none' },
  budding: { top: 28, kind: 'tree', crownW: 23, crownH: 26, ornament: 'bud' },
  blooming: { top: 26, kind: 'tree', crownW: 25, crownH: 28, ornament: 'bloom' },
  fruiting: { top: 28, kind: 'tree', crownW: 23, crownH: 26, ornament: 'fruit' },
}

export function PoolPlant({
  stage,
  artifacts = 0,
  className,
  disc = true,
  animate = false,
  label,
}: {
  stage: GrowthStage
  /** 回流物数量。只在开花阶段生效：每一份多开一朵，最多再开三朵。 */
  artifacts?: number
  className?: string
  /** 画出聚焦圆。圆是舞台 —— 去掉它，植物就成了飘在页面上的图标。 */
  disc?: boolean
  /** 进场时长一次。只给页面上最主要的那一株用，列表里的小图不要动。 */
  animate?: boolean
  /** 无障碍名。传 null 表示旁边已有等价文字，此图纯装饰。 */
  label?: string | null
}) {
  const shape = SHAPES[stage]
  const a11y =
    label === null
      ? { 'aria-hidden': true as const }
      : {
          role: 'img' as const,
          'aria-label': label ?? `${STAGE_LABEL[stage]}：${STAGE_MEANING[stage]}`,
        }

  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} {...a11y}>
      {/* 圆盘描一道极淡的边：它要同时压在页面底色和主色域两种背景上，
          单靠填充色没法对两者都拉开对比，一道 12% 墨色的细边可以。 */}
      {disc && (
        <circle
          cx={CX}
          cy="50"
          r="49.5"
          fill="var(--disc)"
          stroke="color-mix(in srgb, var(--ink) 12%, transparent)"
          strokeWidth="1"
        />
      )}

      {/* 土丘。所有阶段共用同一个底座，它同时也是「地下 / 地上」的分界。 */}
      <path d={MOUND} fill="var(--soil)" />

      {shape.kind === 'seed' && (
        <ellipse cx={CX} cy={GROUND + 6} rx="5" ry="6" fill="var(--disc)" opacity="0.9" />
      )}

      {shape.kind === 'sprout' && (
        <g className={animate ? 'animate-bloom' : undefined}>
          <path
            d={`M${CX} ${GROUND} V${shape.top}`}
            stroke="var(--accent)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          {/* 两片子叶。Forest 的发芽就是这两片，不多画。 */}
          <path
            d={`M${CX} ${shape.top + 4} C${CX - 16} ${shape.top + 6} ${CX - 18} ${shape.top - 8} ${CX - 2} ${shape.top - 4} Z`}
            fill="var(--accent)"
          />
          <path
            d={`M${CX} ${shape.top + 4} C${CX + 16} ${shape.top + 6} ${CX + 18} ${shape.top - 8} ${CX + 2} ${shape.top - 4} Z`}
            fill="var(--accent)"
          />
        </g>
      )}

      {shape.kind === 'tree' && (
        <g className={animate ? 'animate-bloom' : undefined}>
          <path
            d={`M${CX} ${GROUND} V${shape.top + (shape.crownH ?? 20) * 0.55}`}
            stroke="var(--soil)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* 树冠：一个圆角三角块。单一形状，扁平填充，
              比三个叠在一起的圆更容易在 24px 下认出来。 */}
          <path
            d={crownPath(shape.top, shape.crownW ?? 20, shape.crownH ?? 22)}
            fill="var(--accent)"
          />
          <Ornaments
            kind={shape.ornament}
            top={shape.top}
            crownW={shape.crownW ?? 20}
            crownH={shape.crownH ?? 22}
            artifacts={artifacts}
          />
        </g>
      )}
    </svg>
  )
}

/** 树冠：底边宽、顶端收圆的一块。用两段三次曲线围出来，只有一个 path。 */
function crownPath(top: number, w: number, h: number): string {
  const bottom = top + h
  return [
    `M${CX - w} ${bottom}`,
    `C${CX - w * 1.05} ${top + h * 0.25} ${CX - w * 0.62} ${top} ${CX} ${top}`,
    `C${CX + w * 0.62} ${top} ${CX + w * 1.05} ${top + h * 0.25} ${CX + w} ${bottom}`,
    'Z',
  ].join(' ')
}

/**
 * 树冠上的点缀：花苞 / 花 / 果。
 *
 * 三者用同一套位置，只换形状和颜色 —— 相邻阶段之间只差这一个变量，
 * 用户看两遍就能记住「多了几个红点 = 计划定了 / 事办成了」。
 */
function Ornaments({
  kind,
  top,
  crownW,
  crownH,
  artifacts,
}: {
  kind: StageShape['ornament']
  top: number
  crownW: number
  crownH: number
  artifacts: number
}) {
  if (kind === 'none') return null

  // 开花：底数一朵，每份回流物再开一朵，最多四朵 —— 花是「真的发生过」的证据
  const count = kind === 'bloom' ? Math.min(1 + Math.max(artifacts, 0), 4) : 3
  const spots = [
    { x: CX, y: top + crownH * 0.3 },
    { x: CX - crownW * 0.52, y: top + crownH * 0.66 },
    { x: CX + crownW * 0.52, y: top + crownH * 0.6 },
    { x: CX - crownW * 0.12, y: top + crownH * 0.85 },
  ].slice(0, count)

  return (
    <g>
      {spots.map((p, i) => {
        if (kind === 'bud') {
          // 花苞：竖着的窄水滴。和开花的区别全在轮廓 —— 窄 vs 张开
          return (
            <path
              key={i}
              d={`M${p.x} ${p.y - 5} C${p.x + 3.2} ${p.y - 1.6} ${p.x + 3} ${p.y + 2.4} ${p.x} ${p.y + 3.4} C${p.x - 3} ${p.y + 2.4} ${p.x - 3.2} ${p.y - 1.6} ${p.x} ${p.y - 5}Z`}
              fill="var(--seal)"
            />
          )
        }
        if (kind === 'fruit') {
          return <circle key={i} cx={p.x} cy={p.y} r="3.4" fill="var(--seal)" />
        }
        return (
          <g key={i}>
            {[0, 72, 144, 216, 288].map((deg) => (
              <ellipse
                key={deg}
                cx={p.x}
                cy={p.y - 3}
                rx="2.1"
                ry="3.1"
                fill="var(--seal)"
                transform={`rotate(${deg} ${p.x} ${p.y})`}
              />
            ))}
            <circle cx={p.x} cy={p.y} r="1.5" fill="var(--disc)" />
          </g>
        )
      })}

      {/* 结果阶段：两颗落在土丘上的籽。它就是 next_hook ——
          这件事没有枯掉，它把种子留下了，随时能再种一次。 */}
      {kind === 'fruit' && (
        <>
          <circle cx={CX - 16} cy={GROUND + 5} r="3" fill="var(--seal)" />
          <circle cx={CX + 14} cy={GROUND + 8} r="3" fill="var(--seal)" />
        </>
      )}
    </g>
  )
}
