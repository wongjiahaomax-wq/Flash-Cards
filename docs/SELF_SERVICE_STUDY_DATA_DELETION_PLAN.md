# Self-Service Study Data Deletion Plan

Status: **planning contract only**. This document intentionally does not implement the feature. The next coding agent should implement this plan in the same PR/branch.

This plan is intentionally detailed. It exists so the implementation agent can spend its effort validating and coding the design rather than rediscovering the product semantics, deletion boundary, concurrency requirements, or UX from scratch.

## 1. Goal

Add a safe self-service operation that lets a signed-in user remove **all study/review data owned by their own account while keeping the account itself**.

The feature is for both:

- normal learners; and
- administrators who have generated learner/runtime data by using the real study surface.

The required end state is:

```text
same authentication identity
same role
same login/account links
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
- restores the current default FSRS parameters as already implemented;
- retains historical Scheduled/Free activity and durable analytics according to the current contract.

Do not repurpose Fresh FSRS Start as full deletion.

### 2.3 New learner action — Delete all my study data

Learner-facing wording should make the destructive semantics explicit:

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
- be safe to invoke again after the user later accumulates new study data.

Require strong typed confirmation:

```text
DELETE MY STUDY DATA
```

The server must validate the exact semantic confirmation. Client-side confirmation alone is insufficient.

### 2.4 New administrator self-action — Clear my study data

Administrators should receive the same backend study-data semantics for **their own** account.

Suggested Admin wording:

> Clear my study data
>
> Permanently removes Reviews, FSRS progress, study history, and learning analytics associated with this administrator account. Your administrator account, role, login, and Flash-Cards content are not affected.

Use the same strong confirmation phrase unless UX review identifies a compelling reason to vary it.

The initial tranche is **self-service only**.

Do not add:

- a global "clear everyone" control;
- arbitrary Admin deletion of another learner's study data;
- a userId picker for this operation;
- a way to use the feature as a Production deployment/cutover bypass.

---

## 3. User-visible distinction between the three restart/delete operations

The UX must make the following distinction understandable before confirmation:

| Action | Scheduling state | FSRS parameters/generation | Historical activity | Analytics | Account |
| --- | --- | --- | --- | --- | --- |
| Reset Progress | reset | current Reset semantics | kept | kept | kept |
| Fresh FSRS Start | reset | fresh generation/defaults | kept | kept | kept |
| Delete all my study data | deleted | deleted | deleted | deleted | kept |

Do not use wording such as "reset everything" for more than one action.

A learner should be able to answer, from the UI alone:

- "I want Cases to become New but keep my history" -> Reset Progress;
- "I want a new default-parameter FSRS generation but keep my history" -> Fresh FSRS Start;
- "I want the application to forget my study activity while keeping my account" -> Delete all my study data.

---

## 4. Why this must not be implemented as `DELETE FROM reviews`

Current learner state is spread across the active-Review, FSRS, Free Study, retained-history, aggregate, and durable monthly analytics models. The old `reviews` tables are retired runtime tables but still physically exist as historical migration/cutover sentinels.

A correct wipe must therefore delete the whole user-owned study footprint rather than one table.

The coding agent must not infer "all Reviews" from a table name. The product meaning is **all learner-owned study state/history/analytics**, not merely rows whose table name contains `review`.

---

## 5. Current study-data ownership baseline

The coding agent must re-read current `main` before implementation and treat executable schema/runtime as authoritative. At the planning baseline, the operation must account for at least:

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

### 5.1 Active Review ownership

`active_reviews` is user-owned and currently has at most one active Review per user. Its children:

```text
active_review_questions
active_review_assets
```

are owned through `active_review_id` and currently use `ON DELETE CASCADE` from the active Review.

The deletion implementation should therefore delete the active Review parent using the current FK/cascade contract rather than independently deleting its children unless a current-schema change makes that necessary.

The final verification scan should still verify that no child rows linked to the user's former active Review remain.

### 5.2 Legacy Review ownership

The historical physical tables:

```text
reviews
review_questions
review_assets
```

are not the current supported learner runtime. They remain relevant because historical migrations are immutable and current deployment/cutover safety treats them as zero-data sentinels.

Legacy child relationships are restrictive rather than active-Review-style cascades. If rows exist for the current user, deletion must be child-before-parent:

```text
review_questions for reviews owned by user
review_assets for reviews owned by user
reviews owned by user
```

Do not assume these tables are globally empty merely because current application writers are retired.

### 5.3 Durable monthly analytics

`learner_system_monthly_buckets` is intentionally durable across detailed-history expiry. Deleting `scheduled_review_events` does not mean the monthly history is gone.

Full study-data deletion must explicitly remove the user's monthly buckets.

### 5.4 Preferences are not study history

At the planning baseline, `learner_preferences` contains persistent study-display/planning preferences such as:

- Expanded Learning choice; and
- Scheduled ordering choice.

These are preferences, not historical evidence. They should survive full study-data deletion.

If current `main` has added a preference field that is actually a derived study-progress value, the coding agent must document and test any field-level reset. Do not delete the preference row wholesale without a separately justified product reason.

### 5.5 Re-scan for drift

Before coding, search current schema, migrations, write paths, local reset tooling, account deletion, analytics, `/study`, and cutover sentinels for any user-owned study table added after this plan.

The implementation must not freeze the planning list as permanently authoritative.

---

## 6. Data that must survive

Do **not** delete merely because the user requested a study-data wipe:

```text
user
session
account
verification
learner_preferences
learner_account_deletions
content/domain tables
assets/R2 objects owned by content rather than learner history
```

Specifically preserve:

- Better Auth identity;
- current role (`user` or Admin role);
- banned/disabled state unless another account-management workflow changes it;
- password/provider account links;
- current session(s);
- user name/email;
- account-created date/cohort identity;
- unrelated preferences;
- content and taxonomy;
- source/provenance data;
- shared learner-independent Assets.

The deletion must not demote an administrator or convert an Admin identity into a learner identity.

---

## 7. Recommended durable state machine

### 7.1 Add a dedicated study-data deletion marker

Preferred design: add a new table similar in operational shape to the mature account-deletion marker but with account-preserving semantics.

Recommended conceptual table:

```text
learner_study_data_deletions
```

Recommended fields:

```text
user_id              PRIMARY KEY / FK user(id) ON DELETE CASCADE
phase                NOT NULL
requested_at         NOT NULL
updated_at           NOT NULL
batches_completed    NOT NULL DEFAULT 0
completed_at         NULL
```

Use the next available migration number after reconciling current `main`; do not hard-code a migration number from this planning document.

### 7.2 Recommended phases

Use bounded phases with names that correspond to deletion ownership rather than UI concepts. A recommended starting sequence is:

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

The implementation agent may adjust ordering if current FK/trigger/runtime authority requires it, but every adjustment must preserve the same end-state and be covered by tests.

### 7.3 Why active Reviews should be early

Once the fence is durable, remove the user's active Review early so:

- unfinished state does not remain visible longer than necessary;
- active Review Asset lifecycle ownership is released promptly;
- stale browser attempts have no current Review to resume;
- the user does not see a resumable attempt while deletion is in progress.

The durable fence, not the delete ordering alone, is the race-safety mechanism.

### 7.4 Bounded batch size

Reuse the mature-account-deletion principle: each advancement request deletes at most a bounded number of rows from one phase.

Prefer a shared constant/primitive where practical rather than inventing a materially different scale contract.

Do not perform an unbounded mature-history delete simply because the common case is small.

### 7.5 Completed marker semantics

Preferred behavior is to retain the marker row in a non-fencing `complete` state with `completed_at`, rather than deleting it immediately.

Benefits:

- reliable completion status after redirect/reload;
- an auditable operational fact without retaining deleted study history;
- easy idempotent retries;
- clearer testability.

The marker is operational state, not learner study history.

Database writer guards must treat only **non-complete** rows as an active fence.

### 7.6 Repeating deletion later

The feature must support:

```text
user deletes study data
-> deletion reaches complete
-> user studies again later
-> user requests deletion again
```

A new request should atomically reactivate/reset the existing marker, for example by updating:

```text
phase = active_reviews
requested_at = now
updated_at = now
batches_completed = 0
completed_at = NULL
```

Do not make the operation permanently one-shot merely because the marker uses `user_id` as its primary key.

---

## 8. Canonical ownership descriptors and reuse

Do not build an unrelated second hard-coded deletion universe.

The repository already chose a retry-safe staged deletion architecture for mature learner-account deletion because learner history can be large.

Prefer refactoring toward a canonical study-data ownership definition shared by:

- self-service study-data deletion; and
- the study-data portion of permanent learner-account deletion.

A reasonable implementation shape would be a shared server module that defines descriptors such as:

```text
phase
physical table
user ownership expression
bounded delete builder
next phase
```

The permanent account deletion flow can then compose:

```text
auth/session deletion phases
+
canonical study-data deletion phases
+
preference deletion
+
profile/identity completion
```

while self-service deletion composes only:

```text
canonical study-data deletion phases
```

with preferences/auth/identity preserved.

Do not force an over-general abstraction if it makes the code harder to audit. The priority is **one authoritative ownership boundary**, not abstraction for its own sake.

### 8.1 Legacy rows and permanent account deletion

Current permanent account deletion should be re-checked for legacy `reviews` ownership. If the shared study-data ownership definition reveals that account deletion currently omits user-owned legacy Review rows, fix that compatibility gap only if required to keep the shared ownership contract correct, and add focused regression coverage.

Do not broaden the PR into unrelated account-management redesign.

---

## 9. Concurrency and write fencing

A staged deletion that leaves study writers active can race with new Reviews/completions and can finish with rows recreated behind it. The implementation must be fail-closed against this.

Required invariant:

> Once self-service study-data deletion begins, no new learner study mutation for that user may commit until the deletion reaches a verified empty study-data state and the deletion fence is released by entering `complete`.

### 9.1 Fence must be durable before cleanup proceeds

Starting deletion must first create/reactivate the durable study-data deletion marker.

Do not rely on a browser flag, cookie, in-memory state, or a form-submission lifecycle as the fence.

### 9.2 Database boundary is authoritative

Application-level checks are useful for clean UX, but they are not sufficient for the concurrency contract.

Use D1/SQLite guards so a concurrent mutation cannot commit merely because it entered application code before another request noticed the marker.

At minimum, reconcile all current state-producing tables/write paths and guard the relevant `INSERT`/`UPDATE` mutations while an active study-data deletion marker exists.

Planning-baseline tables that require explicit consideration include:

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
reviews   # defensive legacy protection if physical writer access remains possible
```

