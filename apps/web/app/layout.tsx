import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "池塘 Pool · 校园社交 AI",
    template: "%s · 池塘 Pool",
  },
  description:
    "池塘不是帮你找搭子，是帮你「想做的事」真正发生。说一句人话就种下一颗种子，你的 Agent 送到合得来的人手上；两个人都点了确认，它才破土。AI 出候选和草稿，连接谁、怎么说、要不要回，全由你点。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 刘海屏：内容铺到安全区之外，再由固定元素自己用 env(safe-area-inset-*) 让位。
  // 少了 viewport-fit=cover，那几个 env() 变量在 iOS 上恒为 0，底部标签栏
  // 就会被 Home Indicator 压住。
  viewportFit: "cover",
  // 深浅色跟随系统时，让浏览器 UI（地址栏、表单控件、滚动条）也跟着换色。
  // 这两个值必须与 globals.css 里 --surface 的浅/深取值一致 ——
  // 对不上时地址栏和页面之间会出现一道谁都解释不清的色差。
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8ebe4" },
    { media: "(prefers-color-scheme: dark)", color: "#10130f" },
  ],
};

// 三态深浅色里「显式选择」这一态的开关：读 localStorage、把 data-theme
// 写到 <html> 上。必须在 hydration 之前、首帧绘制之前跑完，否则用户上次
// 选的深色会先闪一下浅色再跳过去。放进一段同步内联脚本是唯一可靠的办法——
// 放进 React 组件里跑（哪怕是 useLayoutEffect）也晚于首帧。
const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("pool-theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (e) {
    // 隐私模式等场景 localStorage 可能不可用，静默跳过，退回系统偏好。
  }
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning：上面这段脚本会在 hydration 前改 data-theme 属性，
    // 服务端渲染的 HTML 不可能预知这个属性，这里的告警是预期内的、无害的。
    <html lang="zh-CN" suppressHydrationWarning className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
