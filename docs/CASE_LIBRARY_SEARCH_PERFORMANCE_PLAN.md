# Case Library Search / Filter Performance Plan

Status: planning only. No production behavior is changed by this document.

## Problem

The Admin Case Library currently auto-submits its GET filter form after a 300 ms debounce while typing into the Case, Topic, and System text filters. That creates repeated SvelteKit navigations and repeated server/database reads during normal typing, which is perceptibly laggy.

The current server read path also performs avoidable supporting-data work on each Case Library navigation.

## Current baseline inspected

At the current `main` baseline used for this plan:

- `src/routes/admin/cases/+page.svelte` binds Case, Topic, and System fields to local state and calls `autoSearch()` on every `input`; `autoSearch()` calls `requestSubmit()` after 300 ms.
- the Tag selector also uses the same automatic submit helper on change;
- `src/routes/admin/cases/+page.server.js` loads the Case page, Case-library Tag options, and Admin Topic options in parallel;
- `getCaseLibraryPage()` already loads Concept taxonomy internally so it can resolve System filtering/sorting and visible Case Topic/System enrichment;
- `listAdminConcepts()` separately loads active Concept taxonomy again to build the Topic selector/bulk-assignment options;
- the inactive Case Library does not render the active-only bulk Topic assignment control, but the route currently still loads `listAdminConcepts()`;
- `listCaseLibraryTagOptions()` is already a deliberately lightweight, lifecycle-sensitive option read: active view lists active Tags, while inactive recovery view lists Tags retained by inactive Production Cases, including inactive Tags;
- existing `admin-case-library-read` server timing wraps the principal Case Library load.

This means the safest Stage 2 optimization is **not** to introduce a cross-request cache first. The repository's existing performance rule is query less / deduplicate work first, and only consider caching or indexing after measurement.

## Goal

Make Case Library filtering feel immediate while preserving current server-authoritative filtering, lifecycle, pagination, sorting, Production/Preview ownership, taxonomy compatibility, and Case Tag semantics.

The implementation should ship both stages below in one focused implementation PR.

## Stage 1 — stop search-on-every-keystroke

For the text filters:

- Case contains
- Topic contains
- System contains

remove automatic form submission from each `input` event.

Required UX:

- typing stays local and does not navigate;
- pressing Enter in any text filter submits the current combined filter form;
- provide one explicit `Search` / `Apply filters` submit action;
- retain `Clear` behavior;
- Tag selection may continue to submit immediately on `change`; this is a single deliberate selection rather than a stream of keystrokes;
- preserve the current lifecycle and sort query parameters when submitting;
- a new search/filter submission must return to page 1 rather than carrying a stale `page` value;
- maintain normal form, keyboard, label, focus, and accessibility semantics;
- do not add client-side whole-library filtering or make the client authoritative for results.

Do not replace the current 300 ms debounce with a longer debounce. The purpose is to eliminate navigation while a user is composing text.

## Stage 2 — reduce redundant supporting-data reads safely

Optimize the current request path before considering any cache.

### Required Stage 2 behavior

1. **Eliminate the duplicate Concept-taxonomy load on the active Case Library path.**
   - `getCaseLibraryPage()` and Topic-option construction currently obtain overlapping taxonomy data separately.
   - Refactor narrowly so the relevant request obtains the required taxonomy once and reuses/derives the Case-page taxonomy information and Topic option model from that authoritative result, or use another equally narrow read-model composition that demonstrably avoids the duplicate taxonomy read.
   - Preserve `concept-taxonomy-compat.ts` compatibility behavior; do not bypass it by directly assuming migration `0015` columns exist.

2. **Do not load active Topic assignment options in the inactive Case Library when the UI cannot use them.**
   - Inactive recovery still needs whatever taxonomy information `getCaseLibraryPage()` requires for displayed Topic/System context and filtering/sorting.
   - It does not need the separate active Topic selector model used only by active bulk assignment.

3. **Keep the Tag-option read purpose-specific and lifecycle-correct.**
   - Active Case Library must continue to expose active canonical Tags for filtering and active inline/bulk Tag editing.
   - Inactive Case Library must continue to expose retained inactive-Case Tag context, including inactive Tags where currently supported.
   - Do not replace this with a broad Tag/usage read.

4. **Do not introduce a server-wide or Worker-isolate cache merely for this PR.**
   - Cross-request caching creates mutation-freshness/invalidation questions for Topic and Tag administration and conflicts with the repository's current measurement-first performance direction.
   - If inspection during implementation discovers an existing repository-supported load/reuse boundary that avoids repeated option reads without broadening scope or risking stale mutation state, it may be used, but it must be justified and tested.
   - Otherwise, the accepted Stage 2 target is the safe per-request reduction above: remove duplicate/unused supporting reads while keeping results fresh and server-authoritative.