Do not guard the `DELETE` operations needed by the deletion state machine itself.

### 9.3 Why guarding only `active_reviews` is insufficient

The existing account-deletion migration has an active-Review creation guard, but an account-preserving wipe requires a stronger boundary because:

- a completion transaction may already have an active Review and attempt to write state/history;
- Reset Progress updates the FSRS profile boundary;
- Fresh FSRS Start inserts/updates the FSRS profile;
- Free completion writes encounter/receipt state;
- derived aggregate writes must not recreate data during staged deletion.

The implementation must prove the complete mutation surface, not assume active Review creation is the only writer.

### 9.4 Required blocked operations while deletion is active

The following must fail closed or return a deliberate "study data deletion in progress" product response:

- open/create active Scheduled Review;
- open/create active Free Review;
- Scheduled completion;
- Free completion;
- Reset Progress;
- Fresh FSRS Start;
- scheduler/profile bootstrap that would recreate an FSRS profile;
- direct current-runtime aggregate/encounter updates;
- stale browser completion retries;
- stale run/proof-based writes;
- any other current study writer found during implementation review.

### 9.5 Reads during deletion

While deletion is active, do not present normal study/progress state as though it were stable.

Prefer a dedicated maintenance state:

> Study data deletion is in progress. Study is temporarily unavailable until deletion completes.

