# Self-Service Study Data Deletion Plan

Status: **planning contract only**. This document intentionally does not implement the feature. The next coding agent should implement this plan in the same PR/branch.

This plan is intentionally detailed. It exists so implementation agents can validate and code the design without rediscovering the product semantics, deletion boundary, concurrency requirements, or UX from scratch.

## 1. Goal

Add a safe self-service operation that lets a signed-in user remove **all study/review data owned by their own account while keeping the account itself**.

The feature is for both:

- normal learners; and
- administrators who have generated learner/runtime data by using the real study surface.

Required end state:

```text
same authentication identity
same role
same login/account links
same current session
same unrelated preferences
same shared Flash-Cards content

+

no active Review
no FSRS scheduling state
no Scheduled/Free study history
no learner study aggregates
no durable learner study analytics
no optimizer evidence
no legacy Review rows for that user
```

After deletion completes, the next legitimate study action should initialize the user as fresh study state using the ordinary current runtime.

This is deliberately different from both existing **Reset Progress** and **Permanent learner account deletion**.

---

## 2. Locked product semantics

### 2.1 Existing Reset Progress remains unchanged

Reset Progress remains the non-destructive restart option:

- clears current scheduling state;
- makes Cases New again for scheduling;
- invalidates the current active Review/boundary as already implemented;
- retains historical study activity;
- retains durable learner/System analytics;
- retains the learner FSRS profile/parameters according to the existing Reset contract.

Do not silently broaden Reset Progress into a data-erasure feature.

### 2.2 Existing Fresh FSRS Start remains unchanged

Fresh FSRS Start remains the scheduler-generation restart option:

- clears current Case scheduling state and active Review;
- starts a new FSRS generation/review-sequence boundary;
- restores current default FSRS parameters as already implemented;
- retains historical Scheduled/Free activity and durable analytics according to the current contract.

Do not repurpose Fresh FSRS Start as full deletion.

### 2.3 New learner action — Delete all my study data

Learner-facing semantics:

> Permanently delete your Reviews, ratings, FSRS progress, study history, and associated learning analytics. Your account remains active.

Required effects:

- keep the Better Auth user identity;
- keep password/login/account links;
- keep role and account status;
- keep the current login session;
- keep shared Flash-Cards content;
- keep unrelated user preferences;
- delete all learner-owned study/runtime/history/analytics rows;
- leave the account in the same **study-state class** as an account that has never studied;
- allow a later `/study` visit to initialize fresh learner scheduling state normally;
- allow the user to request another full deletion after accumulating new study data later.

Require strong typed confirmation:

```text
DELETE MY STUDY DATA
```

The server must validate the confirmation. Client-side confirmation alone is insufficient.

### 2.4 New administrator self-action — Clear my study data

Administrators receive the same backend study-data semantics for **their own** account.

Suggested copy:

> Clear my study data
>
> Permanently removes Reviews, FSRS progress, study history, and learning analytics associated with this administrator account. Your administrator account, role, login, and Flash-Cards content are not affected.

Use the same typed confirmation unless UX review identifies a compelling reason to vary it.

The initial feature is **self-service only**.

Do not add:

- a global clear-all-users control;
- arbitrary Admin deletion of another learner's study data;
- a userId picker for this operation;
- a mechanism to bypass Production deployment/cutover safety.

---

## 3. User-visible distinction

| Action | Scheduling state | FSRS parameters/generation | Historical activity | Analytics | Account |
| --- | --- | --- | --- | --- | --- |
| Reset Progress | reset | current Reset semantics | kept | kept | kept |
| Fresh FSRS Start | reset | fresh generation/defaults | kept | kept | kept |
| Delete all my study data | deleted | deleted | deleted | deleted | kept |

The UI must make these choices understandable before confirmation.

---

## 4. Study-data ownership baseline

Do not implement this as `DELETE FROM reviews`.

Current study data spans active Review, FSRS, Free Study, retained history, aggregates, durable monthly analytics, and retired legacy Review sentinel tables.

The coding agent must re-read current executable schema/runtime before implementation. At the planning baseline, the deletion must account for at least:

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

### 4.1 Active Reviews

`active_review_questions` and `active_review_assets` are children of `active_reviews` and currently follow the active Review FK/cascade contract. Prefer deleting the parent using the current contract rather than duplicating child cleanup unless current schema requires otherwise.

