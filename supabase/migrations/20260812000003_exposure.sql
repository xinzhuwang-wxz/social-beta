-- 曝光记录：谁被推给了谁。
--
-- 存在的唯一目的是给「每人每日被推荐次数」设上限。
-- 没有这个上限，热门用户会在模拟阶段就被榨干 —— 而问题会被掩盖到线上才爆，
-- 那时受害的是真实用户的收件箱。
--
-- 刻意不做成通用的埋点表：它只服务于饱和惩罚这一个用途，
-- 一旦变成「什么都往里塞」的日志表，保留期和隐私边界就都说不清了。

create table exposure (
  id           uuid primary key default uuid_generate_v4(),
  -- 看到推荐的人
  seeker_id    uuid not null references person (id) on delete cascade,
  -- 被推荐出去的人
  shown_person uuid not null references person (id) on delete cascade,
  -- 触发这次推荐的意图
  intent_id    uuid references intent (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- 上限查询是「某人最近一天被推了几次」，索引按这个形状建
create index exposure_shown_recent_idx on exposure (shown_person, created_at desc);
create index exposure_seeker_idx on exposure (seeker_id, created_at desc);

alter table exposure enable row level security;

-- 只有本人能看到自己被推荐给了谁。这是隐私信息：
-- 「谁看过你」在社交产品里是敏感数据，不该对推荐方可见。
create policy exposure_read_own on exposure for select
  using (shown_person = current_person_id());

-- 写入只经 PoolEngine 的系统通道，不给客户端权限 ——
-- 允许客户端写就等于允许它伪造曝光记录把竞争者刷到上限之外。
grant select on exposure to authenticated;
