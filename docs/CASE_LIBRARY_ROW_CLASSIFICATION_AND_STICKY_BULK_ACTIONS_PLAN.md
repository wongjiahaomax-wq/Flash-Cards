# Case Library — Row Classification Editing + Sticky Bulk Actions

_Status: agreed PR #104 UX extension; documented but not yet implemented._

_Last updated: 28 August 2026_

## Context

PR #104 already implements the first Case Library improvements around:

- explicit `Unassigned` System filtering;
- Case Library search/filter persistence through browser `localStorage`;
- quick global Topic creation and optional create-and-bulk-assign from `/admin/cases`.

During manual UX review of the active Case Library, two additional usability needs were identified:

1. row-level classification should be editable directly from the Case Library in the same spirit as the existing row-level `Edit tags` interaction;
2. the `Bulk Case actions` toolbar should remain visible while the administrator scrolls through a long Case list.

This document records the agreed product semantics and implementation constraints for those additions. It is an extension of PR #104, not a taxonomy redesign.

---

# Part A — Row-level Edit classification

## Product goal

From an individual Case row, the administrator should be able to change that Case's canonical classification without opening the full Case editor or the global Systems & Topics workspace.

The interaction should feel similar to the existing row-level `Edit tags` control: a compact, local modal/popover that preserves the Case Library context.

The visible table currently shows separate Topic and System columns. The important domain rule is:

```text
Case
└── exactly one canonical Primary Topic
    └── System is derived from that Topic's taxonomy ancestry
```

Therefore **System is not an independent Case relationship and must not become a second source of truth.**

## Do not implement an independent "change this Case's System" write

A System displayed for a Case is derived from the Case's Primary Topic ancestry.

Changing the parent/System of the Topic itself would be a **global taxonomy mutation** and could alter the displayed System for every Case using that Topic. A row-level Case control must not silently perform that operation.

Accordingly:

- the row editor changes the Case's **Primary Topic**;
- the System control inside the editor is a **navigator/filter for eligible Topics**;
- after the Primary Topic is changed, the row's System value is re-derived from the selected Topic's ancestry;
- no independent Case→System relationship is created;
- no taxonomy parent is changed by this row-level workflow.

## Row trigger

Provide a small classification edit affordance in the Topic/System area of each active Case row.

Preferred presentation is intentionally lightweight, for example:

```text
TOPIC                                   SYSTEM
Anterior uveitis  [Edit]                Eye
```

or equivalent.

If it is visually clearer, both the Topic and System cells may expose an edit affordance, but **both must open the same `Edit classification` interaction**. Do not create two separate mutation models called `Edit Topic` and `Edit System`.

The exact button placement is implementation detail. The stable product concept is one Case-classification editor.

## Modal / popover

Opening the control should show a compact modal/popover such as:

```text
Edit classification
Allergic conjunctivitis

System
[ Eye ▼ ]

Topic
[ Conjunctivitis ▼ ]

[ + New Topic ]

                         Cancel   Save
```

The interaction should show enough current context to avoid accidental reassignment:

- Case title;
- current derived System (`Unassigned` when there is no System ancestor);
- current Primary Topic;
- hierarchy-aware Topic label/breadcrumb where needed.

## System selector semantics

The System selector is a **Topic-navigation filter**, not a persisted Case field.

It should offer:

- `Unassigned`;
- active Systems.

Selecting a real System should constrain the Topic chooser to active Topics whose ancestry resolves under that System.

Example:

```text
System = Eye

Topic choices:
Eye → Conjunctivitis
Eye → Uveitis
Eye → Uveitis → Anterior uveitis
Eye → Uveitis → Posterior uveitis
```

Display Topic labels with sufficient breadcrumb context to distinguish nested or similarly named Topics.

Selecting `Unassigned` should show active Topics that do not resolve to a System ancestor, including Topics nested under other unassigned Topics.

Changing only the System filter does **not** mutate anything. Save requires a valid Topic selection.

If changing the System filter makes the currently selected Topic ineligible, clear or otherwise visibly invalidate the Topic selection rather than silently keeping an incompatible hidden value.

## Topic selector semantics

The Topic selector chooses the Case's new canonical Primary Topic.

On Save:

- validate the Case as an active Production Case;
- validate the selected Topic as active and eligible under the existing taxonomy authority;
- replace only the Case's canonical Primary Topic;
- finish with exactly one behaviorally active Primary Topic;
- do not create Additional Study Topic / secondary relationships;
- preserve unrelated Case Tags;
- leave the global taxonomy hierarchy unchanged.

If the selected Topic is already the Case's current Primary Topic, the operation may be a no-op.

## `New Topic` from the classification editor

The row-level classification editor should also provide a secondary `+ New Topic` path so the administrator does not have to close the editor, create a Topic elsewhere, then reopen the Case classification workflow.

Reuse the Topic-creation authority already introduced by PR #104 rather than creating another weaker creator.

Desired workflow:

