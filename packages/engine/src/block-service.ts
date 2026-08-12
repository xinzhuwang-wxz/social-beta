import type { Sql } from '@pool/db'

/**
 * 拉黑：退出的权利。
 *
 * `block` 表、`block_own` 策略与 GRANT 从 M2 就在（见 core migration），
 * 但全仓没有任何一条写路径能真的往这张表里插一行 —— matcher-service 的
 * 双向 `not exists` 硬过滤守着一扇没有门把手的门：用户永远拉不了黑，
 * 于是那条过滤条件永远等价于「没有人被任何人拉黑过」，跟没写一样。
 *
 * 这里只是把已经就位的 RLS 兑现成可调用的动作，不重新判断一遍「谁能拉黑谁」——
 * `block_own` 策略（`blocker_id = current_person_id()`）已经在数据库层保证了
 * 这一点：调用方传入的 blockerId 只可能是当前登录者自己的 id（由 pool-engine
 * 从 actor 解析而来，不接受调用方直接传任意 id），真正越权的写入会被 RLS
 * 拒绝，而不是被这里的某个 if 拒绝。隐私边界落在 RLS，这几个函数只是通道。
 */

export interface BlockView {
  personId: string
  displayName: string
  handle: string
  createdAt: Date
}

/**
 * 拉黑一个人。
 *
 * 重复拉黑是幂等的，不是错误 —— 用户不需要先知道自己是否已经拉黑过谁，
 * 才能安全地点这个按钮。`block_not_self` 约束已经在库里挡自我拉黑，
 * 这里提前给一句人话，不必让用户看见一条 Postgres 的 check 违例。
 */
export async function blockPerson(sql: Sql, blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) throw new Error('不能拉黑自己')
  await sql`
    insert into block (blocker_id, blocked_id)
    values (${blockerId}, ${blockedId})
    on conflict (blocker_id, blocked_id) do nothing
  `
}

/** 取消拉黑。没拉黑过也是幂等的 —— 撤销一件没发生过的事，结果就是什么都没发生。 */
export async function unblockPerson(sql: Sql, blockerId: string, blockedId: string): Promise<void> {
  await sql`delete from block where blocker_id = ${blockerId} and blocked_id = ${blockedId}`
}

/**
 * 我拉黑过的人。
 *
 * 能拉黑就必须能看见、能撤销 —— 否则拉黑是个只进不出的黑洞：
 * 点错一次，或者关系后来缓和了，用户却无路可退。
 */
export async function myBlocks(sql: Sql, blockerId: string): Promise<BlockView[]> {
  return sql<BlockView[]>`
    select p.id as "personId", p.display_name as "displayName", p.handle,
           b.created_at as "createdAt"
    from block b join person p on p.id = b.blocked_id
    where b.blocker_id = ${blockerId}
    order by b.created_at desc
  `
}
