# Case Library Search / Filter Performance Plan

Status: planning only. No production behavior is changed by this document.

## Problem

The Admin Case Library currently auto-submits its GET filter form after a short debounce while typing into the Case, Topic, and System text filters. That creates repeated SvelteKit navigations and repeated server/database reads during normal typing, which is perceptibly laggy.

Current page behavior also reloads supporting filter-option data on each Case Library navigation even when that supporting data is unchanged for the current lifecycle view.

## Goal

Make Case Library filtering feel immediate while preserving the current server-authoritative filtering, lifecycle, pagination, sorting, Production/Preview ownership, and Case Tag semantics.

This plan intentionally has two stages that should ship together in one focused implementation PR.

## Stage 1 — stop search-on-every-keystroke

For the text filters:

- Case contains
- Topic contains
- System contains

remove automatic form submission from each `input` event.

Required UX:

- typing stays local and does not navigate;
- pressing Enter in any text filter submits the current filter form;
- provide one explicit `Search` / `Apply filters` submit action;
- retain `Clear` behavior;
- keep the Tag select simple and predictable. It may continue to auto-apply on change if that remains the clearest UX, but text typing must not trigger navigation;
- preserve the current lifecycle and sort query parameters when submitting;
- a new search should return to page 1 rather than carrying a stale page number;
- maintain keyboard and accessibility semantics for labels, form submission, and focus.

Do not replace this with a longer debounce. The purpose is to eliminate background navigation while a user is composing text.

## Stage 2 — avoid unnecessary supporting-data reloads

The Case Library load currently needs three conceptual read products:

1. the filtered/paginated Case result set;
2. Case Tag filter/editor options;
3. Topic/System taxonomy options used by Case Library controls.

The implementation should inspect current SvelteKit and repository conventions and reduce avoidable repeated work without weakening correctness.

Preferred direction:

- keep the filtered/paginated Case result server-authoritative;
- avoid recomputing/refetching static or lifecycle-stable supporting option data on every text/sort/page navigation when a repository-supported cache/load boundary can safely reuse it;
- if SvelteKit layout-load composition is a clean fit, consider moving stable Admin Case Library option data to an appropriate parent/layout load so child query changes do not force redundant reads;
- otherwise use a small server-side caching/read-model approach only if it is safe for Cloudflare/D1 and cannot serve stale authorization-sensitive or mutation-sensitive data incorrectly;
- do not introduce a broad application caching framework for this narrow issue;
- do not cache filtered Case result pages across users/queries unless current repository architecture clearly supports it;
- Case Tag/Topic option freshness after Admin mutations must remain coherent. If mutation invalidation is required, make it explicit and test it.

The coding agent must measure/inspect current load behavior before choosing the exact implementation. The target is fewer D1 reads and less repeated taxonomy work on ordinary filter/sort/page navigation, not caching for its own sake.

## Important current behavior to preserve

- Active / Inactive lifecycle tabs and Production-only Case Library boundaries.
- Current Case/Topic/System/Tag filter semantics.
- Current sorting and pagination semantics.
- Inactive Tag-context behavior.
- Inline Case Tag editing and bulk Tag management on active Cases.
- Bulk Topic assignment.
- Case deactivate/restore actions.
- Existing URL-query-driven navigation so filtered views remain linkable/bookmarkable.
- Current server-side authorization checks.

## Performance instrumentation

The current Case Library load already uses server timing instrumentation. Retain it and, if useful, split the timing into enough named sub-operations to demonstrate whether Stage 2 reduced repeated supporting-data work.

Do not add noisy production logging solely for this change.

## Testing

Add focused tests covering at minimum:

- typing into each text field does not submit automatically;
- Enter submits the current combined text filters;
- explicit Search/Apply submits all current filters;
- Tag change behavior remains intentional and tested;
- lifecycle and sort parameters are preserved correctly;
- a new filter submission resets pagination to page 1;
- Clear keeps the intended lifecycle behavior;
- no regression in server filter parsing;
- no regression in Case/Topic/System/Tag filtering;
- no regression in Active/Inactive Case Library behavior;
- Stage-2 option-data reuse/caching/invalidation semantics are covered according to the chosen architecture;
- supporting option data is refreshed after relevant mutations if it can otherwise become stale.

Run the repository-defined validation appropriate to the changed files.

## Scope boundaries

In scope:

- `/admin/cases` text-filter interaction;
- Case Library load/read efficiency directly related to filtering/navigation;
- focused tests and documentation.

Out of scope:

- changing Case Library filter semantics;
- changing taxonomy or Tag models;
- full-text search infrastructure;
- fuzzy search;
- client-side loading of the entire Case corpus;
- global application caching infrastructure;
- schema/index migrations unless profiling demonstrates a concrete query bottleneck that cannot be solved by the two changes above;
- unrelated Case Library redesign.

## Implementation sequence

1. Inspect current main and open PRs touching `/admin/cases`, Case Library read models, taxonomy loading, Tag options, or SvelteKit Admin layouts.
2. Read repository guidance and current Case Library tests.
3. Capture the current navigation/load/read path.
4. Implement Stage 1 first and verify no automatic text-search submission remains.
5. Implement Stage 2 using the narrowest safe reuse/load-boundary approach supported by the current architecture.
6. Add focused tests.
7. Run repository validation.
8. Keep the implementation PR draft until validation and review are complete.

## Success criteria

- text entry in Case/Topic/System filters is smooth and causes zero server navigation until the user submits;
- URL-based filter state remains intact;
- filtering results remain server-authoritative and semantically unchanged;
- ordinary filter/sort/page navigation performs less redundant supporting-data work than the current baseline;
- option data does not become incorrectly stale after relevant Admin mutations;
- no Production/Preview, lifecycle, Tag, taxonomy, or bulk-action invariant regresses.
