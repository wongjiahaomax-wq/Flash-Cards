# Learner FSRS Runtime Cutover Status

Status: **current repository runtime authority, including the Multi-System Runtime v2 foundation on Draft PR #147. The learner multi-select UX is not yet implemented.**

Date: 4 September 2026

This document records the current repository learner-runtime boundary. It complements:

- `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — locked product authority;
- `LEARNER_FSRS_RUN_SIZE_PRODUCT_AMENDMENT.md` — 5/10/20/All and continuous-run amendment;
- `MULTI_SYSTEM_STUDY_PLAN.md` — multi-System product/technical plan;
- `MULTI_SYSTEM_RUNTIME_V2_IMPLEMENTATION.md` — current Runtime v2 implementation/cutover evidence;
- `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md` — technical design/history;
- `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md` — safety/readiness requirements;
- `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md` — tranche ownership where older assignments conflict;
- `V1_DATA_MODEL.md` — implemented schema/data semantics, with migration `0026` and this Runtime v2 companion governing the branch delta beyond its last reconciliation.

Repository merge state is not Production deployment evidence. Nothing here establishes that migrations `0019`-`0026` have been applied to Production D1 or that the current Worker has been deployed/enabled/verified there.

## Current learner runtime ownership

Normal `/study` is owned by the FSRS/Free runtime:

- Systems-first run planning;
- Scheduled Study and Free Study;
- descriptor/scope version 2 and Scheduled proof version 2;
- canonical bounded multi-System runtime scope, while the current learner chooser still submits one System as a valid v2 special case;
- deterministic multi-System candidate union/deduplication and concrete per-Case System attribution;
- 5 / 10 / 20 / All available distinct-Case targets, default 10, across the combined unique Case pool;
- global 50-consecutive-New Scheduled guardrail;
- continuous between-Case navigation when the next eligible Case can open immediately;
- required FSRS short-term repeats honored without consuming another distinct-Case slot;
- active Review snapshots in `active_reviews`, `active_review_questions`, and `active_review_assets`;
- server-authenticated run/scope/work proof boundaries;
- Scheduled completion through the Scheduled FSRS owner;
- Free completion through the Free Study owner;
- authenticated Review media through active Review asset ownership;
- browser run/localStorage state as convenience state only;
- deliberate retirement/clearing of v1 learner/local-preview browser run keys rather than reinterpretation.

The old persisted learner Review model is not a supported runtime mode.

The new learner multi-select System chooser and learner-facing per-System configuration remain deferred to Multi-System UX. Balanced/equal System sampling, per-System FSRS state/parameters, a synthetic `Mixed` System, and FSRS algorithm/optimizer changes are not part of the Runtime v2 tranche.

## Multi-System Runtime v2 scope and attribution

The canonical authenticated run scope is a deterministic `systems[]` list. Every selected System is either:

```text
mode = all
```

or:

```text
mode = routes
routes = explicit Topic and/or curated Tag routes
```

Raw limits are 64 selected Systems, 512 explicit routes across the run, and 128 characters per System/Topic/Tag identifier. Scheduled Study retains the existing 20,000-unique-Case supported envelope.

Candidate resolution unions all selected sub-scopes and deduplicates by Case ID. Attribution for one Active Review remains one concrete `system_id`: prefer a selected native Primary-Topic-System contribution, otherwise use stable contributing-System ID order. The attribution System must itself be selected and the Case must be reachable through that exact selected sub-scope.

Persisted Active Review scope uses the v2 envelope:

```js
{
  version: 2,
  systemId: '<frozen concrete attribution>',
  runScope: { systems: [...] }
}
```

Migration `0026_multi_system_active_review_scope_v2.sql` replaces the old scope/content trigger and fails closed on malformed/noncanonical v2 shapes, duplicate Systems/routes, contradictory `all` shapes, forged/unselected attribution, wrong routes, invalid curated Tags, and inactive/missing Primary Topic eligibility.

The active Primary Topic baseline remains unchanged even for curated Tag routing.

## Multi-System Runtime v2 clean-cutover safety

The Runtime v2 deployment contract is a clean cutover, not a long-lived v1/v2 compatibility layer.

The committed read-only gate requires exactly zero rows in:

```text
active_reviews
active_review_questions
active_review_assets
scheduled_review_events
free_review_completion_receipts
learner_case_fsrs
learner_case_encounters
learner_optimizer_evidence
learner_aggregates
learner_system_aggregates
learner_system_monthly_buckets
learner_fsrs_profiles
reviews
review_questions
review_assets
```

`learner_fsrs_profiles` must be exactly zero; there is no pristine/default-profile exception. `learner_preferences` are intentionally excluded because Study page use can create them without starting a run.

For the first Production v2 cutover, `.github/workflows/deploy-production.yml` has no `apply_migrations=false` path. It mechanically fences learner writes, verifies the fence, runs the exact-zero gate, applies pending migrations, verifies the v2 guard, deploys the v2 Worker while still fenced, performs non-mutating status/guard/zero-data verification, then explicitly reopens the learner runtime.

The shared `/study` access owner also honors `LEARNER_RUNTIME_WRITE_FENCE`, so planning/open/resume/reveal/completion cannot run while the fenced v2 Worker is being verified.

These repository mechanics are not evidence that the Production cutover has been executed.

## Legacy Review table status

The physical tables:

```text
reviews
review_questions
review_assets
```

remain because historical migrations are immutable and Production cutover gates use their row counts as zero-data sentinels.

Current application Drizzle schema does not export them as learner runtime tables. Current learner routes do not create/read/complete them. Zero-data preflight is fail-closed/read-only and is not a deletion mechanism.

## Scheduled completion

Scheduled Study is Case-level FSRS using the repository-pinned adapter and canonical desired retention 90% by default.

Scheduled completion:

- validates the learner/current profile/run/work boundary;
- consumes the active Review exactly once;
- applies Again / Hard / Good / Easy;
- advances learner×Case FSRS state;
- writes compact encounter/event/optimizer/aggregate state according to current schema;
- preserves historical concrete System attribution frozen at study time;
- transactionally maintains durable monthly System analytics buckets after migration `0025`.

Multi-System selection does not create per-System FSRS state. There remains one scheduler state per learner × Case and one learner parameter set.

## Free Study

Free Study:

- uses the same current Case/content snapshot architecture;
- uses the combined deduplicated v2 candidate bag;
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
- historical System attribution remains the concrete System captured at study time rather than the Case's current taxonomy.

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

The repository remains pinned to Better Auth `1.6.25` on this branch.

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

`/fsrs-preview` remains a loopback/local-bindings-only regression/reference surface. It keeps continuous runs and 5/10/20/All behavior, now with descriptor/proof v2, but uses separate browser/local reference state from Production `/study`.

## Current repository migration boundary

The repository sequence on this branch extends through:

```text
0026_multi_system_active_review_scope_v2.sql
```

`0024` owns the defensive Reset/Fresh profile-boundary guard. `0025` owns monthly analytics/provenance and staged-deletion schema/guards. `0026` owns the strict v2 Active Review scope shape and selected-sub-scope attribution proof.

Presence of `0026` in the repository is not proof that it has been applied to Production D1.

## Explicit exclusions

The current Runtime v2 tranche does not implement:

- the learner multi-select System chooser;
- learner-facing per-System configuration UX;
- balanced/equal System sampling;
- per-System FSRS state or parameters;
- a synthetic `Mixed` System;
- automatic FSRS optimizer execution;
- automatic parameter replacement/rescheduling from optimizer results;
- long-lived v1/v2 browser/proof/persistence compatibility;
- resurrection of `reviews`, `review_questions`, or `review_assets` as current runtime state.

Those remain outside this tranche unless separately designed/reviewed.
