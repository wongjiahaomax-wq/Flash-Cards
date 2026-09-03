# Learner FSRS Runtime Cutover Status

Status: **Current repository runtime authority for the post-PR #137 learner FSRS/Free runtime, merged PR #139 (PR F), and the PR G Admin analytics/account-deletion implementation represented by this branch.**

Date: 3 September 2026

This document is the implementation-status companion to:

- `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — locked product authority;
- `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md` — technical design;
- `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md` — readiness contract;
- `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md` — normative tranche ownership where assignments conflict;
- `LEARNER_FSRS_PR_G_EVIDENCE.md` — focused PR G implementation/benchmark evidence.

The readiness contract's old observation that learner Review runtime used `reviews`, `review_questions`, and `review_assets` was superseded by PR #137. Its behavioral and safety requirements remain authoritative.

Repository code/migration presence does **not** establish that the corresponding migration has been applied to Production, that the Production Worker has been deployed, or that Production behavior has been verified. Production mutation/deployment remains a separate operator action.

## Post-cutover learner runtime ownership

Normal learner Study is owned by the FSRS/Free runtime:

- `/study` plans Scheduled or Free System-scoped runs through the FSRS run-planning services;
- unfinished work is represented by `active_reviews`, `active_review_questions`, and `active_review_assets`;
- reveal/resume reads the active Review snapshot;
- Scheduled completion is owned by the Scheduled FSRS completion service;
- Free completion is owned by the Free Study completion service;
- run continuation is browser-local convenience state backed by server-validated run/proof boundaries;
- authenticated Review media is served from `active_review_assets`, not legacy `review_assets`;
- Asset/R2 lifecycle checks treat active unfinished Reviews as the temporary learner-media owner.

The legacy Review tables remain physical migration/cutover sentinels only. Current application code does not create/read/complete them.

## Reset Progress / Fresh FSRS Start

Merged PR #139 (PR F) owns Reset/Fresh and detailed-history retention.

Reset Progress:

- invalidates/deletes any active learner Review;
- clears current learner×Case FSRS state;
- preserves generation, personalized parameters, retained Scheduled history, encounter state, aggregates and durable monthly analytics;
- increments review-sequence epoch for an initialized learner.

Fresh FSRS Start:

- invalidates/deletes any active learner Review;
- clears current learner×Case FSRS state;
- restores canonical default FSRS parameters at 90% desired retention;
- increments generation, review-sequence epoch and parameter revision;
- preserves retained visible history, encounters, lifetime aggregates and durable monthly analytics;
- removes now-ineligible optimizer-only evidence from older generations according to the PR F cleanup contract;
- does not execute the optimizer.

Migration `0024_learner_fsrs_reset_fresh.sql` plus the active-Review creation guards enforce the two-sided creation/boundary race. Browser run state is cleared on successful Reset/Fresh while server-side current-boundary validation remains authoritative.

## Detailed Scheduled-history retention

Human-readable Scheduled event retention remains:

- 24 months default;
- 36 months;
- 60 months;
- Indefinite.

`src/lib/server/db/fsrs-retention.js` owns database-time cutoffs and bounded physical cleanup. `/admin/learner-retention` owns the per-learner Production Admin override.

Detailed cleanup deletes only expired `scheduled_review_events`; it does not reinterpret optimizer suffixes, remove current scheduler state merely because display history expires, or delete compact long-lived analytics/encounter state.

## Learner Progress

Learner Progress exposes Due, coverage, not-due memory state, total/recent Scheduled activity, Free activity, rating distribution, per-System progress, and recent retained history. Raw FSRS stability/difficulty remains hidden.

## PR G durable Admin analytics/history

PR G introduces `learner_system_monthly_buckets` with primary key:

```text
(user_id, system_id, month_start)
```

`month_start` is the UTC calendar-month boundary. Each bucket stores compact Scheduled completion and Again/Hard/Good/Easy counts plus first/last completion timestamps for one learner and the historical System recorded at study time.

Migration `0025_learner_fsrs_admin_analytics_deletion.sql`:

- creates the monthly bucket table and indexes;
- backfills only from `scheduled_review_events` still retained when the migration runs;
- adds an `AFTER INSERT` Scheduled-event trigger so the event and monthly-bucket update share the Scheduled completion transaction;
- does not reconstruct already-expired months from lifetime aggregates or optimizer evidence.

The Admin learner analytics surface at `/admin/learner-analytics` provides:

- learner-wide lifetime usage/rating totals from compact learner aggregates;
- per-System lifetime usage/rating totals from learner×System aggregates;
- recent read-only detailed Scheduled history from retained events;
- per-learner historical-System monthly trends from durable monthly buckets;
- cross-learner historical-System monthly trends from durable monthly buckets;
- a stable cohort time series keyed by learner account-created UTC month and measured by activity month from the same durable bucket store.

Optimizer-only evidence is not an Admin analytics/history source.

Account deletion cascades/removes the learner's monthly rows, so the removed learner no longer contributes to System/cohort trend reads.

## Durable historical System provenance

Durable System identity protection is centrally owned by `fsrs-system-provenance.ts` and the taxonomy write path.

Current durable FSRS System attribution includes:

- `scheduled_review_events.system_id`;
- `learner_system_aggregates.system_id`;
- `learner_system_monthly_buckets.system_id`.

Migration `0023` protects Scheduled-event/aggregate dependencies. Migration `0025` extends the same database-level kind-change/delete protection to monthly buckets.

A System with any retained durable attribution cannot be reclassified to Topic or permanently deleted. Account deletion may remove one learner's contributions, but the System remains protected while any other retained history still depends on it.

## PR G mature learner account deletion

The supported mature-account path is **retry-safe staged deletion**, not direct cascade.

Reason: Scheduled history and current-generation optimizer evidence do not have a finite lifetime row cap, so no universal worst-supported mature learner can be certified safe for one unbounded delete statement.

`learner_account_deletions` is the durable staged-deletion marker. The flow:

1. verifies a normal learner identity;
2. creates/resumes the deletion marker;
3. bans the learner and deletes Better Auth sessions before large child cleanup;
4. database guards reject new sessions and active Reviews while deletion is in progress;
5. deletes at most 1,000 rows from one staged ownership class per step;
6. deletes Free receipts and Scheduled event receipts before active Reviews so existing completion-expiry guards cannot block account erasure in an abnormal partially-consumed state;
7. removes Scheduled events, active Reviews/children, optimizer evidence, Case state, encounters, monthly buckets, System aggregates, learner aggregates, preferences and profile state;
8. rescans every staged ownership class before declaring `identity_ready`;
9. calls pinned Better Auth Admin `removeUser` only after the staged data gate is clear.

The user-delete database guard fails closed if any learner-owned row reappears between the residual scan and identity-root delete, making the operation safe to retry.

### Better Auth verification records

Better Auth remains pinned to `1.6.25`.

Its Admin `removeUser` path deletes sessions/accounts/user, but the `verification` table has no user foreign key. In the pinned password-reset flow, reset-verification rows store the learner user id in `verification.value`.

PR G therefore includes `verification.value = learner user id` as the first staged ownership class and in the final user-delete guard. Unrelated verification rows are not deleted.

## Deletion benchmark gate

PR G adds:

```text
npm run fsrs:account-deletion-benchmark
npm run fsrs:account-deletion-d1-smoke
```

The main synthetic mature fixture includes 5,000 Case states, 5,000 encounters, 20,000 Scheduled events, 20,000 optimizer rows, 2,000 Free receipts, durable monthly buckets, aggregates, an active Review with 256 questions/64 assets, and Better Auth account/session state.

The local workerd/D1 smoke uses a smaller multi-batch fixture through the actual D1 binding and proves:

- direct mature user delete is blocked;
- access is revoked before large cleanup;
- every staged step stays within the configured 1,000-row bound;
- staged cleanup reaches identity-ready;
- application learner data is gone before identity deletion;
- the final user delete removes auth account/session ownership and cascades the deletion marker.

Exact environment-specific timings belong in PR G validation/handoff evidence and are not Production latency promises.

## Local replica and Preview boundaries

Production-derived local replicas remain teaching-content only. Learner auth/state/history—including PR G monthly analytics and deletion markers—must never enter the Production-to-local content allowlist. PR G adds source-contract coverage for this exclusion.

Admin Study Preview remains outside learner persistence and must not create learner FSRS state, active Reviews, completion events/receipts, aggregates, monthly buckets or preferences.

`/fsrs-preview` remains a local/loopback regression surface with continuous runs and 5/10/20/All distinct-Case targets. PR G does not change learner Scheduled/Free UX semantics.

## Migration boundary

The PR G branch migration sequence extends through:

```text
0025_learner_fsrs_admin_analytics_deletion.sql
```

Recent FSRS migrations are:

- `0019` — FSRS foundation;
- `0020` — active Review ownership;
- `0021` — Scheduled completion guards/context;
- `0022` — Free completion receipts;
- `0023` — durable System provenance guards;
- `0024` — Reset/Fresh active-Review/profile-boundary guard;
- `0025` — durable monthly System analytics plus staged learner-account-deletion guards/marker.

A committed migration remains separate from Production migration application.

## Explicit exclusions

PR G does not implement:

- automatic FSRS optimizer execution;
- automatic FSRS parameter replacement;
- a new persistent learner study-run/session architecture;
- changes to Scheduled/Free learner study UX beyond analytics population that is transactionally derived from existing Scheduled event writes;
- legacy `reviews`, `review_questions`, or `review_assets` resurrection;
- Production deployment or Production D1/R2 mutation.
