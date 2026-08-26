# Case Deactivation and Restore UX Plan

Status: Planning baseline for implementation in this same draft PR.

## Goal

Expose the Case lifecycle already represented by `cases.is_active` through a safe Admin UX.

The normal lifecycle becomes:

```text
Active Case
→ Deactivate
→ Inactive but preserved
→ Restore
→ Active Case
```

This feature is intended especially for post-import or authoring cleanup when an administrator discovers that one or more Cases should no longer be available to learners.

Routine physical deletion is intentionally out of scope.

## Current implementation baseline

Current main already provides the storage primitive but not the Admin workflow:

- `cases.is_active` exists and defaults true;
- new production Cases are created active;
- the normal Case library explicitly filters to active production Cases;
- normal production Case mutations use an active-production guard;
- the shared Case editor currently renders "Case not found" when its active-only loader cannot resolve a Case;
- production and Preview ownership are distinct and must remain so;
- the Case editor Svelte page is shared by Production Admin and Preview Admin, so any new named production action rendered from that page must preserve the Preview action contract.

No schema migration should be required for this feature.

## Product decisions

### 1. Deactivate, do not delete

Deactivation changes only the Case lifecycle state:

```text
cases.is_active = false
```

It must not physically delete, detach, rewrite, or deactivate related content solely because the Case is deactivated.

Preserve:

- the Case row;
- Primary Topic and any inert legacy secondary Topic rows;
- Case Tags;
- Case Questions and Question Prompts;
- fixed Case Assets;
- Alternative Sets / Stimulus Groups and their options;
- Case-specific image questions;
- reusable Image Question opt-ins;
- shared/global Assets and Prompts;
- historical Reviews and provenance;
- R2 media objects.

An inactive Case is unavailable for future learner study but remains recoverable by an Admin.

### 2. Restore is validated

Restore sets:

```text
cases.is_active = true
```

only after the Case satisfies the invariants required to become learner-presentable again.

At minimum the coding agent must verify current-main requirements for:

- production ownership (`preview_session_id IS NULL`);
- exactly one behaviorally active Primary Topic relationship;
- that Primary Topic exists, is active, and is a Topic rather than a System;
- any additional current learner-presentability invariants discovered in the actual read/resolver paths.

If restore validation fails, leave the Case inactive and return an actionable Admin error.

### 3. Hard delete remains absent

Do not add permanent Case deletion in this PR.

Current Case relationships use restrictive foreign keys in several places, and historical Reviews may refer to the Case. A destructive purge needs a separate retention/dependency design.

## Admin UX

### A. Case library status switch

Keep the normal Case library default as **Active**.

Add a simple lifecycle switch near the library heading or filters:

```text
[ Active ] [ Inactive ]
```

Recommended query contract:

```text
status=active     # default / omitted
status=inactive
```

An `All` state is not required for v1. Keeping the views separate makes bulk actions and editor affordances less ambiguous.

The existing search, Topic, System, Tag, sorting, pagination, and query-preservation behavior should continue to work within both lifecycle states.

The read model must remain production-only in both states:

```text
preview_session_id IS NULL
```

Active view:

- existing table behavior remains;
- rows are normal active Cases;
- existing bulk Primary Topic assignment remains available;
- add bulk **Deactivate selected**.

Inactive view:

- heading becomes `Inactive Cases`;
- rows have an obvious `Inactive` status treatment;
- normal bulk Primary Topic assignment is hidden/disabled;
- add bulk **Restore selected**;
- each row can open a recovery/detail state or offer a direct Restore action, but mutation logic must have one canonical server owner.

### B. Single-Case deactivate from the editor

For a normal active Production Admin Case editor, add a small **Case lifecycle** / danger-zone section near the bottom of the editor.

Show:

- state: `Active`;
- destructive secondary button: `Deactivate Case`;
- explanatory copy that deactivation removes the Case from learner study but retains its questions, images, Topics, Tags, and history.

Require explicit confirmation before submission.

After successful deactivation, redirect to the inactive Case recovery state or the Inactive Case library with a success message. Do not leave the user on the normal active editor, because its data loaders intentionally require an active Case.

Do not show this control in Preview Mode. Because the editor page is shared with `/preview-admin`, preserve the Preview named-action contract explicitly rather than relying only on conditional rendering.

### C. Inactive Case recovery/detail state

Do not weaken the existing active production Case editor guard merely to display inactive Cases.

Instead add a purpose-specific Admin recovery read for an inactive production Case.

When an Admin opens `/admin/cases/<id>` for an inactive production Case, render a compact recovery state rather than the full editable Case editor.

Recommended contents:

