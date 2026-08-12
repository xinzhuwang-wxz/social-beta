/**
 * 三个主要动作的路由约定。
 *
 * 这一刀（S13 #3）只搭导航结构，目标页面由另外两刀实现：
 *   /square      —— 发意图 + 意图广场（S2 #4），PRD 和 DESIGN.md 里反复
 *                    用的就是这个词，选它作为路由名而不是另造一个。
 *   /candidates  —— 候选卡（S3 #5）。
 *   /home        —— 我的池塘列表，S1 已经建好、真实可跑，不是假路由。
 *
 * 如果 S2/S3 落地时选了不同的路径，改这两行常量即可，不用满页面找链接。
 */
export const PRIMARY_NAV = [
  { href: "/square", label: "发意图" },
  { href: "/candidates", label: "候选卡" },
  { href: "/home", label: "我的池塘" },
] as const;
