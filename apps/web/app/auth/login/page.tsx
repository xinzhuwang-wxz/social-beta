import Link from 'next/link'
import { PondMark } from '@/components/pond-mark'
import { sendMagicLink } from './actions'

interface LoginPageProps {
  searchParams: Promise<{ sent?: string; error?: string }>
}

/**
 * 登录页不套 (app) 外壳 —— 还没登录的人不需要那条索引条，
 * 它上面每一项都会把他弹回这里。所以这页自己收口，只留一个标记和一个输入框。
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-12">
      <div className="flex items-baseline gap-2.5">
        <PondMark className="size-5 translate-y-0.5 text-accent-deep" />
        <span className="text-lg font-semibold text-ink">池塘</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-ink">登录</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          不设密码。填邮箱，去信箱点一下链接就登录了。
        </p>
      </div>

      {params.sent ? (
        <div className="border-l-2 border-accent-deep bg-accent-soft px-4 py-4">
          <p className="text-sm leading-relaxed text-ink">
            登录链接已经发到 <strong className="break-anywhere">{params.sent}</strong>，去邮箱点一下就登录了。
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            本地开发环境的邮件会落在{' '}
            <a
              className="text-brand underline decoration-dotted underline-offset-4"
              href="http://127.0.0.1:54324"
              target="_blank"
              rel="noreferrer"
            >
              Mailpit
            </a>
            。
          </p>
        </div>
      ) : (
        <form action={sendMagicLink} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-ink">
              邮箱
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@campus.edu"
              className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft focus-visible:border-accent-deep"
            />
          </div>
          <button
            type="submit"
            className="self-start border border-accent-deep bg-accent-deep px-5 py-2.5 text-sm font-medium text-accent-ink transition-colors hover:border-accent-hover hover:bg-accent-hover"
          >
            发送登录链接
          </button>
          {params.error && (
            <p
              role="alert"
              className="rounded-[var(--radius-md)] border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-brand"
            >
              {params.error}
            </p>
          )}
        </form>
      )}

      <Link
        href="/"
        className="text-sm text-ink-soft underline decoration-dotted underline-offset-4 transition-colors hover:text-accent-deep"
      >
        ← 回首页
      </Link>
    </main>
  )
}