Read-only account/navigation surfaces may remain available.

### 9.6 Final rescan

Before entering `complete`, perform a full user-scoped rescan of all study-owned tables.

The rescan must verify zero user-owned rows for the complete ownership set, including legacy Review children linked through user-owned legacy parents.

If any rows remain:

- do not mark complete;
- return/reposition to the earliest relevant deletion phase;
- continue bounded cleanup safely.

This protects against a pre-fence/in-flight mutation or phase drift.

### 9.7 Release of the fence

The writer fence is released only by transitioning the durable marker to `complete` after the final rescan succeeds.

Do not release the fence merely because the nominal last phase was attempted.

---

## 10. Recommended server API/service contract

Prefer one backend service used by both learner and Admin surfaces.

Suggested conceptual functions:

```text
beginStudyDataDeletion({ db, userId })
advanceStudyDataDeletion({ db, userId, batchSize? })
getStudyDataDeletionStatus(db, userId)
isStudyDataDeletionActive(db, userId)
```

Possible result contract:

```text
userId
phase
inProgress
complete
rowsDeletedThisStep
batchesCompleted
completedAt
```

The exact names may vary, but do not duplicate separate learner/Admin deletion engines.

### 10.1 Error taxonomy

Use explicit, testable errors rather than generic 500s for expected states. At minimum distinguish:

```text
invalid confirmation
not authenticated
unsupported identity/role if any
account deletion already in progress / superseded
study deletion in progress
study deletion state corruption / unsupported phase
```