### 4.2 Legacy Reviews

The historical physical `reviews`, `review_questions`, and `review_assets` tables are not the supported runtime but remain relevant to migration/cutover safety.

If rows exist for the target user, delete legacy children before the parent:

```text
review_questions for reviews owned by user
review_assets for reviews owned by user
reviews owned by user
```

Do not assume these tables are globally empty.

### 4.3 Durable monthly analytics

`learner_system_monthly_buckets` survives detailed-history expiry and must be deleted explicitly. Deleting `scheduled_review_events` does not remove historical monthly buckets.

### 4.4 Re-scan for schema drift

Before coding, search current schema, migrations, `/study`, account deletion, analytics, local reset tooling, and cutover sentinels for any additional user-owned study table or writer introduced after this plan.

Executable code/migrations outrank the planning list.

---

## 5. Data that must survive

Do **not** delete:

```text
user
session
account
verification
learner_preferences
learner_account_deletions
content/domain tables
shared content Assets/R2 objects
```

Specifically preserve:

- Better Auth identity;
- role;
- password/provider links;
- current session;
- name/email;
- account-created date/cohort identity;
- banned/disabled state unless another account workflow changes it;
- unrelated preferences;
- shared content/taxonomy/provenance.

At the planning baseline, `learner_preferences` is preference state rather than historical evidence and must survive unchanged unless current schema contains a field that is demonstrably derived study progress. Any field-level exception must be documented and tested.

---

## 6. Recommended durable state machine

### 6.1 Dedicated marker

Preferred design: add an account-preserving operational marker such as:

```text
learner_study_data_deletions
```

Recommended conceptual fields:

```text
user_id              PRIMARY KEY / FK user(id) ON DELETE CASCADE
phase                NOT NULL
requested_at         NOT NULL
updated_at           NOT NULL
batches_completed    NOT NULL DEFAULT 0
completed_at         NULL
```

Use the next migration number after reconciling current `main`; do not hard-code a migration number from this planning document.

### 6.2 Recommended phases

```text
active_reviews
free_receipts
scheduled_events
optimizer_evidence
case_state
case_encounters
monthly_buckets
system_aggregates
learner_aggregates
legacy_review_questions
legacy_review_assets
legacy_reviews
profile
verify_empty
complete
```

Adjust ordering only if current FK/trigger/runtime authority requires it, with tests proving the revised ordering.

### 6.3 Bounded work

Reuse the mature account-deletion principle: each advancement request performs bounded work, deleting at most a fixed chunk from one phase. Do not introduce an unbounded mature-history delete just because typical accounts are small.

### 6.4 Completed state

Preferred behavior is to retain the marker in a non-fencing `complete` state with `completed_at` so reload/retry/status remain deterministic.

Only non-complete markers act as the study-write fence.

### 6.5 Repeat deletion later

The design must support:

```text
first deletion -> complete
user studies again
second deletion requested
```

A new explicit deletion request may reactivate/reset the completed marker atomically. Repeated `begin` calls while a deletion is already active must not rewind progress.

---

## 7. Canonical ownership/reuse

Do not create an unrelated second deletion universe.

The repository already has retry-safe staged mature learner-account deletion. Prefer sharing/refactoring the **study-data ownership definition** between:

- self-service study-data deletion; and
- the study-data portion of permanent account deletion.

A shared descriptor may define:

```text
phase
physical table
user ownership expression
bounded delete builder
next phase
```

Permanent account deletion can compose auth/identity phases around the canonical study-data phases, while self-service deletion executes only study-data phases and preserves auth/preferences.

Do not over-generalize if that makes the code less auditable. The goal is one authoritative ownership boundary.

Re-check whether current permanent account deletion covers retired legacy Review rows; if a shared ownership definition exposes a real compatibility gap, fix only what is required to keep deletion ownership correct and add focused regression coverage.

---

## 8. Concurrency and write fencing

Required invariant:

> Once self-service study-data deletion begins, no new learner study mutation for that user may commit until deletion reaches a verified empty state and the marker transitions to non-fencing `complete`.

### 8.1 Fence first

Starting deletion must durably create/reactivate the marker before cleanup proceeds.

Do not rely on browser state, cookies, in-memory flags, or form lifecycle.

### 8.2 Database boundary is authoritative

