# Performance and Read-Model Plan

_Last updated: 21 August 2026_

## Purpose

The application architecture remains appropriate, but the amount of imported teaching content is increasing. Admin navigation should therefore avoid broad collection reads when a page needs only aggregate counts, a bounded page, a small summary, or one exact record.

The performance work uses page-specific read models without introducing CQRS infrastructure, caches, speculative indexes, or unnecessary schema changes.

## Pass 1 — targeted Admin reads

### Dashboard

`/admin` uses `getAdminDashboardSummary(db)` rather than constructing Case-editor state.

The read model returns only:

```text
caseCount
questionCount
assetCount
topicCount
dashboardCases (bounded to 6 by default)
```

Counts use SQL `count(*)`. The Case work queue selects only `id`, `title`, and primary Topic name and is bounded in SQL.

Production/Preview ownership semantics remain explicit. Case and Topic counts preserve their previous active-only behavior. Question and Asset counts preserve the previous dashboard's inactive/archive inclusion while excluding Preview-owned rows. The Asset total is an actual aggregate count rather than being implicitly capped by the old 100-row Asset fetch.

### Case detail

List and detail pages use distinct reads:

```text
List page:
    getXLibraryPage(filters, page)

Detail page:
    getAdminCaseById(caseId)

Dashboard:
    getAdminDashboardSummary()

Complex editor:
    page-specific read model where useful
```

`getAdminCaseData()` uses the targeted Case-by-ID lookup and no longer calls `listAdminCases()` followed by an in-memory `.find()`.

The targeted query filters in SQL by exact Case ID, active state, and production ownership, uses `LIMIT 1`, and returns the primary Topic plus Case question-selection settings required by the editor.

## Pass 2 — bounded Admin Case and Question libraries

### Convention

Admin libraries that can grow with imported content should expose a bounded list read model such as:

```text
getXLibraryPage(filters, { page })
```

The list read should use:

- SQL filtering where practical;
- an aggregate total-count query;
- deterministic ordering with an explicit tie-breaker;
- `LIMIT`/`OFFSET` or an equivalent bounded page selection;
- relationship enrichment only for IDs on the visible page;
- separate small taxonomy/selector reads where needed.

Detail/edit reads remain separate and may intentionally expose historical relationships that are not part of current list eligibility.

### Case Library

`/admin/cases` now uses `getCaseLibraryPage()` with the same 60-row page size used by the Image Library.

The Case list now:

1. filters active production Cases by title and optional active Case Tag in SQL;
2. counts all matching Cases in SQL;
3. selects one deterministic page ordered by title then Case ID;
4. fetches active Tag relationships only for the visible Case IDs;
5. returns true total/page metadata to the UI.

The active Tag selector itself uses a lightweight Tag taxonomy query and does not load global Case/Question Tag usage rows merely to populate an option list.

### Question Library

`/admin/questions` now uses `getQuestionLibraryPage()` with a 60-row page size.

The database identifies and bounds matching active production Question Prompt IDs before relationship materialisation. SQL-level matching preserves the established list semantics for:

- Prompt and current answer-content search;
- Topic association through active Concept/Case/Stimulus Group/Stimulus Option usages;
- `scope=shared`, including active Concept Questions plus reusable Shared Questions and reusable Asset Questions;
- `scope=case`, including active Case-wide, Stimulus Group, and Stimulus Option Questions;
- Case Question Tag filtering through active production Case Question usage.

After the page of Prompt IDs is selected, usage/topic summaries and displayed Case Question Tags are loaded only for those visible Prompt IDs. Reusable Shared/Asset Question usages continue to contribute to search, reusable classification, and usage counts without becoming Case Question Tags.

Production/Preview isolation is explicit in the new list read: Preview-owned Prompts are excluded, and Preview-owned Cases do not contribute production Case/Group/Option usage or answer-search matches. Removed stimulus options and inactive parent relationships remain excluded from current usage according to the existing semantics.

Question detail behavior is intentionally unchanged; historical/inactive relationship inspection continues through `getQuestionPromptDetail()` and related detail helpers.

### Pagination UI

