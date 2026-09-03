# Learner FSRS PR G — Admin analytics/history and account deletion evidence

_Status: implementation evidence for the focused PR G branch; not Production deployment evidence._

PR G follows merged PR #139 / PR F and implements the remaining V1 Admin analytics/history and mature-account deletion scale gate from the locked learner FSRS authority chain.

## Scope implemented

PR G adds:

- durable learner × historical-System × UTC-calendar-month Scheduled analytics buckets;
- migration-time backfill only from detailed `scheduled_review_events` that still exist when migration `0025` is applied;
- transactional bucket maintenance for every newly committed Scheduled Review event;
- Production Admin read-only learner history, learner-wide lifetime totals, per-System lifetime totals, per-System monthly trends and cross-learner System monthly trends;
- a stable cohort trend whose cohort key is the learner account-created UTC month and whose activity axis uses the same durable monthly buckets;
- registration of monthly System attribution with the existing centralized taxonomy deletion/provenance authority and defensive database guards;
- the mature learner account-deletion scale gate and retry-safe staged deletion path;
- bounded deletion benchmarks plus local workerd/D1 deletion proof.

PR G does not implement optimizer execution, automatic parameter replacement, learner Scheduled/Free UX changes, or any resurrection of `reviews`, `review_questions`, or `review_assets`.

## Durable monthly analytics semantics

Physical table:

`learner_system_monthly_buckets`

Primary key:

`(user_id, system_id, month_start)`

`month_start` is the UTC first instant of the calendar month. Each row stores compact Scheduled completion/rating counts plus first/last completion timestamps for that learner, historical System, and month.

The bucket is written by an `AFTER INSERT` trigger on `scheduled_review_events`. The event insert and bucket update therefore share the same database transaction as Scheduled completion. A lost-response retry that reuses the already committed Scheduled event cannot increment the bucket again.

Detailed-history cleanup does not delete monthly buckets. Long-range Admin trend queries read these buckets directly; they do not scan optimizer evidence and they do not reconstruct expired months from `learner_system_aggregates`.

Migration `0025` backfills buckets from the detailed Scheduled events retained at migration time. It deliberately does not manufacture months that had already expired before PR G existed. Consequently the durable long-range time series is truthful from retained migration history forward, rather than pretending lifetime totals contain a historical time axis.

## Stable cohort definition

V1 cohort membership is:

**learner Better Auth account-created UTC month**.

Cohort trend measures are aggregated from `learner_system_monthly_buckets` by activity month. Account deletion removes that learner's bucket rows, so the deleted learner's contribution is removed from later cohort/System reads as required by the readiness contract.

## Historical System attribution

Monthly rows persist the `system_id` captured by the Scheduled event at study time. They do not reclassify activity using the Case's current taxonomy.

`fsrs-system-provenance.ts` now centrally checks all three durable V1 System-history owners:

- `scheduled_review_events`;
- `learner_system_aggregates`;
- `learner_system_monthly_buckets`.

Migration `0025` adds defensive kind-change and delete guards for the monthly table. A System identity cannot be reclassified away or permanently deleted while any retained monthly contribution depends on it.

## Account deletion scale-gate decision

Decision: **retry-safe staged deletion**.

Direct cascade is not the supported mature-account path because Scheduled history and current-generation optimizer evidence are not bounded by a finite lifetime row maximum. Therefore there is no universal finite worst-supported learner size for which a one-shot cascade can be certified safe.

The staged path:

1. creates a durable `learner_account_deletions` marker;
2. bans the learner and deletes Better Auth sessions before large child cleanup;
3. database guards reject new sessions and active Reviews while the marker exists;
4. deletes at most 1,000 rows in one staged child-table step;
5. is retry-safe if a delete commits but the phase update does not;
6. performs a full residual rescan before declaring the identity ready for deletion;
7. keeps a database guard on learner `user` deletion so an in-flight writer that recreates learner-owned rows forces the final identity delete to fail closed and be retried;
8. calls pinned Better Auth Admin `removeUser` only after the staged data gate is clear.

Receipt/history rows are deleted before active Reviews so the existing completion-expiry deletion guards cannot obstruct account erasure in an abnormal partially-consumed Review state.

## Better Auth 1.6.25 boundary

The repository remains pinned to Better Auth `1.6.25`.

The pinned Admin `removeUser` implementation deletes user sessions and then delegates user deletion; the pinned internal adapter deletes sessions/accounts and finally the user identity. The Better Auth `verification` table has no user foreign key. In the pinned password-reset flow, reset verification rows store the learner user id in `verification.value`.

PR G therefore stages `verification` rows with `value = learner user id` before FSRS/runtime child deletion and includes that condition in the final user-delete guard. This prevents a retained password-reset verification row from surviving account deletion while leaving unrelated verification records untouched.

## Mature-account benchmark contract

Commands:

```text
npm run fsrs:account-deletion-benchmark
npm run fsrs:account-deletion-d1-smoke
```

The synthetic mature learner benchmark includes, at minimum:

- 5,000 learner×Case FSRS states;
- 5,000 learner×Case encounter rows;
- 20,000 Scheduled Review events;
- 20,000 optimizer-evidence rows;
- 2,000 Free completion receipts;
- 60 months of generated monthly System attribution across representative Systems;
- learner/System and learner-wide aggregates;
- an active Review with 256 frozen questions and 64 assets;
- Better Auth credential account, 20 sessions, and a learner-owned password-reset verification row.

The local workerd/D1 smoke uses a smaller but multi-batch fixture, including the same Better Auth verification ownership class, and proves the same state machine through the actual D1 binding. Benchmark timings are environment-specific evidence, not Production latency promises; the merge handoff records the exact-head CI measurements.

## Regression coverage

PR G tests cover:

- monthly bucket population and rating counts;
- bucket survival after detailed Scheduled events are deleted;
- Admin trend reads remaining available without reconstructing expired detailed history;
- account-created-month cohort semantics;
- monthly System attribution blocking raw System reclassification/deletion;
- access revocation before staged cleanup;
- database blocking of mature direct user cascade;
- per-step deletion row bound;
- retry progression to identity-ready;
- deletion of Scheduled events, optimizer evidence, Case state, encounters, aggregates, monthly buckets, active Review children, Free receipts, preferences and profile state;
- Better Auth reset-verification cleanup without deleting unrelated verification rows;
- session invalidation/new-session guard during deletion;
- final auth account cascade at identity-root deletion;
- Drizzle schema registration and production-to-local replica exclusion contract;
- no legacy Review persistence resurrection.

## Operational boundary

This PR changes repository schema/code/tests/docs only. It does not apply migration `0025` to Production, mutate Production D1/R2, run an optimizer, replace learner FSRS parameters, or deploy a Worker.