Application checks provide UX, but critical write protection must survive concurrent requests. Reconcile current D1/SQLite writers and guard the state-producing writes while an active marker exists.

Planning-baseline paths/tables requiring explicit review include:

```text
active_reviews
scheduled_review_events
free_review_completion_receipts
learner_case_fsrs
learner_case_encounters
learner_optimizer_evidence
learner_aggregates
learner_system_aggregates
learner_system_monthly_buckets
learner_fsrs_profiles
reviews (defensive legacy consideration)
```

Deletion's own `DELETE` statements must remain permitted.

### 8.3 Operations that must be blocked during deletion

At minimum:

- open/create Scheduled active Review;
- open/create Free active Review;
- Scheduled completion;
- Free completion;
- Reset Progress;
- Fresh FSRS Start;
- profile/bootstrap creation that would recreate FSRS state;
- encounter/aggregate/optimizer writes;
- stale browser completion retries;
- stale runtime v2 run/proof writes;
- every other current study writer found during implementation inventory.

### 8.4 Reads during deletion

Do not present normal study/progress as stable while cleanup is active. Prefer a maintenance state such as:

> Study data deletion is in progress. Study is temporarily unavailable until deletion completes.

Account/navigation access remains available.

### 8.5 Final rescan

Before `complete`, run a full user-scoped zero-data verification over the canonical ownership set.

If rows remain:

- do not mark complete;
- reposition to the earliest relevant phase;
- continue bounded cleanup.

The final rescan protects against pre-fence in-flight writes and implementation drift.

---

## 9. Recommended server service

Use one backend service for learner and Admin surfaces, conceptually:

```text
beginStudyDataDeletion({ db, userId })
advanceStudyDataDeletion({ db, userId, batchSize? })
getStudyDataDeletionStatus(db, userId)
isStudyDataDeletionActive(db, userId)
```

Possible result fields:

```text
userId
phase
inProgress
complete
rowsDeletedThisStep
batchesCompleted
completedAt
```

Expected states/errors should be explicit and testable, including invalid confirmation, unauthenticated access, account deletion already authoritative, active study deletion, and corrupted/unsupported phase.

Unexpected failures must remain retry-safe and must never silently release the fence.

It is acceptable for one HTTP request to advance several bounded steps up to a fixed cap, as long as the request remains bounded and returns `inProgress` when work remains.

---

## 10. Authorization

Server authority is mandatory.

### Learner

- derive target from authenticated session;
- do not trust a submitted `userId`;
- crafted requests must not target another user.

### Administrator

- derive target from the authenticated Admin session;
- apply current Production Admin/Preview Worker boundaries;
- do not use the selected learner in `/admin/learner-analytics` as the target;
- do not accept arbitrary learner IDs.

The backend primitive must support both ordinary learner identities and administrators that legitimately accumulated real study state.

Do not copy the permanent account-deletion restriction that rejects Admin identities.

---

## 11. Learner UX

Keep full deletion visually separate from Reset/Fresh.

Recommended structure:

```text
Learner Progress

Reset options
  Reset Progress
  Fresh FSRS Start

Manage study data
  Delete all my study data
```

Suggested destructive copy:

> Permanently removes your completed Reviews, ratings, FSRS scheduling state, Free Study history, and associated learning analytics. Your account and preferences remain active. This cannot be undone.

Require:

```text
DELETE MY STUDY DATA
```

If bounded cleanup remains:

- show `Deletion in progress`;
- provide safe `Continue deletion` behavior;
- keep the session/account usable;
- block study;
- never claim success before final verification.

Completion copy may state:

> Study data deleted. Your account remains active. Your next study session will start from fresh study state.

Do not expose raw table names, phase names, D1 details, or trigger errors to learners.

---

## 12. Administrator UX

Do not attach self-wipe to the selected learner's Permanent account deletion form in `/admin/learner-analytics`; that creates dangerous target ambiguity.

Prefer a self-scoped Admin maintenance surface such as:

```text
/admin/my-study-data
```

with navigation label:

```text
My study data
```

Suggested copy:

> Clear my study data
>
> Use this if this administrator account has been used on the real study surface for testing. This permanently removes study progress, Reviews, history and learning analytics belonging to this administrator account. It does not remove your administrator account or change your role.

