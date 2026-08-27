# PR #104 — ChatGPT Web Coding Prompt

Use this prompt with the next Sol coding agent in ChatGPT web chat.

---

Please continue work on the **EXISTING draft PR #104** in:

`wongjiahaomax-wq/Flash-Cards`

PR:

`#104 — Plan Case Library filtering, search persistence, and quick Topic creation`

## Critical workflow constraints

- **Do not create a new PR.**
- **Do not create a new feature branch.**
- **Do not restart this work from `main`.**
- **Do not merge the PR.**
- Continue the current PR #104 branch and current head.
- Implement the feature **inside PR #104**.
- Keep the PR as **DRAFT** while implementation/validation/review are in progress.
- Do not deploy to production.
- Do not mutate production D1/R2 data for testing.

Before editing:

1. Inspect the current PR #104 head, base, complete diff, commits, and changed files.
2. Check the latest `main` and determine whether it has moved in a way that materially affects this work. Preserve and continue PR #104 rather than abandoning it or starting a replacement branch.
3. Read the durable plans already committed in this PR:
   - `docs/CASE_LIBRARY_UNASSIGNED_SYSTEM_AND_TOPIC_CREATION_PLAN.md`
   - `docs/CASE_LIBRARY_RETURN_CONTEXT_PLAN.md`
   - this implementation prompt.
4. Read repository guidance, at minimum:
   - `AGENTS.md`
   - `docs/DOCUMENTATION_INDEX.md`
   - `docs/AGENT_TASK_MAP.md`
   - `src/routes/admin/AGENTS.md`
   - `src/lib/server/db/AGENTS.md`
5. Read the relevant current design/performance sources before changing behavior:
   - `docs/AUTHORING_MODEL.md`
   - `docs/SYSTEMS_TOPICS_ADMIN_UX_PLAN.md`
   - `docs/CASE_LIBRARY_SEARCH_PERFORMANCE_PLAN.md`
   - `docs/PERFORMANCE_AND_READ_MODEL_PLAN.md` if still current/relevant
6. Inspect the current implementation and tests rather than relying only on this prompt. Likely relevant files include:
   - `src/routes/admin/cases/+page.svelte`
   - `src/routes/admin/cases/+page.server.js`
   - `src/lib/server/db/case-library.js`
   - `src/lib/components/case-library/BulkCaseTagEditor.svelte`
   - `src/lib/components/case-library/CaseTagInlineEditor.svelte`
   - `src/lib/server/db/admin-content.js`
   - `src/lib/server/db/taxonomy-admin-write.ts`
   - `src/lib/server/db/concept-taxonomy-compat.ts`
   - current Case Library/search/taxonomy tests, including `test/admin-case-library-search-performance.test.js`

Treat current executable repository behavior as authoritative if implementation details have changed since this plan was written, but preserve the agreed product semantics below.

# Goal

Implement three focused improvements to the Production Admin Case Library at `/admin/cases`:

1. correct `Unassigned` System filtering and zero-match System semantics;
2. persist Case Library working filters across browser Back, refreshes, and tabs using browser `localStorage` without caching Case results;
3. allow Admins to create a new Topic directly from the Case Library, with optional create-and-assign behavior for selected Cases.

Do not broaden this into a Case Library redesign.

# Part A — Correct System filtering

The current structural bug is that a non-empty System search which resolves to zero real System IDs can cause the System predicate to be omitted. This makes both `system=unassigned` and nonsense/nonexistent System searches behave too broadly.

Implement explicit semantics:

- blank System search → no System restriction;
- non-empty search matching real System name(s) → preserve current case-insensitive **contains** behavior;
- exact trimmed case-insensitive `Unassigned` → return only Cases whose visible System state is `Unassigned`, meaning the canonical Primary Topic does not resolve to a System ancestor;
- any other non-empty System search with zero matching real Systems → return zero rows.

Important requirements:

- Keep filtering/counting server-side in SQL/read-model logic. Do not load the whole Case Library and filter it client-side.
- Preserve pagination, sorting, Case/Topic/Tag filters, active/inactive lifecycle behavior, and Production-only scope.
- Preserve pre-migration-0015 taxonomy compatibility.
- Preserve the Case Library performance work from PR #102, especially the single compatible taxonomy supporting read. Do not reintroduce duplicate taxonomy reads.
- Update the System field placeholder/copy so `Unassigned` is discoverable, e.g. `e.g. Cardiology or Unassigned`.

Prefer an explicit internal System-filter resolution state rather than overloading an empty `systemIds` array. Conceptually this may be equivalent to:

- `none`
- `matching-systems(ids)`
- `unassigned`
- `no-match`

Exact naming is implementation detail.

# Part B — Persist Case Library working state with localStorage

The primary UX is **native browser Back**, not a custom return button:

```text
search/filter Cases
→ open a Case
→ browser Back
→ continue in the same filtered Case Library
```

