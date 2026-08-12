import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "池塘 Pool · 校园社交 AI",
    template: "%s · 池塘 Pool",
  },
  description:
    "池塘是面向大学生的校园社交 AI。发一句你想干什么，AI 出候选卡和开场草稿——连接谁、怎么说、要不要回，全由你点。AI 只做预演，永不代答。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 深浅色跟随系统时，让浏览器 UI（地址栏、表单控件、滚动条）也跟着换色。
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1613" },
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
