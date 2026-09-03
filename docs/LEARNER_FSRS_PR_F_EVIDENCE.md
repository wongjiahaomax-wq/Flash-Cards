# Learner FSRS PR F implementation evidence

Status: **implementation evidence for PR F — Reset Progress / Fresh FSRS Start. No Production migration application, deployment, optimizer execution, account deletion, or Production D1/R2 mutation is authorized by this file.**

Base at implementation start:

`49e3f917221641f3a237dc3b9c56577099232c54`

This is the `main` merge commit for PR #137 / learner runtime cutover.

## Authority and scope

PR F implements the Reset/Fresh, detailed-history retention/control, and learner Progress behavior assigned by:

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

PR F proves the full two-sided creation race with the supported production writers under real workerd + local D1:

- the smoke plans a genuine Scheduled run through `planScheduledSystemStudyRun()`, including the signed run-boundary token and captured-New membership proof;
- it races `createScheduledActiveReview()` concurrently against `resetLearnerFsrsProgress()` and, separately, `freshLearnerFsrsStart()`;
- Reset/Fresh-first may reject creation as a stale run because the authenticated generation/epoch/revision no longer matches;
- creation-first may return as created, or may commit and then be consumed before its post-commit read; both creation-first forms are accepted only when Reset/Fresh commits the required boundary and no active Review remains;
- after every race, the workerd smoke asserts there is no active Review left on the prior generation/epoch and that Reset/Fresh changed exactly the intended profile boundaries.

The specialized `.github/workflows/learner-fsrs-active-review-benchmark.yml` explicitly path-triggers on migration `0024`, Reset/Fresh/retention services and their focused tests, runs those contract tests, and then executes the supported-writer races through the local workerd/D1 smoke. The ordinary node:sqlite tests remain useful trigger/regression coverage but are not presented as the concurrency proof by themselves.

The learner `/study` action response carries `browserRunInvalidated`; the page clears the learner browser-run descriptor after Reset/Fresh so old signed run/work proofs are not reused as resumable browser state. Server-side profile-boundary verification remains the hard authority even if stale localStorage survives outside the normal UI path.

## Detailed-history retention and Admin control

V1 retains human-readable Scheduled history according to the per-learner policy:

- 24 months by default;
- 36 months;
- 60 months;
- Indefinite.

`fsrs-retention.js` defines one database-time cutoff contract used both by visible history reads and bounded physical cleanup. Logical reads hide expired detailed events immediately; physical cleanup is opportunistic and throttled during normal Scheduled completion, while Reset/Fresh and an explicit retention-policy change may force the already-bounded learner-scoped cleanup as part of their transaction.

PR F also provides the authorized per-learner Admin control at `/admin/learner-retention`. `fsrs-retention-admin.js` validates exactly `24m | 36m | 60m | indefinite`, lists normal learner accounts without exposing Admin/Preview identities as retention targets, and persists the selected policy. If the learner has never initialized FSRS, the readiness contract permits this explicit Admin override to create the ordinary canonical initial profile; the writer therefore uses `initialLearnerFsrsProfile()` so generation, epoch and parameter revision start at `1`, scheduler/library identity matches the pinned adapter, and default parameter JSON still carries desired retention `0.90`. It does not create per-Case FSRS state.

For an already initialized learner, changing detailed-history retention does not alter generation, review-sequence epoch, parameter revision, scheduler parameters, current Case scheduling state, or active-run boundaries. Shortening the display-retention window performs immediate bounded cleanup of expired `scheduled_review_events` while leaving optimizer evidence, encounter state, and aggregates intact.

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

## Regression and specialized coverage

`test/learner-fsrs-reset-fresh.test.js` covers:

- Reset preserving generation/parameters/history-domain data while advancing only the review-sequence epoch;
- Fresh advancing generation/epoch/revision and restoring canonical 90% defaults;
- retention override preservation;
- old-generation optimizer-evidence pruning on Fresh;
- never-initialized Reset and Fresh semantics;
- active-Review-first invalidation;
- Reset/Fresh-first stale Scheduled creation rejection at the database boundary;
- database rejection of an unsafe direct boundary update while a Scheduled Review exists;
- retained-history filtering/cleanup semantics;
- learner Progress coverage vs memory separation and cross-System Tag exposure.

`test/learner-fsrs-retention-admin.test.js` covers:

- exact validation of the four locked retention policies;
- learner-only Admin listing with the effective 24-month default before profile initialization;
- an uninitialized override creating only the canonical generation/epoch/revision `1` profile with adapter-generated 90% defaults and no per-Case state;
- initialized-policy changes preserving scheduler boundaries and parameter JSON;
- immediate expired display-history cleanup without deleting optimizer evidence;
- fail-closed handling for invalid policies and non-learner targets.

The active-Review specialized workflow additionally runs repeated Reset-vs-creation and Fresh-vs-creation races through real workerd/local D1 using `createScheduledActiveReview()` and the real Reset/Fresh services, and asserts the valid serialization outcomes plus final no-stale-active-Review invariant.

`test/learner-fsrs-runtime-cutover.test.js` extends the existing PR #137 source contract so `/study` must keep Reset/Fresh/Progress ownership on the new FSRS services, clear browser-run state after a boundary action, retain the defensive migration, and keep `/fsrs-preview` and legacy Review retirement boundaries unchanged.

## Explicitly out of scope

PR F does not implement:

- optimizer execution or automatic parameter optimization;
- PR G Admin/cohort/monthly trend analytics beyond the individual retention control assigned to PR F;
- learner-account deletion;
- a new persistent study-run/session architecture;
- Production migration application or deployment;
- Production D1/R2 mutation.

Validation and review state are recorded on the exact PR head; this evidence file does not substitute for CI or final diff review.