A page reload on Back/Forward is acceptable. The requirement is that the search/filter working state is automatically restored so the Admin does not retype it.

Cross-tab persistence is desired, so use **`localStorage`**, not `sessionStorage`.

## Persisted state

Persist at minimum:

- Case search: `q`
- Topic search: `topic`
- System search: `system`

Prefer persisting the full useful working context because it is already represented by the Case Library URL/read model:

- Tag filter: `tag`
- sort
- lifecycle (`active` / `inactive`)
- page

Use a namespaced/versioned browser key, for example conceptually:

`flash-cards:admin:case-library-state:v1`

Exact key is implementation detail.

## Authority / precedence

Keep the URL/server read model authoritative.

Required precedence:

1. If `/admin/cases` loads with explicit recognized Case Library query parameters, those URL values win.
2. The server-normalized/current Case Library state should update the stored browser working state after deliberate navigation/filter/sort/page changes.
3. If `/admin/cases` loads without recognized Case Library state and valid stored state exists, restore the stored state by navigating/querying the normal Case Library URL/read model.
4. `Clear` must clear both the visible filters and the persisted browser state so the restoration logic does not immediately reapply them.
5. Malformed/old browser state must fail safely and must not break page load.

Do **not**:

- store Case rows/results in localStorage;
- use localStorage as authorization or server truth;
- persist on every keystroke;
- reintroduce the pre-PR-#102 expensive typing behavior;
- replace normal browser Back/Forward/history behavior;
- introduce a DB table or schema migration for this preference.

A refresh should always re-query the current server/database using the restored filters; browser storage should contain only small filter/view state.

Prefer a small focused helper module for browser-state parse/read/write/clear behavior rather than scattering raw JSON/localStorage handling through the Svelte page. Ensure all browser APIs are guarded from SSR execution.

# Part C — Quick Topic creation from `/admin/cases`

Keep the existing fast path:

```text
[Choose a Topic] [Assign Topic]
```

Add a separate action beside it:

```text
[New Topic]
```

Use a compact dialog/popover patterned after the current `BulkCaseTagEditor` interaction rather than navigating away to the full Systems & Topics workspace.

## Dialog fields

At minimum:

```text
Create Topic

Topic name
[____________________________]

Parent placement
[Choose parent...]
```

Parent placement must allow:

- explicit **Unassigned**;
- an active System;
- an active Topic, displayed with enough hierarchy/breadcrumb context to avoid ambiguity.

Respect the current taxonomy model:

- Systems remain top-level;
- Topics may be parented by a System or another Topic;
- Unassigned Topics are valid during curation;
- graph/parent validation remains server-authoritative.

## No Cases selected

Allow creating a global Topic from the Case Library without assigning it to a Case.

Primary action can be equivalent to:

`Create Topic`

After success:

- remain on `/admin/cases`;
- preserve the current Case Library working/filter state;
- the new Topic should be available to the existing Topic assignment selector after reload/redirect.

## One or more Cases selected

Allow the same dialog to create the Topic and immediately make it the canonical Primary Topic for all selected active Production Cases.

Primary action can be equivalent to:

`Create & assign to N`

Requirements:

- preserve the current bulk selection limit; do not raise it;
- validate all selected Case IDs before mutation;
- every selected Case must be an active Production Case eligible for this operation;
- finish with exactly one canonical Primary Topic per selected Case;
- do **not** create Additional Study Topics / secondary Topic relationships;
- do not mutate Preview Cases or create a separate Preview taxonomy.

# Taxonomy/domain implementation requirements

Reuse the existing taxonomy authority rather than creating a weaker Case-Library-only Topic creator.

Preserve existing validation for:

- Topic name rules/length;
- generated unique slug;
- `kind = topic`;
- parent existence/activity/semantics;
- taxonomy graph/cycle validation.

Reuse `createTaxonomyConcept()` or extract/reuse the underlying preparation/validation cleanly if the current function is not composable enough for the create-and-assign transaction.

Do not duplicate taxonomy rules in route/Svelte code.

# Atomicity for create-and-assign

The combined operation must not leave either:

- a new orphan Topic after Case assignment fails; or
- a partially reassigned subset of selected Cases.

Validate everything practical before writes.

Where D1 batch support is available, perform the new Topic insert and all selected Primary Topic replacements as one coherent batch after validation.

If the repository's fallback/test abstraction requires sequential execution, implement compensating cleanup consistent with existing domain patterns. Do not claim transactional guarantees that the fallback does not actually provide.

# Read-model / performance constraint

PR #102 deliberately removed duplicate taxonomy work from `/admin/cases`.

The quick-create dialog needs active parent choices. Derive them from the **same compatible taxonomy rows already loaded by the Case Library read model**.

Do not add a second `listAdminConcepts()`, `listActiveSystems()`, or equivalent broad taxonomy read solely for the dialog.