Unexpected database failures should remain retry-safe and must not silently clear the fence.

### 10.2 Maximum advancement per request

As with current Admin account deletion, it is acceptable to advance several bounded phases/batches within one HTTP request up to a fixed cap.

The cap must not convert the operation into an effectively unbounded request.

If work remains, return `inProgress` and render a safe continuation state.

---

## 11. Authorization contract

Server authority is mandatory.

### 11.1 Learner self-service

- derive the target user from the authenticated session;
- do not trust a submitted `userId`;
- do not include a hidden target user field merely for convenience;
- a crafted request must never delete another learner's data.

### 11.2 Administrator self-service

- derive the target from the authenticated Admin session;
- require the ordinary Production Admin authorization boundary for the Admin portal surface;
- do not accept an arbitrary learner target ID;
- do not reuse the existing selected learner on `/admin/learner-analytics` as the deletion target.

### 11.3 Role handling

The backend study-data deletion primitive should support at least the identities that can legitimately accumulate real learner study state:

```text
normal learner
administrator using the real study runtime
```

Do not copy the existing permanent learner-account-deletion restriction that rejects Admin identities; that restriction is appropriate for account deletion, not for clearing an Admin's own study state.

### 11.4 Preview Worker

Preserve the current Preview/Production boundary. Production study-data deletion should not become an accidental Preview Worker mutation path.

If Admin self-service is exposed under `/admin`, apply the current Production Admin/Preview Worker restrictions consistently.

---

## 12. Learner UX plan

### 12.1 Placement

The current learner Progress component already owns the distinction between:

- Reset Progress; and
- Fresh FSRS Start.

Add a separate **Manage study data** destructive section near, but visually distinct from, those reset controls.

Recommended hierarchy:

```text
Learner Progress

Reset options
  Reset Progress
  Fresh FSRS Start

Manage study data
  Delete all my study data
```

Do not place full deletion as a third visually equivalent reset button.

### 12.2 Initial destructive panel

Recommended copy:

> Delete all my study data
>
> Permanently removes your completed Reviews, ratings, FSRS scheduling state, Free Study history, and associated learning analytics. Your account and preferences remain active. This cannot be undone.

Use a destructive button that opens/reveals the typed-confirmation form.

### 12.3 Confirmation

Require the learner to type:

```text
DELETE MY STUDY DATA
```

Server validation is mandatory.

The confirmation UI should restate what survives:

```text
Your account, login and preferences will remain.
```

and what is deleted:

```text
Study progress, history and learning analytics will be permanently removed.
```

### 12.4 In-progress state

If the deletion does not complete within the bounded per-request work cap:

- replace normal study controls with an in-progress state;
- do not claim success;
- provide **Continue deletion**;
- make continuation idempotent;
- preserve navigation/account access;
- prevent starting study while the fence is active.

Suggested copy:

> Study data deletion is in progress. Study is temporarily unavailable until cleanup finishes.

### 12.5 Completion state

After final verification:

> Study data deleted. Your account remains active. Your next study session will start from fresh study state.

The subsequent Progress view should naturally show the fresh/no-history state rather than special-casing deleted counts forever.

### 12.6 No raw implementation details

Do not expose:

- table names;
- phase names such as `optimizer_evidence`;
- D1 batch counts;
- trigger errors;

to ordinary learners.

A simple in-progress/success/error product state is sufficient.

---

## 13. Administrator UX plan

### 13.1 Do not attach self-wipe to the selected learner card

The current `/admin/learner-analytics` page allows selecting a normal learner and contains **Permanent learner account deletion** for that selected learner.

Do not add the Admin's self-wipe inside that selected-learner destructive form. That creates dangerous target ambiguity.

### 13.2 Preferred placement

Create or use a clearly self-scoped Admin maintenance/account surface, labelled for example:

```text
Admin
  My study data
```

or:

```text
Admin Maintenance
  My study data
```

The page must make it visually obvious that the operation affects **the signed-in administrator only**.

If the smallest coherent implementation is a dedicated route, prefer something explicit such as:

```text
/admin/my-study-data
```

and add it to Admin navigation.

The coding agent should inspect current Admin routing/navigation before locking the exact path.

### 13.3 Admin copy

Recommended:

> Clear my study data
>
> Use this if this administrator account has been used on the real study surface for testing. This permanently removes study progress, Reviews, history and learning analytics belonging to this administrator account. It does not remove your administrator account or change your role.

Require the same typed confirmation.

### 13.4 Admin in-progress/completion

Use the same backend status model as learner deletion.

