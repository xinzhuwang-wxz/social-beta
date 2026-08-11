-- 核心关系模型：Person — Pool — Person 二部超图
--
-- 传统社交底层是 User(profile) + Friendship(edge)。这里刻意不那么建：
-- profile 冷启动填不满，friendship 是个不携带任何信息的布尔值。
-- 本 schema 里「人是什么」不是一张表，而是一个沿 membership → pool → episode 的查询。
--
-- 本迁移只含确定性的结构信息（L1，真相源）。写入这些表零 LLM 成本。
-- 向量列与语义派生物在后续迁移中加入，且必须可整体删除并从这里重建。

create extension if not exists "uuid-ossp";

-- ============================================================
-- 人
-- ============================================================
create table person (
  id            uuid primary key default uuid_generate_v4(),
  auth_user_id  uuid unique references auth.users (id) on delete cascade,
  handle        text unique not null,
  display_name  text not null,
  -- 校区是硬隔离的第一道墙：见面成本决定了匹配必须在同校区内
  campus_id     text not null,
  avatar_uri    text,
  created_at    timestamptz not null default now()
);
create index person_campus_idx on person (campus_id);

-- ============================================================
-- 池塘：一等公民
-- ============================================================
create type pool_kind as enum (
  'intent',    -- 意图池：还没成行
  'activity',  -- 具体事件：已成行
  'crew',      -- 长期社群：从多次 activity 沉淀出来
  'dyad'       -- 双人关系池：小火人的载体
);

create type pool_state as enum (
  'open', 'matching', 'forming', 'active', 'done', 'dormant'
);

