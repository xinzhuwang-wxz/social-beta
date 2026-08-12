-- 事件结束后的反馈
--
-- 这是关系温度与 responsiveness 的真实来源。没有它，两者只能靠消息条数估算 ——
-- 而消息多不等于合得来：约得最久的那次可能全程在扯皮。
--
-- 刻意做得很轻：一个「还想再一起吗」的三档 + 一句可选的话。
-- 让人写长篇评价的表单没人填，而填不了的反馈等于没有反馈。

create type feedback_again as enum ('yes', 'maybe', 'no');

create table feedback (
  pool_id    uuid not null references pool (id) on delete cascade,
  person_id  uuid not null references person (id) on delete cascade,
  again      feedback_again not null,
  note       text,
  created_at timestamptz not null default now(),
  primary key (pool_id, person_id)
);
create index feedback_person_idx on feedback (person_id, created_at desc);

alter table feedback enable row level security;

-- 只有本人看得到自己写了什么。
--
-- 反馈对同伴不可见是刻意的：让人知道队友怎么评价自己，会让所有人只写好话，
-- 而那样的数据对排序毫无用处。它服务于系统的判断，不服务于社交表演。
create policy feedback_own on feedback for select
  using (person_id = current_person_id());

create policy feedback_write_own on feedback for insert
  with check (person_id = current_person_id() and is_pool_member(pool_id));

-- 可以改主意。刚散场时的感受和第二天的判断常常不一样，
-- 而锁死第一次填的答案只会让人干脆不填。
create policy feedback_update_own on feedback for update
  using (person_id = current_person_id());

grant select, insert, update on feedback to authenticated;
