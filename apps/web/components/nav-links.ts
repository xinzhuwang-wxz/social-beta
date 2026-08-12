/**
 * 主导航。路由名沿用代码里既有的词（square / candidates / pool / me / invites），
 * 标签用的是产品世界观里的词 —— 一次行动的完整生命周期：
 *
 *   种一颗     /square      说一句人话，种下一颗种子
 *   候选       /candidates  你的 Agent 带回来的人
 *   收到的种子 /invites     别人的 Agent 送到你信箱的
 *   我的行动   /home        正在长的、开过花的、睡着的
 *   我的森林   /me          由真实经历长出来的画像
 *
 * /me 和 /invites 此前不在任何导航里 —— 两个真实存在、有内容的页面，
 * 用户只能靠手输 URL 才能到达。补进来不是加装饰，是修一个可达性缺陷。
 */
export const PRIMARY_NAV = [
  { href: "/square", label: "种一颗" },
  { href: "/candidates", label: "候选" },
  { href: "/invites", label: "收到的种子" },
  { href: "/home", label: "我的行动" },
  { href: "/me", label: "我的森林" },
] as const;