Do not show a normal "study data cleared" success message until the final user-scoped rescan is zero.

---

## 14. Interaction with permanent account deletion

Permanent account deletion remains a separate feature.

Expected relationship:

```text
Delete all my study data
study data -> deleted
auth identity -> retained
role/login -> retained
preferences -> retained

Permanent account deletion
study data -> deleted
auth identity -> deleted
access -> revoked as already designed
preferences -> deleted with account lifecycle
```

### 14.1 If permanent account deletion starts during study-data deletion

For a normal learner, permanent account deletion should supersede/absorb the study-data wipe rather than creating two competing writers.

Recommended behavior:

- `beginLearnerAccountDeletion` remains authoritative for account removal;
- the study-data deletion service detects `learner_account_deletions` and stops trying to present itself as the controlling workflow;
- permanent deletion may reuse the same canonical study-data phases/ownership descriptors;
- the study-data marker ultimately disappears with `user` via FK cascade when identity deletion completes, or is otherwise left harmless while account deletion owns the process.

### 14.2 Starting study-data deletion after account deletion begins

Reject it with a deliberate state such as:

> Account deletion is already in progress.

Do not reactivate study access or change the account-deletion fence.

### 14.3 Administrator identity

Current permanent learner-account deletion intentionally rejects Admin identities. Self-service Admin study-data deletion must not change that account-management policy.

---

## 15. Interaction with stale browser state and runtime v2 proofs

Deletion must invalidate practical reuse of browser-held study work without introducing a second proof system.

While the deletion fence is active:

- all server-authoritative study writers reject mutations for that user;
- active Review rows are deleted;
- profile/state boundaries are eventually deleted;
- stale descriptors/proofs cannot recreate study state because writer guards reject them.

After deletion completes:

- old active Review IDs no longer resolve;
- old Scheduled boundary/proof material no longer matches a current profile/state;
- ordinary new study initialization establishes fresh authority.

Add explicit tests for lost-response/retry material created before deletion begins.

---

## 16. Interaction with analytics/cohorts

### 16.1 Per-user analytics

After deletion completes, the user's study contribution must be absent from:

- learner-wide aggregates;
- per-System aggregates;
- durable monthly System buckets;
- retained detailed Scheduled history;
- compact case encounters;
- optimizer evidence.

### 16.2 Cross-learner trend recomputation semantics

Current cross-learner trend queries read durable learner rows. Once the selected user's monthly/aggregate rows are deleted, subsequent queries should naturally no longer count that study activity.

Do not introduce a separate negative/tombstone analytics adjustment unless current query architecture proves it necessary.

### 16.3 Cohort identity

The user's Better Auth account creation date survives. Therefore the user's **identity cohort membership** survives, but with zero post-deletion study contribution until they study again.

Do not rewrite account-created time as part of study-data deletion.

---

## 17. Failure and retry behavior

### 17.1 Expected failure contract

If a bounded delete request fails after the fence has started:

- the fence remains active;
- account/login remains active;
- study mutations remain blocked;
- the user can retry/continue;
- no success state is shown.

Suggested learner-facing message:

> Study data deletion did not finish. Your account is unchanged and study remains temporarily paused. Try continuing the deletion.

### 17.2 Do not auto-clear fence on error

Never clear the marker/fence merely because an HTTP request failed, timed out, or the browser closed.

Durability is the point of the state machine.

### 17.3 Browser closes mid-deletion

On the user's next authenticated visit:

- read deletion status;
- show deletion in progress;
- allow safe continuation;
- do not permit study mutations until completion.

### 17.4 Idempotency

Calling `begin` repeatedly while already active must not reset progress backward in a way that can loop forever.

Calling `advance` repeatedly after a phase is empty should move forward safely.

Calling `advance` after `complete` should return a stable complete result rather than erroring or recreating deletion.

Starting a **new deletion request after new study activity** is the only operation that should reactivate a completed marker.

---

## 18. Final empty-state verification contract

The `verify_empty` phase must be explicit and testable.

At the planning baseline, verify no user-owned rows remain in:

```text
active_reviews
active_review_questions linked through owned active Reviews, if any
active_review_assets linked through owned active Reviews, if any
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
review_questions linked through owned legacy Reviews
review_assets linked through owned legacy Reviews
```

If current schema adds another owned table, add it to the verifier.

The verifier should share the same canonical ownership source used by deletion where practical.

A completed result without this verification is not acceptable.

---

## 19. Deployment/cutover relationship

This feature is useful for removing accidental test/Admin study contamination, but it must **not** become a deployment bypass.

