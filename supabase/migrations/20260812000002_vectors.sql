-- 向量与语义派生物（L2）
--
-- 本迁移里的一切都必须可整体删除并从 L1（核心关系表）重建。
-- 这条承诺是「Postgres 是唯一真相源」唯一能被证伪的地方，
-- 因此它有一条专门的等价性回归测试守着。
--
-- 维度 768 来自 ADR-0001：paraphrase-multilingual 实测选型。
-- 换模型 = 一次 migration + 全量重算，不是改个配置。

create extension if not exists vector;

-- ============================================================
-- L0 意图：短期记忆，会过期
-- ============================================================
create table intent (
  id         uuid primary key default uuid_generate_v4(),
  person_id  uuid not null references person (id) on delete cascade,
  raw_text   text not null,
  domain     text not null,
  slots      jsonb not null default '{}'::jsonb,
  -- 不可让步的槽位走 SQL 硬过滤，可商量的走向量与重排
  hard_slots text[] not null default '{}',
  soft_slots text[] not null default '{}',
  embedding  vector(768),
  campus_id  text not null,
  -- 过期即死。没成行的想法不构成你是谁 —— 这既省钱，也更符合直觉。
  expires_at timestamptz not null,
  -- 匹配成功后落到哪个池塘。只有非空的意图才有资格被蒸馏进长期画像。
  pool_id    uuid references pool (id) on delete set null,
  created_at timestamptz not null default now()
);

create index intent_live_idx on intent (campus_id, domain, expires_at)
  where pool_id is null;
create index intent_person_idx on intent (person_id, created_at desc);
create index intent_embedding_idx on intent
  using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- 切面：按 domain 分片的画像，数量有界
-- ============================================================
-- 用户从没填过资料，但三次活动之后系统比任何表单都更懂他 ——
-- 因为它知道他干过什么、在里面扮演什么角色。
create table facet (
  person_id  uuid not null references person (id) on delete cascade,
  domain     text not null,
  summary    text not null,
  traits     jsonb not null default '{}'::jsonb,
  -- 用户逐切面自控。这个值在 RLS 里被消费，不在 prompt 里被消费。
  visibility text not null default 'campus'
    check (visibility in ('public','campus','warm','private')),
  embedding  vector(768),
  -- 支撑证据量。少量样本得出的画像不该被当成事实。
  n_pools    int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (person_id, domain)
);
create index facet_embedding_idx on facet
  using hnsw (embedding vector_cosine_ops);

-- 每条画像必须能溯源到具体池塘。用户问「你凭什么这么说我」要答得出来。
create table facet_evidence (
  person_id uuid not null,
  domain    text not null,
  pool_id   uuid not null references pool (id) on delete cascade,
  primary key (person_id, domain, pool_id),
  foreign key (person_id, domain) references facet (person_id, domain) on delete cascade
);

-- ============================================================
-- 关系温度：熟人/陌生人的连续化
-- ============================================================
-- 熟不熟就是共同记忆的多少。它是连续量，不是 is_friend 布尔值。
create table relation (
  a_id         uuid not null references person (id) on delete cascade,
  b_id         uuid not null references person (id) on delete cascade,
  temperature  real not null default 0,
  shared_pools int  not null default 0,
  co_artifacts int  not null default 0,
  last_co_at   timestamptz,
  -- 温度够高时自动开双人池 —— 那就是小火人
  dyad_pool    uuid references pool (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (a_id, b_id),
  -- 无向关系只存一份，用 id 序规范化，避免 (a,b) 与 (b,a) 不一致
  constraint relation_normalized check (a_id < b_id)
);
create index relation_b_idx on relation (b_id);

-- ============================================================
-- 回流物的向量（用于按内容检索共同记忆）
-- ============================================================
alter table artifact add column embedding vector(768);
create index artifact_embedding_idx on artifact
  using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- RLS
-- ============================================================
alter table intent          enable row level security;
alter table facet           enable row level security;
alter table facet_evidence  enable row level security;
alter table relation        enable row level security;

-- 查任意人的校区。SECURITY DEFINER 绕过 person 的 RLS ——
-- 否则跨校区的人会被 person 策略过滤成 NULL，导致这里的比较悄悄变成「未知」，
-- 而不是明确的「不可见」。策略里的隐式 NULL 语义是安全事故的常见来源。
create or replace function person_campus(target uuid) returns text
language sql stable security definer set search_path = public as $$
  select campus_id from person where id = target
$$;

-- 两人的关系温度。同样需要绕过 relation 自身的 RLS。
create or replace function relation_temperature(other uuid) returns real
language sql stable security definer set search_path = public as $$
  select coalesce(max(r.temperature), 0)
  from relation r
  where (r.a_id = other and r.b_id = current_person_id())
     or (r.b_id = other and r.a_id = current_person_id())
$$;

-- 意图广场：同校区可见未过期且未成池的意图
create policy intent_read_board on intent for select
  using (
    person_id = current_person_id()
    or (pool_id is null and expires_at > now() and campus_id = current_campus_id())
  );

create policy intent_write_own on intent for all
  using (person_id = current_person_id());

-- 切面可见度：本人恒可见；其余按 visibility 与关系温度裁剪。
--
-- 这条策略就是「可披露视图」的实现。Agent 预演时拿到的是这个视图的产物，
-- 而不是全量数据 —— private 切面在 SQL 层就取不到，
-- 所以泄漏在结构上不可能，而不是靠模型自觉。
create policy facet_read_disclosable on facet for select
  using (
    person_id = current_person_id()
    or visibility = 'public'
    or (visibility = 'campus' and person_campus(person_id) = current_campus_id())
    or (visibility = 'warm' and relation_temperature(person_id) >= 1.0)
  );

create policy facet_write_own on facet for all
  using (person_id = current_person_id());

create policy facet_evidence_read on facet_evidence for select
  using (person_id = current_person_id());

create policy relation_read_own on relation for select
  using (a_id = current_person_id() or b_id = current_person_id());

-- ============================================================
-- 表级授权
-- ============================================================
-- 意图由用户直接发布，所以给写权限；切面是蒸馏产物，用户只能改可见度与删除，
-- 不能自己 insert —— 允许手写切面就等于把「填资料」从前门赶出去又从后门放进来。
grant select, insert, delete on intent         to authenticated;
grant select, update, delete on facet          to authenticated;
grant select                 on facet_evidence to authenticated;
grant select                 on relation       to authenticated;

grant execute on function person_campus(uuid)        to authenticated;
grant execute on function relation_temperature(uuid) to authenticated;
