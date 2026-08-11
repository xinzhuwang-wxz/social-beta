# 池塘（Pool）— 事件中心的校园社交 AI

> 产品与架构设计文档 v0.1
> 2026-08-12

---

## 0. 一句话结论

**把"人"建模成"他参与过的事件的集合"，而不是一张资料卡。**

社交产品的传统底层是 `User(profile) + Friendship(edge)`。这个结构在 AI 时代有两个死穴：profile 冷启动填不满，friendship 是二元的、无内容的。

我们的底层是 `Person — Pool(事件) — Person` 的**二部超图**：

- **Pool（池塘）** 是一等公民 —— 一次爬山、一次组队、一个长期社团，都是 Pool
- **人的长期记忆 = 一组指向 Pool 的指针**，而不是一份 Markdown 简历
- **关系 = 两人共同 Pool 的密度**，是连续量，不是 `is_friend` 布尔值
- **AI 的记忆挂在 Pool 上**，不挂在个人身上 —— 这天然就是"小火人"的 N+1 泛化

冷启动因此被绕过：**注册时不用填任何东西，发一条意图就能进第一个池塘，玩完一次就有了第一份画像。**

技术上的取舍红线：**不自己造记忆引擎、不自己造 IM、不自己造向量检索**。自己只写三个薄层 —— 池塘语义、匹配编排、Agent 介入策略。这三层没有现成开源，其余全部组装。

---

## 1. 对齐赛题：四个问题的回答

尤米在分享里给了四个评审判据。先把答案钉死，架构服务于它。

| 评审问题 | 我们的回答 |
|---|---|
| **服务哪一段关系？** | 全段，但用**同一个数据结构**贯通。陌生人 = 共同 Pool 数为 0；同好 = 共同意图但未共池；熟人 = 共同 Pool ≥ 1 且有回流物。关系阶段是 `shared_pool_density` 的连续函数，不是三个割裂的产品。 |
| **AI 介入哪个环节？** | 四个断点，且**只在断点介入**：① 我不知道怎么介绍自己 → AI 从事件蒸馏画像；② 我不知道对方会不会回应 → AI 预测 responsiveness 并只推会回应的人；③ 我不知道第一句说什么 → 双方 Agent 先"工作组会晤"生成共同话题与行动提案；④ 事件推不动/推完没沉淀 → Agent 发决策卡、索要回流。**其他时候 Agent 闭嘴。** |
| **哪些决策留给真人？** | 硬编码四条红线：连接对象（AI 只出候选，真人点"接管"）、表述方式（AI 出草稿，真人可改可弃）、是否回应（AI 永远不代答）、记忆内容（每条写入 Pool 的记忆用户可见可删）。Agent 的产出物一律是**提案卡（Proposal Card）**，不是既成事实。 |
| **沉淀了什么关系资产？** | Pool 本身就是资产：共同角色（Pool 的 AI 化身）、共同作品（返图/纪要/生成图）、共同记忆（Episode 时间线）、下一次互动的理由（Pool 的 `next_hook` 字段，由 Agent 从上次结果推导）。**Pool 不会因为事件结束而销毁，它进入休眠并持有重启的钩子。** |

---

## 2. 核心洞察：为什么是"池塘"而不是"档案"

### 2.1 三个被普遍做错的地方

**错误一：把用户建模成 profile。**
校园用户注册时不可能填出有效信息。你问"你的兴趣是什么"，他填"音乐、电影、运动"—— 这三个词的信息量约等于零，且对所有人都一样。**Profile 是结果，不是输入。**

**错误二：把关系建模成好友边。**
`is_friend = true` 不携带任何可用于 AI 推理的信息。而"我们一起爬过两次山，第二次他带了相机帮大家拍照"携带巨量信息 —— 它同时定义了关系强度、他的角色、下次的钩子。

**错误三：把记忆挂在个人身上。**
Mem0 式的 `user_id → facts[]` 模型对单人助手是对的，对社交产品是错的。「我们上次爬山迷路了」这条记忆不属于任何一个人，它属于那次爬山。挂在个人身上会导致：双方记忆不一致、无法共同编辑、无法作为共同资产展示。

### 2.2 池塘模型

```
        ┌─────────┐
        │ Person  │──────┐
        └─────────┘      │
                         ▼
        ┌─────────┐   ┌──────────────────────────┐   ┌─────────┐
        │ Person  │──▶│  Pool  #217 「周六爬山」    │◀──│ Person  │
        └─────────┘   │  ─────────────────────    │   └─────────┘
                      │  Episodes: 组队/改期/成行   │
        ┌─────────┐   │  Artifacts: 返图×12, 纪要   │
        │ Person  │──▶│  Memory:  「迷路了但看到日出」│
        └─────────┘   │  Spirit:  Pool 的 AI 化身   │
                      │  NextHook:「说好下次去大觉寺」│
                      └──────────────────────────┘
```

