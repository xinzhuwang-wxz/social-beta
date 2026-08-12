import { sendMagicLink } from './actions'

interface LoginPageProps {
  searchParams: Promise<{ sent?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">登录池塘</h1>

      {params.sent ? (
        <p className="text-sm leading-relaxed text-ink-soft">
          登录链接已经发到 <strong>{params.sent}</strong>，去邮箱点一下就登录了。
          本地开发环境的邮件会落在{' '}
          <a
            className="underline"
            href="http://127.0.0.1:54324"
            target="_blank"
            rel="noreferrer"
          >
            Mailpit
          </a>
          。
        </p>
      ) : (
        <form action={sendMagicLink} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm text-ink-soft">
            邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@campus.edu"
            className="rounded border border-border-strong px-3 py-2"
          />
          <button
            type="submit"
            className="rounded border border-seal bg-seal px-4 py-2 text-seal-ink transition hover:bg-seal-strong"
          >
            发送登录链接
          </button>
          {params.error && (
            <p role="alert" className="text-sm text-red-600">
              {params.error}
            </p>
          )}
        </form>
      )}
    </main>
  )
}
