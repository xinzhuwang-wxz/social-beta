import type { Sql } from '@pool/db'
import type { ModelGateway } from '@pool/model'
import { ProposalCard, type DisclosureProfile, type RehearsalMessage } from '@pool/shared'
import { z } from 'zod'

/**
 * 工作组会晤：两个代理人 Agent 交换，产出一张提案卡。
 *
 * ## 为什么是按需而不是随候选卡一起生成
 *
 * 一次匹配返回 3–5 张候选卡。若每张都跑完整预演，就是每次匹配几十次模型调用。
 * 候选卡上的「为什么是他」在终排时已经一次性生成了；完整提案卡与往来记录
 * 只在用户真的点开某一个候选时才值得付这个成本。
 *
 * ## 为什么是一来一回，而不是一次生成、也不是多轮
 *
 * 单次生成能产出同样的提案卡，更便宜也更稳定。交换存在的理由不是输出更好，
 * 而是**可审计**：产品承诺用户可以查看「我的 Agent 到底替我说了什么」。
 * 单次生成没有「全文」可看，只有输入和输出。
 *
 * 但一来一回就已经构成可审计的往来记录了。最初写成两方各两轮（5 次串行调用），
 * 实测下来用户点开一张候选卡要等十几秒 —— 而多出来的那两轮只是让两个同源模型
 * 多寒暄一次，没有带来新信息。透明度不需要靠轮数堆出来。
 *
 * ## 红线
 *
 * 预演的产物是**草稿**。openingDraft 永远不会被自动发出去，
 * 连接是否建立完全取决于真人是否点击接管。
 */

/**
 * 每方发言轮数。一来一回 = 2 次调用，加终稿共 3 次串行。
 *
 * 这个数字直接决定用户点开候选卡后的等待时长，调大之前先想清楚
 * 多出来的那一轮到底带来了什么新信息。
 */
const ROUNDS_PER_SIDE = 1

const AGENT_SYSTEM = `你是一名大学生的代理人，替他去和另一位同学的代理人交流，看看两人是否值得认识。

你只掌握你所代理的人愿意公开的那部分信息。不要编造他没说过的事 ——
一旦编造，真人见面时会立刻穿帮，而代价由他承担，不由你承担。

你的目标是找出两人真正的共同点，以及一个他们可以一起去做的具体的事。
不要寒暄，不要客套，不要复述对方说过的话。每次发言两三句即可。

你不能代表他做任何承诺，也不能替他决定是否要认识对方。`

const SYNTH_SYSTEM = `根据两位代理人的往来记录，写出一张提案卡。

sharedTopics：恰好 3 条共同话题，每条必须引用往来记录里真实出现的内容。
actionProposal：一个具体的行动提案。what 说清做什么，when 用自然表述（「这周六上午」），
  where 给具体地点。rationale 一句话说明为什么这个提案对双方都成立。
riskNote：一条真实的风险提示，比如时间可能对不上、强度差异、其中一方是新手。
  没有明显风险时写出最需要提前说清的那件事，不要写「暂无风险」。
openingDraft：一句可以直接发出去的开场白，以第一人称写，像真人说话，不超过 40 字。
  它是草稿 —— 真人可以直接用、可以改、也可以完全不用。

不要编造任何往来记录里没有的信息。`

export interface RehearsalDeps {
  sql: Sql
  model: ModelGateway
}

export interface RehearsalResult {
  proposal: ProposalCard
  /** 往来记录，供用户查看「我的 Agent 替我说了什么」 */
  transcript: RehearsalMessage[]
}

/**
 * 构造可披露视图。
 *
 * 关键：这里**以观察者的身份查询**，让 RLS 的 facet_read_disclosable 策略决定
 * 哪些切面可见。private 切面在 SQL 层就取不到 —— 泄漏在结构上不可能，
 * 而不是靠在 prompt 里叮嘱模型别说。
 *
 * 这个函数必须在 asPerson 事务内被调用，否则策略不生效。
 */
