# Case Library — Unassigned System Filtering + Quick Topic Creation Plan

_Status: planning-only draft. No application code is implemented in this PR._

_Last updated: 27 August 2026_

## Goal

Improve the Admin Case Library in two focused ways:

1. make the displayed `Unassigned` System state actually filterable without weakening existing System-name search semantics;
2. let an administrator create a new Topic directly from `/admin/cases`, using a compact dialog/popover similar to the current bulk Tag editor, without navigating away to the Systems & Topics workspace.

The work should preserve the current authoring model:

```text
System
└── Topic hierarchy
    └── Case
        └── exactly one canonical Primary Topic
```

Case Tags remain separate cross-cutting metadata. Additional Study Topics remain retired.

No schema migration is expected.

---

## Current behavior inspected

Current `main` already includes PR #102's Case Library search-performance work.

The Case Library now:

- submits Case / Topic / System text filters only on deliberate Search/Enter;
- keeps Tag selection as an immediate filter action;
- derives active Topic assignment options from the same compatible taxonomy read used by the Case Library;
- displays `Unassigned` when a Case's Primary Topic has no resolved System ancestor;
- provides bulk Primary Topic assignment;
- provides inline and bulk Tag editing, including creating a new Tag from the bulk Tag popover.

The current System filter path has an important edge case:

1. `getCaseLibraryPage()` resolves active taxonomy rows and builds `matchingSystemIds` from actual System names.
2. `caseLibraryConditions()` only adds the System SQL condition when `systemSearch` is non-empty **and** `systemIds.length > 0`.
3. Therefore a search such as `system=unassigned` produces zero matching real System IDs and the System condition is omitted entirely.
4. The result is effectively **no System filter**, so the Case Library can show all matching Cases instead of only rows whose displayed System is `Unassigned`.

The same structural bug also affects any non-empty System search that matches no real System name, for example `system=zzzz-no-such-system`: it can incorrectly behave like an empty System filter instead of returning zero rows.

This PR should fix both semantics rather than adding only a one-off UI workaround.

---

# Part A — Correct System filter semantics

## Product semantics

The `System contains` filter should have four distinct states:

### 1. Blank System filter

```text
system=
→ do not constrain by System
```

### 2. Matching real System name(s)

Example:

```text
system=card
→ match Cases whose Primary Topic resolves under a System whose name contains "card"
```

Preserve the current case-insensitive contains behavior for real System names.

### 3. Explicit `Unassigned`

Treat the exact trimmed, case-insensitive term:

```text
unassigned
```

as the user-facing representation of the Case Library's displayed `Unassigned` System state.

It should match Cases whose canonical Primary Topic does **not** resolve to a System ancestor.

This includes, where current data permits:

- a Primary Topic with no parent;
- a Primary Topic nested only beneath other Topics but ultimately not beneath a System;
- a malformed/legacy Case with no resolvable System context, if that row is otherwise allowed by the current read model.

The filter should follow the same semantic boundary that produces:

```text
item.systemName ?? 'Unassigned'
```

in the visible Case row.

### 4. Non-empty System text with no match

Example:

```text
system=zzzz-no-such-system
```

must return zero matching Cases rather than silently dropping the System predicate.

This is a correctness requirement independent of the special `Unassigned` keyword.

## Proposed implementation shape

Do not pass an ambiguous empty `systemIds` array into the condition builder.

Resolve the text search first into an explicit internal mode, for example conceptually:

```text
none
matching-systems(ids)
unassigned
no-match
```

The exact type/name is implementation detail, but the SQL construction must be able to distinguish:

```text
blank search
≠
non-blank search with zero matching Systems
```

Suggested behavior:

- `none` → no System predicate;
- `matching-systems(ids)` → retain the current ancestor `exists` logic;
- `unassigned` → add a predicate that excludes any resolved System ancestor for the Case's Primary Topic;
- `no-match` → add an unsatisfiable predicate so the query returns zero Cases.

Keep filtering/counting in SQL. Do not load the whole Case set and filter `Unassigned` in application memory.