Inactive view should not construct or expose ordinary Topic creation/assignment controls that it does not use.

# UI behavior and accessibility

Preserve the current Case Library structure and existing actions.

Do not remove/regress:

- Case/Topic/System/Tag filtering;
- deliberate Search behavior;
- sorting/pagination;
- Active/Inactive tabs;
- existing bulk Topic assignment;
- inline Case Tag editing;
- bulk Tag editing/creation;
- deactivation/restoration;
- row navigation.

The Topic dialog/popover should have appropriate accessible naming, focus behavior, keyboard close/Escape behavior if consistent with the existing component pattern, server error display, required name validation, and mobile/narrow-screen usability.

# Tests

Add focused automated coverage. Do not create a large new browser-test framework only for this feature if the repository currently uses source-contract/unit/integration tests for these surfaces.

At minimum cover:

## System filtering

- blank System search remains unrestricted;
- real System substring matching remains correct;
- exact case-insensitive `Unassigned` returns only visibly unassigned Cases;
- a Topic nested only under other unassigned Topics still resolves as Unassigned;
- nonexistent non-empty System text returns zero Cases;
- active/inactive behavior remains correct and Production-only;
- Topic + System + Tag + Case filters still compose;
- pre-0015 compatibility remains intact;
- active Case Library still uses only one compatible taxonomy supporting read.

## localStorage persistence

- persisted schema/parser accepts valid state and rejects malformed state safely;
- Case/Topic/System state persists;
- Tag/sort/lifecycle/page persistence if implemented as planned;
- explicit URL state overrides stored state;
- blank Case Library URL restores valid stored state;
- Clear removes stored state and does not immediately restore it;
- storage logic is browser-only / SSR-safe;
- no per-keystroke persistence/navigation regression;
- browser Back/Forward remains native;
- no Case/result-row data is stored.

## Topic creation

- create-only unassigned Topic;
- create-only with System parent;
- create-only with Topic parent;
- invalid/inactive parent rejected;
- graph validation remains authoritative;
- slug uniqueness preserved;
- create-and-assign validates selected Cases and bulk limit;
- active Production Case guard enforced;
- all selected Cases end with exactly one Primary Topic;
- no secondary Topic rows are created;
- failure leaves no orphan Topic and no partial reassignment;
- successful create-and-assign updates all selected Cases;
- inactive Case Library does not expose quick-create mutation UI;
- existing Assign Topic and Manage Tags paths remain present.

# Manual verification

Use local/test data only. Do not mutate Production to satisfy verification.

Verify at least:

1. `System contains = Unassigned` returns only rows whose System column displays `Unassigned`.
2. A nonsense System search returns zero rows.
3. A real partial System search still works.
4. Search by Case/Topic/System, open a Case, use browser Back, and confirm the fields/results return.
5. Refresh `/admin/cases` and confirm filters restore while results are freshly queried.
6. Open another tab to `/admin/cases` and confirm stored working state is available there.
7. Use Clear and confirm the state stays cleared.
8. Combine Case + Topic + System + Tag + sort + pagination, navigate away/back, and confirm expected persistence.
9. Create a Topic with no selected Cases.
10. Create a Topic under a System and assign it to one selected Case.
11. Create and assign to multiple selected Cases.
12. While filtered to `System = Unassigned`, assign selected Cases to a newly created Topic under a System and confirm they may naturally disappear from that result set after reload.
13. Create a nested Topic under another Topic and verify the displayed breadcrumb/placement.
14. Recheck existing Active/Inactive, Tag, bulk Topic, deactivation/restoration, pagination, sorting, and row-open flows.

# Documentation

When implementation lands, update the current documentation/index/status wording as required so the repository no longer describes these PR #104 features as merely planned.

Do not leave stale statements claiming the implementation is documentation-only once code has been added.

# Validation / execution mode

Use the repository's capability-based workflow.

If a local checkout/terminal is available, run the repository-defined focused and standard validation appropriate to the changed files, following `AGENTS.md` and the task map.

If coding through remote GitHub mode without local command execution:

- do not claim local tests were run;
- inspect GitHub CI/checks for the actual PR head after commits are pushed;
- inspect failures and continue fixing the **same PR #104**;
- review the complete PR diff before handoff.

Do not merge even if CI is green.

# Final handoff

At completion, report clearly:

- current PR #104 head SHA;
- files/components/modules changed;
- exact System filter semantics implemented;
- localStorage key/schema and precedence behavior;
- Topic creation/create-and-assign behavior;
- atomicity/fallback approach;
- whether any schema migration was added (none is expected);
- tests/validation actually run and results;
- GitHub CI status at the final head if available;
- documentation updated;
- manual UI checks still required from the user;
- any unresolved risks or design questions.

Keep PR #104 draft and do not merge it.