Use the same backend state machine and typed confirmation as learner self-service.

---

## 13. Interaction with permanent account deletion

Permanent account deletion remains separate:

```text
Delete all my study data
study data -> deleted
auth identity -> retained
role/login -> retained
preferences -> retained

Permanent account deletion
study data -> deleted
auth identity -> deleted
access -> revoked
preferences -> deleted with account lifecycle
```

For normal learners, permanent account deletion should supersede/absorb an in-progress study-data wipe rather than allowing conflicting deletion state machines.

Starting study-data deletion after account deletion becomes authoritative should return a deliberate `Account deletion is already in progress` state.

Admin self-study deletion must not change the existing policy that permanent learner-account deletion does not delete Admin identities.

---

## 14. Stale browser/runtime proof behavior

While the fence is active:

- all server-authoritative study writers reject mutations;
- active Review rows are removed early;
- stale descriptors/proofs cannot recreate state.

After completion:

- old active Review IDs no longer resolve;
- old Scheduled boundary/proof material no longer corresponds to current FSRS profile/state;
- ordinary new study initialization establishes fresh authority.

Explicitly test lost-response/retry material created before deletion begins.

---

## 15. Analytics/cohort semantics

After deletion completes, the user's contribution must disappear from:

- learner-wide aggregates;
- per-System aggregates;
- durable monthly System buckets;
- retained Scheduled history;
- case encounters;
- optimizer evidence.

Cross-learner queries should naturally stop counting deleted rows; do not invent negative/tombstone analytics unless current query architecture proves it necessary.

The Better Auth account-created date survives, so cohort identity remains while study contribution becomes zero until the user studies again.

---

## 16. Failure/retry contract

If cleanup fails after fencing begins:

- fence remains active;
- account/login remains active;
- study remains blocked;
- operation is resumable;
- no success is shown.

Browser close/reload must not clear the fence.

Repeated `advance` calls must be idempotent. `advance` after `complete` returns stable completion. Only a new explicit delete request after later study can reactivate a completed marker.

---

## 17. Final empty-state verification

`verify_empty` is mandatory and must prove no target-user study rows remain in the complete current ownership set.

At the planning baseline that includes:

```text
active_reviews
active Review children linked through owned active Reviews
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
legacy review_questions/review_assets linked through owned reviews
```

Share the verifier's ownership source with deletion where practical.

A completed result without this verification is not acceptable.

---

## 18. Deployment/cutover relationship

This feature must **not** become a deployment bypass.

Do not add a global Production clear-all button.

The multi-System v2 exact-zero deployment/cutover gate remains authoritative whenever required. An individual self-wipe does not:

- clear other users;
- override the gate;
- reinterpret non-zero counts;
- authorize manual Production mutation;
- remove the need to inspect the deployment workflow.

A completed `learner_study_data_deletions` marker is operational state, not learner study history, and should not automatically be added as a zero-study sentinel. An active marker also must not be used to pretend underlying study tables are zero.

---

## 19. Migration/schema requirements

Expect a migration if using the recommended marker/guards.

Likely responsibilities:

1. create `learner_study_data_deletions`;
2. add phase/batch/completion constraints;
3. FK to `user` with `ON DELETE CASCADE`;
4. add writer-fence triggers for active deletion;
5. update schema exports/Drizzle configuration;
6. preserve existing account-deletion triggers/guards;
7. prove migration against a production-shaped D1 schema;
8. ensure migration itself does not delete existing learner data.

Use one stable machine-recognizable fencing error, for example:

```text
learner_study_data_deletion_in_progress
```

Map it to friendly product responses.

Add source-contract coverage so future writers cannot silently escape the deletion fence.

---

## 20. Required tests

At minimum cover the following categories.

### Authorization/targeting

1. learner deletes only self;
2. Admin deletes only self;
3. crafted `userId` cannot target another account;
4. unauthenticated calls fail;
5. Preview Worker does not become a Production deletion surface.

### Preserved state

6. `user` survives;
7. account/login links survive;
8. intended session survives;
9. role survives exactly;
10. account-created time survives;
11. banned/disabled state is unchanged;
12. `learner_preferences` survives unchanged;
13. shared Cases/Questions/Topics/Tags/Assets/R2 content is untouched.

### Deleted state

