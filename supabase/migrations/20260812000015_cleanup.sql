-- S16 架构审查 P3 清理：pool_read 里从未生效过的那半条策略
--
-- pool_read 原本是：
--   is_pool_member(id)
--   or (kind = 'intent' and state in ('open','matching') and campus_id = current_campus_id())
--
-- 后半条是留给「意图广场」的：还没成行的意图应该同校区可见。但意图广场
-- 从一开始走的就是独立的 intent 表（见 0002 的 intent_read_board 策略），
-- 不是 pool 表——pool.kind 这个枚举虽然定义了 intent / activity / crew / dyad
-- 四个值，但全仓搜一遍 `insert into pool`，只会看到 kind = 'activity'。
-- crew、dyad 是 M6 才会落地的范围；intent 阶段的东西从设计上就不会、
-- 也不需要被写进 pool 表。
--
-- 也就是说 `kind = 'intent' and state in ('open','matching')` 这个条件
-- 从写下的第一天起就没有被任何一行数据满足过，将来也不会——只要 M6 之前
-- 都没有代码往 pool 里插 kind='intent' 的行。留着它的成本不是它错了，
-- 而是每个读到这段 SQL 的人都要重新推一遍「这条到底在守什么」，
-- 得到的答案永远是「什么都没守」。删掉它，把 pool_read 收窄成唯一
-- 真实生效的那半条：在册成员可读。
--
-- 等 M6 真的开始往 pool 里写 crew / dyad 行、且这些池塘需要「非成员也能看到」
-- 的读取场景时，再开一条新的 migration 为那时候的真实需求补策略——
-- 不要在需求出现之前先猜一个占位条件占着。

drop policy pool_read on pool;

create policy pool_read on pool for select
  using (is_pool_member(id));
