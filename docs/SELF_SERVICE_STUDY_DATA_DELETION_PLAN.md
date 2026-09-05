# Self-Service Study Data Deletion Plan

Status: **planning contract only**. This document intentionally does not implement the feature. The next coding agent should implement this plan in the same PR/branch.

## Goal

Add a safe self-service operation that lets a signed-in user remove **all study/review data owned by their own account while keeping the account itself**.

The feature is for both:

- normal learners; and
- administrators who have generated learner/runtime data by using the real study surface.

This is deliberately different from both existing **Reset Progress** and **Permanent learner account deletion**.

## Product semantics

### Existing Reset Progress

Reset Progress remains the non-destructive restart option:

- clears current scheduling state;
- makes Cases New again for scheduling;
- invalidates the current active Review/boundary as already implemented;
- retains historical study activity and durable analytics/history.

### New learner action — Delete all my study data

Learner-facing wording should make the destructive semantics explicit:

> Permanently delete your Reviews, ratings, FSRS progress, study history, and associated learning analytics. Your account remains active.

Required effects:

- keep the Better Auth user identity;
- keep password/login/account links;
- keep role and account status;
- keep the current login session unless the implementation finds a concrete security reason not to;
- keep shared Flash-Cards content;
- keep unrelated user preferences;
- delete all learner-owned study/runtime/history/analytics rows;
- leave the account in the same study-state class as an account that has never studied;
- allow a later `/study` visit to initialize fresh learner scheduling state normally.

Require strong confirmation, for example typing:

```text
DELETE MY STUDY DATA
```

The confirmation must clearly state that the operation cannot be undone.

### New administrator self-action — Clear my study data

Administrators should receive the same backend semantics for **their own** account.

Suggested Admin wording:

> Clear my study data
>
> Permanently removes Reviews, FSRS progress, study history, and learning analytics associated with this administrator account. Your administrator account, role, login, and Flash-Cards content are not affected.

Require a destructive confirmation phrase equivalent to the learner flow.

The initial tranche is **self-service only**. Do not add a general "clear everyone" control and do not add arbitrary per-learner study-data deletion from the Admin portal unless separately reviewed.

## Why this must not be implemented as `DELETE FROM reviews`

Current learner state is spread across the active-Review, FSRS, Free Study, retained-history, aggregate, and durable monthly analytics models. The old `reviews` tables are retired runtime tables but still physically exist as historical migration/cutover sentinels.

A correct wipe must therefore delete the whole user-owned study footprint rather than one table.

## Current study-data ownership to clear

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

Notes:

- `active_review_questions` and `active_review_assets` are children of `active_reviews` and should follow the current FK/cascade contract.
- Legacy `review_questions` / `review_assets` must respect their current child-before-parent FK ordering.
- Durable monthly buckets must be deleted explicitly; detailed Scheduled-history deletion does not reconstruct or decrement them.
- Re-check migrations/schema for any learner-owned runtime/history table added after this plan was written.

## Data that should normally survive

Do **not** delete merely because the user requested a study-data wipe:

```text
user
session
account
verification
learner_preferences
content/domain tables
assets/R2 objects owned by content rather than learner history
learner_account_deletions
```

`learner_preferences` should survive unless the coding agent finds a field whose semantics are strictly part of deleted study state. If so, update only that field with tests and document the reason; do not delete unrelated preferences wholesale.

## Reuse existing deletion architecture

Do not build an unrelated, unbounded one-shot cleanup path.

The repository already chose a **retry-safe staged deletion** architecture for mature learner-account deletion because learner history can be large. Reuse/refactor that ownership knowledge and bounded-deletion approach where practical.

However, do **not** directly reuse the current learner-account-deletion operation as-is because it intentionally:

- revokes access;
- deletes Better Auth rows;
- ultimately deletes the identity; and
- rejects non-learner/admin identities.

The study-data operation must retain authentication and must support an administrator deleting only their own study data.

Prefer one canonical shared definition of learner-owned study tables/phases rather than maintaining two drifting hard-coded lists.

## Concurrency and write fencing

A staged deletion that leaves study writers active can race with new Reviews/completions and can finish with rows recreated behind it. The implementation must be fail-closed against this.

Required invariant:

> Once self-service study-data deletion begins, no new learner study mutation for that user may commit until the deletion reaches a verified empty study-data state and the deletion fence is released.

Implement a durable per-user deletion/fence state (or an equally strong reviewed mechanism) so that:

- active Review creation is rejected while deletion is in progress;
- Scheduled completion is rejected while deletion is in progress;
- Free completion is rejected while deletion is in progress;
- Reset Progress / Fresh FSRS Start cannot recreate state during deletion;
- stale browser run/proof material cannot recreate deleted state;
- retries are idempotent;
- a final full user-owned study-row rescan occurs before declaring completion;
- the fence is removed only after that rescan proves the owned study footprint is empty.

