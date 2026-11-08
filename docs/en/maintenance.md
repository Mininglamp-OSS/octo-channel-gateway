# Maintenance and validation

[简体中文](../zh-CN/maintenance.md) | [Documentation](README.md)

Created on 2026-11-08 against the independent Gateway worktree: base commit 16d7421 plus current uncommitted extraction/API changes. This is not a published release note. Planning and actual evidence are separate in the [octospec brief](../../.octospec/tasks/gateway-bilingual-docs/brief.md) and [validation record](../../.octospec/tasks/gateway-bilingual-docs/validation.md).

## Runtime-aligned maintenance

English and Chinese use identical relative paths under docs/en and docs/zh-CN. Language links open matching topics. Executable examples live in docs/examples, and fenced examples match those files; docs/checks verifies examples with a controlled Kernel. This is repository Markdown, with no new documentation site or CI workflow. Root README links here; octospec records engineering process rather than being an integration prerequisite.

```sh
npm run build
npm run docs:check
npm run typecheck
```

Documentation checks cover paired topics/code, language links, local Markdown links, JSON Bot configuration, shared TypeScript types, and example execution. Existing CLI/registration tests cover Runtime prerequisites, ownership, and closure. Live IM/Provider and native service acceptance must record separate versions, dates, and environments; fixtures cannot establish those results.

## Update rules

When APIs, defaults, errors, or lifecycles change, update both languages and shared examples. Add new topics to both indexes. Do not link machine-specific absolute paths or imply unpublished versions exist. Runtime setup guidance must match the supported IPC/client major. Describe retained CLI compatibility and internal drafts accurately rather than presenting target architecture as implemented behavior.

Historical full-suite results are in the [agentEnv validation](../../.octospec/tasks/agent-env-invocation/validation.md). Current results belong to this task's validation record. No claim is made for real models, live IM, or native Windows/Linux services.