- `Inactive` status badge;
- Case internal title;
- Primary Topic / System summary when available;
- Tag summary when available;
- concise explanation that normal editing is unavailable while inactive;
- `Restore Case` action;
- link back to `Inactive Cases`.

Do not expose normal edit forms that currently depend on active-Case guards.

Preview-owned or missing Cases must still fail closed and must not be surfaced through this recovery path.

### D. Bulk lifecycle operations

Bulk lifecycle operations are **in scope** because the motivating use case includes correcting imported batches.

Use the existing Case-library checkbox selection model.

Active library:

```text
Deactivate selected
```

Inactive library:

```text
Restore selected
```

Requirements:

- cap selected Cases consistently with the existing bulk Case action limit unless current code gives a stronger reason otherwise;
- production-only ownership validation;
- validate the complete selected set before mutation where practical;
- do not silently skip invalid Cases;
- provide explicit confirmation for bulk deactivation, including the selected count;
- after completion, preserve the current lifecycle/search/sort context where sensible;
- restore failure must leave invalid Cases inactive rather than partially reactivating them without clear reporting.

If all-or-nothing batching is not reliably available in the current D1/Drizzle path, the coding agent must define and test an explicit failure strategy rather than imply atomicity.

## Server/domain design

Lifecycle mutation is a Case-domain responsibility, not route SQL.

Prefer a focused new application module if adding this behavior directly to the existing Admin content module would create another independent responsibility. Repository architecture guidance prefers new/extracted modules in TypeScript where the toolchain supports it.

A reasonable shape is a focused Case lifecycle module owning operations such as:

```text
deactivateProductionCase(...)
restoreProductionCase(...)
bulkDeactivateProductionCases(...)
bulkRestoreProductionCases(...)
getInactiveProductionCaseRecovery(...)
```

Exact names are implementation details.

The route layer should remain responsible for:

- Admin authorization;
- request/form parsing;
- invoking the lifecycle owner;
- translating domain errors to SvelteKit failures;
- redirecting after success.

### Production/Preview safety

The existing `requireProductionCase(...)` guard deliberately means **active production Case**. Do not weaken or repurpose that semantic contract globally.

Lifecycle operations need a production-ownership check that can intentionally see inactive Cases while still requiring:

```text
preview_session_id IS NULL
```

Implement that check narrowly for lifecycle/recovery behavior. Do not create a vague generic scope helper and do not permit Preview-owned Cases to flow through production lifecycle mutations.

Because `src/routes/admin/cases/[caseId]/+page.svelte` is shared with Preview Admin, any new named action referenced by that shared page must either:

- have a safe Preview implementation where semantically appropriate; or
- be explicitly blocked in Preview with the established 403 pattern.

Case deactivation/restoration itself is production-only in this PR.

## Case library read model

The existing Case library currently hard-codes:

```text
cases.is_active = true
preview_session_id IS NULL
```

Extend the purpose-built bounded read model with an explicit lifecycle filter rather than weakening/removing the predicates.

Desired semantics:

```text
status=active
→ is_active = true AND preview_session_id IS NULL

status=inactive
→ is_active = false AND preview_session_id IS NULL
```

Keep filtering/counting/pagination SQL-bounded as it is today. Do not load all Cases and filter in application memory.

The returned row shape should expose lifecycle state only if the UI actually needs it.

## Learner behavior audit

Deactivation is useful only if inactive Cases cannot start new learner Reviews.

The coding agent must inspect the current learner-selection/read paths and characterize the existing `is_active` protections before changing them.

Expected behavior:

- inactive Cases are excluded from new study selection;
- direct learner-facing Case/Review-start paths cannot bypass that exclusion;
- historical Review data remains readable as historical truth where current product behavior requires it;
- restoring a valid Case makes it eligible again through the existing learner rules.

Do not rewrite historical Reviews or snapshots as part of Case deactivation/restoration.

## Confirmation UX

### Single Case

Suggested direction:

> Deactivate this Case? It will no longer be available for learner study. Its questions, images, Topics, Tags, and review history will be kept so you can restore it later.

### Bulk

Suggested direction:

> Deactivate 12 Cases? They will be removed from learner study but their content and history will be retained.

Use the repository's existing interaction conventions where possible. The confirmation must be explicit; the exact dialog implementation is left to the coding agent after inspecting current UI patterns.

## Success / error feedback

Add clear route status messages for at least:

- Case deactivated;
- Case restored;
- selected Cases deactivated;
- selected Cases restored;
- restore blocked by an invalid/inactive Primary Topic or another required invariant.

Errors should explain the recoverable problem without leaking internal SQL details.

## Acceptance criteria

### Single Case