一个人是什么？**是他所在的所有池塘在他身上的投影。**

```sql
-- 「我是谁」不是一张表，是一个查询
SELECT p.domain, p.title, e.summary, a.uri
FROM membership m
JOIN pool p       ON p.id = m.pool_id
JOIN episode e    ON e.pool_id = p.id
LEFT JOIN artifact a ON a.pool_id = p.id
WHERE m.person_id = :me
ORDER BY e.occurred_at DESC;
```

### 2.3 "切面"（Facet）：可控的画像分片

你担心"切面管理会很多"。解法是：**切面按 domain 聚合，数量有界。**

不是每个池塘一个切面，而是把池塘按生活领域归并成 8–12 个固定切面：`运动 / 学术 / 竞赛 / 手艺 / 演出 / 吃喝 / 出行 / 游戏 / 公益 / 求职 / 情感 / 其他`。

```
Person
 ├─ facet[运动]  ← 由 [爬山#217, 夜跑#301, 羽毛球#88] 蒸馏
 ├─ facet[竞赛]  ← 由 [创业赛#412, 数模#155] 蒸馏
 └─ facet[手艺]  ← 由 [陶艺#520] 蒸馏
```

好处有三：
1. **检索时按意图 domain 选切面**，不用把整个人塞进 prompt
2. **切面数量有界**，蒸馏成本可控（每个切面一条记录，更新是增量的）
3. **隐私可控**：用户可以逐切面设置对外可见度 —— "我的运动切面对陌生人可见，情感切面仅好友可见"

Facet 是 Pool 的**下游派生物**，永远可以从 Pool 重算。这意味着切面的 schema 可以随时改，不丢数据。

---

## 3. 记忆系统：三层，冷热分离

| 层 | 名字 | 生命周期 | 存储 | 用途 |
|---|---|---|---|---|
| **L0** | 意图（Intent） | TTL 小时~天，过期即死 | Postgres + pgvector | 匹配的主信号（冷启动期唯一信号） |
| **L1** | 事件（Pool / Episode / Artifact） | 永久，结构化 | Postgres（真相源） | 关系资产、可精确查询、免 LLM |
| **L2** | 语义（Facet / Fact / Graph） | 永久，可重算 | pgvector + Graphiti KG | 画像、偏好、时序关系推理 |

### 3.1 关键设计：L1 是真相源，L2 可丢弃重建

这是整个系统最重要的一条工程判断。

Graphiti / Mem0 这类记忆框架的通病是**写入昂贵**：Graphiti 每个 episode 触发实体抽取 → 去重 → 边抽取 → 边消解 → 时间戳 → 属性，默认并发下约 **50 episodes/分钟**，单条要多次 LLM 调用。如果把每条群聊消息都灌进去，成本和延迟都会爆。

所以分工是：

- **结构信息进 L1（Postgres）**：谁在哪个池塘、什么时候成行、传了几张图、谁发起的。这些是确定性事实，**一次 LLM 调用都不需要**，SQL 直接查，永远准确。
- **软信息进 L2（KG/向量）**：偏好、性格、"他喜欢爬野线不喜欢景区"、"他俩关系变近了"。这些才值得烧 LLM。
- **L2 的写入时机不是每条消息，而是"事件收敛点"**：池塘成行时、事件结束回流时、周期性批量蒸馏时。一个池塘全生命周期只写 3–5 个 episode 进图，不是 300 条。

这条设计让 L2 完全可以异步、可以降级、可以整个删掉重建。**Graphiti 挂了产品还能用**，只是匹配变笨。

### 3.2 冷启动的三段权重

你说的"权重逐渐增加"，具体化成一个可运行的调度：

| 阶段 | 用户状态 | 主信号 | 权重配置 |
|---|---|---|---|
| **T0 裸奔** | 刚注册，0 个池塘 | L0 意图文本 | `w_intent=0.7, w_facet=0, w_social=0, w_resp=0.3(全局先验)` |
| **T1 有痕** | 1–3 个池塘 | L0 + L2 切面 | `w_intent=0.5, w_facet=0.25, w_social=0.1, w_resp=0.15` |
| **T2 沉淀** | ≥4 个池塘 | 全信号 | `w_intent=0.35, w_facet=0.25, w_social=0.25, w_resp=0.15` |

权重不是拍脑袋 —— 用**每个信号在该阶段的 AUC** 来定，线上跑起来后自动调。冷启动期 `w_social=0` 不是缺陷，是诚实：没数据就别装有数据。

### 3.3 关系温度：熟人/陌生人的连续化

你说得对，熟不熟就是共同记忆的多少。量化：

