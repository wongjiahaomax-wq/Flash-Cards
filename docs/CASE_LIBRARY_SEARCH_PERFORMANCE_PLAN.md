# Case Library Search / Filter Performance

_Status: **implemented and merged in PR #102** (`96d416704b532efd60e3a55c076bf465f317557a`). This document records the focused interaction/read-path performance change._

_Last reconciled: 28 August 2026_

## Problem that was addressed

The Admin Case Library previously auto-submitted its GET filter form after a 300 ms debounce while typing into the Case, Topic, and System text filters. Normal typing could therefore trigger repeated SvelteKit navigations and repeated server/database reads.

The active server path also loaded compatible Concept taxonomy twice: once inside the Case Library read model and once again for Topic assignment options.

## Implemented interaction behavior

For the text filters:

- Case contains;
- Topic contains;
- System contains;

typing now remains local and causes no navigation.

Submission behavior is:

```text
Enter in a text filter
or
explicit Search action
→ submit the current combined GET filter form
```

Tag selection may continue to submit intentionally on `change`; it is a single deliberate selection rather than a stream of keystrokes.

The implementation preserves:

- normal GET/URL-driven server authority;
- lifecycle and non-default sort state;
- page-1 reset for a newly submitted filter set;
- Clear behavior;
- keyboard/label/form semantics;
- normal browser Back/Forward behavior.

A longer debounce was deliberately **not** used. The goal was to remove navigation while the Admin is composing text.

## Implemented read-path reduction

The active Case Library path now avoids the previous duplicate Concept-taxonomy supporting read.

`getCaseLibraryPage()` already requires the compatible taxonomy result for Case filtering/sorting/enrichment. Topic assignment options are now derived/reused from that same authoritative result rather than loading active taxonomy again through a separate supporting read.

The inactive recovery view does not construct active Topic assignment options because the UI cannot use them.

The implementation intentionally preserves:

- `concept-taxonomy-compat.ts` pre-migration-0015 behavior;
- the taxonomy read still required for Case Topic/System display/filtering/sorting;
- lifecycle-correct lightweight Tag option reads;
- `admin-case-library-read` server timing.

## What was deliberately not added

This change did **not** introduce:

- a Worker/global cache;
- cache invalidation infrastructure;
- a speculative database index;
- a schema migration;
- client-authoritative whole-library filtering;
- client caching of Case result rows.

The repository's performance rule remains: **query less / deduplicate work first; cache or index only after measurement shows a need.**

## Behavioral invariants preserved

The implementation preserves:

- server-authoritative URL-query filtering;
- Active / Inactive lifecycle semantics;
- Production/Preview ownership boundaries;
- Case / Topic / System / Tag matching semantics;
- sorting and pagination;
- inactive Tag context;
- inline + bulk Case Tag curation;
- active bulk Primary Topic assignment;
- Case deactivate/restore behavior;
- Admin authorization;
- pre-migration-0015 taxonomy compatibility.

## Validation contract

Focused coverage records at least these invariants:

- text input does not auto-submit;
- Enter and explicit Search submit combined filters;
- Tag change remains intentional;
- lifecycle/sort state is preserved and a new filter submission starts at page 1;
- Active/Inactive filter behavior remains correct;
- active Case Library no longer performs the duplicate taxonomy supporting read;
- inactive view does not perform the unused active Topic-option construction;
- Tag options remain correct in both lifecycle views;
- Production/Preview and taxonomy-compatibility boundaries remain intact.

## Relationship to later work

PR #102 is the merged baseline for the focused search/read-path optimization.

Later Case Library UX work may add persistence, additional filters, classification actions, or other conveniences, but should preserve this baseline unless a measured replacement is deliberately designed:

```text
no navigation while composing Case/Topic/System text
server remains authoritative for results
avoid duplicate supporting reads before considering caches
```

## Authority

For current behavior, use:

1. current `src/routes/admin/cases/**` and `src/lib/server/db/case-library.js` implementation/tests;
2. `PERFORMANCE_AND_READ_MODEL_PLAN.md` for broader performance principles;
3. this document for PR #102's focused design rationale;
4. PR #102 history for implementation/review context.
