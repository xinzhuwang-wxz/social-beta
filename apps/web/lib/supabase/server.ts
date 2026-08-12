import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * 只暴露 auth 这一面。
 *
 * 完整的 SupabaseClient 带着 `.from()`，而它写起来毫不费力、还能过 RLS ——
 * 于是「所有数据访问必须经 PoolEngine」这条约束就只剩下纪律，任何测试都抓不到违反。
 * 把返回类型收窄成 auth，编译器就替我们守住了这条边界：
 * 想绕过 PoolEngine 查表，得先显式地把这里改宽，那是一次会被 review 看见的改动。
 *
 * 身份是 Supabase 的职责，业务数据是 PoolEngine 的职责 —— 这个类型就是那条分界。
 */
export type AuthOnlyClient = Pick<SupabaseClient, 'auth'>

/**
 * Server Component / Server Action / Route Handler 专用的 Supabase 客户端。
 *
 * 每次调用都新建一个：它绑定的是本次请求的 cookies()，跨请求复用同一个实例
 * 会把这次的 cookie 写操作串到别的请求上去。这是 @supabase/ssr 官方推荐的用法，
 * 不是本项目自己发明的模式。
 */
export async function createClient(): Promise<AuthOnlyClient> {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Component 渲染期间无法写响应头，这里的 set 会抛错。
            // 只要 middleware.ts 也在刷新 session，session 仍然会被正确续期，可以安全忽略。
          }
        },
      },
    },
  )
}