```
temperature(a, b) =
      1.0 * log(1 + shared_pool_count)          -- 共过几个池塘
    + 0.6 * log(1 + co_artifact_count)          -- 一起产出过几个东西
    + 0.4 * recency_decay(last_co_episode)      -- 最近一次共同事件的时间衰减
    + 0.3 * reciprocity(msg_a→b, msg_b→a)       -- 互动是否双向
```

这一个数同时驱动：
- 该给他们看什么（陌生人只看公开切面，高温关系看全部）
- Agent 用什么语气
- 「火花」式的可视化（温度就是火花的燃料）
- 什么时候该提醒"你们三个月没一起干过事了"

---

## 4. 数据结构（可直接建表）

```sql
-- ============ 人 ============
CREATE TABLE person (
  id            uuid PRIMARY KEY,
  handle        text UNIQUE,
  campus_id     text,                    -- 学校/校区，硬隔离的第一道墙
  display_name  text,
  avatar_uri    text,
  created_at    timestamptz DEFAULT now()
);

-- ============ 池塘：一等公民 ============
CREATE TYPE pool_kind AS ENUM ('intent', 'activity', 'crew', 'dyad');
-- intent   : 意图池，还没成行（"想周六爬山"）
-- activity : 已成行的具体事件（"9/13 香山"）
-- crew     : 长期社群（从多次 activity 沉淀出来）
-- dyad     : 双人关系池（小火人的载体）

CREATE TYPE pool_state AS ENUM ('open','matching','forming','active','done','dormant');

CREATE TABLE pool (
  id            uuid PRIMARY KEY,
  kind          pool_kind    NOT NULL,
  state         pool_state   NOT NULL DEFAULT 'open',
  domain        text,                    -- 运动/学术/竞赛/... 对应 facet 分片
  title         text,
  brief         text,
  campus_id     text NOT NULL,
  parent_pool   uuid REFERENCES pool(id),-- activity 归属 crew；用于社群养成
  spirit_id     uuid,                    -- 该池塘的 AI 化身（小火人泛化）
  next_hook     text,                    -- ★ 下一次互动的理由，Agent 生成
  occurred_at   timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE membership (
  pool_id    uuid REFERENCES pool(id),
  person_id  uuid REFERENCES person(id),
  role       text,                       -- 发起人/带路/摄影/后勤 —— 互补性的来源
  joined_at  timestamptz DEFAULT now(),
  left_at    timestamptz,
  PRIMARY KEY (pool_id, person_id)
);

-- ============ L0 意图：短期记忆，会过期 ============
CREATE TABLE intent (
  id           uuid PRIMARY KEY,
  person_id    uuid REFERENCES person(id),
  raw_text     text NOT NULL,            -- "周六想去爬山，有人一起吗"
  domain       text,
  slots        jsonb,                    -- {when, where, size, level, budget, vibe}
  embedding    vector(1024),
  campus_id    text NOT NULL,
  expires_at   timestamptz NOT NULL,     -- ★ 到期自动死，不污染长期画像
  pool_id      uuid REFERENCES pool(id), -- 匹配成功后落到哪个池塘
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX ON intent USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON intent (campus_id, domain, expires_at);

-- ============ L1 事件流：池塘里发生了什么 ============
CREATE TABLE episode (
  id          uuid PRIMARY KEY,
  pool_id     uuid REFERENCES pool(id),
  kind        text,                      -- matched/joined/decided/happened/recap
  summary     text,
  payload     jsonb,
  actor_id    uuid REFERENCES person(id),-- NULL = Agent 产生
  occurred_at timestamptz DEFAULT now()
);

CREATE TABLE artifact (                  -- ★ 回流物：返图、纪要、生成图
  id          uuid PRIMARY KEY,
  pool_id     uuid REFERENCES pool(id),
  author_id   uuid REFERENCES person(id),
  kind        text,                      -- photo/note/poster/spirit_skin
  uri         text,
  caption     text,
  embedding   vector(1024),
  created_at  timestamptz DEFAULT now()
);

-- ============ L2 语义层：可重算的派生物 ============
CREATE TABLE facet (
  person_id   uuid REFERENCES person(id),
  domain      text,
  summary     text,                      -- LLM 从该 domain 的所有 pool 蒸馏
  traits      jsonb,                     -- {level, roles[], preferences[], anti[]}
  visibility  text DEFAULT 'campus',     -- public/campus/warm/private ← 用户可控
  embedding   vector(1024),
  n_pools     int,                       -- 支撑证据量，决定可信度权重
  updated_at  timestamptz,
  PRIMARY KEY (person_id, domain)
);
CREATE INDEX ON facet USING hnsw (embedding vector_cosine_ops);

CREATE TABLE relation (                  -- 物化的关系温度，定时/触发重算
  a_id        uuid REFERENCES person(id),
  b_id        uuid REFERENCES person(id),
  temperature real,
  shared_pools int,
  last_co_at  timestamptz,
  dyad_pool   uuid REFERENCES pool(id),  -- 温度够高时自动开双人池（小火人）
  PRIMARY KEY (a_id, b_id)
);

-- ============ 回应先验：解决"他会不会理我" ============
CREATE TABLE responsiveness (
  person_id     uuid PRIMARY KEY REFERENCES person(id),
  reply_rate    real,     -- 收到接管请求后回应率
  accept_rate   real,     -- 回应后真的成行的比率
  median_ttr    interval, -- 中位响应时长
  active_hours  int[],    -- 活跃时段，别在他睡觉时推
  updated_at    timestamptz
);
```

