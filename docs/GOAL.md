# 终局目标词 · 池塘 Pool

> 直接粘贴到 `/ralph` 之后。目标定义在**终局状态**上，不在「issue 关掉几个」上。
> 循环不到终局不停；里程碑只是审查点，不是停止点。

---

## 可直接粘贴的版本

```
持续开发 xinzhuwang-wxz/social-beta 直到下面「终局判据」七条全部为真。不到全绿不要停，
里程碑只是审查点不是停止点 —— 审查完立刻继续下一个里程碑，不要问「要不要继续」。

【当前进度】M1 进行中，S1(#2) 约 75%。已完成并推送：
  - pnpm workspace + Next.js 16 / React 19 / Tailwind 4；本地 Supabase 栈已跑起来
  - migration 0001/0002 已应用：person/pool/membership/episode/artifact/responsiveness/
    block/intent/facet/facet_evidence/relation，含 pgvector(768) 与 HNSW
  - RLS 全表开启并经测试验证真的拦得住；表级 GRANT 按最小权限逐表授予
  - @pool/shared 领域契约、@pool/model(ModelGateway)、@pool/db、@pool/engine(PoolEngine)
  - 12 项测试全绿；cassette 录制回放已验证（record 1.9s / replay 5ms）
  S1 剩余：真实登录流程、以及一个证明 route handler 不含业务逻辑的页面。

【已固定的事实，不要重新论证、不要改回去】
  - 模型：ARK_CHAT_MODEL=doubao-seed-2-0-mini-260428（便宜档，默认）
          ARK_CHAT_MODEL_STRONG=doubao-seed-2-0-lite-260428（贵档，需显式 tier:'strong'）
          ARK_IMAGE_MODEL=doubao-seedream-4-0-250828
          doubao-seed-1-8 / seed-1-6-lite / 1-5-lite-32k 在本账号均 404，不要用
  - embedding：本地 Ollama paraphrase-multilingual，768 维（见 ADR-0001）。
    方舟 embedding 全部未开通且 Retiring；all-minilm 中文区分度为负，禁用。
  - 不用 ORM：SQL migration 是 schema 唯一真相源，类型用 supabase gen types 生成。
  - 不引入 A2A 协议 / AG2 / CAMEL / LiteLLM，理由见 DESIGN.md §7.5。

【执行方式】
  - 用 gh issue list 查 issue_dependencies_summary.blocked_by == 0 取下一个可做的。
  - 独立切片并行开发：同一里程碑内互不依赖的 issue 同时派子智能体推进，
    按目录切开避免冲突。不要一步一验证地串行浪费 token。
  - 每完成一个 issue 就提交并推送，不要攒着。

【里程碑与审查】M1 #2#3 / M2 #4#5 / M3 #6#7 / M4 #8#9 / M5 #10#11 / M6 #12#13#14
  只在里程碑边界做两件事，其余时间埋头推进：
  1. /improve-codebase-architecture —— 消除跨切片累积的重复与错位边界。
     重点盯：业务逻辑有没有漏到 PoolEngine 之外；模型调用有没有绕开 ModelGateway；
     有没有为赶进度长出第二条写库路径。
  2. /verify —— 对照该里程碑所辖 issue 的 Acceptance Criteria 逐条取证。
     「在轨」（做的确实是 PRD 要的）与「不冗余」（没做 PRD 没要的，Out of Scope 是硬边界）
     是两条独立判据，都要分别取到证据。
  审查发现偏离 PRD 时当场收敛：改代码，或改 issue 并说明理由。不留 TODO，不口头记下。
  审查完直接进入下一个里程碑。

【硬约束】
  - 不用 stub / mock / 假数据。唯一例外是 #12 的 1000 模拟学生，
    且必须驱动同一条 PoolEngine 缝，不得旁路写库。
  - 没有假页面、没有硬编码候选、没有模板化的「AI 生成理由」。
  - 测试跑真实 Postgres；模型侧用 cassette 录制回放真实响应，不手写假响应。
  - 隐私边界落 RLS，不落 prompt。
  - Agent 默认 SILENT 是主路径，测试负例数量必须多于正例。
  - 遇到需要人拍板的决定就停下来问，不要选一个更容易的实现然后标 TODO。

【终局判据 —— 七条全为真才算完成】
  ① 真实用户在手机浏览器上、不填任何资料，能跑完
     发意图→候选卡→亲手接管→开池塘→协作成行→回流→被 next_hook 唤醒→再次成行
     的完整闭环，中途没有任何一步是假的、占位的或标了 TODO 的。
  ② 「我的切面」里每条画像都能溯源到具体池塘，逐条可改可删，逐切面可设可见度。
  ③ 1000 人模拟驱动同一条 PoolEngine 缝跑通，冷启动拐点曲线可导出。
  ④ 四条红线在测试中恒真：ai_sent_message === 0；不存在绕过真人接管创建 pool 的路径；
     private 切面泄漏计数为 0 且由 RLS 保证；记忆可见、可编辑、可删除。
  ⑤ L2（facet/relation/知识图谱）全删后从 L1 重建，结果等价。
  ⑥ 六个里程碑各自的 /improve-codebase-architecture 与 /verify 都已完成并取到证据。
  ⑦ 全部功能完成后，跑完一轮 UI-only 的 /autoresearch 并通过（见下）。

【⑦ 最终验收：UI-only autoresearch —— 必须在整个产品做完之后才跑】
  参与验收的 agent 只能通过浏览器操作产品，像真实用户一样。明确禁止：
  读源码 / 查数据库 / 看服务端日志 / 调内部 API / 看测试用例。
  发现问题时记录的是用户视角的症状（「我点了接管，什么都没发生，也没告诉我为什么」），
  不是代码诊断；症状收齐后再回代码定位归因。
  至少覆盖这些人格，各自独立跑完整旅程：
    大一新生零历史 / 社恐不敢先开口 / 一周发三条意图的活跃组局者 /
    从不回消息的人 / 跨专业找队友需求很具体 / 考试周突然沉寂两周 /
    只想找一次性搭子不想深交 / 想找长期社团 / 把多数切面设为私密的隐私敏感者 /
    想让 AI 替他聊天的人
  验收结论必须回答三个问题：
    1. 拿掉 AI 之后产品还成立吗？成立即说明 AI 没做不可替代的事 —— 这是失败信号。
    2. 有多少连接被真人接管并真的发生了共同行动？只看接管率与成行率，不看对话轮次。
    3. 有没有留下下一次互动的理由？复现率是最终答案。
  反指标同样出数：Agent 发言占比（越低越好）、AI 代答次数（必须恒为 0，非零则整轮不通过）。

规格来源：issue #1(PRD) 与 DESIGN.md，冲突以 #1 为准。验收标准以 GitHub issue 为唯一真相源，
改标准请改 issue 后重跑 node scripts/sync-prd.mjs。
```

---

## 设计说明

**为什么把「当前进度」写进目标词。** ralph 的循环会跨多次迭代重进，每次都重新摸索
一遍已经确定的事实是纯粹的浪费，而且有可能把已验证的结论改回错的
（例如把模型 ID 改回文档里那个 404 的 `doubao-seed-1-8`）。

**为什么里程碑写成「审查点不是停止点」。** 默认行为是每完成一段就停下来汇报等指令。
这里要的是审查完立刻继续，所以必须显式否定那个默认。

**为什么 UI-only 的禁止清单要逐项列出。** 只说「像用户一样体验」不够 ——
agent 会不自觉地去读代码印证猜想，那样发现的是「我知道它哪里会错」，
而不是「用户会在哪里卡住」。

**为什么终局判据里没有「13 个 issue 全部关闭」。** issue 关闭是过程指标，
可以在功能残缺的情况下达成。七条判据全部指向可观察的产品行为与结构性不变量。