```text
Edit classification
→ choose/navigate to a System context if useful
→ choose an existing Topic OR create a new Topic
→ make that Topic the Case's canonical Primary Topic
→ remain on /admin/cases
```

The new Topic flow must retain the existing PR #104 rules:

- Topic name/slug validation;
- `kind = topic`;
- active parent validation;
- System or Topic parent placement;
- explicit Unassigned placement;
- graph/cycle validation;
- Production-only mutation boundary;
- pre-migration-0015 compatibility where applicable.

Implementation may either return the newly created Topic to the classification editor as the selected Topic before Save, or use the existing create-and-assign domain operation for the single Case if that produces a cleaner coherent UX. The user-visible result must be unambiguous and must not leave an orphan Topic after an assignment failure.

## Active / inactive behavior

Ordinary classification editing belongs to the **active Production Case Library**.

The inactive recovery view should not expose normal row-level Topic/System classification mutation. An inactive Case should be restored before ordinary classification editing unless a separately reviewed recovery-specific design says otherwise.

Preview Cases remain out of scope.

## Reuse existing domain authority

Do not implement direct SQL taxonomy mutation in the Svelte component or route.

Prefer existing canonical operations, such as the current Primary Topic promotion/bulk-promotion path and the PR #104 Topic authoring operation, or extract small reusable domain primitives if necessary.

The route should remain thin and should preserve the repository's existing Production guards and taxonomy compatibility layer.

No database migration is expected.

---

# Part B — Sticky Bulk Case actions toolbar

## Product goal

When the Case Library contains many rows, the administrator should not have to scroll back to the top of the result panel to perform a bulk action after selecting Cases farther down the page.

The existing `Bulk Case actions` toolbar should therefore remain visible while scrolling through the Case list.

## Desktop / laptop behavior

The primary desktop/laptop behavior should be:

```text
scroll Case Library
→ Bulk Case actions reaches the top working area
→ toolbar remains sticky while Case rows continue scrolling underneath
```

Use normal sticky layout behavior rather than custom scroll-position JavaScript unless the existing application shell makes that impossible.

The sticky toolbar must preserve all live controls and state:

- `N Cases selected` count;
- shift-click selection hint where still useful;
- existing Topic selector;
- `Assign Topic`;
- `New Topic`;
- `Manage Tags`;
- `Deactivate selected`.

Controls that require selection should remain disabled when zero Cases are selected exactly as they are now.

## Sticky offset / layering

The toolbar must not hide underneath or overlap the application's top navigation/header.

Use an appropriate sticky `top` offset based on the actual application shell rather than assuming `top: 0` is always correct.

While sticky, preserve clear visual separation from scrolling Case rows, for example with:

- opaque background;
- existing border/radius where suitable;
- a subtle shadow or separator when pinned;
- an appropriate `z-index` limited to the Case Library surface.

Do not allow Case text or row controls to bleed visually through the sticky toolbar.

## Table interaction

The sticky toolbar must not cover the first visible Case row or make row checkboxes impossible to access.

Do not make the table header sticky as part of this requirement unless it is independently useful and does not complicate the toolbar. The requested behavior is specifically that **Bulk Case actions remain available while scrolling**.

Selections must continue to behave exactly as before, including:

- individual checkbox selection;
- Select all visible;
- shift-click range selection;
- live selected count.

## Inactive view

The inactive Case Library's bulk Restore toolbar should receive equivalent sticky behavior so that selecting inactive Cases farther down the list does not require scrolling back to the top to restore them.

The inactive toolbar should expose only its existing recovery action set; do not add Topic/Tag authoring controls to inactive Cases.

## Narrow screens

On narrow/mobile layouts:

- keep controls usable without horizontal page scrolling;
- allow the toolbar to wrap into multiple lines;
- preserve accessible labels and sufficiently large touch targets;
- avoid a sticky block so tall that it obscures most of the Case list.

The implementation may use a more compact wrapped layout at narrow widths, but it should preserve the core requirement that the active bulk action surface remains available while moving through the list where practical.

Do not solve narrow-screen layout by shrinking controls to unreadable sizes.

## Accessibility

Sticky behavior must not change focus order or keyboard operation.

When keyboard focus moves between Case checkboxes and toolbar controls, the focused element must remain visible rather than being hidden behind the pinned toolbar.

Respect normal document order; do not clone the toolbar into a second interactive copy solely for sticky behavior.

---

# Combined UX behavior

These additions should complement rather than replace the current Case Library fast paths.

After implementation, the page should support:

```text
Individual Case
→ Edit classification
→ choose System context
→ choose/create Topic
→ Save Primary Topic

Individual Case
→ Edit tags
→ manage Case Tags

Several Cases
→ select rows while scrolling
→ sticky Bulk Case actions remains available
→ assign existing Topic / create Topic / manage Tags / deactivate
```

This preserves the conceptual distinction:

```text
Topic = canonical educational home
System = derived navigation ancestry
Tag = cross-cutting Case metadata
```

---

# Performance / read-model constraints

Do not regress PR #102's bounded Case Library read model.

