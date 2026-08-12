-- 预演记录与成员邀请态

-- ============================================================
-- 预演记录
-- ============================================================
-- 存在的理由是产品承诺：用户可以查看「我的 Agent 到底替我说了什么」。
-- 没有这张表，预演就是个黑箱 —— 而一个替你说话的黑箱，
-- 恰恰是本产品最想避免的东西。
create table rehearsal (
  id           uuid primary key default uuid_generate_v4(),
  seeker_id    uuid not null references person (id) on delete cascade,
  candidate_id uuid not null references person (id) on delete cascade,
  seeker_intent    uuid references intent (id) on delete set null,
  candidate_intent uuid references intent (id) on delete set null,
  -- 提案卡：3 话题 + 1 行动提案 + 1 风险 + 1 开场白草稿
  proposal   jsonb not null,
  -- 往来记录，供用户逐句查看
  transcript jsonb not null,
  -- 真人是否接管。null = 还没决定，这是绝大多数记录的最终状态，且完全正常。
  taken_over_at timestamptz,
  created_at timestamptz not null default now()
);
create index rehearsal_seeker_idx on rehearsal (seeker_id, created_at desc);

-- ============================================================
-- 成员邀请态
-- ============================================================
-- ADR-0002：确认即过滤。发起组队或收到邀请，确认加入即可；
-- 不确认就是不合适，系统不需要知道原因。确认之后仍可退出。
--
-- 用 state 而不是「joined_at 为 null 表示未确认」：
-- 后者把一个业务状态藏在时间戳的可空性里，读代码的人要靠猜。
create type membership_state as enum ('invited', 'joined', 'left');

alter table membership add column state membership_state not null default 'joined';
alter table membership add column invited_at timestamptz;

-- 已在册成员的判定必须只认 joined。
-- 若把 invited 也算作成员，被邀请者在确认之前就能读到池塘全部内容 ——
-- 那等于任何人都可以靠发邀请来窥探别人的对话。
create or replace function is_pool_member(target_pool uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membership m
    where m.pool_id = target_pool
      and m.person_id = current_person_id()
      and m.state = 'joined'
  )
$$;

-- 被邀请者要能看到「有人邀请我」这件事本身，但看不到池塘内容
create policy membership_read_own_invite on membership for select
  using (person_id = current_person_id());

alter table rehearsal enable row level security;

-- 预演记录只有发起方可见。被匹配方不该知道有人对他跑过预演 ——
-- 那是一次未发生的接触，暴露它等于把「我考虑过你但没找你」变成一条通知。
create policy rehearsal_read_own on rehearsal for select
  using (seeker_id = current_person_id());

grant select on rehearsal to authenticated;