Both libraries show the true filtered total and current page range. Previous/Next links preserve the active filters. Submitting a new filter/search does not submit a page parameter, so it naturally starts from page 1. Out-of-range page requests clamp to the final available page; invalid page values parse as page 1.

## Instrumentation

The dashboard read exposes a `Server-Timing` response header for its principal server-side read, for example:

```text
server-timing: admin-dashboard-read;dur=12.3
```

The Case and Question library list routes now expose equivalent bounded-read timings:

```text
admin-case-library-read
admin-question-library-read
```

The Case editor data helper emits a small structured timing record:

```text
[server-read-timing] {
  operation: 'admin-case-editor-read',
  durationMs: 18.7,
  outcome: 'ok'
}
```

The timing contains only operation name, elapsed milliseconds, and success/error outcome. It does not contain user IDs, emails, session IDs, Prompt/answer content, vignette content, Asset metadata, or secrets.

The timing helper preserves both successful return values and thrown failures, and observer/logging failures are deliberately ignored. Query-count middleware remains deferred because adding it at the Drizzle/D1 boundary would be more invasive than these focused passes warrant.

For local/Preview inspection, use the browser Network panel for `Server-Timing` response headers and Worker/local server logs for structured timings.

## Performance principle

Optimise in this order:

1. query less data;
2. perform filtering in SQL;
3. bound result sets;
4. parallelise independent reads where safe;
5. consider caching/indexing only after measurements identify a need.

List, dashboard, and detail pages should not share a broad read merely for convenience when their result-shape requirements differ.

## Structural before/after

Before — Dashboard/detail:

- `/admin` fetched broad production collections and constructed Case-management state merely to render aggregate/dashboard information.
- opening one Case caused `getAdminCaseData()` to fetch the complete active production Case library and locate one row in JavaScript.

After Pass 1:

- `/admin` performs targeted aggregate counts plus one bounded six-row Case summary query;
- `getAdminCaseData()` performs one bounded exact-ID Case/primary-Topic/settings query before loading only the relationships required for that Case.

Before — Cases:

- all matching active production Cases were loaded;
- all current Case Tag assignments were loaded;
- Case Tags were decorated globally and Tag filtering happened in JavaScript.

After Pass 2 — Cases:

- matching Cases are counted in SQL;
- Tag filtering happens in SQL;
- one bounded deterministic page is loaded;
- Tag relationships are fetched only for visible Case IDs.

Before — Questions:

- global active Prompt and current usage collections were assembled across Concept, Case, Stimulus Group, Stimulus Option, reusable Shared, reusable Asset, and Case Question Tag relationships before final route filtering.

After Pass 2 — Questions:

- matching production Prompt IDs/count are derived in SQL;
- one bounded deterministic Prompt page is selected;
- usage/topic/tag summaries are materialised only for visible Prompt IDs.

No benchmark numbers are claimed. The evidence is the structural reduction in rows materialised and transferred per navigation.

## Index review

Pass 2 follows **query less first; index second based on evidence**. The relevant schema already has relationship access paths in the directions used by these bounded queries, including Case Tag `(tag_id, case_id)` lookup and Prompt indexes on Concept/Case/Stimulus Group/Stimulus Option/reusable Question relationships.

No speculative index or migration was added in Pass 2. Further `EXPLAIN QUERY PLAN`/index tuning remains a measured follow-up if production/local timings identify a concrete slow query.

## Behaviour intentionally unchanged

Passes 1–2 do not change:

- Better Auth/session behavior;
- learner Study or `startReview` behavior;
- private R2 delivery or image identity;
- Case editor semantics;
- Topic, Tag, question, stimulus, Shared Question, or Reusable Image Question authoring semantics;
- Preview behavior or import runtime behavior;
- detail-page historical usage behavior;
- the data model or migrations.

## Remaining performance passes

### Pass 3

Better Auth short-lived session cookie-cache investigation.

### Pass 4

Learner Study/`startReview` read-model optimisation.

### Pass 5

Case editor lazy-loading/read boundaries.

### Later

- image thumbnail optimisation if measurements justify it;
- `EXPLAIN QUERY PLAN`/index tuning based on measured slow queries.

These future passes are not implemented by Pass 2 and should remain measurement-driven.