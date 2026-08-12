import { asPerson, toVector, type Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'
import { SILENT, type AgentCard, type Domain, type InterventionDecision, type PoolRole, type Visibility } from '@pool/shared'
import {
  listBoard,
  listMyIntents,
  prepareIntent,
  insertIntent,
  type BoardItem,
  type IntentRecord,
  type PreparedIntent,
} from './intent-service'
import { findCandidates, type Candidate } from './matcher-service'
import { disclosureProfileFor, rehearse, type RehearsalResult } from './rehearsal-service'
import {
  confirmJoin,
  leavePool,
  takeOver,
  type RehearsalRecord,
} from './takeover-service'
import {
  decideIntervention,
  makeIcebreaker,
  makeRoster,
  readPulse,
} from './spirit-service'
import {
  makeWakeCard,
  poolsDueForWake,
  sealPool,
} from './recap-service'
import {
  distillPerson,
  membersOf,
  recomputeRelations,
  wipeL2,
} from './distiller-service'

/**
 * PoolEngine —— 本仓库唯一的业务门面，也是唯一的测试缝。
 *
 * 产品做的每一件事，本质上都是 Pool（或将成为 Pool 的 Intent）上的一次状态转移。
 * 把它们全部收敛到这一个对象上，换来三件事：
 *
 * 1. 测试只打这一个面，跑在真实 Postgres 上，只把 ModelGateway 换成录制回放。
 * 2. HTTP handler 与 server action 退化成薄适配器，不含业务逻辑 ——
 *    这条是可检查的：抽查任一 route，里面不应有 if/else 的业务分支。
 * 3. `seed/simulate.ts` 的 1000 人模拟驱动的是同一条缝，不是旁路写库。
 *    这让模拟数据不是假数据，而是同一条链路的产物。
 */
export interface PoolEngineDeps {
  sql: Sql
  model: ModelGateway
}

export interface ActorContext {
  /** Supabase auth 用户 id。RLS 策略据此裁剪可见数据。 */
  authUserId: string
}

export class PoolEngine {
  constructor(private readonly deps: PoolEngineDeps) {}

  get model(): ModelGateway {
    return this.deps.model
  }

  /**
   * 以调用者身份执行一段读写，RLS 生效。
   *
   * 所有面向用户的操作都必须经这里。绕过它直连会跳过全部 RLS ——
   * 而 RLS 是隐私边界的实现，不是可选的加固。
   */
  private async act<T>(actor: ActorContext, fn: (tx: Sql) => Promise<T>): Promise<T> {
    return asPerson(this.deps.sql, actor.authUserId, fn)
  }

  /**
   * 系统任务通道：蒸馏、模拟、定时唤醒。
   *
   * 刻意起一个显眼的名字，因为它绕过 RLS。任何用它承载面向用户的读写
   * 都是缺陷 —— code review 时看到这个方法名就该停下来问为什么。
   */
  private async asSystem<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
    return fn(this.deps.sql)
  }

  // ==========================================================
  // 人
  // ==========================================================

  /**
   * 注册后建立 person 记录。
   *
   * 刻意不接受任何画像字段：没有兴趣标签、没有自我介绍、没有技能列表。
   * Profile 是结果不是输入 —— 它会从这个人参与过的池塘里长出来。
   * 让注册接口能接收画像，就是在给「填资料」这个错误设计留后门。
   */
  async registerPerson(
    actor: ActorContext,
    input: { handle: string; displayName: string; campusId: string },
  ): Promise<PersonRecord> {
    return this.act(actor, async (tx) => {
      const rows = await tx<PersonRecord[]>`
        insert into person (auth_user_id, handle, display_name, campus_id)
        values (${actor.authUserId}, ${input.handle}, ${input.displayName}, ${input.campusId})
        returning id, handle, display_name as "displayName", campus_id as "campusId"
      `
      const person = rows[0]
      if (!person) throw new Error('注册失败：person 未写入')
      return person
    })
  }

  /** 当前登录者。未注册返回 null —— 调用方需要区分「没登录」和「登录了但没建档」。 */
  async currentPerson(actor: ActorContext): Promise<PersonRecord | null> {
    return this.act(actor, async (tx) => {
      const rows = await tx<PersonRecord[]>`
        select id, handle, display_name as "displayName", campus_id as "campusId"
        from person where auth_user_id = ${actor.authUserId}
      `
      return rows[0] ?? null
    })
  }

  /**
   * 一个人的全部池塘 —— 「我是谁」的实现。
   *
   * 注意这不是读一张 profile 表，而是沿 membership → pool → episode 走一遍。
   * 人就是他参与过的事件的集合，这个查询是那句话的字面实现。
   */
  async myPools(actor: ActorContext): Promise<PoolSummary[]> {
    return this.act(actor, async (tx) => {
      return tx<PoolSummary[]>`
        select p.id, p.kind, p.state, p.domain, p.title,
               p.next_hook as "nextHook", p.occurred_at as "occurredAt",
               (select count(*)::int from membership m2 where m2.pool_id = p.id and m2.left_at is null) as "memberCount",
               (select count(*)::int from artifact a where a.pool_id = p.id) as "artifactCount"
        from membership m
        join pool p on p.id = m.pool_id
        where m.person_id = (select id from person where auth_user_id = ${actor.authUserId})
          and m.left_at is null
        order by coalesce(p.occurred_at, p.created_at) desc
      `
    })
  }

  // ==========================================================
  // 意图
  // ==========================================================

  /**
   * 发布一条意图。用户说一句人话即可，不填表。
   *
   * 注意这里先取 person 再进事务：抽取与向量化要打两次模型，
   * 把它们放在事务里会让连接被长时间占住，而它们本来也不需要事务保护。
   */
  async publishIntent(actor: ActorContext, rawText: string): Promise<IntentRecord> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档，无法发布意图')
    // 抽取与向量化在事务外完成 —— 它们要打两次模型，放进事务会长时间占住连接。
    // 但落库必须走用户身份，让 intent_write_own 策略生效：
    // 「模型调用别占事务」不是绕过 RLS 的理由。
    const prepared = await prepareIntent({ model: this.deps.model }, rawText)
    return this.act(actor, (tx) => insertIntent(tx, me.id, me.campusId, prepared))
  }

  /**
   * 意图广场。可见性完全由 RLS 决定，这里不再写一遍过滤条件 ——
   * 两套规则迟早不一致，届时以哪套为准会变成没人答得上来的问题。
   */
  async board(actor: ActorContext, opts: { domain?: Domain; limit?: number } = {}): Promise<BoardItem[]> {
    return this.act(actor, (tx) => listBoard(tx, opts))
  }

  /** 我发过的意图，含已过期的 —— 用户要看得到自己发过什么。 */
  async myIntents(actor: ActorContext): Promise<BoardItem[]> {
    const me = await this.currentPerson(actor)
    if (!me) return []
    return this.act(actor, (tx) => listMyIntents(tx, me.id))
  }

  // ==========================================================
  // 匹配
  // ==========================================================

  /**
   * 读候选。**幂等，不产生任何副作用** —— 刷新、后退、RSC 重渲染都安全。
   *
   * 没有任何一批时才生成第一批。这是渲染路径唯一允许触发生成的场合，
   * 且只会发生一次。
   */
  async candidatesFor(actor: ActorContext, intentId: string): Promise<Candidate[]> {
    const existing = await this.act(
      actor,
      (tx) => tx<{ candidates: Candidate[] }[]>`
        select candidates from candidate_set
        where intent_id = ${intentId}
        order by batch_no desc limit 1
      `,
    )
    if (existing[0]) return existing[0].candidates
    return this.refreshCandidates(actor, intentId)
  }

  /**
   * 换一批。**有副作用且花钱**：跑一次漏斗、计一次曝光。
   *
   * 只能由用户显式触发。把它和 candidatesFor 分开的理由是：
   * 曝光上限存在的意义是防止热门用户被榨干，而如果生成挂在渲染路径上，
   * 别人刷几次页面就能替他把配额烧掉 —— 他什么都没做错，也无从知晓。
   */
  async refreshCandidates(actor: ActorContext, intentId: string): Promise<Candidate[]> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')

    const candidates = await this.generateCandidates(me, intentId)

    await this.asSystem(
      (tx) => tx`
        insert into candidate_set (intent_id, seeker_id, batch_no, candidates)
        select ${intentId}, ${me.id},
               coalesce((select max(batch_no) from candidate_set where intent_id = ${intentId}), 0) + 1,
               ${tx.json(candidates as never)}
      `,
    )
    return candidates
  }

  /**
   * 跑漏斗本身。
   *
   * 走系统通道而非用户通道：召回要看到全校区的意图池，
   * 而 RLS 的意图广场策略是为「浏览」设计的，不是为召回设计的。
   * 隐私边界在这里由漏斗自身保证 —— 返回的候选卡只含对方主动发布的意图内容。
   */
  private async generateCandidates(
    me: PersonRecord,
    intentId: string,
  ): Promise<Candidate[]> {
    return this.asSystem(async (tx) => {
      const rows = await tx<{ id: string; rawText: string; personId: string }[]>`
        select id, raw_text as "rawText", person_id as "personId"
        from intent where id = ${intentId}
      `
      const intent = rows[0]
      if (!intent) throw new Error('意图不存在')
      // 只能为自己的意图找候选 —— 否则任何人都能拿别人的意图去探测全校区
      if (intent.personId !== me.id) throw new Error('无权为他人的意图匹配')

      const [{ n: poolCount } = { n: 0 }] = await tx<{ n: number }[]>`
        select count(*)::int as n from membership
        where person_id = ${me.id} and left_at is null
      `
      return findCandidates(
        { sql: tx, model: this.deps.model },
        { personId: me.id, campusId: me.campusId, poolCount },
        { id: intent.id, rawText: intent.rawText },
      )
    })
  }

  // ==========================================================
  // 预演与接管
  // ==========================================================

  /**
   * 对某个候选跑一次预演，产出提案卡与往来记录。
   *
   * 按需触发（用户点开某张候选卡时），不随候选列表批量生成 ——
   * 一次匹配返回 3–5 张卡，每张都跑预演就是几十次模型调用。
   *
   * 可披露视图在 act 事务内构造，让 RLS 的 facet_read_disclosable 决定
   * 哪些切面可见。private 切面在 SQL 层就取不到。
   */
  async rehearseWith(
    actor: ActorContext,
    input: { seekerIntentId: string; candidateIntentId: string },
  ): Promise<RehearsalResult & { rehearsalId: string }> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')

    const { seekerProfile, candidateProfile, seekerIntent, candidateIntent, candidateId } =
      await this.act(actor, async (tx) => {
        const [mine] = await tx<{ rawText: string; personId: string }[]>`
          select raw_text as "rawText", person_id as "personId"
          from intent where id = ${input.seekerIntentId}
        `
        if (!mine || mine.personId !== me.id) throw new Error('无权使用他人的意图发起预演')

        const [theirs] = await tx<{ rawText: string; personId: string }[]>`
          select raw_text as "rawText", person_id as "personId"
          from intent where id = ${input.candidateIntentId}
        `
        if (!theirs) throw new Error('候选意图不存在或不可见')

        return {
          seekerProfile: await disclosureProfileFor(tx, me.id),
          candidateProfile: await disclosureProfileFor(tx, theirs.personId),
          seekerIntent: mine.rawText,
          candidateIntent: theirs.rawText,
          candidateId: theirs.personId,
        }
      })

    const result = await rehearse(
      { sql: this.deps.sql, model: this.deps.model },
      { profile: seekerProfile, intent: seekerIntent },
      { profile: candidateProfile, intent: candidateIntent },
    )

    const [row] = await this.asSystem(
      (tx) => tx<{ id: string }[]>`
        insert into rehearsal (seeker_id, candidate_id, seeker_intent, candidate_intent, proposal, transcript)
        values (${me.id}, ${candidateId}, ${input.seekerIntentId}, ${input.candidateIntentId},
                ${this.deps.sql.json(result.proposal as never)},
                ${this.deps.sql.json(result.transcript as never)})
        returning id
      `,
    )
    if (!row) throw new Error('预演记录写入失败')
    return { ...result, rehearsalId: row.id }
  }

  /**
   * 接管 —— 真人签字，连接才成立。
   *
   * opening 由调用方传入：可能是草稿原文、改过的、或用户完全自己写的。
   * 引擎不关心它来自哪里，只关心它是**真人提交的**。
   */
  async takeOver(
    actor: ActorContext,
    input: { rehearsalId: string; opening: string },
  ): Promise<{ poolId: string }> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    const opening = input.opening.trim()
    if (opening.length === 0) throw new Error('第一句话不能为空')

    return this.asSystem(async (tx) => {
      const [r] = await tx<
        { seekerId: string; candidateId: string; proposal: unknown; takenOverAt: Date | null }[]
      >`
        select seeker_id as "seekerId", candidate_id as "candidateId",
               proposal, taken_over_at as "takenOverAt"
        from rehearsal where id = ${input.rehearsalId}
      `
      if (!r) throw new Error('预演记录不存在')
      // 只有预演的发起者本人能接管。缺了这一条，任何人都能拿别人的预演开池塘。
      if (r.seekerId !== me.id) throw new Error('无权接管他人的预演')
      if (r.takenOverAt) throw new Error('这次预演已经接管过了')

      return takeOver(tx, {
        seekerId: me.id,
        candidateId: r.candidateId,
        campusId: me.campusId,
        rehearsalId: input.rehearsalId,
        proposal: r.proposal as Parameters<typeof takeOver>[1]['proposal'],
        opening,
      })
    })
  }

  /** 我收到的、尚未确认的邀请。 */
  async myInvites(actor: ActorContext): Promise<{ poolId: string; title: string | null; invitedAt: Date }[]> {
    const me = await this.currentPerson(actor)
    if (!me) return []
    return this.act(
      actor,
      (tx) => tx<{ poolId: string; title: string | null; invitedAt: Date }[]>`
        select m.pool_id as "poolId", p.title, m.invited_at as "invitedAt"
        from membership m join pool p on p.id = m.pool_id
        where m.person_id = ${me.id} and m.state = 'invited'
        order by m.invited_at desc
      `,
    )
  }

  /** 确认加入。不确认就是不合适 —— 系统不需要知道原因。 */
  async confirmJoin(actor: ActorContext, poolId: string): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    return this.asSystem((tx) => confirmJoin(tx, poolId, me.id))
  }

  /** 退出池塘。聊下来发现不合适再走，是正常流程。 */
  async leavePool(actor: ActorContext, poolId: string): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    return this.asSystem((tx) => leavePool(tx, poolId, me.id))
  }

  /** 我发起过的预演，供查看「我的 Agent 替我说了什么」。 */
  async myRehearsals(actor: ActorContext): Promise<RehearsalRecord[]> {
    return this.act(
      actor,
      (tx) => tx<RehearsalRecord[]>`
        select id, proposal, transcript, taken_over_at as "takenOverAt"
        from rehearsal order by created_at desc limit 50
      `,
    )
  }

  // ==========================================================
  // 群聊与精灵
  // ==========================================================

  /**
   * 发一条消息。actor_id 必然非空 —— 这是「AI 未代答」的可核验证据。
   *
   * 引擎里不存在 actor_id 为空的消息写入路径。精灵的产物一律是 kind='card'，
   * 与人的发言在类型上就是两回事，不会混进同一个计数。
   */
  async postMessage(actor: ActorContext, poolId: string, text: string): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    const body = text.trim()
    if (body.length === 0) throw new Error('消息不能为空')

    await this.act(actor, async (tx) => {
      // 非在册成员写不进去：RLS 管读，成员校验管写
      const [m] = await tx<{ state: string }[]>`
        select state from membership where pool_id = ${poolId} and person_id = ${me.id}
      `
      if (m?.state !== 'joined') throw new Error('不是这个池塘的成员')
      await tx`
        insert into episode (pool_id, kind, summary, actor_id)
        values (${poolId}, 'message', ${body}, ${me.id})
      `
    })
  }

  /** 池塘时间线：组队 → 改期 → 成行的全过程，人与精灵的动作都在里面。 */
  async poolTimeline(actor: ActorContext, poolId: string): Promise<TimelineEntry[]> {
    return this.act(
      actor,
      (tx) => tx<TimelineEntry[]>`
        select e.id, e.kind, e.summary, e.payload, e.occurred_at as "occurredAt",
               e.actor_id as "actorId", p.display_name as "actorName"
        from episode e left join person p on p.id = e.actor_id
        where e.pool_id = ${poolId}
        order by e.occurred_at asc
      `,
    )
  }

  /**
   * 让精灵看一眼这个池塘，决定要不要出面。
   *
   * 决策是纯函数（不写库、不打模型），只有真的需要发卡时才付代价 ——
   * 而按 ADR-0004，active 阶段绝大多数时候的正确答案是沉默。
   */
  async tickSpirit(poolId: string): Promise<InterventionDecision> {
    return this.asSystem(async (tx) => {
      const pulse = await readPulse(tx, poolId)
      const decision = decideIntervention({
        poolState: pulse.state,
        minutesSinceLastMessage: pulse.minutesSinceLastMessage,
        memberCount: pulse.memberCount,
        cardsSent: pulse.cardsSent,
      })
      if (decision === SILENT || typeof decision === 'object') return SILENT

      const card =
        decision === 'need_icebreaker'
          ? await makeIcebreaker(
              { sql: tx, model: this.deps.model },
              { title: pulse.title, brief: pulse.brief },
              pulse.members,
            )
          : await makeRoster(tx, poolId)

      // 精灵的产物是卡片，不是发言。actor_id 为空正是它的标记。
      await tx`
        insert into episode (pool_id, kind, summary, payload, actor_id)
        values (${poolId}, 'card', ${cardSummary(card)}, ${tx.json(card as never)}, null)
      `
      return { action: 'card', trigger: pulse.state === 'forming' ? 'newcomer' : 'stall', card }
    })
  }

  /**
   * 点击卡片。行为直接写回 episode，不经二次 LLM 解析 ——
   * 既省钱又准确，且不抢占用户之间的互动空间。
   */
  async tapCard(actor: ActorContext, poolId: string, cardId: string, optionId: string): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.act(actor, (tx) => tx`
      insert into episode (pool_id, kind, summary, payload, actor_id)
      values (${poolId}, 'tap', ${optionId}, ${tx.json({ cardId, optionId } as never)}, ${me.id})
    `)
  }

  // ==========================================================
  // 回流与唤醒
  // ==========================================================

  /** 上传回流物。向量化后可按内容检索共同记忆。 */
  async addArtifact(
    actor: ActorContext,
    poolId: string,
    input: { kind: string; uri: string; caption?: string },
  ): Promise<{ id: string }> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')

    // 向量化在事务外 —— 同 publishIntent 的理由
    const [embedding] = input.caption
      ? await this.deps.model.embed([input.caption])
      : [null]

    return this.act(actor, async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into artifact (pool_id, author_id, kind, uri, caption, embedding)
        values (${poolId}, ${me.id}, ${input.kind}, ${input.uri}, ${input.caption ?? null},
                ${embedding ? toVector(embedding) : null}::vector)
        returning id
      `
      if (!row) throw new Error('回流物写入失败')
      return row
    })
  }

  /** 事件成行结束。转 done，等待回流。 */
  async finishEvent(actor: ActorContext, poolId: string): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.asSystem(async (tx) => {
      const [m] = await tx<{ state: string }[]>`
        select state from membership where pool_id = ${poolId} and person_id = ${me.id}
      `
      if (m?.state !== 'joined') throw new Error('不是这个池塘的成员')
      await tx`update pool set state = 'done', occurred_at = coalesce(occurred_at, now()) where id = ${poolId}`
      await tx`
        insert into episode (pool_id, kind, summary, actor_id)
        values (${poolId}, 'happened', '事情办完了', ${me.id})
      `
    })
  }

  /** 留一条反馈。轻到能顺手填完 —— 填不了的反馈等于没有反馈。 */
  async giveFeedback(
    actor: ActorContext,
    poolId: string,
    input: { again: 'yes' | 'maybe' | 'no'; note?: string },
  ): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.act(actor, (tx) => tx`
      insert into feedback (pool_id, person_id, again, note)
      values (${poolId}, ${me.id}, ${input.again}, ${input.note ?? null})
      on conflict (pool_id, person_id) do update set again = excluded.again, note = excluded.note
    `)
  }

  /**
   * 用回流物生成共同海报。
   *
   * 多图融合保持主体一致性 —— 这让海报是「我们那次」的产物，
   * 而不是一张任何人都能生成的模板图。
   */
  async makePoster(poolId: string): Promise<{ id: string }> {
    return this.asSystem(async (tx) => {
      const [pool] = await tx<{ title: string | null }[]>`
        select title from pool where id = ${poolId}
      `
      const photos = await tx<{ uri: string }[]>`
        select uri from artifact where pool_id = ${poolId} and kind = 'photo' limit 6
      `
      if (photos.length === 0) throw new Error('还没有返图，无法生成海报')

      const image = await this.deps.model.image({
        task: 'recap.poster',
        prompt: `把这些照片融成一张纪念海报，主题：${pool?.title ?? '我们的一次出行'}。保持照片里人物与场景的一致性，风格干净，留白处可写标题。`,
        referenceImages: photos.map((p) => p.uri),
      })

      const uri = `data:${image.contentType};base64,${Buffer.from(image.bytes).toString('base64')}`
      const [row] = await tx<{ id: string }[]>`
        insert into artifact (pool_id, author_id, kind, uri, caption)
        values (${poolId}, null, 'poster', ${uri}, '共同海报')
        returning id
      `
      if (!row) throw new Error('海报写入失败')
      return row
    })
  }

  /** 收尾：写 recap、生成 next_hook、转休眠。池塘不销毁，它带着钩子睡着。 */
  async sealPool(poolId: string): Promise<{ summary: string; nextHook: string }> {
    return sealPool({ sql: this.deps.sql, model: this.deps.model }, poolId)
  }

  /** 到期待唤醒的池塘。 */
  async poolsDueForWake(limit = 100): Promise<string[]> {
    return this.asSystem((tx) => poolsDueForWake(tx, limit))
  }

  /** 取某个休眠池塘的唤醒卡。到期才有，否则 null。 */
  async wakeCardFor(poolId: string): Promise<AgentCard | null> {
    return this.asSystem((tx) => makeWakeCard(tx, poolId))
  }

  /**
   * 接受唤醒 —— 再次成行。
   *
   * 派生一个新池塘，`parent_pool` 指回原池，原池保持休眠。
   * 同一条链上连续成行三次会触发 crew 提议：社群不是用户建的群，
   * 是系统从重复的 activity 里长出来的。
   */
  async acceptWake(actor: ActorContext, poolId: string): Promise<{ poolId: string; crewSuggested: boolean }> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')

    return this.asSystem(async (tx) => {
      const [origin] = await tx<{ nextHook: string | null; campusId: string; domain: string | null }[]>`
        select next_hook as "nextHook", campus_id as "campusId", domain
        from pool where id = ${poolId} and state = 'dormant'
      `
      if (!origin?.nextHook) throw new Error('这个池塘没有待唤醒的约定')

      const [fresh] = await tx<{ id: string }[]>`
        insert into pool (kind, state, campus_id, domain, title, parent_pool)
        values ('activity', 'forming', ${origin.campusId}, ${origin.domain}, ${origin.nextHook}, ${poolId})
        returning id
      `
      if (!fresh) throw new Error('新池塘创建失败')

      // 原池的在册成员直接带过来，但都是 invited —— 确认即过滤，
      // 上次一起玩过不代表这次一定有空
      await tx`
        insert into membership (pool_id, person_id, role, state, invited_at)
        select ${fresh.id}, m.person_id, m.role,
               case when m.person_id = ${me.id} then 'joined'::membership_state else 'invited'::membership_state end,
               case when m.person_id = ${me.id} then null else now() end
        from membership m where m.pool_id = ${poolId} and m.state = 'joined'
      `
      await tx`
        insert into episode (pool_id, kind, summary, actor_id)
        values (${fresh.id}, 'woken', ${origin.nextHook}, ${me.id})
      `

      // 同一条 parent 链上成行过几次
      const chain = await tx<{ n: number }[]>`
        with recursive chain as (
          select id, parent_pool from pool where id = ${fresh.id}
          union all
          select p.id, p.parent_pool from pool p join chain c on p.id = c.parent_pool
        )
        select count(*)::int as n from chain
      `
      return { poolId: fresh.id, crewSuggested: (chain[0]?.n ?? 0) >= 3 }
    })
  }

  // ==========================================================
  // 蒸馏
  // ==========================================================

  /**
   * 在收敛点触发蒸馏。
   *
   * 收敛点只有四个：池塘成行、事件回流、周期批量、关系温度重算。
   * 不在每条消息触发 —— 一个池塘全生命周期写进 L2 的次数是个位数。
   */
  async distillAfterPool(poolId: string): Promise<void> {
    await this.asSystem(async (tx) => {
      const [pool] = await tx<{ domain: string | null }[]>`
        select domain from pool where id = ${poolId}
      `
      // 只重蒸这个池塘所属的领域。一次收尾不可能改变一个人在别的领域的画像，
      // 而不限范围会让每次收尾的模型调用数随用户领域数线性增长。
      const scope = [pool?.domain ?? 'other']

      const members = await membersOf(tx, poolId)
      for (const personId of members) {
        await distillPerson({ sql: tx, model: this.deps.model }, personId, scope)
        // 关系温度不打模型，全量重算很便宜
        await recomputeRelations(tx, personId)
      }
    })
  }

  /** 我的切面。每条都能溯源到具体池塘 —— 用户问「你凭什么这么说我」要答得出来。 */
  async myFacets(actor: ActorContext): Promise<FacetView[]> {
    const me = await this.currentPerson(actor)
    if (!me) return []
    return this.act(
      actor,
      (tx) => tx<FacetView[]>`
        select f.domain, f.summary, f.traits, f.visibility, f.n_pools as "nPools",
               f.updated_at as "updatedAt",
               coalesce(
                 (select json_agg(json_build_object('poolId', p.id, 'title', p.title)
                          order by p.occurred_at desc nulls last)
                  from facet_evidence fe join pool p on p.id = fe.pool_id
                  where fe.person_id = f.person_id and fe.domain = f.domain),
                 '[]'::json
               ) as evidence
        from facet f where f.person_id = ${me.id}
        order by f.n_pools desc
      `,
    )
  }

  /** 改一条切面的可见度。逐切面自控 —— 运动切面可以公开，情感切面可以只给自己。 */
  async setFacetVisibility(
    actor: ActorContext,
    domain: Domain,
    visibility: Visibility,
  ): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.act(actor, (tx) => tx`
      update facet set visibility = ${visibility}
      where person_id = ${me.id} and domain = ${domain}
    `)
  }

  /**
   * 删掉一条切面。
   *
   * 删了还会不会长回来？会 —— 下次蒸馏时它会基于同样的池塘重新出现。
   * 这是刻意的：切面是事实的投影，不是可以单独否认的声明。
   * 用户真正要的是「别再这么说我」，那对应的是改可见度或退出那些池塘。
   * 所以这里删除的语义是「现在别显示」，而不是「假装那些事没发生过」。
   */
  async deleteFacet(actor: ActorContext, domain: Domain): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.act(actor, (tx) => tx`
      delete from facet where person_id = ${me.id} and domain = ${domain}
    `)
  }

  /** 清空 L2。仅用于等价性回归与运维重建，不在任何业务路径上。 */
  async wipeL2(campusId?: string): Promise<void> {
    await this.asSystem((tx) => wipeL2(tx, campusId))
  }

  /** 全量重建 L2。等价性回归的另一半。 */
  async rebuildL2(campusId?: string): Promise<{ people: number }> {
    return this.asSystem(async (tx) => {
      const people = await tx<{ id: string }[]>`
        select distinct m.person_id as id from membership m
        join pool p on p.id = m.pool_id
        join person pe on pe.id = m.person_id
        where m.state = 'joined' and p.state in ('active','done','dormant')
          ${campusId ? tx`and pe.campus_id = ${campusId}` : tx``}
        order by id
      `
      for (const p of people) {
        await distillPerson({ sql: tx, model: this.deps.model }, p.id)
        await recomputeRelations(tx, p.id)
      }
      return { people: people.length }
    })
  }

  /** 连接健康检查。用于启动自检与测试 harness。 */
  async ping(): Promise<{ db: boolean; model: ModelGateway['info'] }> {
    const rows = await this.deps.sql<{ ok: number }[]>`select 1 as ok`
    return { db: rows[0]?.ok === 1, model: this.deps.model.info }
  }
}

export interface PersonRecord {
  id: string
  handle: string
  displayName: string
  campusId: string
}

export interface PoolSummary {
  id: string
  kind: string
  state: string
  domain: string | null
  title: string | null
  nextHook: string | null
  occurredAt: Date | null
  memberCount: number
  artifactCount: number
}

export interface TimelineEntry {
  id: string
  kind: string
  summary: string | null
  payload: Record<string, unknown>
  occurredAt: Date
  actorId: string | null
  /** 精灵产生的条目此处为 null —— 时间线上人与精灵一眼可分 */
  actorName: string | null
}

/** 卡片在时间线上的一行摘要。不打模型 —— 卡片结构已经说清了它是什么。 */
function cardSummary(card: AgentCard): string {
  switch (card.kind) {
    case 'decision':
      return card.question
    case 'roster':
      return '还缺人：' + card.slots.filter((s) => s.takenBy.length < s.needed).map((s) => s.role).join('、')
    case 'recap':
      return card.prompt
    case 'wake':
      return card.hook
    case 'catchup':
      return card.summary
  }
}

export interface FacetView {
  domain: Domain
  summary: string
  traits: { roles?: PoolRole[]; preferences?: string[] }
  visibility: Visibility
  nPools: number
  updatedAt: Date
  /** 这条画像的依据。用户问「你凭什么这么说我」，答案在这里。 */
  evidence: { poolId: string; title: string | null }[]
}