Do not add a global Production "clear all learner data" button.

The multi-System v2 exact-zero cutover/deployment gate remains authoritative whenever that gate is required.

This feature may help an individual user intentionally remove their own data; it does not:

- clear other users;
- override the gate;
- reinterpret non-zero counts as acceptable;
- authorize Production mutation outside normal application behavior;
- remove the need to inspect the deployment workflow.

### 19.1 New deletion marker and cutover sentinel logic

A completed `learner_study_data_deletions` operational marker should not itself be treated as learner study history.

Do not add the marker to a zero-study-data cutover gate merely because the table exists, unless the current cutover contract has a separately reviewed reason to require zero operational markers.

An **active** deletion marker also must not be used to pretend underlying study tables are zero; the actual gate counts remain authoritative.

---

## 20. Migration and schema requirements

The coding agent should expect a migration if using the recommended durable marker/guards.

Migration responsibilities likely include:

1. create `learner_study_data_deletions`;
2. add phase/batch/completion constraints;
3. add FK to `user` with `ON DELETE CASCADE`;
4. add study-writer guard triggers for active deletion;
5. update schema exports/Drizzle configuration as required;
6. preserve existing account-deletion triggers/guards;
7. prove migration works on a current production-shaped D1 schema;
8. ensure no migration rewrites/deletes existing learner data merely by being applied.

### 20.1 Trigger error string

Use one stable machine-recognizable error for study-data deletion fencing, for example:

```text
learner_study_data_deletion_in_progress
```

Map it at the application layer to a friendly product response.

Do not expose the raw SQLite error to users.

### 20.2 Trigger coverage source contract

Add source-contract tests that enumerate the state-producing tables/pathways expected to be fenced so a future new writer cannot be added silently without updating the deletion boundary.

---

## 21. Recommended implementation modules

Exact filenames may change after current-main inspection, but a coherent implementation could look like:

```text
src/lib/server/db/learner-study-data-deletion.ts
src/lib/server/db/learner-data-ownership.ts       # optional shared descriptors
src/lib/server/db/...schema...                    # marker schema if project conventions require
```

Learner route integration:

```text
src/routes/study/+page.server.js
src/lib/components/LearnerFsrsProgress.svelte
```

Admin route integration, preferably self-scoped:

```text
src/routes/admin/my-study-data/+page.server.js
src/routes/admin/my-study-data/+page.svelte
src/routes/admin/+layout.svelte
```

These paths are recommendations, not authority. Follow current repository conventions.

---

## 22. Required tests

At minimum add regression/acceptance coverage for all of the following.

### 22.1 Authorization and targeting

1. learner can delete only their own study data;
2. administrator can delete their own study data;
3. crafted `userId`/request cannot target another account;
4. learner action derives target from session;
5. Admin self-action derives target from session;
6. Preview Worker cannot become an unintended Production deletion surface;
7. unauthenticated requests cannot start/advance deletion.

### 22.2 Preserved identity/preferences/content

8. Better Auth `user` survives;
9. Better Auth `account`/login links survive;
10. intended session survives;
11. user role survives exactly;
12. user banned/disabled state is not changed by study deletion;
13. account-created time survives;
14. `learner_preferences` survives with values unchanged;
15. shared Cases/Questions/Topics/Tags/Assets/content are untouched;
16. R2/content Asset lifecycle is not incorrectly deleted merely because active Review ownership is removed.

### 22.3 Deleted study state

17. active Review is removed;
18. active Review question/asset children are removed through the intended FK contract;
19. Scheduled events are removed;
20. Free completion receipts are removed;
21. case FSRS state is removed;
22. case encounters are removed;
23. optimizer evidence is removed;
24. learner aggregates are removed;
25. System aggregates are removed;
26. durable monthly System buckets are removed;
27. FSRS profile is removed;
28. any legacy Review parent/child rows owned by that user are removed safely;
29. another user's rows in every same table remain untouched.

### 22.4 State-machine behavior

30. deletion is idempotent and safe to retry;
31. a mature account larger than one deletion batch completes through bounded staged work;
32. phase advancement never skips a non-empty phase;
33. browser/request interruption leaves the fence active and progress resumable;
34. `complete` is stable on repeated status/advance calls;
35. user can study after completion and accumulate fresh data;
36. user can request a second full deletion after later studying again;
37. second deletion resets/reactivates the completed operational marker correctly.

### 22.5 Concurrency/write-fence behavior

