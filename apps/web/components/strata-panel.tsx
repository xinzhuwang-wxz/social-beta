const LAYERS = [
  { label: "毕业设计选题", width: "58%", opacity: 0.35 },
  { label: "数模组队", width: "74%", opacity: 0.48 },
  { label: "创业赛复盘", width: "66%", opacity: 0.6 },
  { label: "陶艺工作坊 · 3 人", width: "88%", opacity: 0.74 },
  { label: "周六爬山 · 野线", width: "100%", opacity: 0.9 },
] as const;

/**
 * 首屏配图：不是水波特效，是"层积"母题的唯一一次完整展开——
 * 越靠下、越宽、颜色越实的层代表越早、越沉淀的事；越靠上越新越淡。
 * 用来图解 DESIGN.md 里"人是他参与过的事件的集合"这句话，
 * 而不是用文字重复一遍。纯 CSS，无 JS、无循环动画，只在挂载时
 * 整体入场一次。
 */
export function StrataPanel() {
  return (
    <div className="border border-border bg-surface-raised p-5 sm:p-6">
      {/* 标签放在色带上方而不是并排——并排在窄屏下会被 100% 宽的色带
          挤到几乎没有空间，中文标签会被迫逐字换行、竖成一条，很难看。
          纵向堆叠不管容器多窄都不会互相挤占。 */}
      <ol className="flex flex-col-reverse gap-3.5">
        {LAYERS.map((layer, i) => (
          <li
            key={layer.label}
            className="animate-rise-in flex flex-col gap-1.5"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="text-xs text-ink-muted">{layer.label}</span>
            <span
              className="h-3 bg-accent"
              style={{ width: layer.width, opacity: layer.opacity }}
              aria-hidden="true"
            />
          </li>
        ))}
      </ol>
      <p className="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-ink-soft">
        你的画像，是这些事拼出来的——不是你写的一段自我介绍。
      </p>
    </div>
  );
}
