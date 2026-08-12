-- 可披露切面：把「谁能看到谁的哪些切面」写成一处规则
--
-- 此前这个规则只存在于 facet 的 RLS 策略里，而策略的第一条是
-- `person_id = current_person_id()` —— 本人看自己是全量。
-- 于是预演时 seeker 用自己的身份查自己，把 private 切面也拿到了，
-- 然后原样进了自己 Agent 的 prompt、进了往来记录、进了对方 Agent 的输入。
--
-- 红线测试只验了「我看候选人」那一侧（那侧是对的），
-- 「我的 Agent 替我说」这一侧无人看守。
--
-- 产品承诺的原文是「我的 AI 只带我授权可披露的切面去和对方 AI 交流」——
-- 对外那一份必须按对方的视角裁剪，即使它属于我自己。

create or replace function facets_disclosable_to(owner uuid, viewer uuid)
returns table (domain text, summary text, traits jsonb, n_pools int, visibility text)
language sql stable security definer set search_path = public as $$
  select f.domain, f.summary, f.traits, f.n_pools, f.visibility
  from facet f
  where f.person_id = owner
    and (
      f.visibility = 'public'
      or (f.visibility = 'campus'
          and (select campus_id from person where id = owner)
            = (select campus_id from person where id = viewer))
      or (f.visibility = 'warm'
          and coalesce((
            select max(r.temperature) from relation r
            where (r.a_id = owner and r.b_id = viewer)
               or (r.b_id = owner and r.a_id = viewer)
          ), 0) >= 1.0)
    )
  order by f.n_pools desc
$$;

grant execute on function facets_disclosable_to(uuid, uuid) to authenticated;

-- 顺带收窄 facet 的 update 权限。
--
-- 原本是整行 update，用户可以直接改自己的 n_pools 和 embedding。
-- n_pools 会以「基于 N 次活动」的形式进入别人 Agent 的 prompt，
-- 是一个可被自己抬高的可信度指标 —— 而可信度指标一旦可以自填，
-- 它就不再是可信度指标了。
revoke update on facet from authenticated;
grant update (summary, visibility) on facet to authenticated;
