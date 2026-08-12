import type { Sql } from '@pool/db'
import type { ProposalCard, RehearsalMessage } from '@pool/shared'

/**
 * 接管：真人签字，连接才成立。
 *
 * 这是产品的红线所在。四条不可协商的人类决策权里，前三条都落在这个文件里：
 *   连接对象 —— 只有真人调用 takeOver 才会创建池塘
 *   表述方式 —— opening 由调用方传入，可以是草稿原文、改过的、或完全自己写的
 *   是否回应 —— 被邀请方的 membership 是 invited 态，只有他自己确认才变 joined
 *
 * 这个文件里**不存在**任何自动发送、自动确认、或代替任一方做决定的代码路径。
 * 若将来有人加了这样的路径，`ai_sent_message === 0` 那条测试会失败。
 */

export interface TakeoverInput {
  seekerId: string
  candidateId: string
  campusId: string
  rehearsalId: string
  proposal: ProposalCard
  /** 真人最终决定发出去的第一句话。可能等于草稿，也可能被改过或完全重写。 */
  opening: string
}

export interface TakeoverResult {
  poolId: string
}

/**
 * 接管并开池塘。
 *
 * 发起方直接进入 joined —— 他的确认就是这次调用本身。
 * 被邀请方是 invited，需要他自己确认。这正是「确认即过滤」：
 * 不确认可能是时间不合适、可能是没兴趣，系统不需要知道原因。
 */
export async function takeOver(sql: Sql, input: TakeoverInput): Promise<TakeoverResult> {
  return sql.begin(async (tx) => {
    const [pool] = await tx<{ id: string }[]>`
      insert into pool (kind, state, campus_id, title, brief)
      values (
        'activity', 'forming', ${input.campusId},
        ${input.proposal.actionProposal.what},
        ${input.proposal.actionProposal.rationale}
      )
      returning id
    `
    if (!pool) throw new Error('池塘创建失败')

    await tx`
      insert into membership (pool_id, person_id, role, state)
      values (${pool.id}, ${input.seekerId}, 'initiator', 'joined')
    `
    await tx`
      insert into membership (pool_id, person_id, role, state, invited_at)
      values (${pool.id}, ${input.candidateId}, 'participant', 'invited', now())
    `

    // 第一句话由真人发出，actor 是他本人 —— 不是 Agent。
    // 这条 episode 的 actor_id 非空，正是「AI 未代答」的可核验证据。
    await tx`
      insert into episode (pool_id, kind, summary, payload, actor_id)
      values (
        ${pool.id}, 'opening', ${input.opening},
        ${tx.json({ proposal: input.proposal } as never)}, ${input.seekerId}
      )
    `
    await tx`
      update rehearsal set taken_over_at = now() where id = ${input.rehearsalId}
    `
    return { poolId: pool.id }
  }) as Promise<TakeoverResult>
}

/**
 * 被邀请方确认加入。
 *
 * 只能由被邀请者本人调用 —— 调用方身份由 RLS 与这里的 person_id 双重约束。
 * 确认之后仍可退出：聊下来发现不合适再走，本就是正常的社交流程。
 */
export async function confirmJoin(sql: Sql, poolId: string, personId: string): Promise<void> {
  const rows = await sql`
    update membership set state = 'joined', joined_at = now()
    where pool_id = ${poolId} and person_id = ${personId} and state = 'invited'
    returning pool_id
  `
  if (rows.length === 0) throw new Error('没有待确认的邀请')

  await sql`
    insert into episode (pool_id, kind, summary, actor_id)
    values (${poolId}, 'joined', '确认加入', ${personId})
  `
}

/** 退出池塘。确认之后发现不合适再走，是正常流程，不是异常。 */
export async function leavePool(sql: Sql, poolId: string, personId: string): Promise<void> {
  await sql`
    update membership set state = 'left', left_at = now()
    where pool_id = ${poolId} and person_id = ${personId} and state in ('invited','joined')
  `
  await sql`
    insert into episode (pool_id, kind, summary, actor_id)
    values (${poolId}, 'left', '退出了池塘', ${personId})
  `
}

export interface RehearsalRecord {
  id: string
  proposal: ProposalCard
  transcript: RehearsalMessage[]
  takenOverAt: Date | null
}
