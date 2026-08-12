import { asPerson, type Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'
import type { Domain } from '@pool/shared'
import {
  listBoard,
  listMyIntents,
  prepareIntent,
  insertIntent,
  type BoardItem,
  type IntentRecord,
  type PreparedIntent,
} from './intent-service.js'
import { findCandidates, type Candidate } from './matcher-service.js'
import { disclosureProfileFor, rehearse, type RehearsalResult } from './rehearsal-service.js'
import {
  confirmJoin,
  leavePool,
  takeOver,
  type RehearsalRecord,
} from './takeover-service.js'

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
