# Case Deactivation and Restore UX Plan

Status: Planning only. No implementation in this commit.

## Goal

Add a safe administrator workflow for removing a Case from active use without physically deleting its relational data.

The primary operation is **Deactivate Case**. The inverse operation is **Restore Case**.

Hard deletion is intentionally out of scope for this first implementation.

## Why this is needed

The `cases` table already has an `is_active` flag and production Cases are created active. Current authoring code requires an active production Case for normal edits, but the Admin UX does not currently expose a Case-level activation/deactivation control.

This creates a gap after content import or authoring: if an imported Case is found to be incorrect, an administrator should be able to remove it from learner use without manually deleting dependent questions, Topic relationships, Assets, Stimulus Groups, Tags, or other relational records.

## Product behavior

### Deactivate Case

An administrator can deactivate an active production Case.

Expected semantics:

- set `cases.is_active = false`;
- do not physically delete the Case row;
- do not physically delete or detach Case questions, Topic relationships, Tags, Assets, Stimulus Groups, image-question relationships, or other dependent records;
- the Case must stop appearing in normal learner study selection;
- the Case should stop appearing in the default active Admin Case library;
- existing durable historical records must remain intact;
- repeated deactivation should be safe/idempotent where practical.

### Restore Case

An administrator can restore an inactive production Case.

Expected semantics:

- set `cases.is_active = true` only after validating that the Case is still structurally valid for active authoring/study;
- preserve all existing Case-owned and Case-related content;
- after restore, the Case should return to normal active Admin and learner behavior;
- repeated restore should be safe/idempotent where practical.

### Hard delete

Hard deletion is not part of this feature.

Reasons:

- multiple Case relationships currently use restrictive foreign keys;
- learner/review history may refer to the Case;
- imported images or question prompts may be reusable elsewhere;
- soft deletion gives the administrator a reversible correction path.

A separate future cleanup feature may consider permanent deletion only when dependency and history semantics are explicit.

## Admin UX

### Case editor

Add a small danger-zone section near the bottom of the Case editor.

For an active Case:

- show `Deactivate Case` as a destructive secondary action;
- require an explicit confirmation step before submission;
- confirmation text should explain that the Case will be removed from learner use but its content will be retained;
- after success, redirect to a useful Admin destination rather than leaving the user on an editor that requires an active Case.

For an inactive Case opened from an inactive-case view:

- present the Case in a read-oriented/admin recovery state;
- show `Restore Case` as the primary recovery action;
- avoid exposing normal edit actions that rely on active-Case guards unless those actions are intentionally made inactive-safe.

### Case library

The default Case library remains focused on active Cases.

Add a simple status filter or dedicated inactive view so administrators can find deactivated Cases.

Recommended filter values:

- Active — default
- Inactive
- All

For inactive rows:

- visually identify the inactive state;
- allow navigation to the recovery/detail view;
- optionally expose a row-level Restore action if this can be implemented without duplicating mutation logic.

### Bulk behavior

Bulk deactivation/restoration is desirable for import cleanup, but it is not required for the first implementation unless it is low-complexity after the single-Case mutation is in place.

If included:

- use the existing Case-library selection model;
- cap the number of Cases per operation consistently with existing bulk Admin actions;
- validate all selected Cases before writes when feasible;
- return a clear partial/failure strategy rather than silently skipping invalid Cases.

A future import-history workflow may offer `Cases created by this import` and bulk deactivate from the import record, but import provenance/rollback is outside this PR.

## Server/domain design

Prefer a domain operation in the Case/Admin content layer rather than embedding raw SQL in the SvelteKit route action.

Suggested operations:

- `deactivateCase(db, caseId)`
- `restoreCase(db, caseId)`

The operation should enforce the distinction between production and Preview-owned content and must not allow Preview workspace content to be mutated through the production Admin path.

### Deactivation validation

At minimum:

- Case exists;
- Case is production-owned;
- authorization remains enforced by the existing Admin route/action layer.

Do not require active-only content guards for deactivation in a way that prevents an idempotent second request from returning a sensible result.

### Restore validation

Before restoring, verify the invariants required for an active Case. In particular, inspect current authoring/learner assumptions rather than simply flipping the bit blindly.

Likely checks include:

- production ownership;
- exactly one valid primary Topic;
- primary Topic is active and is a Topic, not a System;
- any additional currently-required active Case invariants used by learner selection.

If the Case cannot safely be restored, return an actionable Admin error instead of partially reactivating it.

## Read-model behavior

Audit all Case list/read paths that currently assume active Cases.

The implementation should explicitly distinguish:

- normal active learner/Admin reads, which continue to exclude inactive Cases;
- the new Admin inactive/recovery read, which intentionally includes inactive production Cases;
- direct learner Case access, which must reject inactive Cases;
- historical review/reporting reads, which may need to retain inactive Case metadata.

Do not globally change active filtering just to make the Admin recovery screen work. Add a purpose-specific Admin read path.

## Safety and data integrity

The feature must not:

- delete Case-related rows;
- delete R2 media;
- deactivate shared Assets or shared Question Prompts merely because one Case is deactivated;
- mutate Preview-owned data;
- orphan or rewrite learner history;
- alter Topic/Tag taxonomy as a side effect;
- convert deactivation into cascade deletion.

Case deactivation is a visibility/lifecycle state change, not content destruction.

## Suggested implementation surfaces

The coding agent should inspect current main before editing, but likely surfaces include:

- `src/lib/server/db/admin-content.js` or a smaller extracted Case-lifecycle module if appropriate;
- Case-library read model/filter parsing;
- `src/routes/admin/_actions.server.js`;
- `src/routes/admin/cases/+page.server.js`;
- `src/routes/admin/cases/+page.svelte`;
- `src/routes/admin/cases/[caseId]/+page.server.js`;
- `src/routes/admin/cases/[caseId]/+page.svelte`;
- focused tests for lifecycle mutations and inactive read behavior;
- relevant Admin/product documentation.

Follow repository architecture guidance: keep route handlers thin and put lifecycle invariants in the server/domain layer.

## UX copy direction

Deactivate confirmation should communicate reversibility and scope, for example:

> Deactivate this Case? It will be removed from learner study and the active Case library. Its questions, images, Topics, Tags, and history will be retained so it can be restored later.

Restore errors should say which invariant prevents restoration, for example that the Case no longer has a valid active Primary Topic.

Final wording can be adjusted during implementation to match current Admin UI conventions.

## Testing / acceptance criteria

At minimum, verify:

1. An active production Case can be deactivated by an authorized Admin.
2. Deactivation changes only lifecycle state and does not delete Case relationships/content.
3. The Case disappears from normal learner study selection.
4. The Case disappears from the default active Case library.
5. The Case appears in the inactive Admin view/filter.
6. Direct learner access to the inactive Case is rejected or excluded using existing learner semantics.
7. The inactive Case can be opened through the Admin recovery path.
8. A structurally valid inactive Case can be restored.
9. A restored Case returns to normal active Admin and learner selection behavior.
10. An invalid Case cannot be restored and receives a useful Admin error.
11. Preview-owned Cases cannot be deactivated/restored through production Admin actions.
12. Deactivation/restoration does not delete R2 objects or shared Assets/Prompts.
13. Existing review/history data remains intact.
14. Authorization failures remain 403 and missing infrastructure remains handled consistently with current Admin actions.

## Scope boundaries

### In scope

- single-Case deactivate;
- single-Case restore;
- Admin discovery of inactive Cases;
- safe inactive Case detail/recovery UX;
- learner exclusion verification;
- focused documentation/tests.

### Optional if low-risk

- bulk deactivate/restore from the Case library.

### Out of scope

- physical Case deletion;
- deleting dependent data;
- import-level rollback/provenance tracking;
- automated garbage collection of unused Assets/Prompts;
- changing learner review-history semantics;
- taxonomy redesign;
- Preview workspace redesign.

## Open implementation questions for the coding agent

Resolve these from current repository behavior before coding rather than guessing:

1. Which exact read path should power inactive Case detail without weakening the existing active production guard?
2. Which learner reads already filter `cases.is_active`, and are there any direct-access paths that need an explicit guard?
3. What active-Case invariants beyond a valid Primary Topic must be checked before restore?
4. Is the current Case library query structured to add an active/inactive/all filter cleanly without regressing pagination/performance?
5. Is bulk lifecycle mutation small enough to include safely, or should it be deferred?

## Implementation sequence

1. Inspect repository guidance and current main.
2. Characterize current active filtering and production/Preview ownership guards.
3. Add focused lifecycle domain functions and tests.
4. Add purpose-specific inactive Admin read support.
5. Add single-Case deactivate/restore route actions.
6. Add Case editor danger-zone/recovery UX.
7. Add Case-library Active/Inactive/All filtering.
8. Verify learner exclusion and historical-read behavior.
9. Add bulk actions only if the preceding design makes them straightforward and safe.
10. Update docs and run repository-defined validation.

## Decision summary

The feature should expose the lifecycle capability already represented by `cases.is_active` rather than introduce destructive deletion.

The desired product model is:

**Active Case → Deactivate → Inactive but preserved → Restore → Active Case**

This provides a safe correction path for imported or manually authored Cases while preserving relational integrity and learner history.
