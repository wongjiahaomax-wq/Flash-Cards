# Learner FSRS PR F implementation evidence

Status: **implementation evidence for PR F — Reset Progress / Fresh FSRS Start. No Production migration application, deployment, optimizer execution, account deletion, or Production D1/R2 mutation is authorized by this file.**

Base at implementation start:

`49e3f917221641f3a237dc3b9c56577099232c54`

This is the `main` merge commit for PR #137 / learner runtime cutover.

## Authority and scope

PR F implements the Reset/Fresh, detailed-history retention, and learner Progress behavior assigned by:

- `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md`;
- `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md`;
- `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md`;
- `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`.

The existing Production `/study` Scheduled/Free run model from PR #137 remains the runtime owner. PR F does not introduce persistent run/session rows and does not modify `/fsrs-preview` ownership or its local-only 5/10/20/All continuous-run behavior.

## Reset Progress

`resetLearnerFsrsProgress()` is one learner-scoped D1 batch that:

1. deletes any active Review for the learner;
2. deletes current `learner_case_fsrs` state;
3. performs bounded detailed-history maintenance;
4. keeps the current FSRS generation, parameter revision and serialized parameters;
5. increments `review_sequence_epoch` only when an FSRS profile already exists.

A never-initialized learner therefore remains uninitialized after Reset. Historical Scheduled events inside the retained display window, compact encounter state, learner/System aggregates, and current-generation optimizer sequence evidence remain independent retained data.

## Fresh FSRS Start

`freshLearnerFsrsStart()` uses the same active-Review/state invalidation boundary and then:

- advances `generation` and `review_sequence_epoch` for an initialized learner;
- advances `parameter_revision` because the persisted parameter object is replaced;
- restores the exact canonical default parameter JSON from `initialLearnerFsrsProfile()`, including 90% desired retention;
- clears `last_optimized_at` without executing an optimizer;
- preserves the learner's detailed-history retention override;
- preserves retained Scheduled history, encounters, and lifetime/System aggregates;
- prunes optimizer-only evidence from generations that became permanently ineligible after the Fresh boundary.

For a never-initialized learner, Fresh creates the ordinary initial generation/epoch/revision `1` profile rather than manufacturing an artificial second generation.

## Active Review and browser-run invalidation

Migration `0024_learner_fsrs_reset_fresh.sql` adds a defensive trigger that rejects a Scheduled profile-boundary update while a Scheduled active Review still exists. The supported Reset/Fresh writers therefore consume the active Review before moving the profile boundary in the same atomic D1 batch.

This completes PR F's two-sided creation race contract:

- Reset/Fresh first → PR C's existing active-Review creation trigger rejects the old generation/epoch/revision as `active_review_stale_boundary`;
- active Review first → Reset/Fresh deletes it in the same transaction as current-state deletion and boundary movement;
- a committed Reset/Fresh cannot leave an active Scheduled Review on the old boundary.

The learner `/study` action response carries `browserRunInvalidated`; the page clears the learner browser-run descriptor after Reset/Fresh so old signed run/work proofs are not reused as resumable browser state. Server-side profile-boundary verification remains the hard authority even if stale localStorage survives outside the normal UI path.

## Detailed-history retention

V1 retains human-readable Scheduled history according to the existing per-learner policy:

- 24 months by default;
- 36 months;
- 60 months;
- Indefinite.

`fsrs-retention.js` defines one database-time cutoff contract used both by visible history reads and bounded physical cleanup. Logical reads hide expired detailed events immediately; physical cleanup is opportunistic and throttled during normal Scheduled completion, while Reset/Fresh may force the already-bounded learner-scoped cleanup as part of their transaction.

Cleanup removes only `scheduled_review_events` outside the retained display window. It does not delete current-generation `learner_optimizer_evidence`, encounter state, or aggregates merely because human-readable events expired. This preserves truthful optimizer sequence continuity without implementing optimizer execution.

## Learner Progress

`getLearnerFsrsProgress()` adds the PR-F learner read model required by the locked product plan. It reports:

- Due Cases;
- SRS coverage as entered-SRS Cases / currently eligible Cases;
- Not-due scheduled Cases separately from coverage;
- total and recent Scheduled activity;
- Free Study aggregate activity;
- Again / Hard / Good / Easy distribution;
- System-level coverage/memory/activity;
- bounded retained recent Scheduled history.

Raw FSRS stability/difficulty values are not exposed. The read model uses current compact state and aggregates and does not implement PR G cohort/time-series Admin analytics.

## Regression coverage

`test/learner-fsrs-reset-fresh.test.js` covers:

- Reset preserving generation/parameters/history-domain data while advancing only the review-sequence epoch;
- Fresh advancing generation/epoch/revision and restoring canonical 90% defaults;
- retention override preservation;
- old-generation optimizer-evidence pruning on Fresh;
- never-initialized Reset and Fresh semantics;
- active-Review-first invalidation;
- Reset/Fresh-first stale Scheduled creation rejection;
- database rejection of an unsafe direct boundary update while a Scheduled Review exists;
- retained-history filtering/cleanup semantics;
- learner Progress coverage vs memory separation and cross-System Tag exposure.

`test/learner-fsrs-runtime-cutover.test.js` extends the existing PR #137 source contract so `/study` must keep Reset/Fresh/Progress ownership on the new FSRS services, clear browser-run state after a boundary action, retain the defensive migration, and keep `/fsrs-preview` and legacy Review retirement boundaries unchanged.

## Explicitly out of scope

PR F does not implement:

- optimizer execution or automatic parameter optimization;
- PR G Admin/cohort/monthly analytics;
- learner-account deletion;
- a new persistent study-run/session architecture;
- Production migration application or deployment;
- Production D1/R2 mutation.

Validation and review state are recorded on the exact PR head; this evidence file does not substitute for CI or final diff review.
