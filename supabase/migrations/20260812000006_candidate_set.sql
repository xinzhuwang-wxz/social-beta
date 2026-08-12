-- 候选集：把「生成一批候选」和「查看候选」分开。
--
-- 此前候选页在 Server Component 渲染路径上直接跑漏斗，于是每次刷新、后退、
-- RSC 重渲染都 = 一次 embedding + 一次 LLM 终排 + 若干行曝光记录。
-- 刷三次页面就能烧掉那几个人当日曝光配额的一大截 —— 而他们什么都没做错，
-- 用户也没看到任何新东西。曝光上限存在的全部意义因此被渲染路径架空。
--
-- 拆开之后：读是幂等的纯查询，只有用户显式点「换一批」才生成新批次并计曝光。

create table candidate_set (
  id         uuid primary key default uuid_generate_v4(),
  intent_id  uuid not null references intent (id) on delete cascade,
  seeker_id  uuid not null references person (id) on delete cascade,
  -- 第几批。用户点一次「换一批」加一，让「我看过哪些」可追溯。
  batch_no   int  not null,
  -- 整批候选卡，含打分明细与生成的理由
  candidates jsonb not null,
  created_at timestamptz not null default now(),
  unique (intent_id, batch_no)
);
create index candidate_set_latest_idx on candidate_set (intent_id, batch_no desc);

alter table candidate_set enable row level security;

-- 只有发起者能看自己的候选集。
-- 被推荐的人不该知道自己出现在谁的候选里 —— 那是一次未发生的接触。
create policy candidate_set_read_own on candidate_set for select
  using (seeker_id = current_person_id());

grant select on candidate_set to authenticated;
