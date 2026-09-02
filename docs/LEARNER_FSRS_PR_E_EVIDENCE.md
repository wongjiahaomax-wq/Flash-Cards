# Learner FSRS Part E implementation evidence

Status: **staged implementation evidence for PR E — Free Study + Expanded preference. No learner runtime cutover, Production migration application, deployment, or Production D1/R2 mutation is authorized by this file.**

Base at implementation start:

`8d2c75eb72360387e5ae2b6e0720ccb4eea37ca6`

This is the `main` merge commit for PR #133 / Part D.

## Scope implemented

Part E reuses the already-merged Part B/C foundations instead of duplicating them:

- `buildFreeStudyRunDescriptor()` already provides the deduplicated Free shuffle bag and contains no scheduler boundary/proof fields;
- `planFreeSystemStudyRun()` already reads the global learner preference without initializing or reading an FSRS profile/state;
- `createFreeActiveReview()` already freezes Free content outside the scheduler boundary and reads the same `learner_preferences.expanded_learning` preference used by Scheduled active-Review creation;
- the persistent preference default remains Expanded Learning OFF.

This tranche adds the missing Free completion/write side:

- migration `0022_learner_fsrs_free_study.sql` adds short-lived unique `free_review_completion_receipts`;
- `free-study-schema.js` is registered in `drizzle.config.js` so the receipt table remains part of Drizzle Kit's declared schema authority;
- `completeFreeReview()` atomically writes the retry receipt, accumulates the Free learner×Case encounter, increments the learner Free lifetime aggregate, and consumes the exact active Free Review;
- receipt insertion is guarded at database-write time by exact active ownership, Free mode, reveal state, and database-time expiry;
- the final active-Review consume has an expiry-crossing guard so a Review that becomes expired before the transaction commits rolls back every Free outcome write;
- ordinary Admin Case deactivation after the Review has been frozen does not retroactively cancel that valid frozen Review;
- duplicate/concurrent/lost-response completion reconciles from the unique **unexpired** receipt and cannot increment Free counters twice;
- an expired receipt is no longer replay authority even if bounded maintenance cleanup has not deleted the row yet;
- receipt cleanup is bounded and uses database time;
- the receipt table has both expiry-oriented cleanup indexing and user-leading account-owned indexing;
- `setExpandedLearningPreference()` changes only the global learner preference row and does not initialize an FSRS profile.

## No-FSRS boundary

Free completion deliberately does **not** write:

- `learner_fsrs_profiles`;
- `learner_case_fsrs`;
- `scheduled_review_events`;
- `learner_optimizer_evidence`;
- `learner_system_aggregates`;
- any Again / Hard / Good / Easy rating.

The real local-workerd/D1 smoke asserts those tables remain untouched while Free encounter/aggregate state advances exactly once.

## Short-lived receipt shape

The Free receipt is retry provenance, not durable learner history or optimizer evidence. It stores only:

- Review/receipt id;
- learner id;
- Case id;
- completion time;
- resulting `free_times_studied` value needed to replay the same success;
- expiry time.

The default TTL is seven days, aligned with the temporary active-Review horizon. Replay checks expiry against database time. Cleanup is bounded (`100` by default, maximum `500` per call) and is a storage-maintenance backstop rather than what makes an expired receipt cease being authoritative.

## Part E D1-compatible benchmark gate

Part A explicitly deferred Free-receipt costs until the tranche that made them executable. Part E therefore adds:

```bash
npm run fsrs:free-study-benchmark
```

The benchmark applies the actual foundation, active-Review, and Part-E migrations to a temporary SQLite database and measures the candidate Part-E persistence shape. Active-Review creation is intentionally outside the measured completion bundle because Part C owns a separate active-Review benchmark.

For representative Free completions it records:

- the logical rows changed by the completion bundle;
- mean/total completion-bundle timing;
- retained receipt occupancy/storage delta and approximate bytes per retained receipt;
- accumulated learner×Case Free encounter count;
- learner-wide `free_completed` count;
- bounded expired-receipt cleanup timing, batch count, and deleted rows;
- the expired-receipt cleanup query plan;
- post-cleanup storage reclamation;
- foreign-key violations.

