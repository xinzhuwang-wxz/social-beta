import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StrataPanel } from "@/components/strata-panel";
import { StanceComparison } from "@/components/stance-comparison";
import { ProcessSteps } from "@/components/process-steps";

const RED_LINES = [
  {
    title: "连接对象",
    body: "AI 只出候选卡，真人点「我来说」，连接才算数。",
  },
  {
    title: "表述方式",
    body: "AI 出草稿，你能直接用、能改、也能整段推翻自己写。",
  },
  {
    title: "是否回应",
    body: "AI 永远不替你发出任何一条消息——不回，就是不回。",
  },
  {
    title: "记忆内容",
    body: "每条写进池塘的记忆，你都能看见、能编辑、能删除。",
  },
] as const;

const PRIMARY_BUTTON =
  "border border-seal bg-seal px-5 py-3 text-sm font-medium text-seal-ink transition-colors hover:border-seal-strong hover:bg-seal-strong";
const SECONDARY_BUTTON =
  "border border-border px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent";

/**
 * 落地页（AC1/AC2/AC4 主要落脚点）。
 *
 * 页面结构本身就是导航结构：header 的三个主要动作、hero 的两个 CTA、
 * 结尾 CTA 带里的两个入口，全部指向同一组真实路由（见
 * components/nav-links.ts）。从这个页面到任意一个主要动作只需要 1 次
 * 点击，远低于 AC 要求的 3 次。
 */
export default function Home() {
  return (
    <>
      <SiteHeader />

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {/* ------------------------------------------------------------ 首屏 */}
        <section className="border-b border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:gap-12">
            <div className="animate-rise-in">
              <p className="text-sm font-medium text-accent">
                池塘 · 校园社交 AI
              </p>
              <h1 className="mt-4 font-head text-4xl font-semibold leading-[1.15] text-ink sm:text-5xl">
                AI 帮你把要发生的事先演一遍，
                <br />
                但那句话，得你自己说。
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
                池塘不是又一个「AI 帮你聊天」的社交产品。发一句你想干什么，AI
                会给你几张候选卡——附上你们为什么可能合得来、对方大概率会不会理你、
                以及一句具体的开场提案。剩下的——连接谁、怎么开口、要不要回——
                都是你自己点出来的。
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/square" className={PRIMARY_BUTTON}>
                  发一条意图
                </Link>
                <Link href="/candidates" className={SECONDARY_BUTTON}>
                  看看候选卡长什么样
                </Link>
              </div>
              <p className="mt-5 text-xs text-ink-soft">
                不用装 App，浏览器打开就能用 · 注册不用先编一份资料
              </p>
            </div>

            <div
              className="animate-rise-in"
              style={{ animationDelay: "120ms" }}
            >
              <StrataPanel />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ 01 分野 */}
        <section id="stance" className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <SectionEyebrow n="01" label="分野" />
            <h2 className="mt-3 max-w-2xl font-head text-2xl font-semibold leading-snug text-ink sm:text-3xl">
              别的 AI 替你说话，我们的 AI 只把话准备好
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
              「AI 帮你聊天」类产品让 AI
              在后台替你逐句回复，对方甚至分不清跟他说话的是不是真人。我们认为这制造的是虚假繁荣——关系里最重要的确认环节被跳过了。所以池塘划了一条线：
            </p>
            <div className="mt-8">
              <StanceComparison />
            </div>
            <p className="mt-6 max-w-2xl border-l-2 border-seal pl-4 text-sm leading-relaxed text-ink sm:text-base">
              一句话说完：我们的 AI 只做预演。连接、表达、回应、记忆——这四件事的决定权，永远在你手上。
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------ 02 怎么运作 */}
        <section id="how" className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <SectionEyebrow n="02" label="怎么运作" />
            <h2 className="mt-3 max-w-2xl font-head text-2xl font-semibold leading-snug text-ink sm:text-3xl">
              从一句话，到一次真的发生的事
            </h2>
            <div className="mt-8">
              <ProcessSteps />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ 03 画像 */}
        <section id="profile" className="border-b border-border bg-surface-alt/40">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <SectionEyebrow n="03" label="关于你的画像" />
            <div className="mt-3 grid gap-8 md:grid-cols-2 md:gap-14">
              <h2 className="font-head text-2xl font-semibold leading-snug text-ink sm:text-3xl">
                注册的时候，不用先编一份自我介绍
              </h2>
              <div className="flex flex-col gap-4 text-sm leading-relaxed text-ink-muted sm:text-base">
                <p>
                  别的产品让你先写清楚你是谁，再开始用。池塘反过来——你先做了几件事，画像才自己长出来。系统按运动、学术、手艺这类生活领域，把你去过的池塘拼成一张张「切面」，而不是一份写死的简历。
                </p>
                <p>
                  每一条切面都能看出它是从哪个池塘推出来的，你能改，也能删；还能给每个切面单独设谁能看——运动切面可以给陌生人看，某些切面只留给熟人。
                </p>
                <p className="border-l-2 border-accent pl-4 text-ink">
                  你没发生过的事，不算数；一时兴起没成行的念头，也不会被算进「你是谁」。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ 04 红线 */}
        <section id="lines" className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <SectionEyebrow n="04" label="四条红线" />
            <h2 className="mt-3 max-w-2xl font-head text-2xl font-semibold leading-snug text-ink sm:text-3xl">
              这四件事，AI 永远不替你做决定
            </h2>
            <dl className="mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
              {RED_LINES.map((line) => (
                <div key={line.title} className="bg-surface p-6">
                  <dt className="font-head text-base font-semibold text-ink">
                    {line.title}
                  </dt>
                  <dd className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {line.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ------------------------------------------------------------ 结尾 CTA */}
        <section className="bg-surface-alt">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <p className="text-sm font-medium text-accent">现在</p>
            <h2 className="mt-3 max-w-xl font-head text-3xl font-semibold leading-snug text-ink sm:text-4xl">
              想好要做的事了，就发一句。
            </h2>

            <div className="mt-8 max-w-md border border-border bg-surface-raised p-5">
              <p className="text-xs text-ink-soft">比如</p>
              <p className="mt-1 font-head text-base leading-relaxed text-ink">
                「这周六想去后海骑车，人多点热闹，谁一起」
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/square" className={PRIMARY_BUTTON}>
                发一条意图
              </Link>
              <Link href="/home" className={SECONDARY_BUTTON}>
                看看已经开起来的池塘
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function SectionEyebrow({ n, label }: { n: string; label: string }) {
  return (
    <p className="flex items-baseline gap-2 text-sm text-ink-soft">
      <span className="font-head text-base text-accent">{n}</span>
      <span>{label}</span>
    </p>
  );
}
