const STEPS = [
  {
    n: "01",
    role: "种子",
    title: "说一句人话，种下一颗",
    body: "「周六想去爬山，最好野线，能拍照的加分。」不挑分类、不选标签、不填表。一颗种子就是一个还没发生的行动愿望。",
  },
  {
    n: "02",
    role: "信使",
    title: "你的 Agent 出门去找人",
    body: "它理解你要什么，去校区里找可能合得来的人，把种子送进对方的信箱。它是信使，不是替身——它不会假装成你去跟人聊天。",
  },
  {
    n: "03",
    role: "你",
    title: "候选卡摆在你面前，你点「我来说」",
    body: "3 到 5 个人，每张卡说清为什么是他、以及一句你可以直接发出去的开场白草稿。改它、删了重写、还是干脆不发，都由你。",
  },
  {
    n: "04",
    role: "植物",
    title: "两个人都确认，它才破土",
    body: "对方不点确认，就是这次不合适——系统不需要知道原因，也不会替他敷衍。确认之后，那件事开始长：长叶、生长、结出花苞。",
  },
  {
    n: "05",
    role: "开花",
    title: "事真的做成了，它才开花",
    body: "行动房间里是你们自己在聊，精灵大多数时候不出声，卡住了才发一张卡。办完之后传几张返图——每一份都让这株多开一朵。",
  },
  {
    n: "06",
    role: "森林",
    title: "它不会消失，会长进你的森林",
    body: "花谢结籽，籽是「下次去大觉寺」这句话。时候到了它自己回来问你们要不要再来一次；而这件事从此写进「你是谁」。",
  },
] as const;

/**
 * 六步核心链路 —— 也是种子→植物→森林这条线的完整展开。
 *
 * 左栏那个词（种子 / 信使 / 你 / 植物 / 开花 / 森林）是这一步的主语，
 * 用它代替 emoji 和图标做章节标记：读者顺着左栏往下扫一遍，
 * 就已经读完了整个世界观。
 */
export function ProcessSteps() {
  return (
    <ol className="flex flex-col">
      {STEPS.map((step, i) => (
        <li
          key={step.n}
          className={`grid grid-cols-1 gap-x-6 gap-y-2 py-6 sm:grid-cols-[7rem_1fr] ${
            i > 0 ? "border-t border-border" : ""
          }`}
        >
          <div className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
            <span className="mark text-ink-soft">{step.n}</span>
            <span className="font-head text-lg text-accent">{step.role}</span>
          </div>
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
