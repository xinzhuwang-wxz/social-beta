import { asPerson, toVector, type Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'
import {
  SILENT,
  type AgentCard,
  type Domain,
  type InterventionDecision,
  type PoolRole,
  type PoolState,
  type Visibility,
} from '@pool/shared'
import {
  listBoard,
  listMyIntents,
  prepareIntent,
  insertIntent,
  type BoardItem,
  type IntentRecord,
  clarify,
  mergeAnswers,
  type Clarification,
  type EssentialSlot,
  type IntentScope,
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
import {
  confirmPlan,
  draftPlan,
  readPlan,
  submitPlan,
  type PlanDraft,
  type PlanRecord,
} from './plan-service'
import {
  dueReminders,
  markReminderSent,
  reminderText,
  type DueReminder,
} from './reminder-service'
import { isActiveNow, recomputeResponsiveness } from './responsiveness-service'
import {
  chooseCompanion,
  deliverSeed,
  replyToSeed,
  seedInbox,
  willingFor,
  type InboxItem,
  type WillingCandidate,
} from './delivery-service'
import {
  blockPerson,
  myBlocks,
  unblockPerson,
  type BlockView,
} from './block-service'
import {
  confirmCompletion,
  myForestRecaps,
  readCompletionStatus,
  withdrawCompletion,
  type CompletionStatus,
  type ForestRecapEntry,
} from './completion-service'

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
               (select count(*)::int from membership m2 where m2.pool_id = p.id and m2.state = 'joined') as "memberCount",
               (select count(*)::int from artifact a where a.pool_id = p.id) as "artifactCount"
        from membership m
        join pool p on p.id = m.pool_id
        where m.person_id = (select id from person where auth_user_id = ${actor.authUserId})
          and m.state = 'joined'
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
  async publishIntent(
    actor: ActorContext,
    rawText: string,
    opts: { scope?: IntentScope } = {},
  ): Promise<IntentRecord> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档，无法发布意图')
    // 抽取与向量化在事务外完成 —— 它们要打两次模型，放进事务会长时间占住连接。
    // 但落库必须走用户身份，让 intent_write_own 策略生效：
    // 「模型调用别占事务」不是绕过 RLS 的理由。
    const prepared = await prepareIntent({ model: this.deps.model }, rawText)
    return this.act(actor, (tx) => insertIntent(tx, me.id, me.campusId, prepared, opts.scope ?? 'open'))
  }

  /**
   * 需求结构化 SOP 的第一步：抽取 + 看缺什么。
   *
   * 返回的 questions 最多三条，来自固定模板而非模型生成 ——
   * 让模型出题会滑向个性化打探（「你体力怎么样？」），
   * 那既拖慢发布也让人不适。整轮可跳过：
   * 缺信息的种子匹配质量确实差，但把人问跑了连差的匹配都没有。
   */
  async clarifyIntent(actor: ActorContext, rawText: string): Promise<Clarification> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    const prepared = await prepareIntent({ model: this.deps.model }, rawText)
    return clarify(prepared.extraction)
  }

  /** 带着答案重新发布。答案并回原文再走一次抽取，不在应用层猜他答的是哪一项。 */
  async publishClarified(
    actor: ActorContext,
    rawText: string,
    answers: Partial<Record<EssentialSlot, string>>,
    opts: { scope?: IntentScope } = {},
  ): Promise<IntentRecord> {
    return this.publishIntent(actor, mergeAnswers(rawText, answers), opts)
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
        -- Next 的预取与并发双渲染会让两次请求同时算出同一个 batch_no，
        -- 其中一次撞唯一键。这条不是「忽略错误」——落不进去只意味着
        -- 已经有等价的一批了，用户该看到的东西一样。
        on conflict (intent_id, batch_no) do nothing
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
      const rows = await tx<
        {
          id: string
          rawText: string
          personId: string
          domain: string
          scope: 'campus' | 'open'
          slots: Record<string, unknown>
        }[]
      >`
        select id, raw_text as "rawText", person_id as "personId", domain, scope, slots
        from intent where id = ${intentId}
      `
      const intent = rows[0]
      if (!intent) throw new Error('意图不存在')
      // 只能为自己的意图找候选 —— 否则任何人都能拿别人的意图去探测全校区
      if (intent.personId !== me.id) throw new Error('无权为他人的意图匹配')

      // 权重档数的是「完成过几次活动」，不是「加入过几个池塘」。
      // 用 left_at is null 会把未确认的邀请和还没成行的 forming 都算进去，
      // 于是一个刚被邀请、什么都还没发生的人会被判成 T1，走上他并不具备的信号。
      const [{ n: poolCount } = { n: 0 }] = await tx<{ n: number }[]>`
        select count(*)::int as n
        from membership m join pool p on p.id = m.pool_id
        where m.person_id = ${me.id} and m.state = 'joined'
          and p.state in ('done','dormant')
      `
      return findCandidates(
        { sql: tx, model: this.deps.model },
        { personId: me.id, campusId: me.campusId, poolCount },
        {
          id: intent.id,
          rawText: intent.rawText,
          domain: intent.domain,
          scope: intent.scope,
          slots: intent.slots,
        },
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
          // 两侧都按「对方能看到什么」裁剪。我方那一份也不例外 ——
          // 我的 Agent 替我说出去的话，不该包含我设为私密的内容。
          seekerProfile: await disclosureProfileFor(tx, me.id, theirs.personId),
          candidateProfile: await disclosureProfileFor(tx, theirs.personId, me.id),
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
        {
          seekerId: string
          candidateId: string
          proposal: unknown
          takenOverAt: Date | null
          seekerIntent: string | null
          candidateIntent: string | null
          domain: string | null
        }[]
      >`
        select rh.seeker_id as "seekerId", rh.candidate_id as "candidateId",
               rh.proposal, rh.taken_over_at as "takenOverAt",
               rh.seeker_intent as "seekerIntent", rh.candidate_intent as "candidateIntent",
               i.domain
        from rehearsal rh
        left join intent i on i.id = rh.seeker_intent
        where rh.id = ${input.rehearsalId}
      `
      if (!r) throw new Error('预演记录不存在')
      // 只有预演的发起者本人能接管。缺了这一条，任何人都能拿别人的预演开池塘。
      if (r.seekerId !== me.id) throw new Error('无权接管他人的预演')
      if (r.takenOverAt) throw new Error('这次预演已经接管过了')

      return takeOver(tx, {
        seekerId: me.id,
        candidateId: r.candidateId,
        campusId: me.campusId,
        domain: r.domain ?? 'other',
        intentIds: [r.seekerIntent, r.candidateIntent].filter((x): x is string => !!x),
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
    // 走系统通道：pool_read 策略要求 is_pool_member（state='joined'），
    // 而被邀请者恰恰还不是 —— 用户身份下这条 join 会把整行过滤掉，
    // 于是库里明明有待确认邀请，页面却显示「没有邀请」。
    // 这里只取标题一个字段，且 where 已经把范围钉死在「发给我的邀请」上。
    return this.asSystem(
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
    await this.asSystem(async (tx) => {
      await confirmJoin(tx, poolId, me.id)
      await recomputeResponsiveness(tx, me.id)
    })
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
  /**
   * 用户点「推进」按钮时才调用。
   *
   * PRD v2 阶段五明确：首版由用户主动请求 AI 帮助，一次只处理眼前一个卡点，
   * 不主动频繁插话。原设计里 active 阶段冷场超阈值就自动发卡 ——
   * 那正是 PRD 说的「后续可增加的非打扰式提示」，不该在首版就默认打开。
   *
   * forming 阶段的破冰仍是主动的（阶段四），且只主动一次。
   */
  async tickSpirit(poolId: string): Promise<InterventionDecision> {
    return this.asSystem(async (tx) => {
      const pulse = await readPulse(tx, poolId)
      const decision = decideIntervention({
        poolState: pulse.state,
        minutesSinceLastMessage: pulse.minutesSinceLastMessage,
        minutesSinceLastCard: pulse.minutesSinceLastCard,
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

  /**
   * 确认事件已完成。
   *
   * 此前是一个成员点了就转 done。现在改成记录「我的确认」——
   * 全员（在册成员）都确认过，池塘才真的转 done，一方没确认就停在
   * 「等待对方确认」，不会被单方面推进。见 `completionStatus` 查询这一状态。
   */
  async finishEvent(actor: ActorContext, poolId: string): Promise<{ allConfirmed: boolean }> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.assertMember(me.id, poolId)
    return this.asSystem((tx) => confirmCompletion(tx, poolId, me.id))
  }

  /**
   * 撤回完成确认。
   *
   * 实际没办完时的出口：点错了、活动被取消了，撤回自己那一条确认，
   * 池塘留在原状态，讨论、改计划都能接着来。全员都确认过、已经转 done
   * 之后就不能再撤——那是共同事实，不是任何单方能单独推翻的。
   */
  async withdrawCompletion(actor: ActorContext, poolId: string): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.assertMember(me.id, poolId)
    await this.asSystem((tx) => withdrawCompletion(tx, poolId, me.id))
  }

  /** 完成确认的进度：谁点了、谁还没。「等待对方确认」这句话的数据来源。 */
  async completionStatus(actor: ActorContext, poolId: string): Promise<CompletionStatus> {
    return this.act(actor, (tx) => readCompletionStatus(tx, poolId))
  }

  /**
   * 留一条私密评价。轻到能顺手填完 —— 填不了的反馈等于没有反馈。
   *
   * 只有事件被全员确认完成（pool.state 已经是 done/dormant）才谈得上评价——
   * 直接借这一条状态机约束当门槛，不用另开一张「能不能评价」的判断表。
   * again 是唯一必填项：它既是私密反馈的核心，也是共同回忆双向门控的开关——
   * 见 `forest_recap` 视图，任一方填 'no' 都会让对外可见的那份共同回忆消失，
   * 且不会让对方知道是谁填的。
   */
  async giveFeedback(
    actor: ActorContext,
    poolId: string,
    input: { again: 'yes' | 'maybe' | 'no'; note?: string; reflection?: string; photoUri?: string },
  ): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.assertMember(me.id, poolId)
    await this.act(actor, async (tx) => {
      const [pool] = await tx<{ state: string }[]>`select state from pool where id = ${poolId}`
      if (!pool || !['done', 'dormant'].includes(pool.state)) {
        throw new Error('事情还没被双方确认完成，还不能评价')
      }
      await tx`
        insert into feedback (pool_id, person_id, again, note, reflection, photo_uri)
        values (${poolId}, ${me.id}, ${input.again}, ${input.note ?? null},
                ${input.reflection ?? null}, ${input.photoUri ?? null})
        on conflict (pool_id, person_id) do update
          set again = excluded.again, note = excluded.note,
              reflection = excluded.reflection, photo_uri = excluded.photo_uri
      `
    })
  }

  /**
   * 森林里对外可见的共同回忆。走 `forest_recap` 视图——
   * 双向门控在视图的 where 子句里兑现，这里不重复判断。
   */
  async myForestRecaps(actor: ActorContext): Promise<ForestRecapEntry[]> {
    return this.act(actor, (tx) => myForestRecaps(tx))
  }

  /**
   * 删除自己上传的回流物。管得了自己传的，改不了对方传的——
   * 由 RLS 的 delete-own 策略兜底，这里的零行检查只是给一个更清楚的报错。
   */
  async removeArtifact(actor: ActorContext, artifactId: string): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    const rows = await this.act(
      actor,
      (tx) => tx`delete from artifact where id = ${artifactId} returning id`,
    )
    if (rows.length === 0) throw new Error('回流物不存在，或不是你上传的')
  }

  /**
   * 用回流物生成共同海报。
   *
   * 多图融合保持主体一致性 —— 这让海报是「我们那次」的产物，
   * 而不是一张任何人都能生成的模板图。
   */
  async makePoster(actor: ActorContext, poolId: string): Promise<{ id: string }> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    // 生图比文本贵得多，越权触发的代价更高
    await this.assertMember(me.id, poolId)
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
  async sealPool(actor: ActorContext, poolId: string): Promise<{ summary: string; nextHook: string }> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.assertMember(me.id, poolId)
    return sealPool({ sql: this.deps.sql, model: this.deps.model }, poolId)
  }

  /**
   * 在册成员校验。
   *
   * 收尾、生海报这类操作会触发真实模型调用并改写池塘状态，
   * 却一度只有注释在描述「必须是成员」——注释拦不住任何人。
   * 任何会花钱或改状态的方法都要先过这一关。
   */
  private async assertMember(personId: string, poolId: string): Promise<void> {
    const [m] = await this.deps.sql<{ state: string }[]>`
      select state from membership where pool_id = ${poolId} and person_id = ${personId}
    `
    if (m?.state !== 'joined') throw new Error('不是这个池塘的成员')
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
        select p.next_hook as "nextHook", p.campus_id as "campusId", p.domain
        from pool p
        where p.id = ${poolId} and p.state = 'dormant'
          -- 必须是原池的在册成员。缺了这一条，陌生人可以对任意休眠池塘派生新池，
          -- 把原池全员写成 invited —— 而邀请的标题正是 next_hook，
          -- 那是池塘的私有内容。既是越权邀请，也是把私有约定当推送外发。
          and exists (
            select 1 from membership m
            where m.pool_id = p.id and m.person_id = ${me.id} and m.state = 'joined'
          )
      `
      if (!origin?.nextHook) throw new Error('这个池塘没有待唤醒的约定，或你不是它的成员')

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
        // 关系温度与回应先验都不打模型，全量重算很便宜
        await recomputeRelations(tx, personId)
        await recomputeResponsiveness(tx, personId)
      }
    })
  }

  /**
   * 重算某人的回应先验。收敛点之外的显式触发口。
   *
   * 存在的理由是「没有回应」本身也是信号，而它不会触发任何事件 ——
   * 一个人从不回应，就没有任何回调会带着他的 id 跑过来。
   * 定时任务与测试需要一个能主动叫醒它的入口。
   */
  async recomputeResponsivenessFor(personId: string): Promise<void> {
    await this.asSystem(async (tx) => {
      await recomputeResponsiveness(tx, personId)
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

  // ==========================================================
  // 行动确认卡 · 从「有空一起」到「确定一起」
  // ==========================================================

  /** AI 从聊天里汇总一张草稿。不落库 —— 提交是人的动作。 */
  async draftPlan(actor: ActorContext, poolId: string): Promise<PlanDraft> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.assertMember(me.id, poolId)
    return draftPlan({ sql: this.deps.sql, model: this.deps.model }, poolId)
  }

  /** 提交确认卡。覆盖式提交会作废此前的确认 —— 大家确认的是那一版，不是这一版。 */
  async submitPlan(
    actor: ActorContext,
    poolId: string,
    input: Parameters<typeof submitPlan>[3],
  ): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.assertMember(me.id, poolId)
    await this.asSystem((tx) => submitPlan(tx, poolId, me.id, input))
  }

  /** 确认计划。全员确认后池塘进入花苞 —— 一个人拍板不算共同承诺。 */
  async confirmPlan(actor: ActorContext, poolId: string): Promise<{ allConfirmed: boolean }> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.assertMember(me.id, poolId)
    return this.asSystem((tx) => confirmPlan(tx, poolId, me.id))
  }

  async plan(actor: ActorContext, poolId: string): Promise<PlanRecord | null> {
    return this.act(actor, (tx) => readPlan(tx, poolId))
  }

  // ==========================================================
  // 邀请回应 · 四个选项
  // ==========================================================

  /**
   * 回应一条邀请。
   *
   * 四个选项不是礼貌性的装饰：`adjust` 给了「想去但条件不合」一个出口，
   * `later` 把一次拒绝转化成长期信号。只有「加入」一个选项时，
   * 所有非加入的意图都塌缩成沉默 —— 而沉默是不可区分的，系统学不到任何东西。
   */
  async replyToInvite(
    actor: ActorContext,
    poolId: string,
    response: InviteResponse,
    note?: string,
  ): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')

    await this.asSystem(async (tx) => {
      const [m] = await tx<{ state: string }[]>`
        select state from membership where pool_id = ${poolId} and person_id = ${me.id}
      `
      if (m?.state !== 'invited') throw new Error('没有待回应的邀请')

      await tx`
        insert into invite_reply (pool_id, person_id, response, note)
        values (${poolId}, ${me.id}, ${response}, ${note ?? null})
        on conflict (pool_id, person_id) do update
          set response = excluded.response, note = excluded.note
      `

      if (response === 'join') {
        await tx`
          update membership set state = 'joined', joined_at = now()
          where pool_id = ${poolId} and person_id = ${me.id}
        `
        await tx`
          insert into episode (pool_id, kind, summary, actor_id)
          values (${poolId}, 'joined', '确认加入', ${me.id})
        `
      } else if (response === 'adjust') {
        // 想去但条件不合：留在邀请态，把诉求带进池塘让大家看到。
        // 直接判成拒绝会丢掉一个本来可以成的连接。
        await tx`
          insert into episode (pool_id, kind, summary, actor_id)
          values (${poolId}, 'adjust', ${note ?? '想参加，但条件需要调整'}, ${me.id})
        `
      } else {
        // decline / later 都退出这个池塘。
        // 区别只在 invite_reply 里 —— later 是一条长期信号，decline 不是。
        await tx`
          update membership set state = 'left', left_at = now()
          where pool_id = ${poolId} and person_id = ${me.id}
        `
      }

      // 回应先验最直接的信号源就是这里。不等到蒸馏时才算 ——
      // 一个人的回应习惯会立刻影响别人是否该被推给他，
      // 而蒸馏只在池塘收尾时跑，那时已经晚了一整个匹配周期。
      await recomputeResponsiveness(tx, me.id)
    })
  }

  // ==========================================================
  // 当天状态与提醒
  // ==========================================================

  /** 轻量状态。首版不做持续定位 —— 定位的隐私代价远高于它带来的协调收益。 */
  async setDayStatus(
    actor: ActorContext,
    poolId: string,
    status: DayStatus,
    note?: string,
  ): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.act(actor, (tx) => tx`
      insert into participant_status (pool_id, person_id, status, note, updated_at)
      values (${poolId}, ${me.id}, ${status}, ${note ?? null}, now())
      on conflict (pool_id, person_id) do update
        set status = excluded.status, note = excluded.note, updated_at = now()
    `)
  }

  /**
   * 到期该发的提醒。定时任务用。
   *
   * 会跳过收件人全都在非活跃时段的池塘 —— 凌晨三点弹「还有两小时集合」
   * 只会让人关掉通知，而关掉之后连该收的提醒也收不到了。
   */
  async dueReminders(limit = 200): Promise<DueReminder[]> {
    const all = await this.asSystem((tx) => dueReminders(tx, limit))
    if (all.length === 0) return all

    const hours = await this.asSystem(
      (tx) => tx<{ personId: string; activeHours: number[] }[]>`
        select person_id as "personId", active_hours as "activeHours" from responsiveness
      `,
    )
    const byPerson = new Map(hours.map((h) => [h.personId, h.activeHours]))
    return all.filter((r) =>
      // 只要有一个人现在活跃就发 —— 提醒是发进池塘的，不是私聊
      r.silentMembers.length === 0 ||
      r.silentMembers.some((m) => isActiveNow(byPerson.get(m.personId) ?? [])),
    )
  }

  /** 把提醒作为精灵的卡片投进池塘，并记录已发，避免重复打扰。 */
  async deliverReminder(r: DueReminder): Promise<void> {
    await this.asSystem(async (tx) => {
      await tx`
        insert into episode (pool_id, kind, summary, payload, actor_id)
        values (${r.poolId}, 'card', ${reminderText(r)},
                ${tx.json({ kind: 'reminder', reminder: r.kind } as never)}, null)
      `
      await markReminderSent(tx, r.poolId, r.kind)
    })
  }

  // ==========================================================
  // 行动房间的状态看板
  // ==========================================================

  /**
   * 顶部持续展示的东西：目标、成员、已确认、未确认、进度、下一步。
   *
   * 「下一步」刻意由确定性规则算出，不打模型 —— 它每次刷新都要显示，
   * 让模型来算既贵又会前后不一致，而用户会立刻发现它在瞎说。
   */
  async poolBoard(actor: ActorContext, poolId: string): Promise<PoolBoard> {
    return this.act(actor, async (tx) => {
      const [pool] = await tx<{ title: string | null; state: string; nextHook: string | null }[]>`
        select title, state, next_hook as "nextHook" from pool where id = ${poolId}
      `
      if (!pool) throw new Error('池塘不存在')

      const members = await tx<{ personId: string; displayName: string; role: string; state: string }[]>`
        select m.person_id as "personId", p.display_name as "displayName", m.role::text, m.state::text
        from membership m join person p on p.id = m.person_id
        where m.pool_id = ${poolId} and m.state in ('invited','joined')
        order by m.joined_at asc nulls last
      `
      const plan = await readPlan(tx, poolId)
      const statuses = await tx<{ personId: string; status: string }[]>`
        select person_id as "personId", status::text from participant_status where pool_id = ${poolId}
      `
      const artifacts = await tx<{ n: number }[]>`
        select count(*)::int as n from artifact where pool_id = ${poolId}
      `

      const settled: string[] = []
      const open: string[] = []
      if (plan) {
        settled.push(`时间：${plan.startsAt.toLocaleString('zh-CN')}`, `集合：${plan.meetAt}`)
        if (plan.route) settled.push(`路线：${plan.route}`)
        if (plan.pendingBy.length > 0) {
          open.push(`还差 ${plan.pendingBy.map((p) => p.displayName).join('、')} 确认计划`)
        }
      } else {
        open.push('时间、地点还没定下来')
      }
      const invited = members.filter((m) => m.state === 'invited')
      if (invited.length > 0) open.push(`${invited.map((m) => m.displayName).join('、')} 还没回应邀请`)

      return {
        title: pool.title,
        state: pool.state as PoolState,
        members,
        settled,
        open,
        plan,
        statuses,
        artifactCount: artifacts[0]?.n ?? 0,
        nextHook: pool.nextHook,
        nextStep: nextStepFor(pool.state as PoolState, plan, invited.length),
      }
    })
  }

  // ==========================================================
  // 投递制：种子发给多人，候选先表态，发起人在愿意的人里选
  // ==========================================================

  /**
   * 把一颗种子投递出去。
   *
   * 候选来自匹配漏斗，但**投递不等于推荐** —— 候选人在信箱里看到的是这颗种子
   * 本身，不是「系统觉得你合适」。推荐理由与打分只给发起人看。
   */
  async deliverSeed(actor: ActorContext, intentId: string): Promise<{ delivered: number }> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')

    const candidates = await this.refreshCandidates(actor, intentId)
    const delivered = await this.asSystem((tx) => deliverSeed(tx, intentId, candidates))
    return { delivered }
  }

  /** 我的种子信箱。走视图 —— 它在 SQL 层就不含推荐理由与打分。 */
  async seedInbox(actor: ActorContext): Promise<InboxItem[]> {
    return this.act(actor, (tx) => seedInbox(tx))
  }

  /** 表态：愿意参与（可附一句留言）或暂不感兴趣。 */
  async replyToSeed(
    actor: ActorContext,
    intentId: string,
    willing: boolean,
    note?: string,
  ): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.asSystem(async (tx) => {
      await replyToSeed(tx, intentId, me.id, willing, note)
      // 表态本身就是回应信号，立刻重算 —— 这是 responsiveness 最直接的来源
      await recomputeResponsiveness(tx, me.id)
    })
  }

  /** 已表达愿意的人。只有发起人调得到。 */
  async willingFor(actor: ActorContext, intentId: string): Promise<WillingCandidate[]> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    return this.asSystem(async (tx) => {
      const [own] = await tx<{ personId: string }[]>`
        select person_id as "personId" from intent where id = ${intentId}
      `
      if (own?.personId !== me.id) throw new Error('无权查看他人种子的回应')
      return willingFor(tx, intentId)
    })
  }

  /**
   * 选中一个同行者并成局。
   *
   * PRD 写的是「亲自选择一名」，但那与种子自己的「需要多少人」矛盾 ——
   * 四个人的爬山局要选三个。按需要人数收满为止。
   *
   * 第一个被选中的人触发建池；之后的人直接进同一个池塘。
   */
  async chooseCompanion(
    actor: ActorContext,
    intentId: string,
    personId: string,
    opening: string,
  ): Promise<{ poolId: string; filled: boolean }> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    const firstWords = opening.trim()
    if (firstWords.length === 0) throw new Error('第一句话不能为空')

    return this.asSystem(async (tx) => {
      const [intent] = await tx<
        { personId: string; domain: string | null; rawText: string; poolId: string | null }[]
      >`
        select person_id as "personId", domain, raw_text as "rawText", pool_id as "poolId"
        from intent where id = ${intentId}
      `
      if (intent?.personId !== me.id) throw new Error('无权处置他人的种子')

      const result = await chooseCompanion(tx, intentId, personId)

      // 已经有池塘就直接加人，否则建一个
      let poolId = intent.poolId
      if (!poolId) {
        const [pool] = await tx<{ id: string }[]>`
          insert into pool (kind, state, campus_id, domain, title)
          values ('activity', 'forming', ${me.campusId}, ${intent.domain}, ${intent.rawText})
          returning id
        `
        if (!pool) throw new Error('池塘创建失败')
        poolId = pool.id
        await tx`
          insert into membership (pool_id, person_id, role, state)
          values (${poolId}, ${me.id}, 'initiator', 'joined')
        `
        await tx`update intent set pool_id = ${poolId} where id = ${intentId}`
        await tx`
          insert into episode (pool_id, kind, summary, actor_id)
          values (${poolId}, 'opening', ${firstWords}, ${me.id})
        `
      }

      // 被选中的人直接 joined —— 他已经表达过「愿意参与」，
      // 再要求他确认一次是把同一个决定问两遍
      await tx`
        insert into membership (pool_id, person_id, role, state)
        values (${poolId}, ${personId}, 'participant', 'joined')
        on conflict (pool_id, person_id) do update set state = 'joined', joined_at = now()
      `
      await tx`
        insert into episode (pool_id, kind, summary, actor_id)
        values (${poolId}, 'joined', '成局', ${personId})
      `
      return { poolId, filled: result.filled }
    })
  }

  /** 连接健康检查。用于启动自检与测试 harness。 */
  async ping(): Promise<{ db: boolean; model: ModelGateway['info'] }> {
    const rows = await this.deps.sql<{ ok: number }[]>`select 1 as ok`
    return { db: rows[0]?.ok === 1, model: this.deps.model.info }
  }

  // ==========================================================
  // 拉黑：退出的权利
  // ==========================================================

  /**
   * 拉黑一个人。
   *
   * 硬过滤（matcher-service 召回阶段的双向 not exists）此前一直守着一扇
   * 没有门把手的门 —— block 表有 RLS、有 GRANT，但没有任何写路径。
   * 这一步补的正是那个门把手，判断「能不能拉黑」的事完全交给 block_own 策略。
   */
  async blockPerson(actor: ActorContext, blockedId: string): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.act(actor, (tx) => blockPerson(tx, me.id, blockedId))
  }

  /** 取消拉黑。 */
  async unblockPerson(actor: ActorContext, blockedId: string): Promise<void> {
    const me = await this.currentPerson(actor)
    if (!me) throw new Error('尚未建档')
    await this.act(actor, (tx) => unblockPerson(tx, me.id, blockedId))
  }

  /** 我拉黑过的人。能拉黑就必须能看见、能撤销，否则拉黑是个只进不出的黑洞。 */
  async myBlocks(actor: ActorContext): Promise<BlockView[]> {
    const me = await this.currentPerson(actor)
    if (!me) return []
    return this.act(actor, (tx) => myBlocks(tx, me.id))
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

/** 邀请的四种回应。见 migration 0012 的注释：后三个不是礼貌性的装饰。 */
export type InviteResponse = 'join' | 'adjust' | 'decline' | 'later'

/** 当天状态。首版不做持续定位。 */
export type DayStatus = 'ready' | 'departed' | 'arrived' | 'changed'

export interface PoolBoard {
  title: string | null
  state: PoolState
  members: { personId: string; displayName: string; role: string; state: string }[]
  /** 已经定下来的事 */
  settled: string[]
  /** 还没定的事 */
  open: string[]
  plan: PlanRecord | null
  statuses: { personId: string; status: string }[]
  artifactCount: number
  nextHook: string | null
  /** 下一步该干什么。确定性规则算出，不打模型 */
  nextStep: string
}

/**
 * 下一步提示。
 *
 * 刻意用确定性规则而非模型：它每次刷新都要显示，让模型来算既贵又会前后不一致，
 * 而「上一秒说该定时间、这一秒说该传照片」这种不一致用户会立刻发现，
 * 且会因此不再相信页面上任何一句提示。
 */
function nextStepFor(state: PoolState, plan: PlanRecord | null, invitedCount: number): string {
  if (state === 'dormant') return '这件事已经结束了。想再约一次的话，点上面那句约定。'
  if (state === 'done') return '传张返图，或者写一句这次的感受。'
  if (state === 'planned') return '计划定了，等着出发。当天记得点一下自己的状态。'
  if (invitedCount > 0) return '还有人没回应邀请，先等等他们。'
  if (!plan) return '把时间和地点聊定，然后提交一张行动确认卡。'
  if (plan.pendingBy.length > 0) {
    return `计划已经拟好了，还差 ${plan.pendingBy.map((p) => p.displayName).join('、')} 确认。`
  }
  return '大家都确认了，等着出发。'
}
