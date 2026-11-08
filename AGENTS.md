# Channel Gateway 开发指引

独立 TypeScript SDK。沟通、任务和工程记录使用中文；docs 开发者文档按同路径维护中英文两套。

先读 `.octospec/index.md`、规则索引和架构规则。渠道业务归本仓库，执行只使用公开 client，不依赖 Runtime checkout 或私有包。任务规划达到 95 分后实施，评分与真实验证分别记录。

<!-- octospec:begin -->
## octo-spec engineering standard

This repo carries a shared engineering standard in `.octospec/`, readable by any
coding agent working in this checkout (Claude Code, Codex, OpenClaw, Gemini, or
others). **Follow it for any non-trivial change.**

When you take on a coding task here:

1. **Start from a brief.** Capture goal / load-bearing list / out-of-scope /
   acceptance in `.octospec/tasks/<slug>/brief.md`
   (template: `.octospec/tasks/_brief.template.md`). Draft it from the code; a
   human confirms it.
2. **Inject the rules that apply.** Read `.octospec/rules/` (index:
   `.octospec/rules/_index.yaml`) plus the inherited global rules in
   `.octospec/_global/`. A rule applies when its `inject_when.paths` matches a
   file you will touch, OR its `inject_when.touches` tag is in the brief's
   load-bearing list. **Read and follow the full text** of each matching rule
   before writing code; prioritize `load_bearing: true` rules.
3. **Implement** following those rules.
4. **Verify** the diff against each injected rule and the brief's acceptance;
   run the repo's gates (lint / type-check / tests).
5. **Open a PR** filling **Linked Spec** + the **COMPREHENSION** three questions
   for load-bearing / architectural / P0 changes. Trivial changes
   (typo/docs/lint/config) are exempt.

Claude Code users also have `/octospec-plan|go|check|finish` slash commands
(committed under `.claude/commands/`). Other agents read the same `.octospec/`
files directly — the steps above are the same regardless of tool.

The first time you apply this in a session, tell the user in one line that this
repo follows the octo-spec standard and point them at `.octospec/` (and
`docs/` in the octo-spec repo) for detail.

This region is managed by octospec-sync; edit outside the markers.
<!-- octospec:end -->
