# Learner FSRS Runtime Cutover Status

Status: **current repository runtime authority after merged PR #137, PR #139 (PR F), and PR #141 (PR G).**

Date: 4 September 2026

This document records the current repository learner-runtime boundary. It complements:

- `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — locked product authority;
- `LEARNER_FSRS_RUN_SIZE_PRODUCT_AMENDMENT.md` — 5/10/20/All and continuous-run amendment;
- `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md` — technical design/history;
- `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md` — safety/readiness requirements;
- `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md` — tranche ownership where older assignments conflict;
- `V1_DATA_MODEL.md` — exact implemented schema/data semantics.

Repository merge state is not Production deployment evidence. Nothing here establishes that migrations `0019`-`0025` have been applied to Production D1 or that the current Worker has been deployed/enabled/verified there.

## Current learner runtime ownership

Normal `/study` is owned by the FSRS/Free runtime:

- Systems-first run planning;
- Scheduled Study and Free Study;
- 5 / 10 / 20 / All available distinct-Case targets, default 10;
- continuous between-Case navigation when the next eligible Case can open immediately;
- required FSRS short-term repeats honored without consuming another distinct-Case slot;
- active Review snapshots in `active_reviews`, `active_review_questions`, and `active_review_assets`;
- server-authenticated run/scope/work proof boundaries;
- Scheduled completion through the Scheduled FSRS owner;
- Free completion through the Free Study owner;
- authenticated Review media through active Review asset ownership;
- browser run/localStorage state as convenience state only.

The old persisted learner Review model is not a supported runtime mode.

## Legacy Review table status

The physical tables:

```text
reviews
review_questions
review_assets
```

remain because historical migrations are immutable and the Production cutover preflight uses their row counts as zero-data sentinels.

Current application Drizzle schema does not export them as learner runtime tables. Current learner routes do not create/read/complete them. The zero-legacy-Review preflight is fail-closed/read-only and is not a deletion mechanism.

## Scheduled completion

Scheduled Study is Case-level FSRS using the repository-pinned adapter and canonical desired retention 90% by default.

Scheduled completion:

- validates the learner/current profile/run/work boundary;
- consumes the active Review exactly once;
- applies Again / Hard / Good / Easy;
- advances learner×Case FSRS state;
- writes compact encounter/event/optimizer/aggregate state according to current schema;
- preserves historical System attribution captured at study time;
- transactionally maintains durable monthly System analytics buckets after migration `0025`.

## Free Study

Free Study:

- uses the same current Case/content snapshot architecture;
- records non-scheduling learner exposure/aggregate activity;
- uses short-lived exactly-once completion receipts;
- does not advance Scheduled FSRS state;
- does not manufacture Scheduled ratings/events/optimizer evidence.

## Reset Progress — merged PR #139 / PR F

Reset Progress:

- invalidates/deletes any active learner Review;
- deletes current `learner_case_fsrs` rows so Cases become New to scheduling again;
- preserves current generation/parameter revision/serialized parameters;
- preserves retained Scheduled history, encounters, learner/System aggregates, and durable monthly analytics;
- increments `review_sequence_epoch` for an initialized learner;
- remains an FSRS-profile no-op for a never-initialized learner.

## Fresh FSRS Start — merged PR #139 / PR F

Fresh FSRS Start:

- invalidates/deletes any active learner Review;
- deletes current `learner_case_fsrs` rows;
- restores canonical default FSRS parameters at 90% desired retention;
- increments generation, review-sequence epoch, and parameter revision for initialized learners;
- clears optimizer metadata and prunes optimizer-only evidence made ineligible by the new boundary as defined by the current implementation;
- preserves detailed-history retention override, retained human-readable history, encounters, learner/System aggregates, and durable monthly analytics;
- creates the ordinary initial profile when Fresh is the learner's first FSRS-initializing operation.

Reset/Fresh and active-Review creation are serialized. If Reset/Fresh commits first, stale Scheduled creation fails. If active Review creation commits first, Reset/Fresh consumes it as part of the boundary change. No committed Reset/Fresh may leave an active Review on an old generation/sequence boundary.

The normal learner UI clears browser-local run state after Reset/Fresh; server-side current-profile checks remain the authority against stale client proofs.

## Detailed Scheduled-history retention — merged PR #139 / PR F

Supported policies:

```text
24 months (default)
36 months
60 months
indefinite
```

The same database-time retention cutoff governs visible detailed-history reads and bounded cleanup. Expiry deletes eligible `scheduled_review_events`; it does not reinterpret or destroy current scheduler state, current-generation optimizer evidence, compact encounters, aggregates, or durable monthly analytics merely because human-readable events expire.

Per-learner Production Admin control exists at `/admin/learner-retention`.

## Learner Progress — merged PR #139 / PR F

Current learner Progress exposes:

- Due Cases;
- SRS coverage;
- not-due scheduled Cases separately from coverage;
- total/recent Scheduled activity;
- Free Study activity;
- Again / Hard / Good / Easy distribution;
- System-level coverage/memory/activity summaries;
- retained recent Scheduled history.

Raw FSRS stability/difficulty internals remain implementation detail rather than the primary learner-facing UX.

## Durable monthly Admin analytics — merged PR #141 / PR G

Migration `0025_learner_fsrs_admin_analytics_deletion.sql` adds:

```text
learner_system_monthly_buckets
primary key (user_id, system_id, month_start)
```

`month_start` is the UTC calendar-month boundary. Each bucket stores compact Scheduled completion/rating counts plus first/last completion timestamps for the learner and historical System captured by the Scheduled event.

Semantics:

- migration-time backfill reads only retained `scheduled_review_events` that still exist when `0025` is applied;
- already-expired months are not fabricated from `learner_system_aggregates` or optimizer evidence;
- an `AFTER INSERT` Scheduled-event trigger maintains buckets transactionally for new completions;
- detailed-event expiry does not delete the monthly bucket;
- historical System attribution remains the System captured at study time rather than the Case's current taxonomy.

Admin analytics at `/admin/learner-analytics` include learner-wide totals, per-System lifetime totals, per-System monthly trends, cross-learner System trends, and stable cohort/time-series views.

V1 cohort membership is learner Better Auth account-created UTC month.

## Durable System provenance

Current durable System-history owners include:

```text
scheduled_review_events
learner_system_aggregates
learner_system_monthly_buckets
```

Central application checks plus defensive database guards prevent permanent System deletion/reclassification while retained durable attribution depends on that System identity.

Future durable System-attribution tables must be registered with the same provenance authority.

## Mature learner account deletion — merged PR #141 / PR G

Scale-gate decision: **retry-safe staged deletion**.

Direct cascade is not the supported mature-account path because Scheduled history and current-generation optimizer evidence are not universally bounded by a finite lifetime row maximum.

The staged path:

1. creates a durable `learner_account_deletions` marker;
2. bans/denies the learner immediately, with request/database guards respecting the deletion marker;
3. drains Better Auth sessions in bounded batches;
4. drains learner-owned Better Auth verification/account rows in bounded phases;
5. drains FSRS/runtime learner-owned rows through retry-safe bounded phases;
6. tolerates commit/phase-marker retry scenarios idempotently;
7. performs a residual rescan;
8. fails final identity deletion closed if any owned row remains;
9. invokes pinned Better Auth final user removal only after the staged data gate is clear.

Account deletion removes that learner's monthly bucket contributions, so later System/cohort reads no longer include the deleted learner.

## Better Auth boundary

The repository remains pinned to Better Auth `1.6.25` on current `main`.

PR G account deletion includes the pinned-version ownership behavior required to remove learner-owned password-reset verification rows without deleting unrelated verification records.

This deletion lifecycle is distinct from the separate Account Management v1 work in still-open draft PRs #96/#97.

## Admin Study Preview

Admin Study Preview remains outside learner persistence. It must not create:

- learner preferences/profiles;
- learner×Case FSRS state;
- active Reviews;
- completion receipts/events;
- legacy Review rows.

Learner retention/analytics pages are ordinary Production Admin surfaces and are not Admin Study Preview persistence.

## Local FSRS regression preview

`/fsrs-preview` remains a loopback/local-bindings-only regression/reference surface. It keeps continuous runs and 5/10/20/All behavior but uses separate browser/local reference state from Production `/study`.

## Current repository migration boundary

The repository sequence extends through:

```text
0025_learner_fsrs_admin_analytics_deletion.sql
```

`0024` owns the defensive Reset/Fresh profile-boundary guard. `0025` owns monthly analytics/provenance and staged-deletion schema/guards.

## Explicit exclusions

Current PR G does not implement:

- automatic FSRS optimizer execution;
- automatic parameter replacement/rescheduling from optimizer results;
- resurrection of `reviews`, `review_questions`, or `review_assets` as current runtime state.

Those remain outside the merged PR G repository scope unless separately designed/reviewed.
