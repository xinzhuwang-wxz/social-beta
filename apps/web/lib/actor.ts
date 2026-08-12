import type { ActorContext } from '@pool/engine'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'

/**
 * 从当前请求的 Supabase session 取出 actor，未登录则跳转登录页。
 *
 * 用 getUser() 不用 getSession()：session 来自可能被篡改的 cookie，
 * getUser() 会拿着里面的 token 向 Auth 服务器验一次，这才是真正可信的身份，
 * 也是 PoolEngine.act() 敢拿 authUserId 直接喂给 RLS 的前提。
 */
export async function requireActor(): Promise<ActorContext> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  return { authUserId: user.id }
}
