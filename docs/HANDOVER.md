# Flash-Cards agent handover

_Refreshed: 21 September 2026 (repository-state reconciliation)._

This handover is a concise current-state companion to `CURRENT_PRODUCT_ROADMAP.md`. Executable code, committed migrations and relevant subsystem authorities take precedence.

## Reconciliation base

Repository `main` checkpoint: `f392752cb5fe6fc14d37257d9352fd611cc0f25b` (merge of PR #193). Refresh GitHub before treating this as the latest HEAD.

Latest **committed repository** migration at that checkpoint: `0031_learner_feedback.sql`. `V1_DATA_MODEL.md` owns the complete migration ledger. Neither this checkpoint nor a committed migration establishes the Production D1 migration level or Worker deployment state.

Relevant merged work since the earlier handover: PR #147 (Multi-System Runtime v2), #159 (multi-System learner UX), #174 (Asset deduplication), #180 (password recovery), #181 (Production Admin account management), #186 (learner feedback), #187 (Study Review UX), #188 (Case Library local mutations), #192 (dead-code retirement), and #193 (Study navigation CPU optimization). See current code/PRs for implementation details rather than treating older plans as current status.

The GitHub repository is public. The application remains closed-enrollment/private; public signup remains disabled in the repository implementation.

## Status boundary

Do not collapse:

```text
merged on main
!= migration applied to Production D1
!= Worker deployed
!= feature enabled
!= Production behavior verified
!= learner rollout complete
```

There is no authority in this handover to apply Production migrations or deploy a Worker.

## Learner runtime

Current repository `/study` behavior is Systems-first and FSRS-owned.

### Run planning

- learner selects one or more Systems in a combined run, with whole-System scope by default and optional Topic/curated-Tag narrowing per System;
- learner selects Scheduled Study or Free Study;
- run-size choices are 5 / 10 / 20 / All available, default 10;
- Scheduled planning uses Due-first ordering with New fallback and preserves required FSRS short-term repeats without consuming an additional distinct-Case run slot;
- continuous navigation advances automatically when the next eligible Case can open immediately;
- browser-local run descriptors are convenience state only and are validated against server-authenticated run/scope/work proofs.

### Active Review ownership

Unfinished work is owned by:

```text
active_reviews
active_review_questions
active_review_assets
```

Active Review creation freezes current Case/question/media content plus scheduler/run/scope provenance. Authenticated learner Review media is served only through active Review asset ownership.

The physical legacy `reviews`, `review_questions`, and `review_assets` tables remain only as migration-history/cutover sentinels. Current application schema/routes do not create/read/complete them as a supported runtime mode.

### Completion

Scheduled Study:

- rates the Case Again / Hard / Good / Easy;
- advances Case-level FSRS state through the pinned `ts-fsrs` adapter;
- writes durable Scheduled events and compact learner/System/optimizer/analytics state according to the current data model;
- consumes the active Review exactly once.

Free Study:

- records non-scheduling exposure/aggregate activity;
- does not advance Scheduled FSRS state or ratings;
- owns short-lived exactly-once completion receipts.

### Reset/Fresh

Reset Progress invalidates any active Review, clears current learner×Case scheduler state, preserves retained history/aggregates, and advances the review-sequence boundary for initialized learners.

Fresh FSRS Start invalidates any active Review, clears current learner×Case scheduler state, restores the canonical default FSRS parameters at 90% desired retention, advances generation/review-sequence/parameter boundaries, and clears/prunes optimizer state as defined by the FSRS authority chain while preserving retained history/aggregates.

The creation-vs-Reset/Fresh race is serialized so no active Review survives on an old committed generation/sequence boundary.

### Retention and Progress

Detailed Scheduled-event retention supports 24m / 36m / 60m / indefinite. Admin per-learner retention control is at `/admin/learner-retention`.

Learner Progress exposes coverage, Due/not-due state, activity, rating distribution, System-level summaries, and retained recent history without exposing raw FSRS internals as the primary learner UX.

### Admin analytics / account deletion

PR #141 / PR G is merged.

`learner_system_monthly_buckets` stores durable learner × historical-System × UTC-month Scheduled counts so long-range Admin trends survive detailed event expiry. The buckets are maintained transactionally from Scheduled event insertion and are not reconstructed from lifetime aggregates or optimizer evidence.

Admin analytics live at `/admin/learner-analytics` and include learner totals, per-System totals/trends, cross-learner trends, and stable account-created-month cohort views.

Mature learner account deletion uses a durable deletion marker plus bounded retry-safe staged cleanup. Direct one-shot cascade is not the supported mature-account path because Scheduled history/optimizer evidence are not universally lifetime-bounded.

## Content/taxonomy model

Current Case classification:

```text
Case
├── exactly one behaviorally active Primary Topic
└── zero or more Case Tags
```

Systems organise learner navigation. Topics are canonical educational homes/direct Topic-question context. Tags are flat cross-cutting classification and may become contextual learner routes only when a System explicitly exposes them.

Historical secondary `case_concepts` rows remain inert compatibility data. Do not restore Additional Study Topic authoring or learner routing.

## Stimulus / question model

Fixed Case Assets are always shown. Alternative Sets select one eligible option per active group and preserve explicit Original semantics where curated.

Question answers live at their semantic context; `question_prompts` stores wording only. Current question sources include Case, stimulus group/option, Topic/ancestor, tag-scoped Shared Question, and explicitly opted-in exact-Asset Reusable Image Question sources.

Do not infer an Original from display order/name. Do not use a different image of the same diagnosis as a same-image higher-resolution replacement.

## Admin surfaces

Current repository Admin navigation includes Feedback, Accounts, learner analytics/retention, and My study data alongside content-management surfaces. The normal Study launcher is multi-System; direct Case Editor Study Preview remains owned by open Draft PR #190, not by this reconciliation.

Learner feedback is Case-level, learner-owned data submitted against an eligible active Review. The Production Admin Feedback queue supports review and deletion; Case Editor feedback operations are separate from Save All. Ordinary Case deactivation retains reports, while permanent learner-account deletion removes feedback through staged cleanup. Self-service study-data deletion does not purge feedback.

Admin Study Preview remains isolated from learner persistence. It must not create learner preferences, FSRS state, active Reviews, completion receipts, or legacy Review rows.

## Account Management

- PR #180 merged password recovery and the transactional-email foundation.
- PR #181 merged Production Admin account lifecycle management; `/admin/accounts` is present in current repository code.
- Additional security/self-service work and any Production configuration or rollout require separate current-state verification and authorization.

Do not equate these merges with configured production email, applied D1 migrations, a deployed Worker, or live account-management verification.

## Development / validation

Normal dependency preparation after branch sync is:

```sh
npm run deps:ensure
```

Use `npm run deps:ensure -- --force` for known damage/drift. GitHub Actions intentionally retain clean-install semantics with npm download caching.

Coding agents:

- read root `AGENTS.md`;
- route through `docs/AGENT_TASK_MAP.md`;
- use `npm run agent:checks -- --compact` after a coherent change when local execution exists;
- run all final required/specialized checks before handoff;
- in Remote GitHub mode, report CI evidence separately from unexecuted local commands.

## Documentation rule

Use `DOCUMENTATION_INDEX.md` to determine authority. Old PR plans/evidence may preserve historical branch-era statements. They do not override current code, migrations, or living authorities merely because their text says `current`, `draft`, or `pending`.
