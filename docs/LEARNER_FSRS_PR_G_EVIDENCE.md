# Learner FSRS PR G — Admin analytics/history and account deletion evidence

_Status: historical implementation/validation evidence for merged PR #141; not Production deployment evidence._

PR #141 / PR G is merged on current `main`. This file records the focused tranche's implementation decisions and validation contract; use `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` and `V1_DATA_MODEL.md` for current repository status/semantics.

## Scope implemented

PR G added:

- durable learner × historical-System × UTC-calendar-month Scheduled analytics buckets;
- migration-time backfill only from detailed `scheduled_review_events` still retained when migration `0025` is applied;
- transactional bucket maintenance for newly committed Scheduled Reviews;
- Production Admin learner lifetime/history/System/cohort trend read models;
- stable cohort membership based on learner account-created UTC month;
- registration of monthly System attribution with the centralized taxonomy provenance authority;
- the mature learner account-deletion scale gate;
- retry-safe staged account deletion with bounded phases;
- bounded synthetic benchmark and local workerd/D1 proof.

PR G explicitly did **not** implement optimizer execution, automatic parameter replacement, learner Scheduled/Free UX redesign, or resurrection of the legacy persisted Review model.

## Durable monthly analytics

Physical table:

```text
learner_system_monthly_buckets
```

Primary key:

```text
(user_id, system_id, month_start)
```

`month_start` is the first instant of the UTC calendar month. Each row stores compact Scheduled completion/rating counts plus first/last completion timestamps for that learner and historical System.

The bucket is maintained by an `AFTER INSERT` trigger on `scheduled_review_events`, so the Scheduled event and monthly increment share the completion transaction. Exactly-once event insertion therefore prevents response retries from double-counting the monthly bucket.

Detailed-history cleanup does not delete monthly buckets. Long-range trends read the durable buckets directly.

Migration `0025` deliberately does **not** manufacture months already lost to retention. Its backfill reads only Scheduled events retained when the migration is applied; it does not infer a time axis from lifetime aggregates or optimizer evidence.

## Stable cohort definition

V1 cohort membership is:

```text
learner Better Auth account-created UTC month
```

Activity is aggregated from monthly buckets by activity month. Account deletion removes the learner's monthly bucket rows, removing that learner's contribution from subsequent cohort/System reads.

## Historical System attribution

Monthly rows retain the `system_id` captured by the Scheduled event at study time. They do not reclassify historical activity using current Case taxonomy.

The centralized durable System-history authority covers:

- `scheduled_review_events`;
- `learner_system_aggregates`;
- `learner_system_monthly_buckets`.

Application checks plus migration `0025` database guards prevent System deletion/reclassification while retained monthly history depends on the identity.

## Account deletion scale-gate decision

Decision: **retry-safe staged deletion**.

A universal one-shot cascade could not be certified for the mature supported account shape because Scheduled history/current-generation optimizer evidence are not lifetime-bounded by a finite maximum row count.

The staged path:

1. persists a durable deletion marker;
2. bans/denies access immediately with application/database guards respecting the marker;
3. drains Better Auth sessions in bounded phases;
4. drains learner-owned verification/account rows in bounded phases;
5. drains FSRS/runtime ownership in bounded retry-safe phases;
6. tolerates a delete committing before the phase marker advances;
7. performs a residual rescan before final identity deletion;
8. keeps final user deletion fail-closed when any owned row survives;
9. invokes pinned Better Auth user removal only after the staged gate is clear.

Receipt/history cleanup precedes active Review cleanup where required so existing completion-expiry guards cannot strand account erasure in an abnormal partially-consumed state.

## Better Auth 1.6.25 boundary

The repository remains pinned to Better Auth `1.6.25`.

PR G accounts for the pinned reset-verification ownership behavior: learner-owned reset verification rows use the learner user id in the relevant `verification.value` flow and must be removed before final identity deletion without deleting unrelated verification records.

## Mature-account benchmark fixture

The synthetic benchmark contract includes at least:

- 5,000 learner×Case FSRS states;
- 5,000 learner×Case encounters;
- 20,000 Scheduled Review events;
- 20,000 optimizer-evidence rows;
- 2,000 Free completion receipts;
- 60 months of monthly System attribution across representative Systems;
- learner/System and learner-wide aggregates;
- an active Review with 256 frozen questions and 64 assets;
- 5,000 Better Auth sessions;
- 2,500 Better Auth linked/credential accounts;
- a learner-owned password-reset verification row.

The local workerd/D1 smoke uses a smaller multi-batch fixture while proving the same state-machine semantics through the actual D1 binding. Timing measurements are environment-specific evidence, not Production latency promises.

Repository commands:

```text
npm run fsrs:account-deletion-benchmark
npm run fsrs:account-deletion-d1-smoke
npm run fsrs:pr-g-acceptance-d1
```

## Regression coverage

PR G coverage includes:

- monthly bucket creation/rating counts;
- bucket survival after detailed Scheduled events expire/delete;
- Admin trend reads without reconstruction from lifetime/optimizer state;
- account-created-month cohort semantics;
- historical monthly System provenance guards;
- immediate access revocation before staged cleanup completes;
- bounded/retry-safe auth/application deletion phases;
- residual-data fail-closed identity deletion;
- removal of monthly/cohort contribution on account deletion;
- no resurrection of legacy Review tables.

## Production boundary

PR #141 merge proves repository implementation/validation only. It does not establish that migration `0025` is applied to Production, that the Worker is deployed, that analytics/deletion are enabled, or that live Production behavior has been verified.
