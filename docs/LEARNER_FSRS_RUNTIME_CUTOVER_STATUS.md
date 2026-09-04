# Learner FSRS Runtime Cutover Status

Status: **Current repository runtime authority after PR #137 and merged PR #139 (PR F), including Reset Progress / Fresh FSRS Start, detailed-history retention/control, and learner Progress.**

Date: 4 September 2026

This document records the repository architecture established by the FSRS learner runtime cutover and the current post-cutover FSRS tranches. It is an implementation-status companion to:

- `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — locked product authority;
- `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md` — technical design;
- `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md` — pre-implementation readiness contract;
- `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md` — normative tranche ownership where assignments conflict.

The readiness contract's Section 1 sentence that described then-current `main` as still owning learner Review runtime through `reviews`, `review_questions`, and `review_assets` was a **pre-cutover repository observation**. PR #137 superseded that current-state observation. The readiness contract's behavioral and safety requirements remain authoritative.

PR #139 (PR F) is merged on current `main`. That repository merge does **not** establish that migration `0024` has been applied to Production, that the Production Worker has been deployed from the merged commit, that the feature has been enabled in Production, or that Production behavior has been explicitly verified. Repository merge state, D1 migration state, Worker deployment, feature enablement, and explicit Production verification remain separate facts.

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

Merged PR #139 (PR F) adds the post-cutover learner boundary writers without changing the existing Scheduled/Free run architecture.

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

Merged PR #139 proves this with the supported writers in the specialized active-Review workflow. The local workerd/D1 smoke plans a genuine signed Scheduled descriptor and captured-New proof, then concurrently races `createScheduledActiveReview()` against Reset and against Fresh. Either valid serialization order is accepted, but every run must finish on the exact intended new boundary with zero stale active Reviews. The earlier node:sqlite trigger tests remain regression coverage rather than the sole concurrency proof.

The learner `/study` boundary actions return a browser-run invalidation result. The page clears the learner browser-local run descriptor after Reset/Fresh. This removes stale run/work proofs from the normal client resume path; server-side current-profile comparison remains the hard authority if stale localStorage is presented by a modified or interrupted client.

## Detailed Scheduled-history retention

The human-readable Scheduled event retention policy is active on current `main` through merged PR #139:

- 24 months by default;
- 36 months;
- 60 months;
- Indefinite.

`src/lib/server/db/fsrs-retention.js` owns the database-time retention cutoff and the bounded physical cleanup statements. Learner-visible detailed-history reads apply the retention cutoff even before physical cleanup runs.

Merged PR #139 also owns the per-learner Admin control at `/admin/learner-retention`. `src/lib/server/db/fsrs-retention-admin.js` validates exactly the four locked policies and targets normal learner accounts only. If an explicit Admin override is saved before first Scheduled Study, the readiness contract permits that operation to establish the ordinary initial FSRS profile; the writer uses `initialLearnerFsrsProfile()` so generation/epoch/parameter revision are `1`, scheduler/library identity is canonical, and the adapter-generated parameter JSON retains desired retention `0.90`. The override does not manufacture learner×Case FSRS state.

For an initialized learner, changing detailed-history retention does not change generation, review-sequence epoch, parameter revision, scheduler parameters, current Case scheduling state, or active-run boundaries. A shorter policy forces the same bounded learner-scoped cleanup immediately.

Normal Scheduled completion opportunistically runs throttled learner-scoped cleanup. Reset/Fresh may force the same bounded learner-scoped cleanup while they already own a mutation transaction.

Detailed-history cleanup deletes only expired `scheduled_review_events`. It does not reinterpret a retained optimizer suffix as a New-card history and does not delete current-generation optimizer evidence, compact encounter state, or aggregates merely because human-readable display events expire. Optimizer execution remains deferred.

## Learner Progress

Merged PR #139 adds the learner-facing Progress read model and `/study` presentation required by the locked product plan. It exposes:

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

A destructive local content refresh remains local-only destructive tooling and is not the learner-facing Reset Progress / Fresh FSRS Start contract. Merged PR #139 does not convert local replica refresh into a Production learner reset mechanism.

## Admin Study Preview boundary

Admin Study Preview remains outside learner persistence. It resolves current learner content using the active snapshot/content resolver but does not create learner preferences, FSRS state, active Reviews, completion receipts, or legacy Review rows.

The separate `/admin/learner-retention` control is ordinary Production Admin account-scoped configuration and is not Admin Study Preview. Merged PR #139 does not add Reset/Fresh/Progress persistence reachability to Admin Study Preview and does not implement PR G analytics.

## Local FSRS regression preview

`/fsrs-preview` remains a loopback/local-bindings-only regression surface. It keeps continuous runs and the approved 5/10/20/All distinct-Case targets; required Scheduled repeats do not consume additional run slots. Its browser storage/proof boundary remains separate from Production `/study` browser-run state. Merged PR #139 does not transplant learner Reset/Fresh persistence into this local-only reference surface.

## Durable System provenance

System deletion/reclassification safety remains centrally owned. Durable FSRS System attribution currently includes Scheduled Review events and learner System aggregates, with application guards plus defensive database triggers. Retention cleanup may remove expired detailed Scheduled events, but retained learner/System aggregate ownership remains a durable System provenance blocker according to the existing centralized rules.

## Migration/parser compatibility

The current post-cutover migration sequence on `main` extends through:

```text
0024_learner_fsrs_reset_fresh.sql
```

Migration `0023_learner_fsrs_system_provenance_guard.sql` protects current durable System attribution. Migration `0024` adds only the defensive Scheduled profile-boundary/active-Review guard required by Reset/Fresh serialization; it does not itself reset learners or mutate historical progress.

## PR F merged validation evidence

PR #139 merged from exact source head `9356ccb3ac65ccab5831bf9f2ba14c79f50ca65b` after the required validation evidence was green:

- focused Reset/Fresh/retention/Progress tests, including the Admin retention-control contract;
- real supported-writer Reset-vs-creation and Fresh-vs-creation serialization coverage through local workerd/D1 in the specialized active-Review workflow;
- the learner-runtime source contract, including unchanged local `/fsrs-preview` and legacy Review retirement boundaries;
- repository-required schema/migration and full validation;
- review of the complete PR #137 merge base → exact PR F head diff for scope and concurrency invariants.

Production deployment, Production D1 migration application, optimizer execution, account deletion, and PR G Admin/cohort/time-series analytics remain outside the merged PR F scope unless separately authorized.

## PR G branch implementation status

PR #141 implements the focused PR G repository tranche after merged PR #139. This section describes the PR G branch implementation and does **not** claim Production migration application, Worker deployment, feature enablement, or Production verification. Focused implementation and benchmark evidence is recorded in `LEARNER_FSRS_PR_G_EVIDENCE.md`.

### Durable monthly Admin analytics

Migration `0025_learner_fsrs_admin_analytics_deletion.sql` adds `learner_system_monthly_buckets`, keyed by:

```text
(user_id, system_id, month_start)
```

`month_start` is a UTC calendar-month boundary. Each row retains compact Scheduled completion and Again/Hard/Good/Easy counts plus first/last completion timestamps for the learner and the historical System captured by the Scheduled event.

The migration backfills only from `scheduled_review_events` that still exist when `0025` is applied. It does not manufacture already-expired months from `learner_system_aggregates` or optimizer evidence. An `AFTER INSERT` trigger on `scheduled_review_events` transactionally maintains the monthly bucket for newly committed Scheduled completions. Detailed-history expiry may delete the event while leaving the compact monthly bucket intact.

`/admin/learner-analytics` adds Production-Admin-only read models for:

- learner-wide lifetime aggregate totals;
- per-System lifetime aggregate totals;
- newest retained detailed Scheduled events;
- per-learner historical-System monthly trends;
- cross-learner historical-System monthly trends;
- a stable account-created-UTC-month cohort time series measured by activity month.

Long-range System/cohort time series read the durable monthly buckets directly. Optimizer-only evidence is not an Admin analytics/history source, and lifetime aggregates are not used to reconstruct an expired time axis.

### PR G historical System provenance extension

PR G extends centralized durable System attribution from `scheduled_review_events` and `learner_system_aggregates` to include `learner_system_monthly_buckets`. `src/lib/server/db/fsrs-system-provenance.ts` includes the new durable owner, and migration `0025` adds defensive System kind-change/delete guards for retained monthly rows.

A historical System therefore remains protected while any detailed event, lifetime System aggregate, or durable monthly bucket still attributes learner activity to it.

### Mature learner account deletion scale gate

PR G chooses **retry-safe staged deletion**, not direct mature-account cascade. Scheduled history and current-generation optimizer evidence have no finite supported lifetime row cap, so there is no finite worst-supported learner size for which one unbounded cascade can be certified safe.

`learner_account_deletions` stores the durable deletion phase. The supported flow:

1. verifies that the target is a normal learner;
2. creates/resumes the durable deletion marker;
3. bans the learner and commits the durable deletion marker as the immediate access-disabled authority;
4. the request hook rejects any already-issued learner session while the marker exists, and database guards reject new sessions, linked accounts, and active Reviews;
5. drains Better Auth sessions, learner-owned verification rows, and linked accounts as staged ownership classes at at most 1,000 rows per step;
6. removes at most 1,000 rows from every subsequent application deletion class per staged step;
7. removes Free receipts, Scheduled events, active Reviews/children, optimizer evidence, learner×Case state, encounters, durable monthly buckets, System aggregates, learner aggregates, preferences and profile state;
8. rescans every staged auth/application ownership class before declaring the identity ready;
9. calls pinned Better Auth Admin `removeUser` only after the staged-data gate is clear, leaving no unbounded auth-owned collection for the final one-row identity operation.

A database user-delete guard fails closed if any learner-owned session, account, verification, or application row remains or reappears before identity deletion, so an interrupted/racing deletion is safe to retry rather than partially bypassing the staged contract.

### Better Auth verification ownership

Better Auth remains pinned to `1.6.25`. Its `verification` table has no user foreign key. In the pinned password-reset flow, reset verification rows store the learner user ID in `verification.value`.

PR G therefore treats matching verification rows as a staged learner-owned deletion class and prevents new learner-owned verification rows from being created while staged deletion is active. A defensive reset-password verification guard also rejects creation against an already-removed user identity. Unrelated verification rows remain untouched.

### Local replica boundary

PR G keeps both `learner_system_monthly_buckets` and `learner_account_deletions` outside the Production-to-local content allowlist and places both on `FORBIDDEN_PRODUCTION_TABLES`. Production-derived local refresh therefore remains teaching-content-only and cannot import learner analytics or deletion state.

### PR G migration boundary and exclusions

The PR G branch extends repository migration history through:

```text
0025_learner_fsrs_admin_analytics_deletion.sql
```

PR G does not implement automatic optimizer execution, automatic parameter replacement, learner Scheduled/Free UX redesign, legacy `reviews` / `review_questions` / `review_assets` resurrection, Production D1/R2 mutation, or Production Worker deployment.
