import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * 魔法链接的落地点。
 *
 * 只做一件事：把 GoTrue 发的一次性 code 换成 session cookie，然后跳走。
 * 不在这里判断 person 是否已建档——那属于「取 actor → 调 PoolEngine → 渲染」
 * 的范畴，留给 /home 自己做，这个 route 才能保持只是协议翻译，没有业务分支。
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/home'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(
    `${origin}/auth/login?error=${encodeURIComponent('登录链接无效或已过期，请重新发送')}`,
  )
}