## Discoverability

Update the System input placeholder/copy so the special state is visible to administrators, for example:

```text
e.g. Cardiology or Unassigned
```

Do not add a second independent client-side filter model.

## Compatibility requirements

Preserve:

- Production-only Case Library scope;
- active/inactive lifecycle behavior;
- pagination and sorting;
- Topic and Tag filters;
- current System contains semantics for real Systems;
- pre-migration-0015 taxonomy compatibility through `concept-taxonomy-compat.ts`;
- the single compatible taxonomy supporting read established by PR #102.

For a pre-0015 database, where the compatibility layer has no real System hierarchy, `Unassigned` should naturally describe Cases whose Topics do not resolve under a System. A real-System text search should not become a broad match simply because no System IDs exist.

---

# Part B — Create Topics directly from the Case Library

## UX objective

Keep the existing fast path for assigning an already-existing Topic:

```text
[Choose a Topic] [Assign Topic]
```

Add a separate compact action beside it:

```text
[New Topic]
```

`New Topic` opens a dialog/popover patterned after the existing bulk Tag editor rather than navigating away from `/admin/cases`.

This is an additive quick-authoring path, not a replacement for the full Systems & Topics workspace.

## Proposed dialog

The dialog should show:

```text
Create Topic

Topic name
[____________________________]

Parent placement
[Choose parent...             v]

Possible parent choices:
- Unassigned
- active Systems
- active Topics, shown with hierarchy-aware breadcrumb labels
```

Topic-parent selection must respect the current taxonomy model:

- Systems are top-level;
- Topics may be parented by a System or another Topic;
- Unassigned Topics remain valid during curation;
- graph validation remains server-authoritative.

Only active parent choices should be offered in this quick-create flow.

### With no Cases selected

The action creates the global Topic and stays on the Case Library.

Primary button:

```text
Create Topic
```

After redirect, the newly created Topic must be available in the existing bulk Topic selector.

### With one or more Cases selected

The same dialog should make the efficient curation path explicit:

```text
Create Topic and make it the Primary Topic for N selected Cases
```

Primary button:

```text
Create & assign to N
```

This should replace the canonical Primary Topic of all selected active Production Cases. It must not create secondary Topic relationships.

The existing Case Library selection limit remains authoritative; do not increase bulk limits as part of this PR.

## Why this should be one dialog rather than putting `Create Topic` inside the native select

A native `<select>` cannot cleanly host a real creation workflow with:

- Topic name validation;
- parent placement;
- hierarchy context;
- selected-Case count;
- server error feedback.

A focused dialog/popover also matches the established bulk Tag interaction pattern while keeping Topic semantics distinct from Tag semantics.

---

# Server/domain design

## Reuse existing taxonomy authority

Topic creation must preserve the validation already enforced by the taxonomy write path:

- canonical name validation and length limit;
- unique slug generation;
- `kind = topic`;
- parent validation;
- cycle/graph validation;
- active-state invariants.

Do not introduce a second weaker Topic-creation implementation merely for the Case Library.

If the existing `createTaxonomyConcept()` API is not composable enough for atomic create-and-assign behavior, extract/reuse the underlying validation/write preparation in a focused way rather than duplicating taxonomy rules.

## Create-only action

When no Cases are selected:

```text
validate Topic + parent
→ create global Topic
→ redirect back to the current Case Library state
```

Preserve the current filter/sort/lifecycle query state where sensible, but reset stale status parameters.

Topic creation is available only from the active Case Library. The inactive recovery view should not expose ordinary Topic creation/assignment controls.

## Create-and-assign action

When Cases are selected:

1. validate administrator authorization;
2. validate selected Case IDs and current bulk limit;
3. validate every selected Case as an active Production Case with exactly one current Primary Topic;
4. validate the proposed Topic name and parent against the current taxonomy graph;
5. prepare the new Topic ID/slug;
6. perform the new Topic insert and all Primary Topic replacements as one coherent mutation;
7. redirect back to the Case Library with a success status.

