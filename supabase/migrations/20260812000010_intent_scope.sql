-- 意图的匹配范围：校区不再是硬墙
--
-- 原设计把 campus 当作「第一道墙」，理由是见面成本。但这与 ADR-0002 自己的原则冲突：
-- 误判的代价不对称 —— 筛掉一个合适的人，用户永远看不到，也无从申诉。
-- 一个想找跨校队友的人（比赛组队、线上协作），系统直接把人筛没了。
--
-- 也不该简单全开：爬山、吃饭、自习确实同校才有意义，把外校的人混进来
-- 是另一种形式的浪费用户注意力。
--
-- 所以让每条意图自己声明，默认放开 —— 需要收窄的人自己收窄，
-- 而不是让系统替所有人假设。这与「确认即过滤」是同一条思路：
-- 把判断交给知道答案的那个人。

create type intent_scope as enum ('campus', 'open');

alter table intent add column scope intent_scope not null default 'open';

-- 广场的可见性跟着放开：能被匹配到，就该能在广场上被浏览到。
-- 两套规则不一致时，用户会看到「系统推了我一个广场上根本找不到的人」。
drop policy intent_read_board on intent;
create policy intent_read_board on intent for select
  using (
    person_id = current_person_id()
    or (
      pool_id is null
      and expires_at > now()
      and (scope = 'open' or campus_id = current_campus_id())
    )
  );

-- 召回时按范围过滤需要这个索引形状
drop index if exists intent_live_idx;
create index intent_live_idx on intent (scope, campus_id, domain, expires_at)
  where pool_id is null;

-- 可见性要传递：能看到那条开放意图，就该看得到发它的人是谁。
--
-- 否则会出现一种很难排查的症状 —— 策略允许读意图，但 `join person` 被
-- person 的同校区策略整行过滤掉，于是意图「存在但查不出来」。
-- 这类跨表可见性不一致，比直接拒绝更难发现，因为没有任何报错。
--
-- 只暴露 display_name 级别的信息（person 表本身不含隐私字段，
-- 画像在 facet 里，仍受 facet_read_disclosable 管辖）。
drop policy person_read on person;
create policy person_read on person for select
  using (
    auth_user_id = auth.uid()
    or campus_id = current_campus_id()
    or exists (
      select 1 from intent i
      where i.person_id = person.id
        and i.scope = 'open'
        and i.pool_id is null
        and i.expires_at > now()
    )
    -- 同池塘的人当然互相可见
    or exists (
      select 1 from membership m1
      join membership m2 on m2.pool_id = m1.pool_id
      where m1.person_id = person.id and m2.person_id = current_person_id()
    )
  );
