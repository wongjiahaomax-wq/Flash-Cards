# Performance and Read-Model Plan

_Last updated: 20 August 2026_

## Purpose

The application architecture remains appropriate, but the amount of imported teaching content is increasing. Admin navigation should therefore avoid broad collection reads when a page needs only aggregate counts, a small summary, or one exact record.

This first pass establishes lightweight page-specific read models without introducing CQRS infrastructure, caches, speculative indexes, or schema changes.

## Pass 1 — targeted Admin reads

### Dashboard

`/admin` now uses `getAdminDashboardSummary(db)` rather than constructing Case-editor state.

The read model returns only:

```text
caseCount
questionCount
assetCount
topicCount
dashboardCases (bounded to 6 by default)
```

Counts use SQL `count(*)`. The Case work queue selects only `id`, `title`, and primary Topic name and is bounded in SQL.

Production/Preview ownership semantics remain explicit. Case and Topic counts preserve their previous active-only behavior. Question and Asset counts preserve the previous dashboard's inactive/archive inclusion while excluding Preview-owned rows. The Asset total is now an actual aggregate count rather than being implicitly capped by the old 100-row Asset fetch.

### Case detail

List and detail pages now use distinct reads:

```text
List page:
    listAdminCases(filters/page)

Detail page:
    getAdminCaseById(caseId)

Dashboard:
    getAdminDashboardSummary()

Complex editor:
    page-specific read model where useful
```

`getAdminCaseData()` uses the targeted Case-by-ID lookup and no longer calls `listAdminCases()` followed by an in-memory `.find()`.

The targeted query filters in SQL by exact Case ID, active state, and production ownership, uses `LIMIT 1`, and returns the primary Topic plus Case question-selection settings required by the editor.

## Instrumentation

The dashboard read exposes a `Server-Timing` response header for its principal server-side read, for example:

```text
server-timing: admin-dashboard-read;dur=12.3
```

The Case editor data helper emits a small structured timing record:

```text
[server-read-timing] {
  operation: 'admin-case-editor-read',
  durationMs: 18.7,
  outcome: 'ok'
}
```

The structured timing contains only operation name, elapsed milliseconds, and success/error outcome. It does not contain user IDs, emails, session IDs, question/vignette content, Asset data, or secrets.

The timing helper preserves both successful return values and thrown failures, and observer/logging failures are deliberately ignored. Query-count instrumentation is deferred because adding it cleanly at the Drizzle/D1 boundary would be more invasive than this pass warrants.

For local/Preview inspection, use the browser Network panel for the dashboard document's `Server-Timing` response header and the Worker/local server logs for structured Case-editor timings.

## Performance principle

Optimise in this order:

1. query less data;
2. perform filtering in SQL;
3. bound result sets;
4. parallelise independent reads where safe;
5. consider caching/indexing only after measurements identify a need.

List, dashboard, and detail pages should not share a broad read merely for convenience when their result-shape requirements differ.

## Structural before/after

Before:

- `/admin` fetched up to 100 full production Asset rows, all active production Cases, all active Topics, selected a Case, then loaded full Case-management data, Case questions, stimulus groups, attached/available Assets, and production Case Question rows.
- opening one Case caused `getAdminCaseData()` to fetch the complete active production Case library and locate one row in JavaScript, followed by a second Case query for question-selection settings.

After:

- `/admin` performs four targeted aggregate counts plus one bounded six-row Case summary query; it does not construct a Case editor model or fetch Asset payload rows.
- `getAdminCaseData()` performs one bounded exact-ID Case/primary-Topic/settings query before loading only the relationships required for that Case.

No benchmark numbers are claimed by this pass. The improvement is the structural reduction in rows/columns transferred and server/database work performed per navigation.

## Behaviour intentionally unchanged

This pass does not change:

- Better Auth/session behavior;
- production Admin vs Preview Admin isolation;
- learner Study or `startReview` behavior;
- private R2 delivery or image identity;
- Case editing, Topic routing, question, stimulus, or reusable-image semantics;
- import runtime behavior;
- the data model or migrations.

## Intentionally deferred performance passes

1. Cases + Questions server-side pagination/filtering;
2. Better Auth short-lived session cookie-cache investigation;
3. learner Study/`startReview` read-model optimisation;
4. Case editor lazy-loading/component boundaries;
5. image thumbnail optimisation if measurements justify it;
6. `EXPLAIN QUERY PLAN`/index tuning based on real slow queries.

These should be driven by measurements rather than speculative optimisation.