38. active Scheduled Review creation cannot race the deletion fence;
39. active Free Review creation cannot race the deletion fence;
40. Scheduled completion cannot race the deletion fence;
41. Free completion cannot race the deletion fence;
42. FSRS case-state insert/update cannot recreate state during deletion;
43. encounter insert/update cannot recreate state during deletion;
44. optimizer evidence cannot recreate state during deletion;
45. aggregate writes cannot recreate state during deletion;
46. profile/bootstrap creation cannot recreate state during deletion;
47. Reset Progress cannot mutate/recreate state during deletion;
48. Fresh FSRS Start cannot mutate/recreate state during deletion;
49. stale browser run/proof retries fail after deletion begins;
50. lost-response completion retry from pre-deletion state cannot recreate rows;
51. final rescan catches/repositions for any residual user-owned row before completion.

### 22.6 Analytics behavior

52. learner analytics show zero/no history after deletion;
53. per-System lifetime contribution disappears;
54. monthly System contribution disappears;
55. cross-learner System trend no longer counts the deleted user's historical rows;
56. stable cohort identity remains based on account creation while study contribution becomes zero;
57. new post-deletion study activity appears normally as fresh analytics.

### 22.7 Permanent account deletion compatibility

58. study-data deletion refuses to start if permanent account deletion is already authoritative;
59. permanent account deletion can safely supersede an in-progress study-data deletion for a normal learner;
60. permanent account deletion remains bounded/retry-safe;
61. Admin self-study deletion does not accidentally enable permanent Admin identity deletion;
62. shared ownership refactor does not weaken existing learner-account-deletion guards.

### 22.8 UX confirmation

63. learner deletion cannot start without the exact destructive confirmation;
64. Admin deletion cannot start without the exact destructive confirmation;
65. Reset/Fresh controls remain distinct and unchanged;
66. in-progress UX does not claim success;
67. completion UX appears only after final verified empty state;
68. ordinary users never see raw database phase/table names or trigger errors.

---

## 23. D1 acceptance and benchmark requirements

Use lightweight unit/source tests where adequate, but add migrated-D1 acceptance for behavior that depends on real SQLite/D1 semantics.

At minimum D1 acceptance should prove:

- migration applies cleanly to current schema;
- guard triggers abort relevant writes while fence is active;
- deletion's own `DELETE` operations remain permitted;
- active Review cascade behaves as expected;
- legacy child-before-parent cleanup works;
- final verifier is correct;
- fence transition to complete permits fresh study writes afterward;
- account-deletion interaction does not deadlock either state machine.

### 23.1 Scale gate

Reuse the mature-account deletion envelope philosophy.

Seed a realistically mature supported account exceeding one batch in high-volume tables and prove:

- each advance call stays bounded;
- total deletion converges;
- no unbounded `DELETE WHERE user_id = ?` is introduced for potentially mature high-volume history unless current benchmark evidence explicitly proves it safe;
- common small accounts can still complete in a small number of requests.

If the shared deletion primitive changes existing account-deletion performance, rerun/update the existing benchmark evidence rather than assuming no regression.

---

## 24. Observability and operational behavior

Do not log deleted clinical/study content unnecessarily.

Safe server logs may include:

```text
operation type
user id or appropriately existing internal identifier
phase
rows deleted this bounded step
whether completion verification succeeded
unexpected error class
```

Avoid logging:

- answers;
- case snapshots;
- ratings/history payloads;
- auth tokens;
- confirmation phrase submissions;
- secrets.

The UI should not require an operator to inspect logs for ordinary continuation/retry.

---

## 25. Security/privacy properties

The implementation should be reviewed against these explicit properties:

1. **Self-targeting only** — target comes from authenticated identity.
2. **No confused deputy** — Admin selected-learner UI cannot redirect this operation at another user.
3. **Strong confirmation** — destructive request requires explicit typed confirmation.
4. **Server-side enforcement** — no client-only security assumptions.
5. **Fail-closed mutation fence** — deletion cannot race with new study state.
6. **Identity preservation** — no auth/account deletion in self-wipe flow.
7. **Data minimization after completion** — all defined study history/analytics are actually gone.
8. **No content collateral damage** — shared learning content remains intact.
9. **Retry safety** — errors do not create a half-open state where study resumes before cleanup verifies empty.

---

## 26. Documentation to update when implementing

Reconcile the feature with the current authority chain, especially:

```text
docs/DOCUMENTATION_INDEX.md
docs/CURRENT_DESIGN.md
docs/V1_DATA_MODEL.md
docs/V1_SPEC.md
docs/LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md
docs/LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md
docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md
```