### Atomicity requirement

Do not leave a newly created orphan Topic behind because Case assignment failed halfway through.

Where D1 batch support is available, the Topic insert plus selected Case Primary Topic updates should be committed as one batch after all validation succeeds.

If a fallback execution path is required by the repository's existing test/runtime abstraction, it must provide compensating cleanup equivalent to the current single-Case `createCaseTopic()` behavior and must not silently claim atomicity it cannot provide.

Because the Topic is newly created, it cannot already exist as a historical secondary Topic on a selected Case. Existing unrelated legacy secondary rows remain inert and must not be recreated or broadened.

## Production / Preview boundary

This quick-create workflow is Production Admin behavior only.

Do not:

- mutate Preview-owned Cases;
- create a separate Preview taxonomy;
- weaken Production Case guards;
- expose the action through Preview Admin merely because the Production Case editor has related Topic actions.

---

# Case Library read-model implications

PR #102 intentionally removed a duplicate taxonomy read from `/admin/cases`.

Do not regress that improvement.

The quick-create dialog needs active parent choices. Derive the required System / Topic parent-option models from the **same compatible taxonomy rows already loaded by `getCaseLibraryPage()`**.

A suitable return shape could include, for example:

```text
topicOptions
systemOptions
```

or a purpose-built hierarchy-aware parent option model.

Exact naming is implementation detail.

Requirements:

- no second `listAdminConcepts()`/`listActiveSystems()` taxonomy read in the route;
- active view only needs active creation/assignment choices;
- inactive view must not construct unused creation choices;
- existing `admin-case-library-read` timing remains meaningful.

---

# Success and redirect behavior

Suggested success states:

```text
topic-created
→ "Created <Topic>."

topic-created-and-assigned
→ "Created <Topic> and assigned it to N selected Cases."
```

If the current filters no longer include those Cases after assignment, that is expected behavior.

Example:

```text
System = Unassigned
→ create Topic under Eye
→ assign selected Cases
→ those Cases now resolve to Eye
→ they may disappear from the current Unassigned result set after redirect
```

Do not preserve selected checkbox state across a server redirect.

---

# Validation plan

## Automated — System filter

Add focused coverage for:

1. blank System filter still means no System restriction;
2. real System substring filtering still works;
3. exact case-insensitive `Unassigned` returns only Cases whose visible System state is unassigned;
4. an unassigned Topic nested beneath another unassigned Topic still counts as Unassigned;
5. a non-empty nonexistent System search returns zero rows rather than all rows;
6. active and inactive lifecycle filtering remain Production-only;
7. Topic + System + Tag filters still compose correctly;
8. System sort/display remains unchanged;
9. pre-0015 compatibility remains valid;
10. the active Case Library still performs only one compatible taxonomy supporting read.

The existing `test/admin-case-library-search-performance.test.js` is a natural place for the read-path/query-count regression coverage, while a focused Case Library filter test may be clearer for the semantic cases if the existing test becomes too broad.

## Automated — Topic creation

Cover at minimum:

- create-only with a valid unassigned Topic;
- create-only with a valid System parent;
- create-only with a valid Topic parent;
- invalid/inactive parent rejection;
- graph validation remains authoritative;
- generated slug uniqueness behavior is preserved;
- create-and-assign requires at least one valid selected Case when using the bulk assignment path;
- selected Case count limit remains enforced;
- every selected Case must be an active Production Case;
- selected Cases finish with exactly one canonical Primary Topic;
- no new secondary Topic rows are created;
- a failure before commit produces no new Topic and no partial Case reassignment;
- successful create-and-assign updates all selected Cases coherently;
- inactive Case Library does not expose the quick-create mutation UI.

## UI/source contract

Cover the stable interaction contract without introducing a new browser test framework solely for this feature:

- `New Topic` trigger exists on the active Case Library;
- dialog/popover is keyboard closable and accessible;
- Topic name is required and length-limited consistently with the server;
- parent placement has an explicit Unassigned choice;
- selected Case count changes the submit label/intent;
- existing `Assign Topic` and `Manage Tags` flows remain present;
- return-query state is preserved through the mutation action.

