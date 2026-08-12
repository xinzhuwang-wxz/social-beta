-- 双方完成确认 + 共同回忆的双向门控（PRD v2 阶段七、八）
--
-- 此前 finishEvent 是「一个成员点了就转 done」——单方面就能把整个池塘
-- 推进到回忆与评价阶段，另一个人可能压根不同意「这件事办完了」。
-- 这条迁移把「完成」从一次单方动作变成一个需要全员确认的小状态机，
-- 手法与 0011/0012 的 action_plan / plan_confirmation 完全一致：
-- 一张「谁确认了」的表 + 全员确认才推进状态机，而不是新开一个 pool_state 分支。

-- ============================================================
-- 1. 完成确认：每人一条，全员确认才转 done
-- ============================================================
create table completion_confirmation (
  pool_id      uuid not null references pool (id) on delete cascade,
  person_id    uuid not null references person (id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (pool_id, person_id)
);

alter table completion_confirmation enable row level security;

create policy completion_conf_members on completion_confirmation for select
  using (is_pool_member(pool_id));

create policy completion_conf_write_own on completion_confirmation for insert
  with check (person_id = current_person_id() and is_pool_member(pool_id));

-- 撤回确认：点错了、活动其实没办成，允许本人撤回自己那一条。
-- 只能撤自己的——「我觉得没办完」不该由别人替你决定，也不能替别人撤。
create policy completion_conf_delete_own on completion_confirmation for delete
  using (person_id = current_person_id());

grant select, insert, delete on completion_confirmation to authenticated;

-- ============================================================
-- 2. 私密评价：扩展 feedback，加两个可选字段
-- ============================================================
-- again（是否愿意再次组队）与 note 已经存在（0008）。这里补的是
-- PRD 要求的另外两项：照片（可选的回忆素材，不是完成证明）与
-- 自己的文字（一段感想，与「私密备注」note 分开写，各自意图不同：
-- note 更像是给系统/未来的自己留一句操作性的话，reflection 是这次经历本身的记录）。
--
-- 两个字段都可选，且都走既有的 feedback RLS（只本人可读可写）——
-- 私密评价的隐私边界不因为多了两个字段而改变。
alter table feedback add column photo_uri text;
alter table feedback add column reflection text;

-- ============================================================
-- 3. 森林里对外可见的共同回忆：双向门控
-- ============================================================
-- 池塘内部的 recap（episode kind='recap'，由 sealPool 写入）不受这条门控——
-- 成员本就都在场，已经知道发生了什么，压根不存在「要不要说」的问题。
--
-- 这张视图门的是「对外」的那一份：会离开池塘上下文、被摆进个人主页森林、
-- 单独被除了在场者之外的人看到的版本。任一方在私密评价里选了「不愿意再次组队」，
-- 双方都不该生成这一份——但**不能**通过「不查」来实现，那是应用层记得，
-- 记得的事情迟早有人忘。所以门控写进这张视图的 where 子句本身。
--
-- 关键设计：这条 where 子句只问「存不存在一条 again='no' 的反馈」，
-- 从不 select 反馈是谁写的。查询这张视图的任何人，包括池塘内的另一方，
-- 都只能看到「这份共同回忆有/没有」，永远看不到是谁让它消失的——
-- 这条隐私边界必须在这里兑现，不是靠应用层不去查 feedback 的内容。
create or replace view forest_recap as
  select e.pool_id, e.summary,
         e.occurred_at as "createdAt",
         p.title, p.domain,
         p.occurred_at as "activityAt"
  from episode e
  join pool p on p.id = e.pool_id
  where e.kind = 'recap'
    and is_pool_member(e.pool_id)
    and not exists (
      select 1 from feedback f where f.pool_id = e.pool_id and f.again = 'no'
    );

grant select on forest_recap to authenticated;

-- ============================================================
-- 4. 回流物：各自管理自己上传的，不能改对方的
-- ============================================================
-- 此前 artifact 只有 insert（0007）与 select（0001）授权，没有 delete——
-- 共同回忆是共享的容器，但容器里每一件东西的归属权仍是个人的：
-- 传错了、不想要了，本人应该能撤下自己那一张，且不能动别人传的那些。
create policy artifact_delete_own on artifact for delete
  using (author_id = current_person_id());

grant delete on artifact to authenticated;