14. active Review and children removed;
15. Scheduled events removed;
16. Free receipts removed;
17. case FSRS state removed;
18. encounters removed;
19. optimizer evidence removed;
20. learner aggregates removed;
21. System aggregates removed;
22. monthly System buckets removed;
23. FSRS profile removed;
24. legacy Review parent/children removed safely;
25. another user's rows remain untouched.

### State machine/retry

26. begin is idempotent while active;
27. mature account larger than one batch completes through bounded work;
28. phases cannot skip non-empty data;
29. interruption leaves fence active/resumable;
30. complete is stable;
31. user can study again after completion;
32. a second deletion after new study works.

### Concurrency/fence

33. Scheduled active Review creation blocked;
34. Free active Review creation blocked;
35. Scheduled completion blocked;
36. Free completion blocked;
37. case-state write blocked;
38. encounter write blocked;
39. optimizer write blocked;
40. aggregate write blocked;
41. profile/bootstrap creation blocked;
42. Reset Progress blocked;
43. Fresh FSRS Start blocked;
44. stale run/proof retry blocked;
45. lost-response pre-deletion completion cannot recreate rows;
46. final rescan catches residual rows.

### Analytics

47. learner analytics are empty/zero after deletion;
48. System lifetime contribution disappears;
49. monthly contribution disappears;
50. cross-learner trends no longer count deleted rows;
51. cohort identity remains while study contribution is zero;
52. new post-delete activity appears normally.

### Account deletion compatibility

53. self-wipe refuses to start after permanent account deletion is authoritative;
54. permanent account deletion safely supersedes in-progress self-wipe for a learner;
55. existing account deletion remains bounded/retry-safe;
56. Admin self-wipe does not enable permanent Admin deletion;
57. shared ownership refactor does not weaken existing account-deletion guards.

### UX

58. learner exact confirmation required;
59. Admin exact confirmation required;
60. Reset/Fresh controls remain distinct;
61. in-progress UX never claims success;
62. completion only after verified empty state;
63. raw DB errors/tables/phases are not exposed.

Add further tests discovered by current-main inventory.

---

## 21. D1 acceptance and scale

Use migrated-D1 acceptance for behaviors that depend on real trigger/FK semantics.

At minimum prove:

- migration applies cleanly;
- writer guards abort relevant writes while active;
- deletion's own deletes remain permitted;
- active Review cascade is correct;
- legacy child-before-parent cleanup works;
- final verifier is correct;
- transition to `complete` allows fresh study writes;
- interaction with account deletion does not deadlock.

Seed a mature account exceeding one batch in high-volume tables and prove:

- each advance call is bounded;
- deletion converges;
- no unreviewed unbounded mature-history delete is introduced;
- common small accounts still finish efficiently.

If shared primitives change existing account-deletion performance, rerun/update its benchmark evidence.

---

## 22. Observability/security

Safe logs may include operation type, user internal identifier, phase, bounded rows deleted, completion-verification status, and error class.

Do not log clinical/study payloads, answers, ratings/history payloads, auth tokens, confirmation text, or secrets.

Security properties:

1. self-targeting only;
2. no confused-deputy target through Admin selected learner state;
3. strong typed confirmation;
4. server-side authorization;
5. fail-closed durable writer fence;
6. auth identity preservation;
7. complete study-history minimization after success;
8. no shared-content collateral deletion;
9. retry safety.

---

## 23. Documentation to update during implementation

Reconcile at least:

```text
docs/DOCUMENTATION_INDEX.md
docs/CURRENT_DESIGN.md
docs/V1_DATA_MODEL.md
docs/V1_SPEC.md
docs/LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md
docs/LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md
docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md
docs/SELF_SERVICE_STUDY_DATA_DELETION_PLAN.md
```

Also update learner/Admin UX documentation, migration authority, account-deletion docs if ownership is shared, source-contract tests, and local reset tooling where relevant.

---

## 24. Explicit non-goals

Unless required for correctness, do not expand this PR into:

- global deletion of all users' Reviews;
- arbitrary Admin deletion of another learner's study data;
- content deletion;
- account/identity deletion redesign;
- public account self-deletion;
- optimizer execution/automatic parameter replacement;
- changes to Reset Progress semantics;
- changes to Fresh FSRS Start semantics;
- new retention-policy semantics;
- anonymized retention after an explicit full study-data deletion;
- weakening deployment/cutover zero-data gates;
- automatic Production cleanup during deployment;
- manual Production D1 mutation as part of implementation.