**注意 `intent.expires_at`。** 这是短期记忆的核心机制：意图有 TTL，过期即死，不会污染长期画像。只有当意图**成功落到池塘**（`pool_id IS NOT NULL`）时，它才有资格进入 L1，进而蒸馏成 L2。**没成行的想法不构成你是谁。** 这条既省钱，也更符合直觉。

---

## 5. 核心链路

```
①发意图 ──▶ ②匹配 ──▶ ③A2A预演 ──▶ ④真人接管 ──▶ ⑤群聊+Agent推进 ──▶ ⑥回流沉淀
   L0        召回/精排     Agent 会晤      ★红线★        决策卡/事件卡      Artifact→L1→L2
                                                              │                    │
                                                              └────── next_hook ◀──┘
                                                                    （下次互动的理由）
```

### ① 发意图 — 一句话，不填表

用户说人话："周六想去爬山，最好野线，能拍照的加分"。

LLM 做**槽位抽取**，不是分类：
```json
{ "domain":"出行", "when":"2026-08-15±1d", "where":"京郊",
  "size":"3-6", "level":"中等", "vibe":["野线","摄影"],
  "hard": ["when","where"], "soft": ["vibe","level"] }
```
区分 hard/soft 很关键：hard 走 SQL 硬过滤（省钱、准确），soft 走向量+重排。

### ② 匹配 — 四段漏斗

```
候选全集 (campus 内)
   │  ① 硬过滤：SQL WHERE campus + domain + 时间窗重叠 + 未拉黑 + 活跃度
   ▼  ~10^4 → ~10^3
   │  ② 向量召回：intent.embedding ⋈ {其他 intent, facet[domain], pool}
   ▼  pgvector HNSW，top-200
   │  ③ 精排：多信号加权 + cross-encoder
   ▼  top-20
   │  ④ LLM 终排 + 生成理由（"你俩都提到想拍星轨"）
   ▼  top-3~5 张候选卡
```

精排打分：

```
score = w_intent   · cos(intent_a, intent_b)           -- 想干同一件事
      + w_facet    · cos(facet_a[d], facet_b[d])       -- 长期取向合得来
      + w_comp     · complementarity(roles_a, roles_b) -- ★ 互补，不只是相似
      + w_social   · social_proximity(a, b)            -- 二度关系/共同社群
      + w_resp     · responsiveness(b)                 -- ★ 他会不会理你
      - penalty    · (saturation(b) + recent_reject)   -- 别把热门用户榨干
```

两个非共识但重要的项：

- **`complementarity` 互补性**：爬山队不需要 5 个"资深驴友"，需要 1 个带路 + 1 个摄影 + 1 个后勤。角色从 `membership.role` 历史里学，纯 embedding 相似度做不到这件事，这是差异化。
- **`responsiveness` 回应先验**：直接回应赛题痛点"不知道对方会不会回应"。**AI 不该推"最合适"的人，该推"最合适且会回应"的人。** 一个从不回消息的完美匹配，价值是负的。

规模化：`pgvector + HNSW` 到 ~500 万向量都够用（单校区几万人，几十万意图/年，绰绰有余）；跨校区或过千万再换 Qdrant（带 payload 过滤的 HNSW 在过滤场景下只加 1–2ms，而 pgvector 后过滤会退化到 20–40ms）。

### ③ A2A 预演 — "工作组会晤"

你那个"领导人会晤"的比喻是对的，把它做成协议：

```
[工作组阶段]  Agent(A) ⇄ Agent(B)   ← 各自只带「可披露切面」，最多 6 轮
   产出：3 条共同话题 + 1 个具体行动提案 + 1 个风险提示
   红线：Agent 不代表真人做任何承诺，不交换未授权信息

[提案卡]   ┌────────────────────────────────┐
           │ 林某 · 大三 · 计算机            │
           │ 你俩都在找野线，他上次去了箭扣    │
           │ 💡 提案：周六 6:00 北宫门集合     │
           │ ⚠️  他周六下午有课，需早回        │
           │ [ 我来说 ]  [ 换个人 ]  [ 用这句 ]│
           └────────────────────────────────┘

[真人接管] ← ★ 这里是红线，AI 到此为止
```

