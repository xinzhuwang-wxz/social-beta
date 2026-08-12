import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GrowthPlate } from "@/components/growth-plate";
import { SpecimenCard } from "@/components/specimen-card";
import { ForestBand } from "@/components/forest-band";
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
    body: "每条长进森林的记忆，你都能看见、能编辑、能删除。",
  },
] as const;

/**
 * 落地页的示例森林。
 *
 * 明确标注为示例，且不出现在任何产品页面上 —— /me 那片森林里的每一株
 * 都来自 PoolEngine.myPools 的真实记录，一株也不掺。
 */
const SAMPLE_FOREST = [
  { key: "a", stage: "blooming" as const, artifacts: 3, title: "周六后海骑车" },
  { key: "b", stage: "fruiting" as const, artifacts: 1, title: "陶艺工作坊" },
  { key: "c", stage: "sapling" as const, artifacts: 0, title: "数模组队" },
  { key: "d", stage: "blooming" as const, artifacts: 1, title: "香山看红叶" },
  { key: "e", stage: "fruiting" as const, artifacts: 2, title: "创业赛复盘" },
  { key: "f", stage: "budding" as const, artifacts: 0, title: "毕设互审" },
];

const PRIMARY_BUTTON =
  "border border-seal bg-seal px-5 py-3 text-sm font-medium text-seal-ink transition-colors hover:border-seal-strong hover:bg-seal-strong";
const SECONDARY_BUTTON =
  "border border-border px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent";

/**
 * 落地页。
 *
 * 结构就是世界观的顺序：一颗种子 → 一株植物的一生 → 我们和代答式 AI 的分野
 * → 六步怎么走 → 一片森林 → 四条红线。读到底的人应该能自己复述出
 * 「这个产品要解决的不是找不到人，是没人先开口」。
 */