---

# Manual UX verification

Use local development data only.

Verify:

1. Search `System contains = Unassigned` and confirm every visible row displays `Unassigned` in the System column.
2. Search for a nonsense System string and confirm zero results.
3. Search for a real partial System name and confirm existing contains behavior remains correct.
4. Combine `Unassigned` with Topic / Tag / Case filters.
5. Open `New Topic` with zero selected Cases, create a Topic, and confirm it appears in the existing Topic selector after redirect.
6. Select one Case, create a Topic under a System, and confirm the Case's Primary Topic changes.
7. Select multiple Cases and confirm the new Topic is assigned to all selected Cases.
8. While filtered to `Unassigned`, create/assign a Topic under a System and confirm reassigned Cases naturally leave the filtered result set.
9. Create a nested Topic under another Topic and confirm the breadcrumb is correct.
10. Confirm keyboard focus, Escape/close behavior, and narrow-screen layout are usable.
11. Confirm Active/Inactive tabs, pagination, sorting, existing bulk Topic assignment, inline Tags, bulk Tags, deactivation, and row navigation still work.

Do not mutate Production data for verification.

---

# Scope boundaries

## In scope

- `/admin/cases` System filter correctness;
- explicit `Unassigned` System filtering;
- correct zero-match System behavior;
- active Case Library quick Topic creation;
- optional create-and-bulk-assign to selected Cases;
- parent placement using current taxonomy semantics;
- focused server/domain/UI tests;
- required current documentation updates when implementation lands.

## Out of scope

- redesigning the entire Case Library;
- replacing text System search with a new global filter system;
- fuzzy/full-text search;
- changing Topic/Tag/System domain semantics;
- Additional Study Topics;
- schema or migration changes;
- automatic inference of System from Topic name;
- automatic Topic creation from Case title;
- bulk creation of many Topics at once;
- drag/drop taxonomy organization from the Case Library;
- replacing the full `/admin/topics` taxonomy workspace;
- Preview taxonomy mutation;
- learner-facing navigation changes.

---

# Proposed implementation sequence

1. Start from the latest current `main` used by this planning PR.
2. Re-read root/scoped agent guidance and current Case Library tests before implementation.
3. Add semantic regression tests demonstrating the current zero-match/System-Unassigned bug.
4. Refactor System-filter resolution into explicit blank / real-match / Unassigned / no-match states.
5. Verify real System search, Unassigned filtering, inactive behavior, and pre-0015 compatibility.
6. Extend the Case Library read model with any parent-option data needed by quick Topic creation, derived from the existing single taxonomy read.
7. Add the `New Topic` dialog/popover while retaining the existing Topic selector and Assign button.
8. Add create-only server behavior.
9. Add validated atomic create-and-assign behavior for selected active Production Cases.
10. Add focused domain/action/UI contract coverage.
11. Run repository-defined validation and manually verify the Case Library on local data.
12. Review the complete diff for accidental taxonomy, Preview, lifecycle, performance, or URL-state regressions before handoff.

---

# Acceptance criteria

The implementation is complete when:

- typing/searching `Unassigned` in the System filter returns only Cases whose System cell is displayed as `Unassigned`;
- any other non-empty System search with no real System match returns zero Cases rather than acting as an empty filter;
- existing real-System contains filtering remains unchanged;
- System filtering stays server-authoritative and bounded;
- PR #102's single compatible taxonomy-read optimization is preserved;
- an Admin can create a Topic without leaving `/admin/cases`;
- the Topic can be explicitly placed as Unassigned, under an active System, or under an active Topic;
- when Cases are selected, the Admin can create the Topic and make it the canonical Primary Topic for all selected Cases in one coherent operation;
- no secondary Topic relationships are created;
- no partial Case reassignment/orphan Topic remains after a failed create-and-assign operation;
- inactive/Preview/Production boundaries remain intact;
- no schema migration is introduced.