**衡量成功的指标不是 Agent 聊了几轮，是"接管率"和"接管后成行率"。** 这一条直接抄进产品的北极星指标。

技术上这就是标准的 A2A（已捐给 Linux Foundation，2026 年 4 月过 150 家机构支持）—— 但**我们内部不需要跑真的 A2A 协议**，同进程两个 agent 实例交换结构化消息即可。A2A 只在未来需要跨 App 互通时才有价值，别过早引入。

**可披露切面（Disclosure Profile）** 是安全边界：Agent 拿到的不是用户全量数据，是按 `facet.visibility` + 关系温度过滤后的视图。这个过滤在数据库层做（RLS），不在 prompt 里做 —— **prompt 里的约束是建议，数据库里的约束才是保证。**

### ④ 真人接管 — 四条红线

```
连接对象  → AI 出候选，真人点
表述方式  → AI 出草稿，真人可改可弃可自己写
是否回应  → AI 永不代答（这是与 Tara 式"AI 替你聊"的根本分歧）
记忆内容  → 每条写入 Pool 的记忆用户可见、可编辑、可删除
```

第三条值得展开：Tara 那类产品让 AI **代替**你回复。我们不做，因为它违反赛题第三问，而且会制造"虚假繁荣" —— 尤米原话："AI 不能替代真人完成关系确认环节，否则只会产生虚假繁荣。" 我们的 AI 只做**预演**，预演产物必须经过真人签字才生效。

### ⑤ 群聊 + Agent 推进

群聊本体是普通 IM。Agent 作为一个特殊成员在里面，但**默认沉默**。

介入策略基于一条原则（有 CHI 2026 的研究支撑）：**只在出现"协作断点"时介入，其余时刻的介入都是骚扰。**

```python
INTERVENE_WHEN = [
  ("stall",      "冷场 > 30min 且关键槽位未定"),
  ("undecided",  "时间/地点/人数出现 ≥2 个未收敛提案"),
  ("newcomer",   "新成员入池且无人 onboard"),
  ("no_recap",   "事件结束 > 12h 且零 artifact"),
  ("hook_due",   "池塘休眠 > N 天且 next_hook 到期"),
]
# 其余一律 SILENT。用户可全局调低阈值，也可 @ 唤起。
```

介入形式不是"说话"，是**发卡**（借鉴飞书群的事件卡）：

| 卡片 | 触发 | 内容 |
|---|---|---|
| 决策卡 | undecided | 「时间投票：周六6点 / 周日8点」一键投 |
| 清单卡 | forming | 「带路×1(缺) 摄影×1(林) 后勤×1(缺)」 |
| 回流卡 | no_recap | 「传张图？我给你们做张海报」 |
| 唤醒卡 | hook_due | 「上次说好去大觉寺，下周六？」 |

**卡片 > 聊天。** 卡片是结构化的，点击行为直接写回 `episode`，不需要再 LLM 解析。这既省钱又准确，还避免了 Agent 抢占用户的互动空间。

### ⑥ 回流沉淀 — 闭环

事件结束 → 索要返图 → 生成共同资产 → 写 L1 → 蒸馏 L2 → 生成 `next_hook`。

```
artifact(返图×12) ──▶ episode(recap)  ──▶ facet 增量更新
                          │                 relation.temperature ↑
                          ▼
                   pool.next_hook = "说好下次去大觉寺"
                   pool.state = 'dormant'   ← 不销毁，休眠
                          │
                          └──▶ N 天后触发唤醒卡 ──▶ 新 pool，parent = 本 pool
                                                        │
                                              连续 3 次 → 自动提议成立 crew
```

**这就是"社群养成"的机制化定义**：crew 不是用户建的群，是系统从重复的 activity 里**长出来**的。用户从没做过"建群"这个动作，但他有了一个社群。

---

## 6. 小火人的 N+1 泛化

现有小火人是 `2 人 + 1 精灵`，载体是双人关系。我们的泛化：**精灵的载体是 Pool，不是关系。**

| | 抖音小火人 | 我们 |
|---|---|---|
| 载体 | dyad（双人关系） | 任意 Pool |
| 数量 | 每对好友 1 只 | 每个池塘 1 只 |
| 记忆 | 双人对话上下文 | 池塘的 episode + artifact |
| 形态 | 共同装扮 | 装扮由 artifact 驱动（爬山回来皮肤上多一座山） |
| 群体 | 不支持 N+1 | 原生 N+1 |

`kind='dyad'` 的 Pool 退化后就**恰好是**现在的小火人。所以这不是"另做一个东西"，是**小火人的严格超集** —— 汇报时这一点很好讲。

