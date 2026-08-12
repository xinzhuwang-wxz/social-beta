import type { ReactNode } from 'react'
import { PoolPlant } from './pool-plant'
import { STAGE_LABEL, STAGE_MEANING, type GrowthStage } from '@/lib/growth'

/**
 * 主色域 —— 每一屏都有的那一块纯色。
 *
 * 这是整套视觉里唯一一处「大声」的地方，规则因此定得很死：
 *
 *   一块底色 + 一个圆 + 圆里一株植物 + 几行细体白字 + 若干 pill。
 *   没有卡片、没有阴影、没有第二种强调色、没有插图堆叠。
 *
 * 借鉴自 Forest 的不是它的绿，是它敢把七成屏幕交给一块纯色 ——
 * 让色彩承担情绪，插画只做状态指示。白底上撒卡片是安全的，
 * 也是没有表情的；而这个产品要传达的恰恰是「你手上这件事活着」。
 *
 * 圆是舞台不是装饰：植物永远画在圆里，圆的位置在各屏之间保持一致，
 * 用户扫一眼就知道该往哪看。
 */
export function ColorField({
  eyebrow,
  title,
  meta,
  children,
  stage,
  artifacts = 0,
  compact = false,
}: {
  eyebrow?: string
  title: ReactNode
  /** 元数据 pill。传字符串数组，第一条会带一个琥珀点。 */
  meta?: string[]
  /** 色域底部的补充内容（按钮、说明）。 */
  children?: ReactNode
  /** 有阶段就画植物；没有就只是一块带字的色域。 */
  stage?: GrowthStage
  artifacts?: number
  compact?: boolean
}) {
  return (
    <section
      className={`bg-field text-field-ink ${compact ? 'px-5 py-6 sm:px-7 sm:py-7' : 'px-5 py-8 sm:px-8 sm:py-10'}`}
    >
      <div className={`flex flex-col gap-6 ${stage ? 'sm:flex-row sm:items-center sm:gap-8' : ''}`}>
        {stage && (
          <PoolPlant
            stage={stage}
            artifacts={artifacts}
            animate
            label={null}
            className={compact ? 'size-24 shrink-0' : 'size-28 shrink-0 sm:size-36'}
          />
        )}

        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="mark opacity-70">{eyebrow}</p>
          )}
          <div
            className={`field-title mt-2 break-anywhere ${
              compact ? 'text-2xl' : 'text-3xl sm:text-4xl'
            }`}
          >
            {title}
          </div>
          {stage && (
            <p className="mt-2 text-sm opacity-80">{STAGE_MEANING[stage]}</p>
          )}

          {meta && meta.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {meta.map((m, i) => (
                <li key={m} className="pill">
                  {i === 0 && <span aria-hidden="true" className="pill-dot" />}
                  {m}
                </li>
              ))}
            </ul>
          )}

          {children && <div className="mt-5">{children}</div>}
        </div>
      </div>
    </section>
  )
}

/** 色域里的阶段名。抽出来是因为好几屏都要「阶段 + 一句解释」这一组。 */
export function stageTitle(stage: GrowthStage): string {
  return STAGE_LABEL[stage]
}
