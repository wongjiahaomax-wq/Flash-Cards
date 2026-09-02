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
- `completeFreeReview()` atomically writes the retry receipt, accumulates the Free learner×Case encounter, increments the learner Free lifetime aggregate, and consumes the exact active Free Review;
- receipt insertion is guarded at database-write time by exact active ownership, Free mode, reveal state, and database-time expiry;
- the final active-Review consume has an expiry-crossing guard so a Review that becomes expired before the transaction commits rolls back every Free outcome write;
- ordinary Admin Case deactivation after the Review has been frozen does not retroactively cancel that valid frozen Review;
- duplicate/concurrent/lost-response completion reconciles from the unique receipt and cannot increment Free counters twice;
- receipt cleanup is bounded and uses database time;
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

The default TTL is seven days, aligned with the temporary active-Review horizon. Cleanup is bounded (`100` by default, maximum `500` per call).

## Admin Study Preview boundary

The merged Part E authority requires Admin Study Preview not to contaminate learner state/history/aggregates/preferences. Current `main` does not contain the old PR #119 Admin Study Preview implementation. That implementation depended on the rejected permanent `studySelectionId` / legacy Review architecture and is intentionally **not** transplanted here.

No Part E code is reachable from an Admin Preview surface, and this tranche does not add a new Preview persistence path. When a Production Admin Study Preview surface is selectively transplanted or rebuilt, it must remain outside learner FSRS/Free persistence and receive its own contamination regression coverage before learner runtime cutover.

## Focused validation ownership

`test/learner-fsrs-free-study.test.js` covers:

- Expanded OFF default and scheduler-free Free descriptor shape;
- seven-day short-lived receipt schema/account cascade;
- completion after ordinary Admin Case deactivation;
- reveal/exact-active/database-expiry write guards;
- expiry-crossing all-or-nothing rollback.

`.github/workflows/learner-fsrs-free-study.yml` additionally runs:

- migration history validation;
- focused bootstrap/run-planner/Part-E contracts;
- the real repository-pinned Wrangler/workerd + local D1 Free completion smoke.

The workerd/D1 smoke proves:

- preference mutation leaves FSRS profile uninitialized;
- two concurrent identical Free completions serialize to one `completed` and one `replayed` result;
- a subsequent lost-response retry replays the same receipt/result;
- the committed completion increments Free encounter and learner Free aggregate exactly once;
- Scheduled events, optimizer evidence, learner×Case FSRS state, learner/System Scheduled aggregates, and FSRS profile remain absent;
- completion-vs-Discard serializes to one coherent owner;
- expired completion-vs-active-cleanup leaves zero partial Free writes;
- bounded expired-receipt cleanup removes the expired retry receipt.

## Deliberate exclusions

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
