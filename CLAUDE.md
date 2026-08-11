# social-beta — 池塘 Pool

事件中心的校园社交 AI。产品与架构设计见 [`DESIGN.md`](./DESIGN.md)。

核心命题：把「人」建模成他参与过的事件的集合，而不是一张资料卡。底层是
`Person — Pool(事件) — Person` 的二部超图；人的长期记忆是一组指向 Pool 的指针；
关系是共同 Pool 的密度；AI 的记忆挂在 Pool 上，不挂在个人身上。

## Agent skills

### Issue tracker

Issues 和 PRD 存为 `xinzhuwang-wxz/social-beta` 的 GitHub issue，用 `gh` CLI 操作。见 `docs/agents/issue-tracker.md`。

### Triage labels

沿用五个标准角色的默认标签串（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文布局：根目录 `CONTEXT.md` + `docs/adr/`。见 `docs/agents/domain.md`。