精灵的记忆实现：Letta 的 **shared memory block** 语义正好对上 —— 多个 agent 挂载同一个 block，一方更新所有人立即可见，`memory_insert` 是增量的、并发安全的。我们不一定引入 Letta 全家桶，但**"记忆块归属于 Pool、被多个 person session 共享挂载"这个语义直接照抄**。

未来的"精灵世界"= 多个 Pool 的精灵进入公共空间互动 —— 在我们的结构里就是 `pool × pool` 的相遇，天然支持。

---

## 7. 技术选型与开源复用清单

### 7.1 诚实的前提

**没有任何一个开源项目做过"事件中心的社交记忆图谱"。** 所以策略是**组装**，不是"fork 一个改改"。可复用的部分我全部列出来了，剩下必须自己写的只有三个薄层。

### 7.2 主推方案

| 层 | 选型 | License | 为什么 | 复用什么 |
|---|---|---|---|---|
| **应用底座** | **Supabase**（可自托管） | Apache-2.0 | 一个东西同时给到 Auth + Postgres + Realtime + Storage + **pgvector** + RLS。RLS 是关键 —— 隐私边界必须在数据库层，不能靠 prompt | 全部。**别自己写认证和权限** |
| **前端壳** | Next.js 15 + `supabase-community/vercel-ai-chatbot` | Apache-2.0 | 聊天 UI、流式、鉴权已连好 | 聊天 UI 骨架 + Supabase 集成 |
| **Agent 编排** | Vercel AI SDK v5（TS） | Apache-2.0 | 与前端同语言，`streamText`/`generateObject`/tool-calling 齐全。**槽位抽取用 `generateObject` + zod，别自己解析 JSON** | 全部编排原语 |
| **记忆 L1** | **自建 Postgres schema**（见 §4） | — | 这层是我们的核心资产，且用框架反而更慢更贵 | — |
| **记忆 L2 图** | **Graphiti**（`getzep/graphiti`） | Apache-2.0 | 三个特性精准命中：`group_id` 命名空间 = **池塘天然隔离**；`communities`（Leiden）= **社群自动发现**；bi-temporal = **关系随时间变化**。官方 `/server` 目录是现成 FastAPI 服务 | 直接跑官方 REST server，我们只调 HTTP |
| **记忆 L2 向量** | pgvector（HNSW） | PostgreSQL | 500 万向量内与专用库同档，且能和业务表 JOIN | 索引 + 查询 |
| **重排** | `BAAI/bge-reranker-v2-m3` | Apache-2.0 | <6 亿参数，消费级 GPU 可跑；两阶段召回+重排是标准解 | 直接推理 |
| **模型** | 火山方舟 `doubao-seed-1-8` | 商用 API | **OpenAI SDK 完全兼容**，`baseURL` 换掉即可，零迁移成本；字节生态对齐 | OpenAI SDK 客户端 |
| **生图** | `doubao-seedream-4-0-250828` | 商用 API | 0.20 元/张，1k–4k；**多图融合 + 主体一致性** 正好用于"精灵皮肤随事件演化"和返图海报 | 同上 |
| **IM（起步）** | Supabase Realtime | Apache-2.0 | Broadcast + Presence + Postgres Changes，一个 channel 搞定 | 全部 |
| **IM（规模化）** | **OpenIM** | Apache-2.0 | Go，微服务，前微信技术专家出品，大群/水平扩展是它的主场 | 服务端 + 全平台 SDK |
| **向量（规模化）** | Qdrant | Apache-2.0 | 带 payload 过滤的 HNSW 只加 1–2ms；我们的查询**永远带过滤**（campus/domain/时间窗），这个特性对我们价值极高 | 替换 pgvector |

### 7.3 明确不用的，和原因

