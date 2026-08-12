import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'

/**
 * 登录后的首页。
 *
 * 结构约束（S1 定死，后面每一刀都继承）：这个 Server Component 只做
 * 「取 actor → 调 PoolEngine → 渲染」。没有 person 记录时跳去建档、
 * 池塘列表怎么查、怎么排序——这些判断全部在 PoolEngine.currentPerson /
 * myPools 内部，这里不重复实现，也不直连数据库。
 */
export default async function HomePage() {
  const actor = await requireActor()
  const engine = getEngine()

  const person = await engine.currentPerson(actor)
  if (!person) redirect('/onboarding')

  const pools = await engine.myPools(actor)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-sm text-ink-soft">欢迎回来</p>
        <h1 className="text-2xl font-semibold">{person.displayName}</h1>
        <p className="text-sm text-ink-soft">
          @{person.handle} · {person.campusId}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">我的池塘</h2>

        {pools.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-soft">
            还没有池塘。发一条意图、进第一个池塘之后，这里会长出你的第一份画像。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pools.map((pool) => (
              <li
                key={pool.id}
                className="rounded border border-border p-4"
              >
                <p className="font-medium">{pool.title ?? '（未命名池塘）'}</p>
                <p className="text-sm text-ink-soft">
                  {pool.state} · {pool.memberCount} 人 · {pool.artifactCount} 份回流物
                </p>
                {pool.nextHook && (
                  <p className="mt-1 text-sm text-ink-soft">
                    下次：{pool.nextHook}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