export default function Home() {
  return (
    <>
      <SiteHeader />

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {/* ------------------------------------------------------------ 首屏 */}
        <section className="border-b border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-20 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-14">
            <div className="animate-rise-in">
              <p className="mark text-accent">种子 · 植物 · 森林</p>
              <h1 className="mt-4 font-head text-4xl leading-[1.2] font-semibold text-ink sm:text-5xl">
                种下一颗，
                <br />
                看它长成一件
                <br />
                真的发生过的事。
              </h1>
              {/* 中文段落必须写成一行。JSX 会把源码里的换行折成一个空格，
                  中文之间多出来的那个半角空格在页面上非常刺眼。 */}
              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
                池塘不是又一个帮你找搭子的 App——找到人只是开头。你说一句想干什么，那就是一颗种子；你的 Agent 把它送到可能合得来的人手上；
                <span className="text-ink">两个人都点了确认，它才破土。</span>
                之后长叶、生长、开花，全靠你们真的把这件事做成。
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/square" className={PRIMARY_BUTTON}>
                  种下第一颗
                </Link>
                <Link href="#stance" className={SECONDARY_BUTTON}>
                  AI 到底替我做什么
                </Link>
              </div>
              <p className="mt-5 text-xs text-ink-soft">
                不用装 App · 注册不用先编一份资料 · AI 从不替你发出任何一条消息
              </p>
            </div>

            <div className="animate-rise-in" style={{ animationDelay: "120ms" }}>
              <SpecimenCard />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- 01 生长图谱 */}
        <section id="growth" className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <SectionEyebrow n="01" label="一次行动的一生" />
            <h2 className="mt-3 max-w-2xl font-head text-2xl leading-snug font-semibold text-ink sm:text-3xl">
              这株植物长到哪一步，就是这件事办到哪一步
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
              它不是进度条的装饰版本。每一次形态变化背后都有一件真的发生过的事：有人点了确认、有人在卡片上投了票、有人传了一张返图。没有发生的事，不会让它长高一毫米。
            </p>
            <div className="mt-8">
              <GrowthPlate />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ 02 分野 */}
        <section id="stance" className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <SectionEyebrow n="02" label="分野" />
            <h2 className="mt-3 max-w-2xl font-head text-2xl leading-snug font-semibold text-ink sm:text-3xl">
              别的 AI 替你说话，我们的 AI 只把话准备好
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
              「AI 帮你聊天」类产品让 AI 在后台替你逐句回复，对方甚至分不清跟他说话的是不是真人。我们认为这制造的是虚假繁荣——关系里最重要的确认环节被跳过了。所以池塘划了一条线：
            </p>
            <div className="mt-8">
              <StanceComparison />
            </div>
            <p className="mt-6 max-w-2xl border-l-2 border-seal pl-4 text-sm leading-relaxed text-ink sm:text-base">
              一句话说完：AI 出候选和草稿，连接谁、怎么说、要不要回，全由你点。
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- 03 怎么运作 */}
        <section id="how" className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <SectionEyebrow n="03" label="怎么运作" />
            <h2 className="mt-3 max-w-2xl font-head text-2xl leading-snug font-semibold text-ink sm:text-3xl">
              从一句话，到一件真的发生的事
            </h2>
            <figure className="mt-6 max-w-2xl border-l-2 border-accent pl-4">
              <blockquote className="font-head text-lg leading-relaxed text-ink">
                最远的距离不是宿舍到早八教室，而是你们都对一件事感兴趣、都想组队，但没有一个人先问一句「要不要一起」。
              </blockquote>
              <figcaption className="mark mt-2 text-ink-soft">
                这就是池塘要解决的那一件事
              </figcaption>
            </figure>
            <div className="mt-10">
              <ProcessSteps />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- 04 森林 */}
        <section id="forest" className="border-b border-border bg-surface-alt">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <SectionEyebrow n="04" label="我的森林" />
            <div className="mt-3 grid gap-10 md:grid-cols-2 md:gap-14">
              <div>
                <h2 className="font-head text-2xl leading-snug font-semibold text-ink sm:text-3xl">
                  你的画像，不是你声称喜欢什么，是你真正和别人完成过什么
                </h2>
                {/* 图放在标题正下方而不是整段之后：这排植物就是上面那句话的证据，
                    隔着一整段文字才出现的证据，说服力会被稀释掉。 */}
                <div className="mt-8 border-t border-border pt-6">
                  <p className="mark mb-4 text-ink-soft">一片森林 · 示例</p>
                  <ForestBand plants={SAMPLE_FOREST} className="gap-x-1 gap-y-6" />
                </div>
              </div>
              <div className="flex flex-col gap-4 text-sm leading-relaxed text-ink-muted sm:text-base">
                <p>
                  注册的时候不用先编一份自我介绍。你先做了几件事，画像才自己长出来——系统按运动、学术、手艺这类领域，把你去过的地方拼成一张张「切面」，而不是一份写死的简历。
                </p>
                <p>
                  每一条切面都能点回它的依据：具体是哪几株植物长出了这句话。你能改可见度、也能删。
                </p>
                <p className="border-l-2 border-seal pl-4 text-ink">
                  你没发生过的事，不算数；一时兴起没成行的念头，也不会被算进「你是谁」。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- 05 红线 */}
        <section id="lines" className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <SectionEyebrow n="05" label="四条红线" />
            <h2 className="mt-3 max-w-2xl font-head text-2xl leading-snug font-semibold text-ink sm:text-3xl">
              这四件事，AI 永远不替你做决定
            </h2>
            <dl className="mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
              {RED_LINES.map((line, i) => (
                <div key={line.title} className="bg-surface p-6">
                  <dt className="flex items-baseline gap-3">
                    <span className="mark text-seal">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-head text-base font-semibold text-ink">
                      {line.title}
                    </span>
                  </dt>
                  <dd className="mt-2 pl-9 text-sm leading-relaxed text-ink-muted">
                    {line.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ------------------------------------------------------------ 结尾 */}
        <section className="bg-surface-alt">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <p className="mark text-accent">现在</p>
            <h2 className="mt-3 max-w-xl font-head text-3xl leading-snug font-semibold text-ink sm:text-4xl">
              想好要做的事了，就种一颗。
            </h2>

            <div className="mt-8 max-w-md border-l-2 border-accent bg-surface-raised px-5 py-4">
              <p className="mark text-ink-soft">比如</p>
              <p className="mt-1 font-head text-base leading-relaxed text-ink">
                「这周六想去后海骑车，人多点热闹，谁一起」
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/square" className={PRIMARY_BUTTON}>
                种下第一颗
              </Link>
              <Link href="/home" className={SECONDARY_BUTTON}>
                看看我已经长起来的
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
    <p className="flex items-baseline gap-3">
      <span className="mark text-accent">{n}</span>
      <span className="text-sm text-ink-soft">{label}</span>
    </p>
  );
}
