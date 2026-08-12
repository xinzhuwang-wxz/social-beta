/**
 * 产品标记：一颗种子破土。
 *
 * 它是产品的第一个动作 —— 用户说一句人话，就在土里放下一颗种子。
 * 手绘家园的语气，但用在 UI 里，所以形状克制到三块色：土、芽、叶。
 * 缩到 16px 仍然读得出来。
 */
export function PondMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="池塘" className={className} fill="none">
      {/* 土丘 */}
      <path d="M3 25 Q16 15 29 25 Z" fill="var(--soil)" />
      {/* 茎 */}
      <path d="M16 25 V13" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      {/* 两片子叶 */}
      <ellipse cx="10" cy="12" rx="6.5" ry="4" fill="var(--accent)" transform="rotate(-22 10 12)" />
      <ellipse cx="22" cy="10" rx="6.5" ry="4" fill="var(--grass)" transform="rotate(22 22 10)" />
    </svg>
  );
}
