const STEPS = [
  {
    n: "01",
    title: "发一句人话",
    body: "「周六想去爬山，最好野线，能拍照的加分。」不用挑分类、不用选标签，怎么说话平时就怎么说。",
  },
  {
    n: "02",
    title: "看几张候选卡",
    body: "3 到 5 个人，每张卡说清为什么可能合得来、对方大概率会不会理你、以及一个具体提案——「周六 6 点北宫门集合」。",
  },
  {
    n: "03",
    title: "你点「我来说」",
    body: "候选卡不是聊天记录。AI 只演到这一步，连接是不是成立、成立了要不要先开口，都是你自己点出来的。",
  },
  {
    n: "04",
    title: "池塘里正常聊",
    body: "群里是你们自己在聊。AI 大多数时候不出声，只有卡壳了才发一张卡——时间定不下来发投票卡，缺人发清单卡。",
  },
  {
    n: "05",
    title: "传几张回来的照片",
    body: "事情办完，传几张返图，系统把这次的事沉淀成你们的共同记忆，顺手生成一张海报。",
  },
  {
    n: "06",
    title: "池塘不会消失",
    body: "它带着「下次去大觉寺」这句话进入休眠，时候到了会主动回来问你们要不要再约一次。",
  },
] as const;

/**
 * 六步核心链路，用编号代替 emoji 做章节标记——宋体数字本身就是很克制的
 * 版式语言，不需要图标堆砌。
 */
export function ProcessSteps() {
  return (
    <ol className="flex flex-col">
      {STEPS.map((step, i) => (
        <li
          key={step.n}
          className={`grid grid-cols-[3rem_1fr] gap-4 py-6 sm:grid-cols-[4rem_1fr] sm:gap-6 ${
            i > 0 ? "border-t border-border" : ""
          }`}
        >
          <span className="font-head text-2xl text-ink-soft sm:text-3xl">
            {step.n}
          </span>
          <div>
            <h3 className="font-head text-lg font-semibold text-ink">
              {step.title}
            </h3>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
              {step.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
