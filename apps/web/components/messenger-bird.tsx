/**
 * 信使鸟 —— 用户的个人 Agent，产品最重要的角色资产。
 *
 * 它是**信使，不是替身**：它替你去找人、把种子送到别人的信箱、
 * 把候选带回来。它不会假装成你去跟人聊天 —— 所以它永远长得像一只
 * 背着包送信的鸟，而不是一个人形化身。
 *
 * 造型规则（规范）：圆润身体 + 小翅膀 + 绿色披风 + 小背包 + 小信件，
 * 简洁五官，**3 秒内可识别**。不要复杂帽子、武器、大量装备、羽毛纹理。
 * 整只鸟只有六个形状：身体、翅膀、披风、背包、喙、眼睛。
 *
 * 七种状态对应产品里七个真实时刻，不是七个表情包：
 *   idle       站着       —— 没事发生时
 *   thinking   歪头 + 三点 —— 正在理解你说的话 / 跑匹配
 *   flying     展翅       —— 正在去找人
 *   carrying   抱着种子   —— 带着你的愿望出门
 *   delivering 递出信件   —— 把种子送到对方信箱
 *   happy      眯眼       —— 带回了候选 / 事情成了
 *   resting    闭眼       —— 没有待办
 */
export type BirdState =
  | 'idle'
  | 'thinking'
  | 'flying'
  | 'carrying'
  | 'delivering'
  | 'happy'
  | 'resting'

const STATE_LABEL: Record<BirdState, string> = {
  idle: '信使鸟站在一旁',
  thinking: '信使鸟正在琢磨',
  flying: '信使鸟出门去找人了',
  carrying: '信使鸟带着你的种子',
  delivering: '信使鸟正在送信',
  happy: '信使鸟带回了消息',
  resting: '信使鸟在歇着',
}

export function MessengerBird({
  state = 'idle',
  className,
  animate = false,
  label,
}: {
  state?: BirdState
  className?: string
  animate?: boolean
  label?: string | null
}) {
  const flying = state === 'flying'
  const tilt = state === 'thinking' ? -8 : flying ? -14 : 0
  const a11y =
    label === null
      ? { 'aria-hidden': true as const }
      : { role: 'img' as const, 'aria-label': label ?? STATE_LABEL[state] }

  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} {...a11y}>
      <g
        className={animate ? 'animate-settle' : undefined}
        transform={`rotate(${tilt} 50 56)`}
      >
        {/* 披风：从后颈垂下的一块绿。它是这只鸟最先被认出来的特征， */}
        {/* 所以画在身体之前、露出一整块边。 */}
        <path
          d="M34 40 Q24 60 30 78 L52 74 Q46 54 46 40 Z"
          fill="var(--accent)"
        />

        {/* 身体：一个圆润的蛋形 */}
        <ellipse cx="54" cy="58" rx="24" ry="26" fill="var(--surface-alt)" />

        {/* 背包：一小块木色圆角方 */}
        <rect x="30" y="52" width="16" height="17" rx="5" fill="var(--wood)" />
        <path d="M34 52 V49 Q38 46 42 49 V52" stroke="var(--wood-dark)" strokeWidth="2.5" />

        {/* 翅膀。飞行时展开，其余时候贴着身体 */}
        {flying ? (
          <path d="M56 48 Q78 26 92 34 Q80 50 62 58 Z" fill="var(--grass)" />
        ) : (
          <ellipse
            cx="60"
            cy="60"
            rx="11"
            ry="14"
            fill="var(--grass)"
            transform="rotate(12 60 60)"
          />
        )}

        {/* 喙：一个小三角 */}
        <path d="M76 48 L88 52 L76 56 Z" fill="var(--wood)" />

        {/* 眼睛：简洁五官，只有一只眼（侧面） */}
        {state === 'resting' ? (
          <path d="M64 48 Q68 51 72 48" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
        ) : state === 'happy' ? (
          <path d="M64 50 Q68 45 72 50" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
        ) : (
          <circle cx="68" cy="49" r="3" fill="var(--ink)" />
        )}

        {/* 脚。飞行时收起来 */}
        {!flying && (
          <>
            <path d="M48 84 V90" stroke="var(--wood-dark)" strokeWidth="3" strokeLinecap="round" />
            <path d="M60 84 V90" stroke="var(--wood-dark)" strokeWidth="3" strokeLinecap="round" />
          </>
        )}

        {/* 手里的东西：种子 / 信件。两者互斥，绝不同时出现。 */}
        {state === 'carrying' && (
          <ellipse cx="52" cy="86" rx="9" ry="7" fill="var(--wood-light)" />
        )}
        {state === 'delivering' && (
          <g>
            <rect x="60" y="74" width="26" height="18" rx="4" fill="var(--surface-raised)" stroke="var(--border-strong)" strokeWidth="1.5" />
            <path d="M60 78 L73 86 L86 78" stroke="var(--border-strong)" strokeWidth="1.5" fill="none" />
          </g>
        )}
      </g>

      {/* 思考的三点。放在旋转组之外，免得跟着头一起歪。 */}
      {state === 'thinking' && (
        <g fill="var(--ink-soft)">
          <circle cx="72" cy="22" r="3" />
          <circle cx="83" cy="17" r="3.6" />
          <circle cx="95" cy="12" r="2.4" />
        </g>
      )}
    </svg>
  )
}
