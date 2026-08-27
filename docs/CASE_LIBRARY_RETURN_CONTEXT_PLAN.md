# Case Library — Search Persistence / Browser Back Plan

_Status: planning-only supplement for draft PR #104. No application code is implemented here._

_Last updated: 27 August 2026_

## Goal

When an administrator searches or filters `/admin/cases`, opens a Case, and then uses the browser **Back** button, the Case Library should restore the previous working state without requiring the administrator to retype the search.

The browser Back workflow is the primary interaction. This feature should not require a separate in-app `Back to Cases` button to preserve state.

The minimum requested persistence is:

- Case contains (`q`);
- Topic contains (`topic`);
- System contains (`system`).

The preferred persisted working state also includes:

- Tag filter (`tag`);
- sort;
- lifecycle (`active` / `inactive`);
- page.

## Product decision

Keep the current URL-driven Case Library as the server-authoritative filter model, and add browser `localStorage` as a small persistence layer for the Admin's last Case Library working state.

Use a namespaced browser key such as:

```text
flash-cards:admin:case-library-state
```

Example value:

```json
{
  "q": "uveitis",
  "topic": "",
  "system": "Unassigned",
  "tag": "",
  "sort": "case-asc",
  "lifecycle": "active",
  "page": 2
}
```

`localStorage` is chosen instead of `sessionStorage` because cross-tab persistence is desired.

This state stays in the browser only. It is not stored in D1, Cloudflare, or the user account.

## Browser Back is primary

Typical workflow:

```text
/admin/cases?q=uveitis&system=unassigned&page=2
→ open a Case
→ inspect/edit the Case
→ browser Back
→ return to the previous Case Library state
```

The implementation should preserve the browser's native history behavior. Do not add history manipulation that makes Back unpredictable.

The Case Library may still perform a normal client/server navigation or refresh when the browser returns. That is acceptable. The important requirement is that the working filters are restored automatically after the page is reloaded/re-rendered.

Persisted state is only search/filter/navigation state. Case rows and counts must always be re-read from the current server/database state.

## URL and localStorage precedence

Use this precedence:

```text
1. Explicit Case Library query parameters in the URL
   → authoritative for that navigation
   → normalize and save to localStorage

2. No explicit Case Library query parameters
   → restore the last valid localStorage state

3. No valid stored state
   → use the normal Case Library defaults
```

This means browser Back to a filtered URL naturally restores that exact URL state, while localStorage provides resilience for reloads, direct `/admin/cases` visits, and cross-tab workflows.

## What should update localStorage

Update storage after deliberate Case Library state changes, including:

- Search submission;
- Tag filter change;
- sort change;
- pagination;
- Active / Inactive lifecycle change;
- loading an explicit filtered Case Library URL.

Do **not** persist on every keystroke. PR #102 deliberately removed input-driven search/navigation for performance, and this PR should not reintroduce that behavior.

## Clear behavior

`Clear` should clear the remembered working filters as well as the visible filters.

Expected behavior:

```text
Active Clear
→ /admin/cases
→ stored search/filter state reset

Inactive Clear
→ /admin/cases?lifecycle=inactive
→ inactive view remains explicit, other filters reset
```

The exact storage representation is implementation detail as long as the visible behavior is deterministic.

## Refresh behavior

Refreshing the Case Library may still reload/re-run the server read. That is acceptable and desirable because results remain fresh.

After refresh:

- URL filters should repopulate the fields if present;
- otherwise the stored localStorage state should repopulate them;
- the server should execute the Case Library query using the restored normalized state.

The requirement is persistence of the working context, not avoidance of all page reloads.

## Cross-tab behavior

`localStorage` is shared across tabs for the same origin.

Use simple last-write-wins semantics:

```text
Tab A changes Case Library filters
→ saved state updates

Tab B later opens /admin/cases without explicit query state
→ restores the latest saved state
```

Do not add cross-tab locking or conflict resolution.

If useful and simple, a `storage` event listener may update an already-open Case Library tab, but live synchronization is not required for this PR. Cross-tab persistence on subsequent navigation/load is sufficient.

## Direct Case visits

A Case opened directly from a bookmark does not need a propagated `return_query` merely for this feature.

If the administrator later navigates to `/admin/cases`, the last stored Case Library working state may be restored. This is an intentional consequence of choosing persistent cross-tab browser state.

Do not add complex per-entry return-context plumbing unless implementation reveals a separate navigation requirement that localStorage cannot satisfy.

## Validation / safety

Stored browser data is untrusted input.

When restoring from localStorage:

- parse JSON defensively;
- accept only known fields;
- constrain lifecycle to the existing allowed values;
- constrain sort through the existing Case Library allow-list;
- constrain page to a positive integer;
- ignore malformed/unknown values;
- never treat browser storage as authorization or as a substitute for server parsing.

Server-side Case Library parsing and Admin authorization remain authoritative.

## Implementation shape

Prefer a small helper module, for example conceptually:

```text
src/lib/admin-case-library-state.js
```

Responsibilities:

- storage key;
- read/parse/validate stored state;
- write normalized state;
- clear state;
- convert normalized state to URL query parameters if needed.

The Svelte page should use the helper rather than scattering raw `localStorage` access throughout the component.

No schema migration is required.

## Automated coverage

Add focused coverage for at minimum:

- Case / Topic / System values are written after deliberate search submission;
- Tag, sort, lifecycle and page are persisted when changed;
- explicit URL state overrides stored state;
- `/admin/cases` without explicit filters restores valid stored state;
- malformed stored JSON fails safely;
- unknown sort/lifecycle/page values are rejected or normalized;
- `Clear` resets stored filters;
- no per-keystroke persistence/navigation is introduced;
- browser Back-compatible URL behavior remains unchanged;
- inactive lifecycle state is restored correctly.

## Manual verification

Using local development data only:

1. Search by Case title, open a Case, use browser Back, and confirm the Case field is still populated.
2. Repeat for Topic search.
3. Repeat for System search, including `Unassigned` once that filter fix is implemented.
4. Combine Case + Topic + System + Tag filters, open a Case, then use browser Back.
5. Sort and move to page 2+, open a Case, then use browser Back and confirm sort/page context remains.
6. Refresh the Case Library and confirm the working filters remain populated.
7. Open `/admin/cases` in another tab and confirm the last stored working state is available there.
8. Use `Clear` and confirm the stored state is reset.
9. Confirm normal Case results are freshly read from the server after returning/reloading.
10. Confirm browser Back/Forward remains predictable and no custom history manipulation interferes with it.

## Scope boundaries

In scope:

- browser Back-friendly Case Library search persistence;
- cross-tab persistence via localStorage;
- Case / Topic / System search persistence;
- Tag/sort/lifecycle/page persistence where useful;
- focused helper/UI tests.

Out of scope:

- account-level/cloud-synced saved searches;
- named saved-filter presets;
- learner-facing persistence;
- caching Case results in localStorage;
- avoiding every page refresh/navigation;
- replacing server-side Case Library filtering with client-only filtering;
- complex history rewriting.

## Acceptance criteria

The feature is complete when an administrator can filter the Case Library, open a Case, use the browser Back button, and have the Case / Topic / System search state restored automatically even if the Case Library reloads; the same last working state is also available across tabs on the same browser/origin, while Case results themselves remain freshly loaded from the server.
