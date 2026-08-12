-- 投递制：种子发给多人，候选先表态，发起人在愿意的人里选
--
-- 原设计是「挑选制」：发起人拿到候选卡 → 挑一个 → 预演 → 接管 → 对方确认。
-- 问题在于**发起人把勇气花在一次抛硬币上** —— 挑中的人可能根本不回，
-- 而「不知道对方会不会回应」正是本产品要解决的第二个痛点。
--
-- 投递制把顺序倒过来：种子先发出去，候选各自表态，发起人只在
-- 已经说了「愿意」的人里选。从结构上消灭了石沉大海。
--
-- 代价是从同步变异步（发起人要等），这个代价值得付。

create type seed_delivery_state as enum ('delivered', 'willing', 'declined', 'chosen', 'closed');

create table seed_delivery (
  intent_id  uuid not null references intent (id) on delete cascade,
  -- 收到这颗种子的人
  person_id  uuid not null references person (id) on delete cascade,
  state      seed_delivery_state not null default 'delivered',
  /** 表达愿意时可附的一句留言 */
  note       text,
  /** AI 给发起人看的推荐理由。候选人自己看不到，避免变成「我为什么被选中」的攀比 */
  reason     text,
  /** 打分明细，仅用于发起人侧排序与线上归因 */
  score      jsonb,
  delivered_at timestamptz not null default now(),
  replied_at   timestamptz,
  primary key (intent_id, person_id)
);
create index seed_delivery_person_idx on seed_delivery (person_id, state, delivered_at desc);
create index seed_delivery_intent_idx on seed_delivery (intent_id, state);

-- 种子需要几个同行者。
--
-- PRD 写的是「发起人亲自选择一名同行者」，与种子自己的「需要多少人」矛盾 ——
-- 四个人的爬山局要选三个。按需要人数收满为止，收满才停止匹配。
alter table intent add column needed int not null default 1
  check (needed between 1 and 8);
-- 已选中几个。收满即停止投递。
alter table intent add column chosen_count int not null default 0;

alter table seed_delivery enable row level security;

-- 候选人只看得到发给自己的那一份，**且看不到 reason 与 score**。
--
-- 规则来自 PRD：不向候选人展示排名、竞争人数或最终被选择者。
-- 这不是客套 —— 一个能看到自己「排第几」的人，下次就不会再表达愿意了。
create policy seed_delivery_read_own on seed_delivery for select
  using (person_id = current_person_id());

-- 发起人看得到自己那颗种子的全部投递情况
create policy seed_delivery_read_owner on seed_delivery for select
  using (
    exists (
      select 1 from intent i
      where i.id = seed_delivery.intent_id and i.person_id = current_person_id()
    )
  );

-- 候选人只能改自己那一份的状态（表达愿意或不感兴趣）
create policy seed_delivery_reply on seed_delivery for update
  using (person_id = current_person_id());

grant select on seed_delivery to authenticated;
grant update (state, note, replied_at) on seed_delivery to authenticated;

-- 候选人侧的视图：**刻意不含 reason 与 score**。
-- 把「不展示」做成一个查不到的视图，而不是在应用层记得别 select 那两列 ——
-- 后者迟早会有人忘。
create or replace view my_seed_inbox as
  select d.intent_id, d.state, d.note, d.delivered_at, d.replied_at,
         i.raw_text, i.domain, i.slots, i.needed, i.expires_at,
         i.person_id as seeker_id, p.display_name as seeker_name
  from seed_delivery d
  join intent i on i.id = d.intent_id
  join person p on p.id = i.person_id
  where d.person_id = current_person_id()
    and i.expires_at > now();

grant select on my_seed_inbox to authenticated;