If the current account-deletion guard/fence can be generalized safely, prefer factoring shared primitives rather than adding parallel inconsistent guards.

## Account deletion interaction

Permanent account deletion remains a separate feature.

Expected relationship:

```text
Delete all my study data
study data -> deleted
auth identity -> retained
role/login -> retained

Permanent account deletion
study data -> deleted
auth identity -> deleted
access -> revoked as already designed
```

The coding agent must define and test what happens if permanent account deletion is started while a study-data deletion is in progress. A safe default is for permanent account deletion to supersede/absorb the study-data cleanup rather than allowing two conflicting deletion state machines.

## Authorization

Server authority is mandatory.

Learner self-service:

- derive the target user from the authenticated session;
- do not trust a submitted `userId`;
- a crafted request must never delete another learner's data.

Administrator self-service:

- also derive the target from the authenticated admin session;
- this initial feature must not accept an arbitrary target learner ID.

Do not use client-side role checks as the security boundary.

## UX placement

### Learner

Place beside the existing learner Progress/reset controls, under a clearly separated destructive-data section such as:

```text
Progress
  Reset Progress
  Manage study data
    Delete all my study data
```

Keep Reset Progress visually and semantically distinct from deletion.

### Admin

Expose a clearly labelled **My study data** / Maintenance section in the Admin portal. Do not hide the feature inside Permanent learner account deletion and do not make an admin delete/recreate their account to clear test study state.

The current `/admin/learner-analytics` page is primarily about normal learner analytics and permanent learner-account deletion. The coding agent should inspect current navigation and choose the smallest coherent Admin placement for an administrator's own study-data maintenance.

## Completion UX

When deletion is complete, show a concrete success state such as:

> Study data deleted. Your account remains active and your next Scheduled Study will start fresh.

If deletion is staged across multiple bounded requests, the UI must represent "deletion in progress" rather than claiming success early. Retrying/continuing the operation must be safe.

Do not expose raw table names to ordinary learners.

## Deployment/cutover relationship

This feature is useful for removing accidental test/admin study contamination, but it must **not** become a deployment bypass.

Do not add a global Production "clear all learner data" button.

The multi-System v2 exact-zero cutover/deployment gate remains authoritative whenever that gate is required. This feature may help an individual user intentionally remove their own data; it does not weaken or override the gate.

## Tests required

At minimum add regression/acceptance coverage for:

1. learner can delete only their own study data;
2. administrator can delete their own study data;
3. crafted `userId`/request cannot target another account;
4. Better Auth `user`, account/login, role, and intended session survive;
5. unrelated learner preferences survive;
6. active Review and its child question/asset rows are removed;
7. Scheduled events are removed;
8. Free completion receipts are removed;
9. case FSRS state is removed;
10. case encounters are removed;
11. optimizer evidence is removed;
12. learner aggregates are removed;
13. System aggregates are removed;
14. durable monthly System buckets are removed;
15. FSRS profile is removed;
16. any legacy Review parent/child rows owned by that user are removed safely;
17. shared Cases/Questions/Topics/Tags/Assets/content are untouched;
18. deletion is idempotent and safe to retry;
19. a mature account larger than one deletion batch completes through bounded staged work;
20. active Review creation cannot race the deletion fence;
21. Scheduled completion cannot race the deletion fence;
22. Free completion cannot race the deletion fence;
23. Reset Progress / Fresh FSRS Start cannot recreate state during deletion;
24. stale browser run/proof retries fail after deletion begins;
25. final rescan catches/retries any pre-fence in-flight write;
26. after completion, the account can start study again from a fresh state;
27. permanent account deletion remains correct and compatible with an in-progress/completed study-data wipe;
28. learner and Admin confirmation UX cannot trigger deletion accidentally.

Add D1 acceptance coverage if concurrency/trigger semantics cannot be proven faithfully with the lightweight test harness.

## Documentation to update when implementing

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

Also update learner/Admin UX documentation and source-contract tests where appropriate.

## Explicit non-goals for this PR

Unless required for correctness, do not expand this PR into:

- global deletion of all users' Reviews;
- arbitrary Admin deletion of another learner's study data;
- content deletion;
- account/identity deletion redesign;
- optimizer execution or automatic parameter replacement;
- changes to the meaning of Reset Progress;
- weakening deployment/cutover zero-data gates;
- Production D1 mutation performed manually as part of implementation.

## Implementation handoff

The next coding agent should work **inside this existing PR/branch**, starting from this plan, then:

1. re-read latest repository authority and exact executable schema/runtime;
2. reconcile any drift since this plan was written;
3. implement the backend deletion/fence state safely;
4. add learner UX;
5. add administrator self-service UX;
6. add migrations only if needed for a durable deletion/fence state;
7. add the full regression/concurrency/D1 acceptance suite;
8. update authoritative documentation;
9. run all affected validation/CI suites;
10. leave Production mutation/deployment outside the PR.

Do not treat this planning commit itself as implementation evidence.
