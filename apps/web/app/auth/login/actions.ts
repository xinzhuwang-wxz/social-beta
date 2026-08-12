'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * 发送登录魔法链接。
 *
 * 本地开发没有真实邮箱服务，Supabase 本地栈把邮件投进 Mailpit（127.0.0.1:54324）—
 * 这就是本地"真实身份登录"的样子：真走 Supabase Auth 的协议，只是收信渠道换成本地信箱，
 * 不是伪造一个已登录用户糊弄过去。
 *
 * 这不是业务逻辑，是身份认证的管道：整段函数只是把表单值转成一次 Supabase Auth 调用，
 * 不涉及 person / pool 的任何读写——那些留给登录之后的 PoolEngine。
 */
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) redirect('/auth/login?error=' + encodeURIComponent('请输入邮箱'))

  const supabase = await createClient()

  // 用请求本身的 host 拼回跳地址，而不是写死一个值：
  // Supabase 本地栈的 additional_redirect_urls 只放行 127.0.0.1，跟请求走的域一致才不会被拒。
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('host') ?? '127.0.0.1:3000'
  const origin = `${proto}://${host}`

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })

  if (error) redirect('/auth/login?error=' + encodeURIComponent(error.message))
  redirect('/auth/login?sent=' + encodeURIComponent(email))
}