---

## 25. Acceptance criteria

The feature is review-ready only when:

### Product

- learner has a clearly separate full-study-data deletion action;
- Admin has a clearly self-scoped equivalent;
- both require typed confirmation;
- account/role/login/session/preferences survive;
- Reset, Fresh, and Delete semantics are clear.

### Data

- all current target-user study/runtime/history/analytics rows are removed;
- legacy rows are removed if present;
- other users are untouched;
- shared content is untouched;
- final zero-data verification is authoritative.

### Concurrency

- fence is durable before cleanup;
- all current study writers fail closed while active;
- retries/interruption are safe;
- completion releases the fence only after verified empty state;
- stale browser work cannot recreate deleted data.

### Scale

- mature history is deleted in bounded chunks;
- D1 acceptance/benchmark demonstrates convergence;
- no unreviewed unbounded mature-history path is added.

### Compatibility

- Reset Progress remains correct;
- Fresh FSRS Start remains correct;
- permanent learner account deletion remains correct;
- Admin permanent-deletion policy remains unchanged;
- Runtime v2 proof/scope behavior remains correct;
- deployment/cutover gates are not weakened.

### Quality

- migration/schema/source contracts updated;
- required unit/regression/D1 tests pass;
- authoritative docs updated;
- no Production deployment/data mutation occurs in the PR.

---

# 26. Luna/Codex implementation tranches

This section is the **execution sequence for Luna agents in Codex**.

Do not give one Luna agent the whole implementation at once. Run these tranches sequentially in the **same existing PR #154 / branch**:

```text
feature/self-service-study-data-deletion
```

For every tranche:

- work from the current PR head;
- reconcile with latest `main` if required;
- re-read this plan before editing;
- current executable code/migrations outrank stale planning text;
- implement only the assigned tranche;
- add focused tests for that tranche;
- commit the completed tranche;
- do not deploy or mutate Production;
- stop after the tranche and hand back concrete evidence/results.

## Tranche 1 — Durable study-data deletion state/fence

### Goal

Create the durable database representation for an account-preserving study-data deletion operation.

### Implement

Add the per-user marker/fence, preferably equivalent to:

```text
learner_study_data_deletions
```

It must support:

- one row per user;
- phase/state;
- requested/updated timestamps;
- bounded-work progress metadata;
- active/in-progress fencing;
- a completed non-fencing state;
- repeat deletion after later study.

Preserve:

```text
user
session
account
verification
role
learner_preferences
```

Add migration/schema exports/registration as required.

Add the database-level guard required to prevent creation of a new `active_reviews` row while the study-data fence is active.

Do **not** implement the full deletion engine or UX yet.

### Focused tests

- marker creation;
- idempotent begin while active;
- active Review insert rejected while fenced;
- complete state no longer fences fresh study;
- learner identity can own marker;
- Admin identity can own marker;
- migration does not mutate existing study data.

### Stop when

The migration/schema/fence primitive exists and focused tests pass.

---

## Tranche 2 — Bounded study-data deletion engine

### Goal

Implement staged server-side cleanup while preserving authentication/preferences.

### Implement

Create/refactor the canonical study-data deletion service.

Reuse mature-account deletion ownership/batching design where practical.

Account for all current study-owned data, including at least:

- active Review and children;
- Scheduled events;
- Free completion receipts;
- Case FSRS state;
- Case encounters;
- optimizer evidence;
- learner aggregates;
- System aggregates;
- durable monthly buckets;
- FSRS profile;
- retired legacy Review/question/asset rows.

Respect FK ordering/cascades.

Implement:

```text
begin
advance one bounded chunk
status
phase progression
final user-scoped rescan
complete only after verified empty
```

Do not add UI yet.

### Focused tests

- each owned table cleared;
- authentication survives;
- preferences survive;
- shared content survives;
- other user's rows survive;
- retry/idempotency;
- >1 batch converges;
- final rescan catches leftovers;
- complete state permits fresh study.

### Stop when

The backend cleanup engine is complete and independently testable without UI.

---

## Tranche 3 — Fence every current study writer

### Goal

Make the deletion fence authoritative across every mutation capable of recreating study state.

### Inventory first

Find every current writer for:

- active Reviews;
- Scheduled FSRS state/completion;
- Free completion;
- FSRS profile/bootstrap;
- Reset Progress;
- Fresh FSRS Start;
- encounters;
- optimizer evidence;
- aggregates/monthly analytics;
- any current runtime writer added since this plan.

### Implement

While deletion is active, fail closed for:

- Scheduled Review creation;
- Free Review creation;
- Scheduled completion;
- Free completion;
- FSRS state recreation;
- Reset Progress;
- Fresh FSRS Start;
- profile/bootstrap recreation;
- encounter/aggregate/optimizer writes;
- stale browser/run/proof retries.

Prefer DB-enforced invariants/triggers for critical writes, with application mapping for friendly errors.

Normal behavior for unfenced users must remain unchanged.

### Focused tests

Race/regression coverage for:

- deletion vs Scheduled Review creation;
- deletion vs Free Review creation;
- deletion vs Scheduled completion;
- deletion vs Free completion;
- deletion vs Reset Progress;
- deletion vs Fresh FSRS Start;
- stale proof/run completion after deletion starts;
- lost-response completion retry;
- write begun before fence but attempting to commit after fence.

Add migrated-D1 acceptance where lightweight SQLite cannot faithfully prove behavior.

### Review checkpoint

**Stop for independent architecture review after Tranche 3.**

Do not proceed to UX until the deletion engine + complete writer fence are judged sound.

---

## Tranche 4 — Learner self-service UX

### Goal

Expose the safe backend operation to ordinary learners.

### Implement

Place full deletion near learner Progress/reset controls but in a separate destructive section.

Keep these distinct:

```text
Reset Progress
Fresh FSRS Start
Delete all my study data
```

Require exact typed confirmation:

```text
DELETE MY STUDY DATA
```

Validate confirmation server-side.

Derive the target exclusively from the authenticated session. Do not trust or require a submitted target `userId`.

If bounded work remains:

- show deletion-in-progress state;
- provide safe continuation/retry;
- keep account/session available;
- block study;
- never claim success early.

After verified completion, show a fresh/no-history Progress state.

### Focused tests

- confirmation required;
- crafted target cannot delete another user;
- account/session survives;
- progress/in-progress state correct;
- success only after verified completion;
- learner can study again;
- second deletion after later study works.

### Stop when

Learner UX is complete without adding Admin UX.

---

## Tranche 5 — Administrator self-service UX

### Goal

Allow an administrator to clear only their own study data.

### Implement

Add a clearly self-scoped Admin maintenance surface, preferably:

```text
/admin/my-study-data
```

with navigation label such as:

```text
My study data
```

Use the exact same backend deletion service/state machine as learner self-service.

The Admin:

- stays logged in;
- stays Admin;
- keeps identity/account links;
- keeps ordinary preferences;
- loses only their own study/runtime/history/analytics data.

Target must come from the authenticated Admin session.

Do **not** add:

- global clear all;
- selected-learner wipe;
- arbitrary learner ID input.

### Focused tests

- Admin can clear self;
- role survives;
- current session survives;
- another account cannot be targeted;
- existing learner analytics/permanent deletion UI remains unchanged;
- Preview Worker boundary remains correct.

### Stop when

Admin self-service works using the shared backend and no cross-user capability was introduced.

---

## Tranche 6 — Permanent account deletion interoperability

### Goal

Ensure account deletion and self-wipe cannot conflict.

### Implement

Define and implement authoritative behavior for:

1. self-wipe active, then permanent learner account deletion begins;
2. completed self-wipe, then permanent deletion begins;
3. permanent deletion already active, then self-wipe requested.

Preferred semantics:

- permanent learner account deletion supersedes/absorbs study cleanup;
- self-wipe refuses to become authoritative once account deletion has started;
- two competing state machines do not independently churn the same user forever.

Refactor shared ownership descriptors if needed to prevent table-list drift.

Do not weaken current account-deletion safety or make Admin identities permanently deletable.

### Focused tests

Cover all state transitions, retries, ownership reuse, and existing permanent deletion invariants.

### Stop when

Both deletion systems have one deterministic interoperability contract.

---

## Tranche 7 — Mature-account D1 acceptance and scale gate

### Goal

Prove the design works against production-shaped D1 semantics and mature histories.

### Implement/tests

