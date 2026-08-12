/**
 * 池塘的标记：三道渐窄、错落堆叠的横杠，代表沉积——事件一层层落下去，
 * 最下面最宽、最久，最上面最新、最窄。这既是 logomark，也是全站反复
 * 出现的"层积"母题的最小单元，克制地用一次，不做成水波特效。
 *
 * 用 currentColor 取色，放进任何文字颜色的容器里都能正确继承。
 */
export function PondMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 24"
      role="img"
      aria-label="池塘"
      className={className}
      fill="none"
    >
      <rect x="0" y="0" width="32" height="4" rx="1" fill="currentColor" />
      <rect
        x="4"
        y="10"
        width="24"
        height="4"
        rx="1"
        fill="currentColor"
        opacity="0.72"
      />
      <rect
        x="9"
        y="20"
        width="14"
        height="4"
        rx="1"
        fill="currentColor"
        opacity="0.46"
      />
    </svg>
  );
}