export async function disclosureProfileFor(
  tx: Sql,
  ownerId: string,
  viewerId: string,
): Promise<DisclosureProfile> {
  const [person] = await tx<{ id: string; displayName: string }[]>`
    select id, display_name as "displayName" from person where id = ${ownerId}
  `
  if (!person) throw new Error('对方不存在或不可见')

  // 按 viewer 的视角裁剪，**即使 owner 就是调用者自己**。
  // 直接查 facet 表会命中 RLS 的「本人看自己是全量」分支，
  // 把 private 切面也带出来 —— 然后它会进自己 Agent 的 prompt、
  // 进往来记录、再进对方 Agent 的输入。
  const facets = await tx<
    { domain: string; summary: string; traits: { roles?: string[] }; nPools: number; visibility: string }[]
  >`
    select domain, summary, traits, n_pools as "nPools", visibility
    from facets_disclosable_to(${ownerId}, ${viewerId})
  `

  return {
    personId: person.id,
    displayName: person.displayName,
    facets: facets.map((f) => ({
      domain: f.domain as DisclosureProfile['facets'][number]['domain'],
      summary: f.summary,
      roles: (f.traits.roles ?? []) as DisclosureProfile['facets'][number]['roles'],
      nPools: f.nPools,
      visibility: f.visibility as DisclosureProfile['facets'][number]['visibility'],
    })),
  }
}

function describe(profile: DisclosureProfile, intent: string): string {
  const facets =
    profile.facets.length === 0
      ? '（还没有任何活动记录 —— 这是他第一次找搭子）'
      : profile.facets
          .map((f) => `- ${f.domain}：${f.summary}（基于 ${f.nPools} 次活动）`)
          .join('\n')
  return `姓名：${profile.displayName}\n他这次想做的事：${intent}\n他的活动侧写：\n${facets}`
}

const Utterance = z.object({ say: z.string().min(1) })

/**
 * 跑一次预演。
 *
 * 注意两侧 Agent 拿到的输入不同：各自只带自己所代理者的完整侧写，
 * 加上对方 Agent 主动说出来的内容。这不是为了安全（安全由 RLS 保证），
 * 而是为了让往来记录真实反映「谁透露了什么」，用户看的时候才有意义。
 */
export async function rehearse(
  deps: RehearsalDeps,
  seeker: { profile: DisclosureProfile; intent: string },
  candidate: { profile: DisclosureProfile; intent: string },
): Promise<RehearsalResult> {
  const transcript: RehearsalMessage[] = []

  for (let round = 0; round < ROUNDS_PER_SIDE; round++) {
    for (const side of ['agent_a', 'agent_b'] as const) {
      const me = side === 'agent_a' ? seeker : candidate
      const heard =
        transcript.length === 0
          ? '（你先开口）'
          : transcript
              .map((m) => `${m.role === side ? '你' : '对方'}：${m.parts[0]?.text ?? ''}`)
              .join('\n')

      const { say } = await deps.model.generate({
        task: 'rehearsal.turn',
        schema: Utterance,
        system: AGENT_SYSTEM,
        user: `你代理的人：\n${describe(me.profile, me.intent)}\n\n目前的交流：\n${heard}`,
      })
      transcript.push({ role: side, parts: [{ kind: 'text', text: say }] })
    }
  }

  const proposal = await deps.model.generate({
    task: 'rehearsal.synthesize',
    schema: ProposalCard,
    system: SYNTH_SYSTEM,
    user:
      `甲想做的事：${seeker.intent}\n乙想做的事：${candidate.intent}\n\n往来记录：\n` +
      transcript.map((m) => `${m.role === 'agent_a' ? '甲方代理' : '乙方代理'}：${m.parts[0]?.text ?? ''}`).join('\n'),
  })

  return { proposal, transcript }
}
