-- 行动确认卡 / 邀请回应 / 当天状态
--
-- 与 0011 分开，是因为 ALTER TYPE ADD VALUE 加的枚举值不能在同一事务里使用。

-- ============================================================
-- 状态机放行 forming/active → planned → done
-- ============================================================
create or replace function pool_guard_transition() returns trigger
language plpgsql as $$
begin
  if old.state = new.state then return new; end if;
  if not (
       (old.state = 'open'     and new.state in ('matching','done'))
    or (old.state = 'matching' and new.state in ('forming','open','done'))
    or (old.state = 'forming'  and new.state in ('active','planned','done'))
    or (old.state = 'active'   and new.state in ('planned','done'))
    -- 花苞可以退回生长：有人退出、计划有变，都该允许回到讨论
    or (old.state = 'planned'  and new.state in ('active','done'))
    or (old.state = 'done'     and new.state in ('dormant'))
    or (old.state = 'dormant'  and new.state in ('matching'))
  ) then
    raise exception '非法的池塘状态转移: % -> %', old.state, new.state;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ============================================================
-- 行动确认卡
-- ============================================================
-- PRD 要求的字段：名称、日期时间、集合地点、成员、路线流程、需准备物品、
-- 任务与负责人、预算、临时变更处理方式。
--
-- 时间在这里是**具体值**而不是自由文本 —— 与意图阶段刻意不同。
-- 意图阶段说「这周末」是对的（ADR-0002：那时不该逼人精确）；
-- 但到了确认卡，含糊就是没确认。这正是这张卡存在的意义：
-- 把「有空一起」变成「周六 6:00 北宫门」。
create table action_plan (
  pool_id       uuid primary key references pool (id) on delete cascade,
  title         text not null,
  starts_at     timestamptz not null,
  meet_at       text not null,
  route         text,
  bring         text[] not null default '{}',
  budget        text,
  change_policy text,
  -- 谁起草的。草稿由 AI 从聊天里汇总，但必须有人提交
  drafted_by    uuid references person (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 任务分工：谁负责什么，什么时候前完成
create table plan_task (
  id         uuid primary key default uuid_generate_v4(),
  pool_id    uuid not null references pool (id) on delete cascade,
  what       text not null,
  owner_id   uuid references person (id) on delete set null,
  due_hint   text,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index plan_task_pool_idx on plan_task (pool_id);

-- 全员确认。**所有参与者都确认后**池塘才进入 planned（花苞）——
-- 一个人拍板不算共同承诺。
create table plan_confirmation (
  pool_id      uuid not null references pool (id) on delete cascade,
  person_id    uuid not null references person (id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (pool_id, person_id)
);

-- ============================================================
-- 邀请回应：四个选项，不只是「加入」
-- ============================================================
-- PRD 给了四个：愿意加入 / 感兴趣但需调整条件 / 这次不合适 / 以后类似的提醒我。
--
-- 后三个不是礼貌性的装饰：
--   adjust  给了「想去但条件不合」一个出口，避免它被迫表达成「不合适」
--   later   把一次拒绝转化成一条长期信号，而不是彻底丢失
-- 只有「加入」一个选项时，所有非加入的意图都塌缩成沉默，
-- 而沉默是不可区分的 —— 系统学不到任何东西。
create type invite_response as enum ('join', 'adjust', 'decline', 'later');

create table invite_reply (
  pool_id     uuid not null references pool (id) on delete cascade,
  person_id   uuid not null references person (id) on delete cascade,
  response    invite_response not null,
  -- adjust 时说明想调整什么
  note        text,
  created_at  timestamptz not null default now(),
  primary key (pool_id, person_id)
);
create index invite_reply_person_idx on invite_reply (person_id, created_at desc);

-- ============================================================
-- 当天状态
-- ============================================================
-- PRD 首版明确不做持续定位，只要轻量状态。
create type day_status as enum ('ready', 'departed', 'arrived', 'changed');

create table participant_status (
  pool_id    uuid not null references pool (id) on delete cascade,
  person_id  uuid not null references person (id) on delete cascade,
  status     day_status not null,
  note       text,
  updated_at timestamptz not null default now(),
  primary key (pool_id, person_id)
);

-- ============================================================
-- 提醒
-- ============================================================
-- 提醒是「计划已确认」之后才有意义的东西，所以它依赖 action_plan.starts_at。
-- 记录已发过什么，避免重复打扰 —— 重复提醒比不提醒更让人想关掉通知。
create type reminder_kind as enum ('day_before', 'morning_of', 'gather_soon');

create table reminder_sent (
  pool_id uuid not null references pool (id) on delete cascade,
  kind    reminder_kind not null,
  sent_at timestamptz not null default now(),
  primary key (pool_id, kind)
);

-- ============================================================
-- RLS
-- ============================================================
alter table action_plan        enable row level security;
alter table plan_task          enable row level security;
alter table plan_confirmation  enable row level security;
alter table invite_reply       enable row level security;
alter table participant_status enable row level security;
alter table reminder_sent      enable row level security;

create policy action_plan_members on action_plan for select using (is_pool_member(pool_id));
create policy plan_task_members   on plan_task   for select using (is_pool_member(pool_id));
create policy plan_conf_members   on plan_confirmation for select using (is_pool_member(pool_id));
create policy status_members      on participant_status for select using (is_pool_member(pool_id));
create policy reminder_members    on reminder_sent for select using (is_pool_member(pool_id));

-- 确认只能确认自己那一份
create policy plan_conf_write_own on plan_confirmation for insert
  with check (person_id = current_person_id() and is_pool_member(pool_id));

-- 当天状态同理
create policy status_write_own on participant_status for all
  using (person_id = current_person_id())
  with check (person_id = current_person_id() and is_pool_member(pool_id));

-- 邀请回应：被邀请者本人可读写。
-- 刻意不让发起方看到 decline/later 的明细 —— 让人知道谁拒绝了自己，
-- 会让所有人倾向于不回应，而沉默比明确的拒绝更糟：
-- 拒绝至少是一条信号，沉默什么都不是。
create policy invite_reply_own on invite_reply for select
  using (person_id = current_person_id());
create policy invite_reply_write_own on invite_reply for insert
  with check (person_id = current_person_id());

-- 任务认领：成员可以认领或标记完成
create policy plan_task_claim on plan_task for update using (is_pool_member(pool_id));

grant select on action_plan, plan_task, plan_confirmation, participant_status, reminder_sent to authenticated;
grant insert on plan_confirmation to authenticated;
grant insert, update, delete on participant_status to authenticated;
grant select, insert on invite_reply to authenticated;
grant update (owner_id, done_at) on plan_task to authenticated;