Also update:

- learner Progress/reset UX documentation;
- Admin navigation/maintenance documentation;
- mature account deletion documentation if ownership descriptors are shared/refactored;
- migration index/current migration authority;
- source-contract tests that enumerate learner-owned tables/writers;
- any local replica/reset tooling whose ownership list is intended to mirror production learner/runtime ownership.

Do not represent this planning document as implementation evidence.

---

## 27. Explicit non-goals for this PR

Unless required for correctness, do not expand this PR into:

- global deletion of all users' Reviews;
- arbitrary Admin deletion of another learner's study data;
- content deletion;
- account/identity deletion redesign;
- public account self-deletion;
- optimizer execution or automatic parameter replacement;
- changes to the meaning of Reset Progress;
- changes to the meaning of Fresh FSRS Start;
- new retention-policy product semantics;
- anonymized historical analytics retention after a user asks for full study-data deletion;
- weakening deployment/cutover zero-data gates;
- automatic Production cleanup during deployment;
- Production D1 mutation performed manually as part of implementation.

---

## 28. Acceptance criteria

The feature is ready for review only when all of the following are true:

### Product

- learner has a clearly separate full-study-data deletion action;
- Admin has a clearly self-scoped equivalent;
- both require strong typed confirmation;
- account/role/login/preferences survive;
- user-facing wording accurately distinguishes Reset, Fresh, and Delete.

### Data

- all current user-owned study/runtime/history/analytics rows are removed;
- legacy Review rows for that user are removed if present;
- another user's study rows are unaffected;
- shared content is unaffected;
- final zero-user-study-data verification is authoritative.

### Concurrency

- a durable fence becomes authoritative before cleanup proceeds;
- all current study writers are fail-closed while the fence is active;
- retries/interruption are safe;
- completion releases the fence only after verified empty state;
- stale browser work cannot recreate deleted data.

### Scale

- mature history is deleted in bounded chunks;
- benchmark/acceptance demonstrates convergence within supported envelopes;
- no unreviewed unbounded D1 delete path is introduced.

### Compatibility

- existing Reset Progress behavior remains correct;
- existing Fresh FSRS Start behavior remains correct;
- permanent learner account deletion remains correct;
- Admin identity deletion policy remains unchanged;
- Runtime v2 scope/proof behavior remains correct;
- deployment/cutover gates are not weakened.

### Quality

- migration/schema/source contracts are updated;
- required unit/regression/D1 tests pass;
- authoritative documentation is updated;
- PR remains free of Production data mutation/deployment side effects.

---

## 29. Suggested implementation sequence for the next coding agent

Work **inside this existing PR/branch**.

Recommended order:

1. re-read latest `main` authority and exact executable schema/runtime;
2. inventory every current user-owned study table and every writer;
3. compare that inventory with permanent account deletion, local reset tooling, and cutover sentinels;
4. design/refactor canonical study-data ownership descriptors;
5. add the durable study-data deletion marker migration;
6. add database write-fence triggers;
7. implement `begin` / `advance` / `status` / `verify` server primitives;
8. add focused unit/source tests for ownership, phase order, authorization, and confirmation;
9. add migrated-D1 trigger/concurrency/legacy cleanup acceptance;
10. integrate `/study` learner UX and in-progress blocking state;
11. add the self-scoped Admin maintenance UX;
12. test repeat deletion after fresh post-delete study;
13. test permanent account deletion interaction;
14. run/update mature deletion benchmarks if shared primitives changed;
15. update authoritative documentation and source contracts;
16. run all affected repository validation/CI suites;
17. independently review the exact base-to-head diff for data-loss scope, races, and authorization;
18. leave Production mutation/deployment outside the PR.

---

## 30. Questions the implementation must answer explicitly in its evidence/handoff

Before marking the PR Ready, the coding agent should state concrete answers to:

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
13. Which D1 acceptance proves the race/fence behavior?
14. Which scale test proves mature history remains bounded?
15. Why does the implementation not weaken the Production exact-zero/cutover contract?

If any of these cannot be answered from code/tests, the implementation is not yet review-ready.

---

## 31. Implementation handoff

The next coding agent should work **inside this existing PR/branch**, starting from this plan.

Current executable code/migrations on the implementation base outrank stale planning text. If repository authority has materially changed since this document was written:

- preserve the locked product semantics;
- reconcile the implementation details to current authority;
- document the drift and why the implementation differs;
- do not silently weaken the deletion, authorization, concurrency, or bounded-work contracts.

Do not treat this planning commit itself as implementation evidence.
