import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GrowthPlate } from "@/components/growth-plate";
import { GardenScene } from "@/components/garden-scene";
import { MessengerBird } from "@/components/messenger-bird";
import { PoolPlant } from "@/components/pool-plant";
import { StanceComparison } from "@/components/stance-comparison";
import { ProcessSteps } from "@/components/process-steps";

const RED_LINES = [
  { title: "连接对象", body: "AI 只出候选卡，真人点「我来说」，连接才算数。" },
  { title: "表述方式", body: "AI 出草稿，你能直接用、能改、也能整段推翻自己写。" },
  { title: "是否回应", body: "AI 永远不替你发出任何一条消息——不回，就是不回。" },
  { title: "记忆内容", body: "每条长进森林的记忆，你都能看见、能编辑、能删除。" },
] as const;

/**
 * 落地页示例花园。明确标注为示例，且不出现在任何产品页面上 ——
 * /home 与 /me 那两片花园里的每一株都来自 PoolEngine 的真实记录。
 */
const SAMPLE_GARDEN = [
  { key: "a", stage: "bloom" as const, artifacts: 3, title: "周六后海骑车" },
  { key: "b", stage: "fruit" as const, artifacts: 1, title: "陶艺工作坊" },
  { key: "c", stage: "seedling" as const, artifacts: 0, title: "数模组队" },
  { key: "d", stage: "bud" as const, artifacts: 0, title: "毕设互审" },
  { key: "e", stage: "sprout" as const, artifacts: 0, title: "周日夜跑" },
  { key: "f", stage: "bloom" as const, artifacts: 1, title: "香山看红叶" },
];

/**
 * 落地页。
 *
 * 结构就是世界观的顺序：一颗种子 → 一株植物的一生 → 我们和代答式 AI 的分野
 * → 六步怎么走 → 信使鸟 → 一片森林 → 四条红线。
 */
