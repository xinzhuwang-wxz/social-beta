const ROWS = [
  {
    dim: "连接谁",
    other: "算法直接建立对话，你事后才知道自己被安排认识了谁",
    pool: "AI 只出候选卡，你点「我来说」，连接才成立",
  },
  {
    dim: "说什么",
    other: "AI 在聊天框里替你逐句回复，对方分不清是不是真人",
    pool: "AI 出一句开场草稿，你能直接用、能改、也能整段删了自己写",
  },
  {
    dim: "回不回",
    other: "你不回，系统会在后台替你维持「活跃」",
    pool: "不回就是不回，没有任何东西替你敷衍过去",
  },
  {
    dim: "记住什么",
    other: "藏在模型的对话上下文里，你看不到，也改不了",
    pool: "每条长进森林的记忆，你能看、能改、能删",
  },
] as const;

/**
 * 核心主张的正面对比：与「代答式」AI 社交产品逐项划清界限。
 *
 * 用 CSS grid 而不是 <table> —— 移动端把三列自然堆成一列，
 * 不会出现表格惯有的「横向滚动才能看全」的问题。
 * 我方那一列压一层极淡的叶色底：绿在这套系统里的意思是「活着的」，
 * 用在这里正好 —— 左边那一列是被代答掉的关系，它没活着。
 */
export function StanceComparison() {
  return (
    <div className="border border-border">
      <div className="mark hidden border-b border-border bg-surface-alt px-5 py-2.5 text-ink-soft sm:grid sm:grid-cols-[6rem_1fr_1fr] sm:gap-6 sm:px-6">
        <span>决定权</span>
        <span>代答式 AI 社交</span>
        <span className="text-accent">池塘</span>
      </div>
      {ROWS.map((row, i) => (
        <div
          key={row.dim}
          className={`grid grid-cols-1 gap-2.5 px-5 py-5 sm:grid-cols-[6rem_1fr_1fr] sm:gap-6 sm:px-6 sm:py-4 ${
            i > 0 ? "border-t border-border" : ""
          }`}
        >
          <div className="font-head text-base font-semibold text-ink sm:text-sm">
            {row.dim}
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">
            <span className="mr-1 sm:hidden">代答式 AI：</span>
            {row.other}
          </p>
          <p className="border-l-2 border-accent pl-3 text-sm leading-relaxed text-ink sm:border-l sm:border-border sm:pl-4">
            <span className="mr-1 text-accent sm:hidden">池塘：</span>
            {row.pool}
          </p>
        </div>
      ))}
    </div>
  );
}
