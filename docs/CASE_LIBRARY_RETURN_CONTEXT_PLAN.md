# Case Library — Return Context / Search Persistence Plan

_Status: planning-only supplement for draft PR #104. No application code is implemented here._

_Last updated: 27 August 2026_

## Goal

When an administrator filters `/admin/cases`, opens a Case, and then returns to the Case Library, restore the previous Case Library context instead of forcing the administrator to re-enter search terms.

The minimum requested behavior is persistence of the three text fields:

- Case contains;
- Topic contains;
- System contains.

The preferred behavior is to restore the **complete Case Library view context** because that state is already URL-driven and the additional state is useful during curation:

- Case search (`q`);
- Topic search (`topic`);
- System search (`system`);
- Tag filter (`tag`);
- sort;
- lifecycle (`active` / `inactive`);
- page.

This should be navigation-context persistence, not a new global preference system.

## Current behavior inspected

The Case Library already serializes its current server-authoritative state in the URL and has a `currentQuery()` helper that includes the active filters, sort, lifecycle and page.

However, Case row links currently navigate only to:

```text
/admin/cases/<caseId>
```

or, for inactive Cases:

```text
/admin/cases/<caseId>/recovery
```

The active Case editor header currently links `All Cases` directly to:

```text
/admin/cases
```

and the inactive recovery page links directly to:

```text
/admin/cases?lifecycle=inactive
```

Therefore the Case Library URL state is discarded as soon as the administrator enters a Case and uses the page's own return link.

There is a second implementation consideration: many Case-editor mutations redirect back to `/admin/cases/<caseId>?status=...`. A return-context mechanism must survive those redirects as well, otherwise the context would disappear after editing the Case before returning to the library.

## Recommended interaction

Example:

```text
/admin/cases?q=uveitis&topic=eye&system=unassigned&page=2
```

The administrator opens a Case.

The Case editor should know that its return destination is conceptually:

```text
/admin/cases?q=uveitis&topic=eye&system=unassigned&page=2
```

The header should then show:

```text
[Back to Cases]
```

and that action returns to the same filtered page with the fields repopulated from the URL.

If the Case was opened without Case Library context, fall back safely to the current ordinary destination:

```text
/admin/cases
```

For inactive recovery, the fallback remains:

```text
/admin/cases?lifecycle=inactive
```

## State transport

Prefer explicit URL/route state over `localStorage` as the primary mechanism.

A suitable implementation can append a validated return-context value to Case links, for example conceptually:

```text
/admin/cases/<caseId>?return_query=<encoded Case Library query>
```

or an equivalent safe representation.

Exact parameter naming is implementation detail.

### Why not make localStorage the primary authority

A browser-stored "last Case search" can become stale and can affect Cases opened from unrelated routes, bookmarks, or direct links.

The URL already represents the Case Library's authoritative state. Passing that context explicitly gives predictable behavior:

```text
Case opened from filtered library
→ return to that filtered library

Case opened directly
→ ordinary All Cases fallback
```

Browser/session storage may be used only as a narrow enhancement if implementation proves it useful, not as the sole or authoritative state source.

## Security / validation requirement

Do not accept an arbitrary external return URL.

The return context must resolve only to the local Case Library route. Prefer storing/validating query parameters rather than trusting a complete user-supplied URL.

At minimum:

- destination path is fixed to `/admin/cases`;
- only known Case Library query parameters are retained;
- unexpected parameters are discarded;
- no external origin or protocol can be supplied;
- lifecycle values remain constrained by the existing parser.

This avoids introducing an open-redirect surface.

## Preserve context through Case editor mutations

Opening the Case is not enough. The return context must remain available after normal authoring actions that redirect back to the Case editor.

Examples include:

- Case metadata save;
- Topic changes;
- Case Tag changes;
- vignette save;
- question create/edit/remove/reorder;
- image/stimulus mutations;
- reusable image-question mutations;
- Primary Topic → System placement.

The implementation should centralize preservation rather than independently rebuilding query strings in every action where possible.

Conceptually:

```text
Case editor URL
/admin/cases/<id>?return_query=...

POST mutation
→ redirect to /admin/cases/<id>?status=...&return_query=...

Back to Cases
→ /admin/cases?<restored query>
```

Status/image-picker/editor-local query parameters must remain separate from the Case Library return context.

## Active and inactive behavior

Support both library lifecycle views.

### Active

Opening from an active filtered library should return to the exact active view.

### Inactive

Opening a recovery page from a filtered inactive library should preserve:

- `lifecycle=inactive`;
- filters;
- sort;
- page.

If no explicit return context exists, keep the existing inactive fallback.

## Browser Back

Normal browser Back should continue to work naturally.

This feature is specifically for the in-app `Back to Cases` / return link and for cases where mutations have changed browser history while the Case editor is open.

Do not implement history manipulation that breaks the browser's native Back behavior.

## Relationship to PR #104

This is a third focused Case Library usability improvement alongside:

1. correct `Unassigned` System filtering;
2. quick Topic creation;
3. persistent Case Library return context.

It fits the same PR because all three target the current Case Library curation loop and share URL/filter state, but implementation should remain modular and avoid a broad Case Library redesign.

## Automated coverage

Add focused coverage for at minimum:

- Case row link carries the current Case Library return context;
- Case / Topic / System search terms are restored after returning;
- Tag, sort, lifecycle and page are also retained when present;
- no-filter Case links still have a sensible fallback;
- inactive recovery preserves inactive library context;
- the Case editor return link uses only a validated `/admin/cases` destination;
- unknown/malformed return parameters fail closed to the ordinary Case Library;
- Case editor POST/redirect flows preserve return context;
- status parameters do not overwrite or corrupt return context;
- existing Case Library Search/Clear semantics are unchanged.

A source-contract test is acceptable for stable link/form wiring, supplemented by focused helper/unit tests for sanitization/query reconstruction.

## Manual verification

Using local development data only:

1. Search by Case title, open a Case, click Back to Cases, and confirm the Case field is still populated and results are unchanged.
2. Repeat for Topic search.
3. Repeat for System search, including `Unassigned` once Part A is implemented.
4. Combine Case + Topic + System + Tag filters and verify all return.
5. Sort and move to page 2+, open a Case, return, and confirm the same sort/page is restored.
6. Open a Case, perform at least one edit that redirects back to the Case editor, then click Back to Cases and confirm context still survives.
7. Repeat from the inactive recovery library.
8. Open a Case directly from a bookmark/direct URL and confirm Back to Cases falls back safely instead of using unrelated stale search state.
9. Verify browser Back remains normal.

## Scope boundaries

In scope:

- Case Library → Case editor → Case Library navigation context;
- active and inactive Case Library context;
- preservation through Case-editor redirects;
- safe query parsing/reconstruction;
- focused tests.

Out of scope:

- global remembered filters across unrelated future visits;
- account-level saved searches;
- named saved-filter presets;
- browser-local search history UI;
- learner-facing persistence;
- replacing URL-driven Case Library state with client-only storage.

## Acceptance criteria

The feature is complete when an administrator can filter the Case Library, open and edit a Case, then use the in-app return action and land back on the same Case Library view without retyping the Case, Topic or System searches, while preserving the rest of the useful URL-driven list context and safely falling back for direct Case visits.