export default function Home() {
  return (
    <>
      <SiteHeader />

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {/* ------------------------------------------------------------ 首屏 */}
        <section className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 sm:py-14 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-12">
          <div className="animate-rise-in">
            <p className="t-cap font-medium tracking-wide text-accent-deep">
              种子 · 植物 · 森林
            </p>
            <h1 className="t-h1 mt-3 text-[2rem] leading-[1.25] sm:text-[2.5rem]">
              种下一颗，看它长成一件真的发生过的事。
            </h1>
            <p className="t-sec mt-5 max-w-xl text-base">
              池塘不是又一个帮你找搭子的 App——找到人只是开头。你说一句想干什么，那就是一颗种子；信使鸟把它送到可能合得来的人手上；
              <span className="font-semibold text-ink">两个人都点了确认，它才破土。</span>
              之后长叶、开花，全靠你们真的把这件事做成。
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/square" className="btn btn-primary">
                种下第一颗
              </Link>
              <Link href="#stance" className="btn btn-secondary">
                AI 到底替我做什么
              </Link>
            </div>
            <p className="t-cap mt-4">
              不用装 App · 注册不用先编一份资料 · AI 从不替你发出任何一条消息
            </p>
          </div>

          <div className="animate-rise-in" style={{ animationDelay: "120ms" }}>
            <GardenScene plants={SAMPLE_GARDEN} bird="happy" />
            <p className="t-cap mt-2 text-center">一片花园 · 示例</p>
          </div>
        </section>

        {/* ------------------------------------------------------- 01 生长图谱 */}
        <section id="growth" className="bg-surface-alt">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <SectionEyebrow n="01" label="一次行动的一生" />
            <h2 className="t-h2 mt-2 max-w-2xl">
              这株植物长到哪一步，就是这件事办到哪一步
            </h2>
            <p className="t-sec mt-3 max-w-2xl">
              它不是进度条的装饰版本。每一次形态变化背后都有一件真的发生过的事：有人点了确认、有人在卡片上投了票、有人传了一张返图。没有发生的事，不会让它长高一毫米。
            </p>
            <div className="mt-7">
              <GrowthPlate />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ 02 分野 */}
        <section id="stance">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <SectionEyebrow n="02" label="分野" />
            <h2 className="t-h2 mt-2 max-w-2xl">
              别的 AI 替你说话，我们的 AI 只把话准备好
            </h2>
            <p className="t-sec mt-3 max-w-2xl">
              「AI 帮你聊天」类产品让 AI 在后台替你逐句回复，对方甚至分不清跟他说话的是不是真人。我们认为这制造的是虚假繁荣——关系里最重要的确认环节被跳过了。所以池塘划了一条线：
            </p>
            <div className="mt-7">
              <StanceComparison />
            </div>
            <p className="t-hand mt-5 max-w-2xl rounded-[var(--radius-md)] bg-accent-soft px-4 py-3 text-base leading-relaxed text-ink">
              一句话说完：AI 出候选和草稿，连接谁、怎么说、要不要回，全由你点。
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- 03 怎么运作 */}
        <section id="how" className="bg-surface-alt">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <SectionEyebrow n="03" label="怎么运作" />
            <h2 className="t-h2 mt-2 max-w-2xl">从一句话，到一件真的发生的事</h2>
            <figure className="card mt-5 max-w-2xl p-5">
              <blockquote className="t-hand text-lg leading-relaxed text-ink">
                最远的距离不是宿舍到早八教室，而是你们都对一件事感兴趣、都想组队，但没有一个人先问一句「要不要一起」。
              </blockquote>
              <figcaption className="t-cap mt-2">这就是池塘要解决的那一件事</figcaption>
            </figure>
            <div className="mt-8">
              <ProcessSteps />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- 04 信使鸟 */}
        <section id="agent">
          <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div className="card flex items-end justify-around gap-2 p-5">
              {(["carrying", "flying", "delivering", "happy"] as const).map((s) => (
                <MessengerBird key={s} state={s} className="size-16 sm:size-20" label={null} />
              ))}
            </div>
            <div>
              <SectionEyebrow n="04" label="你的信使鸟" />
              <h2 className="t-h2 mt-2">它是信使，不是替身</h2>
              <p className="t-sec mt-3">
                它理解你要什么，去校区里找可能合得来的人，把种子送进对方的信箱，再把候选带回来给你看。
              </p>
              <p className="t-hand mt-3 rounded-[var(--radius-md)] bg-accent-soft px-4 py-3 text-base leading-relaxed text-ink">
                它不会假装成你去跟人聊天。那句话，始终得你自己说。
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- 05 森林 */}
        <section id="forest" className="bg-surface-alt">
          <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-2 md:gap-12">
            <div>
              <SectionEyebrow n="05" label="回忆森林" />
              <h2 className="t-h2 mt-2">
                你的画像，不是你声称喜欢什么，是你真正和别人完成过什么
              </h2>
              <div className="mt-5 flex items-end gap-1">
                {(["bloom", "fruit", "bloom"] as const).map((s, i) => (
                  <PoolPlant
                    key={i}
                    stage={s}
                    artifacts={i + 1}
                    label={null}
                    className="h-24 w-20"
                  />
                ))}
              </div>
            </div>
            <div className="t-sec flex flex-col gap-4 text-base">
              <p>
                注册的时候不用先编一份自我介绍。你先做了几件事，画像才自己长出来——系统按运动、学术、手艺这类领域，把你去过的地方拼成一张张「切面」，而不是一份写死的简历。
              </p>
              <p>
                每一条切面都能点回它的依据：具体是哪几株植物长出了这句话。你能改可见度、也能删。
              </p>
              <p className="t-hand rounded-[var(--radius-md)] bg-surface-raised px-4 py-3 text-base leading-relaxed text-ink">
                你没发生过的事，不算数；一时兴起没成行的念头，也不会被算进「你是谁」。
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- 06 红线 */}
        <section id="lines">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <SectionEyebrow n="06" label="四条红线" />
            <h2 className="t-h2 mt-2 max-w-2xl">这四件事，AI 永远不替你做决定</h2>
            <dl className="mt-7 grid gap-3 sm:grid-cols-2">
              {RED_LINES.map((line, i) => (
                <div key={line.title} className="card p-5">
                  <dt className="flex items-baseline gap-2.5">
                    <span className="t-cap font-semibold text-accent-deep">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="t-h3">{line.title}</span>
                  </dt>
                  <dd className="t-sec mt-2">{line.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ------------------------------------------------------------ 结尾 */}
        <section className="bg-surface-alt">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <p className="t-cap font-medium tracking-wide text-accent-deep">现在</p>
            <h2 className="t-h1 mt-2 max-w-xl">想好要做的事了，就种一颗。</h2>

            <div className="card mt-6 max-w-md p-5">
              <p className="t-cap">比如</p>
              <p className="t-hand mt-1 text-lg leading-relaxed text-ink">
                「这周六想去后海骑车，人多点热闹，谁一起」
              </p>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/square" className="btn btn-primary">
                种下第一颗
              </Link>
              <Link href="/home" className="btn btn-secondary">
                看看我的花园
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
    <p className="flex items-baseline gap-2.5">
      <span className="t-cap font-semibold text-accent-deep">{n}</span>
      <span className="t-cap">{label}</span>
    </p>
  );
}
