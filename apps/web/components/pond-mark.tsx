/**
 * 产品标记：一颗种子破土。
 *
 * 选这个形而不选叶子或水波，是因为它是产品的第一个动作 ——
 * 用户说一句人话，就在土里放下一颗种子。土线以下是还没发生的愿望，
 * 以上是已经开始长的东西。整个标记只有三个元素，缩到 16px 仍然读得出来。
 *
 * 用 currentColor 取色，放进任何文字颜色的容器里都能正确继承。
 */
export function PondMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" role="img" aria-label="池塘" className={className} fill="none">
      {/* 土线 */}
      <path d="M2 17H26" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {/* 土里的籽 */}
      <ellipse
        cx="14"
        cy="22.5"
        rx="3.6"
        ry="4.4"
        fill="currentColor"
        opacity="0.45"
        transform="rotate(-16 14 22.5)"
      />
      {/* 破土的那一段芽 */}
      <path d="M14 17V7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14 9C14 5.5 17 3 21 3C21 6.5 18 9 14 9Z" fill="currentColor" />
    </svg>
  );
}