Prefer deriving any row classification option data from already available compatible taxonomy models where practical. If the modal needs additional data, avoid issuing a broad taxonomy read per row or per rendered `Edit` control.

In particular:

- do not perform N taxonomy reads for N visible Cases;
- do not fetch all Case result data into localStorage;
- do not reintroduce per-keystroke Case Library navigation;
- preserve server-authoritative filtering/pagination.

A single shared active taxonomy option model for all visible row editors is preferable to per-row taxonomy fetches if the payload remains bounded and consistent with the current read-model contract.

---

# Automated coverage

Add focused coverage without introducing a large new browser-test framework solely for these additions.

## Row classification

Cover at minimum:

- active Case row exposes an `Edit classification` interaction;
- Topic and System edit affordances, if both are shown, resolve to the same classification editor;
- editor displays the current Case title, Primary Topic and derived System;
- System selection filters/navigates Topic choices but is not submitted as an independent Case→System write;
- selecting `Unassigned` exposes only Topics with no resolved System ancestor;
- real System selection exposes Topics resolving beneath that System;
- nested Topic labels preserve useful breadcrumb context;
- changing System context invalidates an incompatible Topic selection;
- saving an existing Topic replaces only the canonical Primary Topic;
- exactly one Primary Topic remains after save;
- no new secondary Topic rows are created;
- unrelated Tags are preserved;
- active Production Case guards remain enforced;
- inactive Case Library does not expose ordinary classification mutation;
- Preview Case mutation remains unavailable;
- `New Topic` reuses existing Topic-authoring validation/atomicity rather than bypassing it.

## Sticky bulk toolbar

Cover stable source/UI contracts for:

- active `Bulk Case actions` toolbar uses sticky positioning with an application-safe top offset;
- pinned toolbar has an opaque/layered surface so rows do not show through;
- existing bulk controls remain present;
- selected count and disabled-state behavior remain intact;
- inactive bulk Restore toolbar receives equivalent sticky treatment;
- only one interactive toolbar instance exists;
- narrow-screen rules wrap controls rather than forcing page-level horizontal scrolling.

---

# Manual UX verification

Use local/test data only.

Verify at minimum:

1. Open row-level Edit classification for a Case whose System is `Unassigned`; confirm current Topic/System context is correct.
2. Choose a real System and confirm the Topic list is filtered to Topics under that System.
3. Choose `Unassigned` and confirm only unassigned Topic hierarchies are offered.
4. Change a Case from an Unassigned Topic to a Topic beneath a real System; confirm the table's System column changes automatically after save.
5. Change a Case between two Topics in the same System; confirm only the Case's Primary Topic changes.
6. Create a new Topic from the classification workflow and make it the Case's Primary Topic without leaving the Case Library.
7. Confirm existing Case Tags remain unchanged after classification edits.
8. Confirm inactive Cases do not expose ordinary Edit classification controls.
9. Select a Case near the top, scroll down several rows/pages of viewport content, and confirm the bulk toolbar remains visible with the correct selected count.
10. Select additional Cases farther down and confirm the sticky toolbar updates immediately.
11. Use Assign Topic, New Topic, Manage Tags and Deactivate from the sticky toolbar.
12. Repeat in the inactive view and confirm Restore remains accessible while scrolling.
13. Verify the sticky toolbar does not overlap the application header or obscure Case row controls.
14. Verify keyboard tab/focus navigation and Escape/close behavior for the classification modal.
15. Verify laptop and narrow-screen layouts, especially toolbar wrapping and modal usability.

---

# Scope boundaries

## In scope

- active row-level Case classification editing from `/admin/cases`;
- System-as-navigator/filter semantics inside that editor;
- Primary Topic reassignment;
- reuse of quick Topic creation from the row classification workflow;
- sticky active bulk Case actions;
- sticky inactive bulk Restore actions;
- focused tests and documentation.

## Out of scope

- creating a Case→System database relationship;
- changing a Topic's global parent/System from an individual Case row;
- taxonomy drag/drop or hierarchy administration;
- redesigning the full `/admin/topics` workspace;
- Additional Study Topics;
- learner-facing changes;
- Preview taxonomy mutation;
- schema migration;
- making the entire table/header sticky unless separately justified.

---

# Acceptance criteria

This extension is complete when:

- an administrator can open one compact row-level classification editor from the Case Library;
- the editor clearly distinguishes System navigation from the canonical Topic assignment;
- System selection filters Topic choices without creating a second Case classification source of truth;
- saving changes exactly one Case's canonical Primary Topic and the visible System is re-derived correctly;
- a new Topic can be created from the same workflow using existing taxonomy authority;
- no secondary Topic rows or independent Case→System writes are introduced;
- the active bulk toolbar remains available while scrolling long Case lists;
- the inactive Restore toolbar behaves equivalently;
- sticky layout does not obscure rows, break keyboard operation or force unusable narrow-screen layout;
- existing Case Library filtering, persistence, sorting, pagination, Tags, lifecycle actions and row navigation remain intact;
- PR #102 read/performance constraints remain intact;
- no database migration is introduced.