Build a migrated-D1 acceptance/smoke case with:

- active Review children;
- Scheduled history;
- Free history;
- multiple Systems;
- monthly buckets;
- optimizer evidence;
- aggregates;
- FSRS state/profile;
- legacy sentinel rows where relevant;
- enough high-volume rows to exceed one deletion batch.

Prove:

- each request is bounded;
- retries resume safely;
- no table is skipped;
- fence prevents concurrent recreation;
- final user-scoped rescan reaches zero;
- auth/preferences survive;
- fresh study works after completion;
- account-deletion interoperability does not deadlock.

Reuse/update existing mature account-deletion benchmark infrastructure where sensible.

### Review checkpoint

**Stop for independent D1/scale review after Tranche 7.**

The feature should not be finalized until this evidence is satisfactory.

---

## Tranche 8 — Documentation, source contracts, and final integration

### Goal

Finish PR #154 as a coherent review-ready feature.

### Update authoritative docs

At minimum:

```text
docs/DOCUMENTATION_INDEX.md
docs/CURRENT_DESIGN.md
docs/V1_DATA_MODEL.md
docs/V1_SPEC.md
docs/LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md
docs/LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md
docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md
docs/SELF_SERVICE_STUDY_DATA_DELETION_PLAN.md
```

Mark this planning contract implemented/superseded appropriately once code is complete.

### Source-contract protection

Prevent future contributors from silently:

- dropping a study-owned table from deletion;
- adding an unfenced study writer;
- deleting authentication/preferences;
- accepting arbitrary target IDs;
- conflating Reset/Fresh with full deletion.

### Final validation

Run all affected:

- unit/regression suites;
- migration checks;
- migrated-D1 smoke/acceptance;
- account deletion tests;
- Scheduled/Free FSRS tests;
- build/check;
- repository-specialized CI commands.

Review the complete intended-base → exact-head diff.

Do not deploy Production.

Only after this tranche should PR #154 be considered ready for independent final review.

---

## 27. Recommended Luna operating pattern

Give Luna **one tranche at a time** rather than the entire feature.

For each Luna run, use a concise instruction of the form:

```text
MODE: IMPLEMENT

Work in existing PR #154 / branch feature/self-service-study-data-deletion.
Read docs/SELF_SERVICE_STUDY_DATA_DELETION_PLAN.md.
Implement Tranche N only.
Reconcile with current executable main/PR-head authority.
Add focused tests, run the required checks for this tranche, commit the work, and stop.
Do not implement later tranches. Do not deploy or mutate Production.
```

This keeps each run auditable and prevents scope creep.

Recommended independent review points:

```text
after Tranche 3 -> backend deletion + concurrency/fence architecture review
after Tranche 7 -> migrated-D1 + mature-account scale review
after Tranche 8 -> complete PR final review
```

Learner UX and Admin UX intentionally remain separate tranches so authorization/targeting mistakes are easier to detect.

---

## 28. Questions the final implementation handoff must answer

Before marking PR #154 Ready, the coding agent must state concrete answers to:

1. What exact table/module is the durable study-data deletion fence?
2. What exact state means the fence is active?
3. Which database writes are guarded, and how was that list derived?
4. What is the bounded phase order?
5. What is the per-step batch bound?
6. How are legacy Review child rows deleted safely?
7. How does the final rescan prove empty state?
8. How can a completed user study again?
9. How can the same user request deletion a second time later?
10. What survives deletion, specifically auth/session/role/preferences?
11. How is self-targeting enforced for learner and Admin surfaces?
12. What happens if permanent account deletion begins concurrently?
13. Which D1 acceptance proves race/fence behavior?
14. Which scale test proves mature history remains bounded?
15. Why does the implementation not weaken the Production exact-zero/cutover contract?

If any answer cannot be demonstrated from code/tests, the PR is not review-ready.

---

## 29. Final implementation handoff

The next coding agent should work **inside existing PR #154 / branch `feature/self-service-study-data-deletion`**.

Current executable code/migrations on the implementation base outrank stale planning text. If repository authority materially changes:

- preserve the locked product semantics;
- reconcile implementation details to current authority;
- document the drift and reason;
- do not weaken deletion completeness, authorization, concurrency, bounded-work, identity-preservation, or deployment safety.

Do not treat planning commits as implementation evidence.