The expected Part-E completion bundle changes exactly four logical rows per successful completion:

1. unique retry receipt insert;
2. learner×Case encounter upsert;
3. learner aggregate upsert;
4. active Free Review consume.

This is deliberately D1-compatible local SQLite evidence rather than a claim about Cloudflare network latency or billing metadata.

## Admin Study Preview boundary

The merged technical design requires Admin Study Preview not to contaminate learner state/history/aggregates/preferences. Current `main` does not contain the old PR #119 Admin Study Preview implementation. That implementation depended on the rejected permanent `studySelectionId` / legacy Review architecture and is intentionally **not** transplanted here.

No Part E code is reachable from an Admin Preview surface, and this tranche does not add a new Preview persistence path. The implementation-readiness contract separately assigns the learner runtime cutover to keep Admin Study Preview outside learner SRS persistence. When a Production Admin Study Preview surface is selectively transplanted or rebuilt, that checkpoint must add executable contamination regression coverage before learner runtime cutover is accepted.

## Focused validation ownership

`test/learner-fsrs-free-study.test.js` covers:

- Drizzle Kit registration of the Part-E receipt schema;
- Expanded OFF default and scheduler-free Free descriptor shape;
- seven-day short-lived receipt schema/account cascade;
- completion after ordinary Admin Case deactivation;
- reveal/exact-active/database-expiry write guards;
- expiry-crossing all-or-nothing rollback.

`test/learner-fsrs-free-study-benchmark.test.js` protects the benchmark contract, including the four-row completion bundle, retained receipt footprint, bounded cleanup, cleanup index use, and FK integrity.

`.github/workflows/learner-fsrs-free-study.yml` additionally runs:

- migration history validation;
- focused bootstrap/run-planner/Part-E/benchmark contracts;
- the representative Part-E Free completion/receipt benchmark;
- the real repository-pinned Wrangler/workerd + local D1 Free completion smoke.

The workerd/D1 smoke proves:

- preference mutation leaves FSRS profile uninitialized;
- two concurrent identical Free completions serialize to one `completed` and one `replayed` result;
- a subsequent lost-response retry replays the same unexpired receipt/result;
- an expired receipt cannot replay stale success before cleanup;
- the committed completion increments Free encounter and learner Free aggregate exactly once;
- Scheduled events, optimizer evidence, learner×Case FSRS state, learner/System Scheduled aggregates, and FSRS profile remain absent;
- completion-vs-Discard serializes to one coherent owner;
- expired completion-vs-active-cleanup leaves zero partial Free writes;
- bounded expired-receipt cleanup removes the expired retry receipt.

## Browser/runtime and Preview work deliberately left to cutover

Part B staged the browser-local Scheduled/Free run descriptors but explicitly deferred browser runtime advancement. The later learner runtime cutover therefore still owns wiring the staged FSRS/Free system into `/study`, including:

- advancing/persisting the Free bag position in browser state;
- reshuffling after a Free bag is exhausted and handling explicit Start new Free Study session;
- learner-facing controls for persistent global preferences;
- `Study More` routing into Free Study;
- rebuilding/selectively transplanting Production Admin Study Preview without learner persistence contamination;
- executable Admin Preview contamination regression coverage against that actual runtime surface.

Those are not implemented by inventing a second pre-cutover learner runtime in Part E.

## Other deliberate exclusions

This tranche does not:

- cut `/study` over to the staged FSRS/Free runtime;
- add a persistent Free run/session row;
- persist the browser Free shuffle bag in D1;
- add ratings or any FSRS transition to Free Study;
- implement Reset Progress / Fresh FSRS Start;
- implement retention, learner Progress, Admin analytics, optimizer execution, or account deletion;
- retire legacy learner Review persistence;
- implement the rejected PR #119 persisted-selection architecture;
- mutate Production D1/R2 or deploy anything.

Learner runtime cutover remains a separate checkpoint after Scheduled and Free behavior is validated.