1. An authorized production Admin can deactivate an active production Case.
2. Deactivation sets only the Case lifecycle state required by this feature and does not destroy Case relationships/content/media.
3. The Case disappears from the default Active Case library.
4. The Case is excluded from future learner study selection.
5. The Case appears in the Inactive Case library.
6. Opening the inactive Case gives an Admin recovery state rather than the normal active editor.
7. A valid inactive production Case can be restored.
8. A restored Case returns to the Active library and normal learner eligibility.
9. An invalid restore is rejected without reactivating the Case.

### Bulk

10. Admin can select multiple active Cases and deactivate them after explicit confirmation.
11. Admin can select multiple inactive Cases and restore them.
12. Existing active-library bulk Primary Topic assignment still works in Active view.
13. Inactive view does not offer mutations that assume active Case authoring.
14. Bulk operations obey the selected-count limit and have a tested failure strategy.

### Safety

15. Preview-owned Cases cannot be discovered, deactivated, or restored through production Admin lifecycle paths.
16. Preview Admin cannot invoke production Case lifecycle actions from the shared editor contract.
17. Deactivation/restoration does not delete R2 objects.
18. Deactivation/restoration does not deactivate shared Assets or shared Question Prompts.
19. Case Tags, Topics, questions, stimulus relationships, and historical Review records remain intact.
20. Existing active-only production guards keep their current meaning.

### Read-model / UX preservation

21. Active remains the default Case library state.
22. Search, Topic/System/Tag filters, sorting, pagination, and preserved query context continue to work in lifecycle views.
23. Case-library reads remain bounded/paginated in SQL.
24. The Case editor remains shared with Preview Admin without copied editor implementations.

## Likely implementation surfaces

The coding agent must inspect current head rather than treating this as a fixed file list. Likely areas are:

```text
src/lib/server/db/
  focused Case lifecycle module (preferred if proportionate)
  case-library.js
  relevant lifecycle/read-model tests

src/routes/admin/_actions.server.js
src/routes/admin/cases/+page.server.js
src/routes/admin/cases/+page.svelte
src/routes/admin/cases/[caseId]/+page.server.js
src/routes/admin/cases/[caseId]/+page.svelte
src/routes/preview-admin/cases/[caseId]/+page.server.js
src/lib/components/case-editor/  # if a focused lifecycle component is useful

test/admin-editor-preview-contract.test.js
relevant learner/read-model tests
```

If a new focused application module is introduced, prefer TypeScript according to the repository's incremental architecture direction, but do not convert unrelated JavaScript files.

## Validation expectations

Implementation agent should use the repository capability-based workflow.

At minimum, logic changes should receive focused tests for:

- lifecycle mutation semantics;
- production/Preview ownership;
- restore validation;
- Case-library active/inactive filters;
- bulk lifecycle behavior;
- shared Production/Preview editor action contract;
- learner exclusion if current coverage does not already characterize it.

Then use repository-defined `agent:checks` / checkpoint / pre-handoff validation appropriate to the execution mode. Do not claim unexecuted local commands as passed.

## Explicitly out of scope

- permanent/hard Case deletion;
- cascading deletion of questions, relationships, or history;
- R2 garbage collection;
- deleting unused Assets/Prompts after Case deactivation;
- import-job provenance or one-click import rollback;
- automatic identification of all Cases created by a particular historical import;
- taxonomy redesign;
- Preview workspace lifecycle redesign;
- changing historical Review semantics.

## Future follow-up

A later import-management feature could expose:

```text
Import job
→ Cases created by this import
→ Deactivate imported Cases
```

That requires durable import-to-created-entity provenance and is deliberately separate from this generic Case lifecycle PR.

## Implementation sequence

1. Inspect the current PR head and intended base before coding.
2. Read root/scoped agent guidance and current Admin/DB authorities.
3. Characterize existing production active filters, learner exclusion, and Preview action-contract tests.
4. Add the focused lifecycle domain owner and tests.
5. Extend the bounded Case-library read model with Active/Inactive lifecycle filtering.
6. Add production single/bulk route actions and Preview explicit blocks where required.
7. Add Active/Inactive Case-library UX and bulk actions.
8. Add the active-editor Case lifecycle danger zone.
9. Add inactive Case recovery/detail UX without exposing normal active-only edit forms.
10. Verify learner behavior and historical preservation.
11. Review the complete PR diff for scope/safety.
12. Run the repository-defined validation available in the coding agent's execution mode.

## Decision summary

The correct v1 solution is **Deactivate / Restore**, not hard delete.

The feature should make the existing Case lifecycle state administratively usable while preserving the repository's production/Preview isolation, active-only mutation guards, historical Review integrity, and purpose-built read models.