| 候选 | 判断 | 理由 |
|---|---|---|
| **Mem0** | ❌ 不作为主记忆层 | ① Python SDK v2.0.0 **移除了外部 graph-store 支持**，OSS 版抽取是 **ADD-only**（不会消解冲突），而我们的场景充满"计划改了""他升级了装备"这类需要失效旧事实的更新；② graph memory 被门禁在 **Pro 档 $249/月**。它的 `user_id/agent_id/run_id/app_id` 四维作用域设计值得借鉴（我们的 `intent.expires_at` 就是 `run_id` 的同构物），但**只借鉴思路，不引入依赖** |
| **Letta** | ⚠️ 只借语义 | 它是"有状态 agent 操作系统"，我们需要的只是 shared memory block 的语义。引入整个 agent server 会把架构绑死在它的 agent 模型上 |
| **Coze Studio** | ⚠️ 不作基底 | Apache-2.0、Go + React、字节自家（讲故事有加分）。但它是**给人搭 Agent 的平台**，不是搭社交产品的框架 —— 把社交业务塞进它的 DDD 微服务里是负担不是加速。**建议：只在需要"让运营同学可视化配 Agent prompt/workflow"时，作为旁挂的配置面接入** |
| **CloudWeGo Eino** | ⚠️ 备选 | 字节的 Go 版 LangGraph，Doubao/TikTok 在用。如果团队是 Go 栈就选它。**但单语言 TS 全栈对小团队更快**，别为了生态对齐付语言分裂的代价 |
| **Mobilizon / Gathio** | ❌ | 开源 Meetup 替代品，但它们的模型是"公开活动 + RSVP"，没有匹配、没有记忆、没有 Agent。我们的 Pool 语义远超它们，借鉴不了 |
| **A2A 协议**（Linux Foundation） | ⏸ 暂缓 | 跨组织 agent 互通的协议。我们内部两个 agent 在同进程里交换结构化对象就够了。等到要和多闪/抖音的 AI 分身互通时再上 |
| **自建 IM** | ❌❌ | 红线。起步 Supabase Realtime，规模化 OpenIM |

### 7.4 我们必须自己写的三层（约占总代码 15%）

1. **Pool 语义层** —— §4 的 schema + 状态机 + `next_hook` 生成 + crew 自动孵化
2. **匹配编排器** —— §5.② 的四段漏斗、权重调度、互补性打分、responsiveness 建模
3. **Agent 介入策略** —— §5.⑤ 的断点检测 + 卡片系统

这三层没有开源，也不该有 —— **它们就是产品本身**。其余一律组装。

### 7.5 目标仓库结构

```
social-beta/
├── apps/
│   └── web/                    # Next.js 15，fork 自 vercel-ai-chatbot
│       ├── app/(pool)/         # 池塘视图、群聊、卡片
│       ├── app/(match)/        # 发意图、候选卡、接管
│       └── lib/ai/             # AI SDK：槽位抽取、A2A 预演、卡片生成
├── services/
│   ├── matcher/                # TS：四段漏斗 + 权重调度
│   ├── distiller/              # TS：facet 蒸馏、next_hook、temperature（cron）
│   └── memory/                 # Python：Graphiti 官方 server 薄封装
├── packages/
│   ├── db/                     # Drizzle schema + migrations + RLS 策略
│   └── shared/                 # zod schema：Intent/Proposal/Card 契约
├── supabase/
│   ├── migrations/
│   └── functions/              # Edge Functions：webhook、定时蒸馏
└── seed/
    └── simulate.ts             # ★ 1000 虚拟学生 + 12 周事件流
```

---

## 8. 冷启动：1000 个虚拟学生

你提到"可以模拟 1000 个人"。这件事的正确做法不是生成 1000 份 profile —— **那样就假定了 profile 是输入，恰好是我们要否定的东西。**

正确做法是**生成事件历史，让画像自己长出来**：

```
1. 生成 1000 个 person，只有 handle + campus，profile 全空
2. 生成 12 周的事件流：每周 ~200 条意图，按真实校园分布
   （周中学术/竞赛，周末出行/吃喝，考试周骤降，开学季骤升）
3. 让匹配引擎真跑，产生 pool / membership / episode / artifact
4. 跑蒸馏，facet 和 relation 自然浮现
5. ★ 验证：随机抽 20 个人，看蒸馏出的画像是否"像个人"
```

好处：
- **同一套代码跑模拟和真实**，模拟数据不是假数据，是同一条链路的产物
- 能真实测量冷启动曲线：**第几次事件之后，匹配质量出现拐点？**（这是路演最有说服力的一张图）
- 能压测：1000 人 × 12 周的向量规模、Graphiti 写入量都能提前暴露

`seed/simulate.ts` 是**产品能力的证明工具**，不是 demo 道具。评委问"没用户怎么证明"，答案就是这条曲线。

---

## 9. 路线图

### Phase 0 — 骨架可跑（~3 天）
Supabase 起、schema 落地、fork chat 壳、火山方舟接通。
**里程碑：** 发一条意图 → 硬过滤 + 向量召回出 5 个候选（假数据）

### Phase 1 — 主链路闭环（~1 周）
四段漏斗、A2A 预演 + 提案卡、接管建池、群聊、决策卡、返图 → artifact → recap → next_hook。
**里程碑：** 一个人从"想爬山"到"爬完了有 12 张返图和一句下次的理由"，全程跑通。**这就是可路演的完整故事。**

### Phase 2 — 记忆长出来（~1 周）
facet 蒸馏、relation 温度、Graphiti 接入（只在收敛点写）、权重三段调度、1000 人模拟。
**里程碑：** 冷启动质量曲线出图；随机抽人的蒸馏画像"像个人"