create table pool (
  id           uuid primary key default uuid_generate_v4(),
  kind         pool_kind  not null,
  state        pool_state not null default 'open',
  domain       text,
  title        text,
  brief        text,
  campus_id    text not null,
  -- activity 归属 crew，或唤醒后派生的新池塘指回原池。社群养成靠这条链。
  parent_pool  uuid references pool (id) on delete set null,
  -- 下一次互动的理由。dormant 不是终态 —— 池塘带着这句话休眠，到期被唤醒。
  next_hook    text,
  next_hook_due_at timestamptz,
  occurred_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index pool_campus_state_idx on pool (campus_id, state);
create index pool_parent_idx on pool (parent_pool) where parent_pool is not null;
create index pool_hook_due_idx on pool (next_hook_due_at)
  where state = 'dormant' and next_hook_due_at is not null;

-- 状态机在数据库层兜底。非法转移必须被拒绝，而不是指望每个调用方自觉。
create or replace function pool_guard_transition() returns trigger
language plpgsql as $$
begin
  if old.state = new.state then return new; end if;
  if not (
       (old.state = 'open'     and new.state in ('matching','done'))
    or (old.state = 'matching' and new.state in ('forming','open','done'))
    or (old.state = 'forming'  and new.state in ('active','done'))
    or (old.state = 'active'   and new.state in ('done'))
    or (old.state = 'done'     and new.state in ('dormant'))
    or (old.state = 'dormant'  and new.state in ('matching'))
  ) then
    raise exception '非法的池塘状态转移: % -> %', old.state, new.state;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger pool_transition_guard
  before update of state on pool
  for each row execute function pool_guard_transition();

-- ============================================================
-- 成员与角色
-- ============================================================
create type pool_role as enum (
  'initiator', 'guide', 'shooter', 'logistics', 'participant'
);

create table membership (
  pool_id   uuid not null references pool (id) on delete cascade,
  person_id uuid not null references person (id) on delete cascade,
  -- 角色是互补性打分的来源：爬山队不需要五个都想带路的人
  role      pool_role not null default 'participant',
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (pool_id, person_id)
);
create index membership_person_idx on membership (person_id) where left_at is null;

-- ============================================================
-- 事件流：池塘里发生了什么（L1，零 LLM 成本）
-- ============================================================
create table episode (
  id          uuid primary key default uuid_generate_v4(),
  pool_id     uuid not null references pool (id) on delete cascade,
  kind        text not null,
  summary     text,
  payload     jsonb not null default '{}'::jsonb,
  -- NULL 表示这条由 Agent 产生。用于度量「Agent 发言占比」这个反指标。
  actor_id    uuid references person (id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index episode_pool_time_idx on episode (pool_id, occurred_at desc);

-- ============================================================
-- 回流物：关系资产的实体
-- ============================================================
create table artifact (
  id         uuid primary key default uuid_generate_v4(),
  pool_id    uuid not null references pool (id) on delete cascade,
  author_id  uuid references person (id) on delete set null,
  kind       text not null,
  uri        text not null,
  caption    text,
  created_at timestamptz not null default now()
);
create index artifact_pool_idx on artifact (pool_id, created_at desc);

-- ============================================================
-- 回应先验：解决「他会不会理我」
-- ============================================================
-- AI 不该推「最合适」的人，该推「最合适且会回应」的人。
-- 一个从不回消息的完美匹配，价值是负的。
create table responsiveness (
  person_id    uuid primary key references person (id) on delete cascade,
  reply_rate   real not null default 0,
  accept_rate  real not null default 0,
  median_ttr   interval,
  active_hours int[] not null default '{}',
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- 拉黑：退出的权利
-- ============================================================
create table block (
  blocker_id uuid not null references person (id) on delete cascade,
  blocked_id uuid not null references person (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint block_not_self check (blocker_id <> blocked_id)
);

-- ============================================================
-- RLS：从第一天就开，不是留到后面再补
-- ============================================================
-- 隐私边界必须落在数据库层。prompt 里的约束是建议，这里的才是保证。
alter table person         enable row level security;
alter table pool           enable row level security;
alter table membership     enable row level security;
alter table episode        enable row level security;
alter table artifact       enable row level security;
alter table responsiveness enable row level security;
alter table block          enable row level security;

-- 策略辅助函数必须是 SECURITY DEFINER。
--
-- 否则会无限递归：person 的策略里查 person，membership 的策略里查 membership，
-- 策略求值又触发策略。SECURITY DEFINER 让这几个查询以属主身份执行、绕过 RLS，
-- 从而打断这个环。search_path 固定为 public，防止被调用方的 search_path 劫持。

-- 当前登录者对应的 person.id
create or replace function current_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from person where auth_user_id = auth.uid()
$$;

-- 当前登录者所属校区
create or replace function current_campus_id() returns text
language sql stable security definer set search_path = public as $$
  select campus_id from person where auth_user_id = auth.uid()
$$;

-- 当前登录者是否为某池塘的在册成员
create or replace function is_pool_member(target_pool uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membership m
    where m.pool_id = target_pool
      and m.person_id = current_person_id()
      and m.left_at is null
  )
$$;

-- 同校区可见，跨校区不可见
create policy person_read_same_campus on person for select
  using (campus_id = current_campus_id());

create policy person_write_self on person for update
  using (auth_user_id = auth.uid());

-- 池塘：成员可读；未成行的意图池同校区可见（意图广场靠这条）
create policy pool_read on pool for select
  using (
    is_pool_member(id)
    or (kind = 'intent' and state in ('open','matching') and campus_id = current_campus_id())
  );

create policy membership_read on membership for select
  using (person_id = current_person_id() or is_pool_member(pool_id));

-- 池塘内容仅成员可读。非成员读不到任何一条消息或回流物。
create policy episode_read_members on episode for select
  using (is_pool_member(pool_id));

create policy artifact_read_members on artifact for select
  using (is_pool_member(pool_id));

create policy responsiveness_read_self on responsiveness for select
  using (person_id = current_person_id());

create policy block_own on block for all
  using (blocker_id = current_person_id());

-- ============================================================
-- 表级授权
-- ============================================================
-- RLS 只决定「哪些行可见」，GRANT 决定「这张表能不能碰」。两者都要，缺一不可：
-- 没有 GRANT，策略再对也是 permission denied；没有策略，GRANT 就是全表放开。
--
-- 按最小权限逐表授予，不用 `grant all on all tables`：
-- 那样将来新增一张本不该让用户直接写的表时，它会被静默地一起放开。
grant usage on schema public to anon, authenticated;

grant select, update           on person         to authenticated;
grant select                   on pool           to authenticated;
grant select                   on membership     to authenticated;
grant select                   on episode        to authenticated;
grant select                   on artifact       to authenticated;
grant select                   on responsiveness to authenticated;
grant select, insert, delete   on block          to authenticated;

-- 池塘、成员、事件、回流物的写入一律经 PoolEngine 的系统通道，
-- 因为它们伴随状态机校验与事件流写入 —— 让客户端直接 insert 会绕过这些不变量。

grant execute on function current_person_id()      to authenticated;
grant execute on function current_campus_id()      to authenticated;
grant execute on function is_pool_member(uuid)     to authenticated;
