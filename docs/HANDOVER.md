# Flash-Cards agent handover

_Refreshed: 4 September 2026._

This handover is a concise current-state companion to `CURRENT_PRODUCT_ROADMAP.md`. It is not a substitute for executable code/migrations or subsystem authorities.

## Reconciliation base

This reconciliation was prepared from `main` commit:

```text
602b2abab7102dd135670c9bd4f564c1d07528dc
```

That commit merged PR #142 (dependency-install speedups). Use Git/GitHub for the exact current head after this documentation PR changes the branch.

The implemented repository migration boundary is:

```text
0025_learner_fsrs_admin_analytics_deletion.sql
```

Important merged sequence represented by this handover includes:

- PR #137 — learner `/study` runtime cutover to FSRS/Free and legacy Review retirement;
- PR #139 — PR F: Reset Progress / Fresh FSRS Start, detailed-history retention/control, learner Progress;
- PR #141 — PR G: durable monthly Admin analytics/cohorts and mature-account-deletion readiness;
- PR #142 — dependency reuse/cache/install speedups.

The repository is public. The application remains closed-enrollment/private; public signup remains disabled on current repository code.

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

- learner selects a System;
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

Current repository Admin navigation includes learner analytics/retention in addition to the established content-management surfaces.

Admin Study Preview remains isolated from learner persistence. It must not create learner preferences, FSRS state, active Reviews, completion receipts, or legacy Review rows.

## Account Management

Account Management v1 is not merged on the reconciliation base:

- PR #96 is open/draft and implements password recovery plus transactional email on its branch;
- PR #97 is open/draft and stacked on #96 for Production Admin account management.

Do not treat their implementation prompts or PR bodies as current-main behavior.

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
