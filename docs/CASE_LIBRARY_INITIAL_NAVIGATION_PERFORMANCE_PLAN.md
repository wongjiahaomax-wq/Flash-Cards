# Admin Case Library — initial navigation and read performance

Status: implementation plan for this Draft PR. No application-code change is implied by adding this document.

## Observed behavior and baseline

The 22 September 2026 browser HAR records opening the Cases page from Admin with a previously remembered Unassigned System filter:

- First request: `GET /admin/cases/__data.json?x-sveltekit-invalidated=001`, **without a System filter**; 2,472 ms total, 1,090 ms `admin-case-library-read`; response size ~81 KB. This unfiltered page contains 60 Cases (page 1) out of 313 active Cases.
- After the unfiltered content appears, client `onMount` reads persisted Case Library state and calls `window.location.replace('/admin/cases?system=__unassigned__')`.
- Second request: `GET /admin/cases?system=__unassigned__`, 2,702 ms total, 1,074 ms `admin-case-library-read`; response size ~193 KB and 18 filtered Cases.
- No failed requests or meaningful uncached JS/CSS transfer in the capture.

These are timings for one recorded navigation, not a general latency benchmark. The HAR proves the duplicate navigation and reports server read timing; it does not isolate individual SQL statements or client paint timestamps.

Relevant current implementation: `src/routes/admin/+layout.svelte` has a bare Cases sidebar link; `src/routes/admin/cases/+page.svelte` restores saved state in `onMount` after the first page is rendered; `src/lib/admin-case-library-state.ts` contains validated storage/URL helpers; the route loader and `getCaseLibraryPage()` perform the bounded database read.

## Tranche A — remove the unfiltered flash and redundant normal navigation

Goal: the normal hydrated Admin sidebar Cases link resolves the last saved Case Library URL **before** fetching or displaying the Cases page. Reuse the existing stored-state and canonical URL helpers; do not introduce another persistence mechanism.

- Preserve the current rule: explicit Case Library URL parameters win over stored state, including explicit default values; Clear intentionally removes stored state and shows all Cases; action failures must not trigger restoration; pagination, sorting, lifecycle, editor-return query, and Back navigation must retain their behavior.
- Keep the sidebar target current when working state changes within the same browser tab; do not rely only on a `storage` event (which does not fire in the writing tab). Avoid preloading the unfiltered target while the saved filtered target is known.
- For a direct hard navigation to bare `/admin/cases`, the server cannot read browser-only localStorage. Preserve the existing restoration behavior, but **do not render an incorrect unfiltered Case list while restoration is pending**. Do not claim that the initial unfiltered HTTP request can always be avoided on a hard navigation without changing the persistence boundary.
- Avoid blanking or hiding correctly filtered explicit URLs, including the case where browser storage is absent, disabled, malformed, or stale.

Executable acceptance: a real-browser test seeds saved `system=__unassigned__`, enters from a different Admin route, and verifies that no unfiltered Case rows become visible and no unfiltered Cases data request is sent during the ordinary hydrated sidebar navigation. Test direct bare entry has no incorrect list flash; explicit filtered URL and Clear each take precedence and show the intended data. Keep the fixture focused; no production mutation.

## Tranche B — reduce unnecessary list payload

- `getCaseLibraryPage()` currently selects `cases.vignetteMd` into the Case Library rows, but the Cases list component does not display or use that field. Remove it **from this list-specific select only**, after checking that no dependent list consumer/test needs it. Do not remove the field from the Case Editor or study path.
- Record before/after transfer sizes for the same filtered and unfiltered fixture where feasible. Do not claim speed gains from bytes alone without measuring.

Executable acceptance: existing Case Library filtering, pagination, inline edits, dates, selection, and editor navigation remain unchanged; a focused test asserts the Case Library row payload excludes `vignetteMd` if that is not part of the list contract.

## Tranche C — profile remaining filtered-read latency; optimize only if supported

After A and B, measure the **single** filtered navigation under comparable conditions. The HAR reports ~1.07–1.09 s `admin-case-library-read`, but does not reveal which operation dominates.

- Start from the existing server-timing signal and the current route/database implementation. Measure taxonomy read, filtered count, paginated Case retrieval, page enrichment, and tag options only to the extent needed to locate a material delay. Keep instrumentation bounded and avoid logging personal content, credentials, or unnecessarily verbose diagnostics.
- The Unassigned System predicate currently repeats a recursive ancestry lookup in the count and row queries. If profiling identifies it as material, propose/implement the smallest **semantics-preserving** query simplification supported by the current schema; verify nested Topics, assigned/unassigned Systems, active/inactive taxonomy, totals, pagination and sort behavior against the original.
- Do not introduce a new cache, data-model denormalization, migration, background processing, or broad query refactor without a demonstrated bottleneck and concrete benefit. If the remaining duration is mainly outside the database read, report that instead of optimizing SQL speculatively.

Executable acceptance: compare representative before/after single-navigation timings and request/response sizes, including the original Unassigned filter, and document any remaining server-vs-network latency without promising a specific numeric target.

## Execution/handoff

Continue **this same Draft PR** in tranches; keep changes scoped to Admin Cases navigation/read performance. Inspect the actual current branch and repository-owned progressive-retrieval guidance before edits. Use focused tests during iteration and repository-required handoff validation, including real-browser navigation/network acceptance for Tranche A. Report actual measured results and exact-head CI. Do not merge, deploy, or mark Ready for Review.
