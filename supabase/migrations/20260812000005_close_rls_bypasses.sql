-- 堵上三处「隐私边界落在代码里而不是 RLS 里」的缺口
--
-- 这些不是新功能，是把已经存在的约束从 TypeScript 断言下沉到数据库。
-- 区别在于：TS 里的约束只在调用方走对路径时成立，
-- 数据库里的约束对所有路径成立，包括将来某个人图省事直接连库的那条。

-- ============================================================
-- 1. person 允许本人建档
-- ============================================================
-- 此前 person 只有 select / update 策略与授权，没有 insert ——
-- 于是 registerPerson 只能走绕过 RLS 的系统通道，
-- 安全性完全依赖一行「插入时把 auth_user_id 写成调用者」的 TS 代码。
-- 数据库侧零兜底：任何绕过那行代码的写入都能给别人建档。
create policy person_insert_self on person for insert
  with check (auth_user_id = auth.uid());
grant insert on person to authenticated;

-- 本人永远看得见自己，与校区无关。
--
-- 原策略只有 `campus_id = current_campus_id()`。这在建档那一刻会失败：
-- INSERT ... RETURNING 同时要求通过 SELECT 策略，而 current_campus_id() 是 STABLE 函数，
-- 看到的是语句开始时的快照 —— 里面还没有正在插入的这一行，于是它返回 NULL，
-- 比较结果是 NULL 而不是 true，整条建档被拒。
--
-- 补这一条不只是为了让建档跑通：「一个人看得见自己」本来就是不该依赖校区的语义。
drop policy person_read_same_campus on person;
create policy person_read on person for select
  using (auth_user_id = auth.uid() or campus_id = current_campus_id());

-- ============================================================
-- 2. campus_id 建档后不可改
-- ============================================================
-- campus 是匹配的第一道墙：person 可见性、意图广场、facet 的 campus 档、
-- 匹配硬过滤，四处都吃这个值。
-- 而 person_write_self 此前是整行 update 授权，用户可以随时把自己改到别的校区，
-- 于是「campus 切面只给同校区看」实际是「你报哪个校区就给你看哪个」。
--
-- 真正的解法是邮箱域名映射到校区，那是后面的事。
-- 现在先让它建档后不可改 —— 至少把「随时切换」这条路堵死。
revoke update on person from authenticated;
grant update (display_name, avatar_uri) on person to authenticated;

-- ============================================================
-- 3. 曝光记录去重
-- ============================================================
-- 候选页在 GET 渲染路径上跑漏斗，刷新一次就重复写一轮曝光，
-- 几次刷新就能烧掉某个人当日配额的一大截 —— 而他什么都没做错。
-- 读写分离在应用层做，这里是数据库侧的兜底：同一个人为同一条意图
-- 被推给同一个人，只算一次。
delete from exposure a using exposure b
  where a.ctid > b.ctid
    and a.seeker_id = b.seeker_id
    and a.shown_person = b.shown_person
    and a.intent_id is not distinct from b.intent_id;

create unique index exposure_unique_idx
  on exposure (seeker_id, shown_person, intent_id);
