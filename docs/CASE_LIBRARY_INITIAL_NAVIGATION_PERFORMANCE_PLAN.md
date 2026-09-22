# Admin Case Library — filter restoration and small load optimization

Status: implementation plan for Draft PR #198. No application code has been changed yet.

## Problem and evidence

The 22 September 2026 HAR shows a normal Admin → Cases visit first requesting unfiltered `/admin/cases/__data.json` (2.47 s; 60 of 313 active Cases), followed by client-side saved-filter restoration and a second request for `/admin/cases?system=__unassigned__` (2.70 s; 18 Cases). The incorrect first list briefly appears. The existing `admin-case-library-read` timing was ~1.1 s for each request. One HAR cannot identify which SQL statement is slow or establish representative latency.

Current cause: the Admin sidebar links to bare `/admin/cases`; `src/routes/admin/cases/+page.svelte` restores localStorage state in `onMount`, after the first page data has loaded.

## Implement in this same PR

1. **Fix the normal Admin sidebar navigation.** Before navigating to Cases from the hydrated Admin UI, resolve its destination from the existing validated saved-state/URL helpers so the first Cases request already carries the remembered filter. The link must reflect the latest state within the same tab, not just what was stored when the Admin layout mounted. Prefer a small change to existing components/helpers; no new persistence, global navigation interception, or server/client synchronization architecture.

   Preserve explicit filtered/default URLs, Clear, Active/Inactive, sorting, pagination and editor return context. The existing bare-URL `onMount` fallback may remain for direct hard loads: the server cannot read localStorage, so eliminating its initial unfiltered HTTP request is **not** a requirement for this PR. Do not add SSR masking, loading gates, cookies, or server-side storage solely for that path. If a direct bare URL still briefly shows unfiltered rows, document it as a remaining limitation rather than expanding this fix.

2. **Trim the list-only query.** Verify that `vignetteMd` is unused by the Case Library list and its consumers, then remove it only from `getCaseLibraryPage()`'s row selection. Do not change Case Editor or learner data.

3. **Check outcome; no speculative SQL changes.** On the same representative saved-filter navigation, confirm that only the filtered Cases request occurs, no incorrect rows flash, and the list still functions. Compare the existing `admin-case-library-read` timing and response size if readily available. The remaining ~1.1 s read is a separate possible follow-up; **do not** add query-level instrumentation, rewrite recursive SQL, introduce caching, migrations, or other performance architecture in this PR.

## Focused acceptance and handoff

Use one focused real-browser regression (or extend an existing suitable browser test) for Admin sidebar → remembered Unassigned filter: assert the first Cases data/navigation request is filtered and the unfiltered list is never shown. Smoke-check Clear and an explicit filtered URL. Use focused existing Case Library tests for list-row compatibility, then repository-required handoff validation. Report actual results, remaining direct-hard-load limitation and exact-head CI. Preserve Draft state; do not merge or deploy.
