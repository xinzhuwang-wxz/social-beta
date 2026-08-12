-- 成员可以往自己所在的池塘写事件流
--
-- 这条策略同时把红线三「AI 永不代答」从测试断言下沉成数据库约束：
-- with check 要求 actor_id 必须等于调用者本人。于是
--   - 冒充别人发言：数据库拒绝
--   - 以精灵身份发言（actor_id 为空）：数据库拒绝
-- 只有绕过 RLS 的系统通道才能写 actor_id 为空的条目，而那条通道只用于发卡，
-- 且卡的 kind 是 'card'，与人的 'message' 在类型上就分开。
--
-- 此前这条红线只由 TypeScript 保证：引擎里不存在写空 actor 的消息路径。
-- 那是一句关于「我们没写那样的代码」的断言，而不是关于「那样的写入不可能」的保证。

create policy episode_write_member on episode for insert
  with check (
    actor_id = current_person_id()
    and is_pool_member(pool_id)
  );

grant insert on episode to authenticated;

-- 回流物同理：只有在册成员能传，且必须署自己的名
create policy artifact_write_member on artifact for insert
  with check (
    author_id = current_person_id()
    and is_pool_member(pool_id)
  );

grant insert on artifact to authenticated;
