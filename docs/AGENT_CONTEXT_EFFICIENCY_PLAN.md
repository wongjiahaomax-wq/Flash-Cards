# Coding-agent context-efficiency plan — historical PR #156 record

_Status: historical PR #156 planning/audit record. Implementation is complete in this PR. This file is not living operational authority._

For current coding-agent behavior, use:

- root `AGENTS.md` for repository-wide safety, retrieval, validation, and handoff policy;
- `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md` for Local / Remote GitHub / Hybrid execution mechanics and Remote Git-data write discipline;
- repository-owned validation tooling (`agent:checks`, validation contracts, and current CI) for executable check selection.

Do not treat this historical record as overriding those living authorities.

## Why PR #156 existed

Long coding-agent sessions were accumulating repeated repository/tool output even after the implementation surface was already known. PR #155 had already reduced routine local terminal-output volume; PR #156 addressed the remaining context-lifecycle problem without adding a new orchestration system.

The intended pattern was:

```text
bounded discovery
-> focused implementation
-> coherent checkpoint
-> context compaction when the client supports it
-> efficient read-only handoff retrieval
-> explicit mutations and exact-head verification
```

## Historical audit baseline

The original PR #156 audit was performed against post-PR-#155 `main` at `1be48975def0cde66ddb0ff4445131198062e320`.

Before final review, the branch was reconciled with current `main` at `9f1313d50c51eba6e8a32fa528727fd3df3eef80`, which includes PR #158. PR #158 further compacted Production test presentation by switching the Production deployment workflow's test step from `npm run test:verbose` to `npm run test:ci`.

Accordingly, the compact-output foundation should be read as:

- PR #155 established compact-by-default local validation/test/check/build presentation and bounded diagnostics;
- PR #158 later extended compact CI-oriented test presentation to the Production deployment workflow;
- PR #156 did not reimplement either change and remained documentation-only.

## Audit conclusions

The audit concluded that several broader ideas were already substantially satisfied and should not be reimplemented:

- `agent:checks` already exposed enough compact changed-scope and validation guidance;
- repeated-retrieval prevention was already substantially present in repository guidance;
- PR #155 already owned the main output-volume regression work;
- no new token counters, context thresholds, session parsers, file-read tracking, retrieval caches, command proxies, Git/GitHub wrappers, or second validation/retrieval DSL were justified.

The remaining gap was therefore limited to context lifecycle and handoff retrieval guidance.

## Later empirical evidence — PR #161 (7 September 2026)

The conclusions above describe what PR #156 reasonably believed at the time. They are intentionally preserved rather than rewritten after later evidence.

PR #160 subsequently tightened local/Hybrid Codex retrieval and compact tool-output behavior. The external audit of the later PR #161 coding session then showed that compact presentation was useful but insufficient as a whole-session efficiency strategy:

- tool-output volume fell materially, but overall input/context replay increased materially;
- the audited session reached approximately 14.29M input tokens versus approximately 42K output tokens, with about 98% of input reported as cached/replayed context;
- roughly 103 execution calls were observed, including about 30 patch operations;
- 21 process-poll turns used one-second yields;
- nine tool outputs were explicitly truncated;
- semantic checkpoint guidance did not reliably terminate discovery or prevent later rediscovery;
- excessive small turns became a material efficiency cost.

Accordingly, the PR #156 statement that repeated-retrieval prevention was “substantially present” was too optimistic as an execution claim. The remaining gap was not limited to lifecycle/handoff guidance: PR #161 demonstrated additional problems in retrieval-failure recovery, formal discovery termination, coherent implementation batching, process waiting/polling, and operational reuse of retained checkpoint evidence.

PR #162 addresses those later findings in the living authorities while preserving full session context. This historical record does not duplicate those operational rules; use root `AGENTS.md`, `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`, `docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md`, and the current validation authority for current behavior.

## Implemented PR #156 decisions

PR #156 moved the following rules into the living authorities:

1. Treat a coding session as `Discovery -> Implementation -> Checkpoint -> Handoff` using semantic milestones rather than token percentages or fixed command counts.
2. End broad discovery once current work state, implementation surface, directly related owners/tests, and any protected-boundary routing are established.
3. After a coherent implementation batch, inspect the scoped change and run risk-appropriate checkpoint validation before handoff.
4. When the active coding client exposes context compaction and substantial file/tool output has accumulated, compact at the coherent checkpoint-to-handoff boundary when useful.
5. Treat context compaction as a host/client capability, not a repository command.
6. After compaction, reuse the retained task/checkpoint summary and reread only evidence that is missing, ambiguous, changed, or drift-prone.
7. Permit batching of closely related read-only local/remote handoff facts only when attribution stays clear and each constituent command/request retains independent success/failure authority.
8. Reuse ordinary PR identity/head/base metadata while valid and refresh it after invalidating events rather than after every model turn.
9. Preserve the mandatory exception for Remote Git-data writes: immediately before constructing a commit/ref mutation, establish the exact current feature-branch head again and use the normal fast-forward discipline.
10. Tie final verification to the exact reviewed/validated head, PR head, and CI/check state for that SHA.
11. Keep commit, push/ref update, PR mutation, merge, migration, deployment, Production mutation, and live verification as explicit separate operations and evidence claims.
12. Preserve merge-base-aware tracked-change and separate untracked-file whitespace handling; do not replace repository-owned authority with a plain `git diff --check` shortcut.
13. Do not require a globally clean worktree when unrelated pre-existing tracked or untracked work must be preserved and accurately reported.
14. Treat a clean compact validation pass as sufficient evidence for that command; verbose reproduction remains diagnostic only.
15. Continue to inspect the complete intended-base-to-head diff deliberately at final review.

These numbered items remain the historical PR #156 decisions, including its then-current compaction guidance. Current living guidance supersedes that historical mechanism where PR #162 later changed it.

## Non-goals preserved

PR #156 intentionally did not add:

- model-token telemetry;
- context-window thresholds;
- session-file or conversation-output persistence;
- file-read tracking;
- retrieval caches;
- a new `agent:handoff` / `agent:finish` command;
- a generic shell proxy;
- a Git/GitHub wrapper;
- another changed-path classifier;
- another validation-selection DSL;
- any application/product behavior change;
- any migration, deployment, Preview, or Production behavior change.

## Final authority note

This document is retained only to explain the design/audit history of PR #156. If wording here ever conflicts with current executable behavior, root `AGENTS.md`, `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`, or repository-owned validation/CI contracts, the current living/executable authority wins.
