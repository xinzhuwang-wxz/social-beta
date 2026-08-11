import { asPerson, type Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'

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
    return this.asSystem(async (tx) => {
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
