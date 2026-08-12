/**
 * 主导航。路由名沿用代码里既有的词，标签用产品世界观里的词。
 *
 * `tab` 是底部标签栏用的短名（手机上一格只有 ~70px，放不下四个字），
 * `label` 是桌面横排导航用的全名。
 *
 * 五个标签对应五个真实存在、有内容的路由。规范里提到的「我」这一格
 * 在本产品里就是「森林」—— 个人档案由真实经历构成，没有第二个资料页，
 * **不为一个不存在的页面留一格空标签**。
 */
export const PRIMARY_NAV = [
  { href: "/square", label: "种一颗", tab: "种子", icon: "seed" },
  { href: "/candidates", label: "候选", tab: "候选", icon: "candidates" },
  { href: "/invites", label: "收到的种子", tab: "信箱", icon: "inbox" },
  { href: "/home", label: "我的花园", tab: "花园", icon: "garden" },
  { href: "/me", label: "回忆森林", tab: "森林", icon: "forest" },
] as const;
