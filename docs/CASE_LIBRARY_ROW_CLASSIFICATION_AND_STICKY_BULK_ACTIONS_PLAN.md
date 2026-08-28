# Case Library — Row Classification Editing + Sticky Bulk Actions

_Status: implemented in draft PR #104; automated validation and manual UX review remain part of handoff._

_Last updated: 28 August 2026_

## Context

PR #104 originally added:

- explicit `Unassigned` System filtering;
- Case Library search/filter persistence through browser `localStorage`;
- quick global Topic creation and optional create-and-bulk-assign from `/admin/cases`.

During manual review, two follow-up UX needs were agreed for the same PR:

1. edit one active Case's canonical classification from its Case Library row;
2. keep the existing bulk action toolbar available while scrolling long Case lists.

This remains a Case Library UX extension, not a taxonomy redesign.

## Domain decisions retained

The governing model remains:

```text
Case
└── exactly one canonical Primary Topic
    └── System is derived from that Topic's taxonomy ancestry
```

Therefore:

- System is not an independent Case relationship;
- the row editor changes only the canonical Primary Topic;
- the System selector is only a Topic-navigation/filter control;
- changing the selector does not mutate the Case or taxonomy;
- the displayed System is re-derived from the selected Topic ancestry;
- Case Tags remain unrelated cross-cutting metadata;
- Additional Study Topics remain retired;
- no Case→System schema or migration is introduced.

Changing a Topic's parent/System remains a global taxonomy operation and is intentionally unavailable from an individual Case row.

## Implemented row-classification UX

Active Case rows now expose one `Edit classification` interaction in the Topic area. Inactive recovery rows remain read-only for ordinary classification and do not expose this editor.

The editor shows:

- Case title;
- current canonical Topic;
- current derived System;
- a System navigator;
- a breadcrumb-aware Topic selector;
- `+ New Topic`;
- Cancel and Save controls.

Escape closes the interaction, the explicit close/cancel controls restore trigger focus, and server errors are surfaced inside the editor.

### Shared taxonomy option model

No per-row taxonomy read was added.

The editor reuses the active taxonomy data already returned by the bounded `/admin/cases` read model introduced before this extension:

- `pageData.topicOptions` supplies active Topics with breadcrumbs;
- `pageData.topicParentOptions` supplies active System/Topic parent choices;
- each visible Case row already includes its canonical `conceptId`, Topic name, and derived System name.

One shared client helper resolves Topic→System context and filters the shared option set for all row editors.

### System selector semantics

The System selector offers:

- `Unassigned`;
- active real Systems.

For a real System, the Topic selector includes only active Topics whose breadcrumb resolves beneath that System.

For `Unassigned`, the Topic selector includes only active Topics with no System anywhere in their ancestry, including nested Topics whose ancestor chain consists only of other unassigned Topics.

Breadcrumb labels remain visible so nested and similarly named Topics are distinguishable.

When the System context changes and the selected Topic no longer belongs to that context, the Topic selection is cleared instead of retaining an incompatible hidden value.

No System value is submitted to the mutation endpoint.

## Primary Topic save path

Saving an existing Topic uses the existing canonical `promoteCaseTopic(...)` domain operation.

That authority already:

- requires an active Production Case;
- requires an active Topic through the taxonomy compatibility layer;
- requires one existing canonical Primary Topic before replacement;
- performs a no-op when the selected Topic is already canonical;
- replaces only the canonical Primary Topic;
- does not create an Additional Study Topic;
- handles a target Topic that exists as a legacy secondary row without creating a duplicate;
- leaves unrelated Case Tags untouched;
- rejects Preview-owned Cases through the Production Case guard.

The Case Library route remains thin and performs no direct taxonomy SQL.

## New Topic from the row editor

`+ New Topic` reuses the PR #104 `createCaseLibraryTopic(...)` authority with exactly the edited Case ID.

This preserves the existing rules for:

- Topic name validation;
- deterministic unique slug generation;
- `kind = topic`;
- active parent validation;
- System / Topic / explicit Unassigned placement;
- graph/cycle validation;
- Production-only Case assignment;
- pre-migration-0015 compatibility.

The selected System context also constrains the parent choices shown in the nested creator. A real System offers that System and Topics beneath it; `Unassigned` offers explicit Unassigned placement and unassigned Topic parents.

The existing domain operation validates the Case before Topic creation and uses a D1 batch where available. Its non-batch fallback compensates Case relationship writes and removes the Topic on failure, so the row workflow does not introduce an orphan Topic after failed assignment.

## Sticky bulk actions implementation