### Phase 3 — 社群养成（~1 周）
crew 自动孵化、休眠唤醒、Pool 精灵 + Seedream 皮肤演化、Graphiti communities。
**里程碑：** 模拟数据里自发长出 ≥3 个稳定 crew

### Phase 4 — 规模化（按需）
Qdrant 替换、OpenIM 替换、bge-reranker 自托管、RLS 全面审计、多校区。

**如果只有 48 小时**：做 Phase 1，用假 seed 数据。Phase 1 的故事是完整的，而且**恰好命中赛题的全部四问**。

---

## 10. 风险与红线

| 风险 | 应对 |
|---|---|
| **Graphiti 写入太慢/太贵** | 已在架构上规避：只在收敛点写，一个池塘全生命周期 3–5 个 episode。且 L2 可整个降级，产品不挂 |
| **匹配冷启动质量差** | 承认它差，用权重三段调度诚实处理；T0 阶段主打"意图广场"（人肉浏览），别硬装智能 |
| **Agent 话痨招人烦** | 默认沉默 + 断点触发 + 卡片而非聊天 + 用户可调阈值。宁可少说 |
| **隐私事故** | 可披露切面在 **RLS 层**实现，不在 prompt 层；facet 逐项可见度用户自控；A2A 交换内容全程留痕可审计 |
| **热门用户被榨干** | 打分里的 `saturation` 惩罚项；每人每日被推荐次数硬上限 |
| **假匹配/刷量** | 北极星指标是**接管后成行率**和**回流物产出率**，不是匹配数、不是消息数。指标定对了，就没人有动力刷 |

**开发红线（不可协商）：**
1. 不自己写 IM、认证、向量索引、记忆抽取
2. 隐私边界必须落在数据库（RLS），不能只写在 prompt 里
3. Agent 的一切产出是**提案**，真人签字才生效
4. L1（Postgres）永远是真相源，L2 必须可删可重建

---

## 11. 北极星指标

```
主指标   接管率           = 真人点"我来说" / AI 出的提案卡数
        成行率           = pool 进入 'active' / 接管数
        回流率           = 产出 ≥1 artifact 的 pool / 成行数
        复现率  ★★★     = 由 next_hook 唤醒并再次成行的 pool 比例

反指标   Agent 发言占比    ← 越低越好
        AI 代答次数       ← 必须恒为 0
```

最后一条 `复现率` 是最重要的。它直接量化尤米那句话：

> "很多的关系之所以持续，不是因为永远都有话说，而是我们一直都有事情可以去做。"

---

## 附：参考来源

- Graphiti（Apache-2.0，group_id 命名空间 / Leiden communities / bi-temporal）— https://github.com/getzep/graphiti ｜ https://help.getzep.com/graphiti/core-concepts/graph-namespacing ｜ https://help.getzep.com/graphiti/core-concepts/communities
- Mem0（作用域设计、OSS 限制）— https://github.com/mem0ai/mem0 ｜ https://docs.mem0.ai/core-concepts/memory-types
- Letta shared memory blocks — https://docs.letta.com/guides/agents/multi-agent-shared-memory/
- 记忆框架横评 2026 — https://particula.tech/blog/agent-memory-frameworks-tested-mem0-zep-letta-cognee-2026 ｜ https://atlan.com/know/mem0-alternatives/
- Supabase Realtime（Broadcast/Presence）— https://supabase.com/docs/guides/realtime ｜ 前端壳 https://github.com/supabase-community/vercel-ai-chatbot
- pgvector vs Qdrant 选型 — https://encore.dev/articles/pgvector-vs-qdrant ｜ https://rivestack.io/blog/pgvector-vs-qdrant
- 两阶段召回+重排 / bge-reranker — https://www.pinecone.io/learn/series/rag/rerankers/ ｜ https://markaicode.com/bge-reranker-cross-encoder-reranking-rag/
- 群聊中 Agent 何时该发言（CHI 2026）— https://dl.acm.org/doi/10.1145/3772363.3798392 ｜ ProACT https://arxiv.org/pdf/2607.03730
- 火山方舟 OpenAI 兼容 — https://www.volcengine.com/docs/82379/1330626 ｜ Seedream 4.0 https://www.volcengine.com/docs/82379/1824718
- Coze Studio（Apache-2.0）— https://github.com/coze-dev/coze-studio ｜ CloudWeGo Eino — https://github.com/cloudwego/eino
- OpenIM — https://www.openim.io/zh
- A2A 协议（Linux Foundation）— https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents
- 事件中心记忆研究 — https://arxiv.org/pdf/2601.04726 ｜ 冷启动+LLM — https://arxiv.org/html/2511.18261
- 对标产品 Tara「懂你的 AI 社交助手」— https://apps.apple.com/cn/app/id6743015968