5. **Do not add schema/index migrations unless measurement identifies a separate concrete query bottleneck.**
   - This PR is primarily eliminating excessive navigations and redundant read work, not redesigning Case search.

### Architectural preference

Prefer a cohesive Case Library read-model/orchestration boundary over route-level duplication. Keep the route thin and preserve purpose-specific DB reads. New extracted application modules should follow the repository's TypeScript direction where proportionate, but do not convert unrelated JavaScript simply because it is touched.

## Important current behavior to preserve

- Active / Inactive lifecycle tabs and Production-only Case Library boundaries.
- Current Case/Topic/System/Tag filter semantics.
- Current sorting and pagination semantics.
- Inactive Tag-context behavior.
- Inline Case Tag editing and bulk Tag management on active Cases.
- Bulk Topic assignment on active Cases.
- Case deactivate/restore actions.
- Existing URL-query-driven navigation so filtered views remain linkable/bookmarkable.
- Current server-side authorization checks.
- Pre-migration-0015 taxonomy compatibility through the existing compatibility layer.

## Performance evidence / instrumentation

Retain the existing `admin-case-library-read` timing contract.

For Stage 2, prefer focused automated evidence that the redundant read path is gone, for example by instrumenting the existing SQLite/D1 test fixture statement capture or adding a similarly narrow characterization test. The implementation should be able to show structurally that:

- active Case Library loading no longer fetches Concept taxonomy twice for the Case page + Topic options;
- inactive Case Library loading does not perform the active Topic-option read;
- the Case result remains bounded and page-enriched as before.

Do not add noisy production logging or a generic query-count middleware solely for this change.

## Testing

Add focused tests covering at minimum:

### Stage 1 interaction

- the three text inputs no longer have automatic `input`-driven submission;
- pressing Enter submits the current combined text filters through normal form semantics;
- explicit Search/Apply submits all current filters;
- Tag change behavior remains intentional and tested;
- lifecycle and sort parameters are preserved correctly;
- a new filter submission resets pagination to page 1;
- Clear keeps the intended lifecycle behavior.

### Stage 2 read path

- no regression in `parseCaseLibraryFilters()` or page parsing;
- no regression in Case/Topic/System/Tag filtering;
- no regression in Active/Inactive Case Library behavior;
- active loading avoids the previously duplicated Concept-taxonomy supporting read;
- inactive loading avoids the unnecessary active Topic-option read;
- Tag option semantics remain correct in both lifecycle views;
- Production/Preview filtering remains intact;
- taxonomy compatibility behavior remains intact where touched.

Use existing repository test styles rather than introducing a new browser-test framework solely for this change. If the repository's current UI contract tests are source-level rather than DOM/browser-level, a focused source contract is acceptable for the no-auto-submit invariant, supplemented by manual UX verification.

## Manual verification

Use local development data only.

Verify:

- rapidly typing into Case, Topic, and System fields is smooth and does not cause Network navigations until Enter/Search is used;
- Enter and Search produce the same result URL/rows;
- changing Tag applies predictably;
- Active/Inactive filters, sorting, pagination, Clear, bulk actions, inline Tag editing, and row links still behave normally;
- browser Network/Server-Timing evidence no longer shows a request per typing pause.

Do not mutate Production data for verification.

## Scope boundaries

In scope:

- `/admin/cases` text-filter interaction;
- Case Library read-path efficiency directly related to filter/navigation requests;
- focused tests and necessary documentation updates.

Out of scope:

- changing Case Library matching semantics;
- changing taxonomy or Tag models;
- full-text search infrastructure;
- fuzzy search;
- client-side loading/filtering of the entire Case corpus;
- global application caching infrastructure;
- speculative indexes/schema migrations;
- unrelated Case Library redesign;
- learner search behavior.

## Implementation sequence

1. Inspect current `main` and open PRs touching `/admin/cases`, Case Library read models, taxonomy compatibility, Tag options, or Admin Case UX.
2. Read repository guidance and current Case Library/performance tests.
3. Confirm the current 300 ms auto-submit path and capture the current Case Library read composition.
4. Implement Stage 1 and verify text typing no longer submits automatically.
5. Implement Stage 2 by deduplicating the Concept-taxonomy supporting read and skipping active Topic options in inactive view, preserving compatibility and freshness.
6. Add focused tests for interaction contracts and read-path/query-shape behavior.
7. Run repository-defined validation.
8. Keep the implementation PR draft until validation and review are complete.

## Success criteria

- text entry in Case/Topic/System filters causes zero server navigation until the user deliberately submits;
- URL-based filter state remains intact;
- filtering results remain server-authoritative and semantically unchanged;
- active Case Library loading performs less redundant taxonomy work than the current baseline;
- inactive Case Library loading does not fetch unused active Topic assignment options;
- no broad cache or speculative schema/index work is introduced;
- no Production/Preview, lifecycle, Tag, taxonomy-compatibility, sorting, pagination, or bulk-action invariant regresses.
