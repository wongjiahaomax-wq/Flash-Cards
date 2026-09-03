# Learner FSRS Runtime Cutover Status

Status: **Current repository runtime authority after PR #137, extended on the PR F branch for Reset Progress / Fresh FSRS Start, detailed-history retention, and learner Progress.**

Date: 3 September 2026

This document records the repository architecture established by the FSRS learner runtime cutover and the current post-cutover FSRS tranches. It is an implementation-status companion to:

- `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — locked product authority;
- `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md` — technical design;
- `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md` — pre-implementation readiness contract;
- `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md` — normative tranche ownership where assignments conflict.

The readiness contract's Section 1 sentence that described then-current `main` as still owning learner Review runtime through `reviews`, `review_questions`, and `review_assets` was a **pre-cutover repository observation**. PR #137 superseded that current-state observation. The readiness contract's behavioral and safety requirements remain authoritative.

This document does **not** claim that PR F has been merged or that any repository migration has been applied to Production. Repository merge state, D1 migration state, Worker deployment, feature enablement, and explicit Production verification remain separate facts.

## Post-cutover repository ownership

Normal learner Study is owned by the active FSRS/Free runtime:

- `/study` plans Scheduled or Free System-scoped runs through the FSRS run-planning services;
- unfinished learner work is represented by `active_reviews`, `active_review_questions`, and `active_review_assets`;
- reveal/resume reads the active Review snapshot;
- Scheduled completion is owned by the Scheduled FSRS completion service;
- Free completion is owned by the Free Study completion service;
- learner run continuation is browser-local convenience state backed by server-validated run/proof boundaries;
- authenticated learner Review media is served from active Review asset ownership, not legacy `review_assets`;
- the media route resolves only the requested unexpired owner-scoped `active_review_assets.storage_key_snapshot`;
- Asset/R2 lifecycle checks treat active unfinished Reviews as the temporary learner-media owner.

The old persisted learner Review model is not a supported runtime mode.

## PR F — Reset Progress / Fresh FSRS Start

PR F adds the post-cutover learner boundary writers without changing the existing Scheduled/Free run architecture.

### Reset Progress

Reset Progress:

- invalidates/deletes any active learner Review;
- deletes current `learner_case_fsrs` rows so every Case becomes New to scheduling again;
- preserves the current FSRS generation, parameter revision, serialized parameters, retained Scheduled history, encounter state, and learner/System aggregates;
- increments `review_sequence_epoch` for an initialized learner;
- remains an FSRS-profile no-op for a never-initialized learner.

### Fresh FSRS Start

Fresh FSRS Start:

- invalidates/deletes any active learner Review;
- deletes current `learner_case_fsrs` rows;
- restores the pinned adapter's canonical default FSRS parameters at 90% desired retention;
- increments FSRS generation, review-sequence epoch, and parameter revision for an initialized learner;
- clears optimizer metadata without executing the optimizer;
- preserves the learner's detailed-history retention override, retained visible history, encounter state, and lifetime/System aggregates;
- prunes optimizer-only evidence from now-ineligible pre-Fresh generations;
- creates the ordinary generation/epoch/revision `1` profile when Fresh is the learner's first FSRS-initializing operation.

`src/lib/server/db/fsrs-reset-fresh.js` owns these mutations. They use D1 atomic batches so active-Review invalidation and scheduler-boundary movement cannot commit separately.

## Reset/Fresh serialization and stale browser proofs

Migration `0024_learner_fsrs_reset_fresh.sql` adds a defensive `learner_fsrs_profiles_active_scheduled_boundary_guard` trigger. A direct Scheduled boundary update fails while a Scheduled active Review still exists. The supported Reset/Fresh transaction deletes the active Review before it moves generation/epoch/revision state in the same batch.

Together with the active-Review creation guard introduced by PR C, the final race invariant is:

- Reset/Fresh commits first → old Scheduled creation fails on the stale profile boundary;
- active Review creation commits first → Reset/Fresh atomically consumes it and changes/clears the relevant scheduler boundary/state;
- no committed Reset/Fresh may leave a Scheduled active Review on an old generation/sequence boundary.

The learner `/study` boundary actions return a browser-run invalidation result. The page clears the learner browser-local run descriptor after Reset/Fresh. This removes stale run/work proofs from the normal client resume path; server-side current-profile comparison remains the hard authority if stale localStorage is presented by a modified or interrupted client.

## Detailed Scheduled-history retention

The human-readable Scheduled event retention policy is active in PR F:

- 24 months by default;
- 36 months;
- 60 months;
- Indefinite.

`src/lib/server/db/fsrs-retention.js` owns the database-time retention cutoff and the bounded physical cleanup statements. Learner-visible detailed-history reads apply the retention cutoff even before physical cleanup runs.

Normal Scheduled completion opportunistically runs throttled learner-scoped cleanup. Reset/Fresh may force the same bounded learner-scoped cleanup while they already own a mutation transaction.

Detailed-history cleanup deletes only expired `scheduled_review_events`. It does not reinterpret a retained optimizer suffix as a New-card history and does not delete current-generation optimizer evidence, compact encounter state, or aggregates merely because human-readable display events expire. Optimizer execution remains deferred.

## Learner Progress

PR F adds the learner-facing Progress read model and `/study` presentation required by the locked product plan. It exposes:

- Due Cases;
- SRS coverage as Cases entered into SRS / currently eligible Cases;
- Not-due scheduled Cases separately from coverage;
- total/recent Scheduled activity;
- Free Study activity;
- Again / Hard / Good / Easy distribution;
- System-level coverage, memory state, and historical Scheduled activity;
- recent retained Scheduled history.

Raw FSRS stability/difficulty internals remain hidden. The learner Progress read model consumes current state and compact aggregates; PR G Admin/cohort/time-series analytics are not implemented here.

## Legacy Review table status

The physical tables `reviews`, `review_questions`, and `review_assets` remain only because historical migrations are immutable repository history and because the deployment preflight uses their row counts as cutover sentinels.

Current application Drizzle schema does not export those tables. Current learner routes do not create/read/complete them. Legacy Review media readers and the optional-route legacy Review insert/read compatibility module are retired.

The Production cutover gate remains fail-closed and read-only: require zero legacy Review rows before an authorized Production rollout; do not delete Production learner data as part of that gate.

## Local replica and reset boundary

Production-derived local replicas continue to mirror teaching **content only**. `scripts/local-replica-lib.mjs` forbids Production Better Auth state, current FSRS/Free learner-state tables, retired legacy Review sentinels, Preview sessions, and import-job state from entering the replica allowlist.

A destructive local content refresh remains local-only destructive tooling and is not the learner-facing Reset Progress / Fresh FSRS Start contract. PR F does not convert local replica refresh into a Production learner reset mechanism.

## Admin Study Preview boundary

Admin Study Preview remains outside learner persistence. It resolves current learner content using the active snapshot/content resolver but does not create learner preferences, FSRS state, active Reviews, completion receipts, or legacy Review rows.

PR F does not add Reset/Fresh/Progress persistence reachability to Admin Study Preview and does not implement PR G analytics.

## Local FSRS regression preview

`/fsrs-preview` remains a loopback/local-bindings-only regression surface. It keeps continuous runs and the approved 5/10/20/All distinct-Case targets; required Scheduled repeats do not consume additional run slots. Its browser storage/proof boundary remains separate from Production `/study` browser-run state. PR F does not transplant learner Reset/Fresh persistence into this local-only reference surface.

## Durable System provenance

System deletion/reclassification safety remains centrally owned. Durable FSRS System attribution currently includes Scheduled Review events and learner System aggregates, with application guards plus defensive database triggers. Retention cleanup may remove expired detailed Scheduled events, but retained learner/System aggregate ownership remains a durable System provenance blocker according to the existing centralized rules.

## Migration/parser compatibility

The current post-cutover migration sequence on the PR F branch extends through:

```text
0024_learner_fsrs_reset_fresh.sql
```

Migration `0023_learner_fsrs_system_provenance_guard.sql` protects current durable System attribution. Migration `0024` adds only the defensive Scheduled profile-boundary/active-Review guard required by Reset/Fresh serialization; it does not itself reset learners or mutate historical progress.

## PR F validation boundary

Before PR F is ready to merge, one exact head must have:

- the focused Reset/Fresh/retention/Progress tests green;
- the existing learner-runtime source contract green, including unchanged local `/fsrs-preview` and legacy Review retirement boundaries;
- repository-required schema/migration and full validation green;
- the complete `main...HEAD` diff reviewed for scope and concurrency invariants.

Production deployment, Production D1 migration application, optimizer execution, account deletion, and PR G analytics remain outside PR F unless separately authorized.