The existing active and inactive bulk action surfaces now use normal CSS sticky positioning. No scroll-position JavaScript and no duplicated floating toolbar were introduced.

The active runtime toolbar still contains:

- selected Case count;
- shift-click hint on wider layouts;
- Topic selector;
- Assign Topic;
- New Topic;
- Manage Tags;
- Deactivate selected.

The inactive runtime toolbar retains only its existing Restore workflow.

The active and inactive markup are mutually exclusive lifecycle branches, so there is one interactive toolbar in document/focus order at runtime.

### Sticky offset and layering

The Admin header is normal-flow rather than fixed/sticky, so the toolbar uses a small content-safe viewport gutter instead of `top: 0`:

```text
position: sticky
top: 0.75rem
z-index: 12
```

On narrow screens the gutter reduces to `0.5rem`.

The sticky surface is opaque, bordered, and shadowed so Case rows do not bleed through it. Case rows also receive scroll margin to reduce the chance of keyboard/focus navigation placing them behind the pinned action surface.

The Case table header was not made sticky.

### Narrow layouts

The existing flex toolbar remains a single wrapping surface. At narrow widths:

- the summary occupies its own row;
- the shift-click hint is hidden to reduce sticky height;
- the Topic control uses the available width;
- embedded New Topic / Tag controls retain their existing responsive behavior;
- no horizontal page-scrolling workaround is introduced.

## Performance and persistence constraints preserved

This extension does not change Case Library filtering, pagination, sorting, or browser persistence semantics.

In particular it does not:

- perform a taxonomy read per visible Case;
- cache Case result rows in `localStorage`;
- reintroduce per-keystroke navigation;
- move server-authoritative filtering/pagination into the browser;
- add a Case→System write path.

PR #102's bounded read-model approach remains intact.

## Automated coverage added

Focused coverage now checks:

- System-context Topic filtering for real Systems;
- nested `Unassigned` Topic filtering;
- breadcrumb labels;
- System-scoped parent choices for row-level Topic creation;
- active-only row classification controls;
- current Case/Topic/System context in the editor;
- incompatible Topic invalidation on System change;
- absence of a System field in the mutation contract;
- reuse of `promoteCaseTopic(...)` for existing Topic assignment;
- reuse of `createCaseLibraryTopic(...)` for atomic single-Case create-and-assign;
- structural preservation of Case Tags by the Primary Topic mutation path;
- sticky positioning, non-zero top offset, opaque layering, and narrow-screen wrapping;
- mutually exclusive active/inactive toolbar branches and existing disabled-state behavior.

Existing Admin content tests remain the executable authority for canonical Primary Topic replacement, legacy secondary compatibility, invalid-selection rollback, and the retired Additional Study Topic contract.

## Manual UX verification still required

Use local/test data only.

1. Open Edit classification for an active Case currently under an Unassigned Topic.
2. Select a real System and verify Topic options are restricted to that System hierarchy.
3. Select Unassigned and verify only unassigned Topic hierarchies appear.
4. Reassign a Case from an Unassigned Topic to a Topic under a real System and confirm the displayed System changes after refresh/invalidation.
5. Reassign between two Topics in the same System.
6. Create a new Topic from the row editor and make it canonical without leaving `/admin/cases`.
7. Confirm existing Case Tags remain unchanged.
8. Confirm inactive Cases expose no ordinary Edit classification control.
9. Select Cases, scroll far down, and verify Bulk Case actions remains visible.
10. Add selections farther down and verify the selected count updates.
11. Use Assign Topic, New Topic, Manage Tags, and Deactivate while the toolbar is pinned.
12. Verify the inactive Restore toolbar remains available while scrolling.
13. Verify the sticky surface does not overlap Case row controls or visually bleed into rows.
14. Verify keyboard focus, Escape, close, and error feedback in the classification editor.
15. Verify laptop and narrow-screen layouts, especially toolbar wrapping and popover usability.

## Out of scope retained

This PR still does not implement:

- a Case→System relationship;
- Topic-parent/System mutation from a Case row;
- taxonomy drag/drop or hierarchy administration;
- a redesign of `/admin/topics`;
- Additional Study Topics;
- learner-facing changes;
- Preview taxonomy mutation;
- any schema migration;
- a sticky table header.

## Acceptance state

The code implementation is complete when repository validation is green and the manual checklist above has been performed by the user on a real browser/local test dataset.

The durable semantic distinction remains:

```text
Topic  = canonical educational home
System = derived navigation ancestry
Tag    = cross-cutting Case metadata
```
