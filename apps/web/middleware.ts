import { type NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

/**
 * 每个请求都过一遍，把 Supabase session cookie 续上。
 *
 * 不在这里做登录态跳转（那是各页面 / layout 自己的事，见 app/(app)/layout.tsx）——
 * middleware 只管 cookie 保鲜，职责单一，出问题时排查范围小。
 */
export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
