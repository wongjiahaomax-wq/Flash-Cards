# Systems & Topics Admin UX Redesign

_Status: pending UX implementation plan._

_Last updated: 26 August 2026_

## Goal

Make `/admin/topics` substantially easier to scan and navigate as the taxonomy grows, while preserving the current System / Topic domain model and all existing hierarchy mutation semantics.

The current page is functionally capable but structurally expensive to use because several separate jobs are stacked vertically:

1. taxonomy coverage and curation warnings;
2. System / Topic creation;
3. search;
4. taxonomy browsing;
5. hierarchy reorganisation.

The full taxonomy is also rendered twice: once in the taxonomy library and again in the hierarchy manager. As the number of Systems and Topics grows, page length therefore grows approximately twice as fast as the taxonomy itself.

This PR should improve presentation and interaction only. It must not change taxonomy meaning, learner routing, schema, production data, or System↔Tag semantics.

## Current product contracts to preserve

The redesign must keep these current invariants:

- **System** is a top-level learner-navigation grouping.
- **Topic** is the canonical Case classification and direct reusable Topic-question context.
- Cases attach to Topics, never Systems.
- Current Case-local classification is exactly one Primary Topic plus zero or more Case Tags.
- Additional Study Topics are retired from current authoring behavior.
- System↔Tag exposure remains a System-detail responsibility, not a Case-local or taxonomy-library shortcut.
- Systems are always top-level.
- Topics may be nested beneath a System or another Topic.
- Hierarchy changes remain global taxonomy changes and must retain the existing validated atomic apply behavior.
- Unassigned Topics remain supported during curation.
- Inactive classifications remain visible to Admins where relevant.

## Problems in the current page

### 1. The taxonomy is duplicated vertically

The `Taxonomy` section renders every matching System / Topic as a row.

The `Hierarchy manager` then renders the same matching taxonomy again, this time with parent controls.

For a growing library this creates a long, repetitive page and forces the administrator to repeatedly scroll past information already seen.

### 2. The primary view is flat even though the domain is hierarchical

The taxonomy table is sorted by breadcrumb, but every item is still presented as a visually equivalent row.

This makes it unnecessarily difficult to answer common questions quickly:

- Which Topics are under Cardiology?
- Which Topics are nested below another Topic?
- Which Topics are unassigned?
- Which System am I currently looking at?
- How large is one System compared with another?

The breadcrumb helps, but the administrator has to read it row-by-row instead of perceiving the hierarchy directly.

### 3. Browsing and hierarchy editing are mixed together

Most visits to `/admin/topics` are likely to involve finding or opening a classification, checking coverage, or creating one.

Changing global parent relationships is a less frequent and higher-risk operation. It should not consume a full second copy of the taxonomy during ordinary browsing.

### 4. Creation occupies permanent vertical space

The New System or Topic form is always expanded even when the administrator is only trying to locate or inspect an existing classification.

### 5. Search is too narrow for a large taxonomy

Current search supports name / breadcrumb text only.

There is no direct way to narrow the library by common administrative states such as:

- Systems only;
- Topics only;
- unassigned Topics;
- inactive classifications.

### 6. Search state also changes the visible hierarchy-manager rows

When text search is active, the taxonomy library and hierarchy manager are both driven by the filtered `data.topics` result. Parent options still come from the complete hierarchy options.

That behavior is technically workable, but the UI does not make it obvious that the hierarchy editor is currently showing only the search subset.

### 7. Navigation from Topic/System detail is partially disconnected

The detail page links to `/admin/topics#hierarchy`, but the current hierarchy section has no matching `id="hierarchy"` anchor.

The intended jump therefore does not provide a reliable shortcut to the hierarchy tool.

### 8. Some taxonomy copy is stale after Additional Study Topic retirement

Current taxonomy UI copy still describes direct Case attachments as including Additional Study Topic relationships, while current read models use Primary Topic relationships and current product documentation retires Additional Study Topics from authoring behavior.

The UX redesign should clean up this wording rather than carrying an obsolete mental model forward.

## Proposed interaction model

### A. One primary hierarchical browser

Replace the flat taxonomy table as the main mental model with a compact hierarchy browser.

Recommended structure:

```text
Systems & Topics

[coverage summary]                         [New classification]

[Search................................] [Filters]

Cardiology                                  24 study cases
├── Arrhythmias                              8
│   ├── Atrial fibrillation                  4
│   └── Prolonged QTc                        4
├── Pericardial disease                      6
└── Valvular disease                        10

Endocrine                                  18 study cases
├── Diabetes                                12
└── Thyroid disease                          6

Unassigned Topics                           3
├── ...
```

Requirements:

- Systems should be visually dominant group headers / roots.
- Topic nesting should be visible through indentation or tree guides.
- Nested Topics must remain supported; do not assume only `System → Topic` depth.
- Unassigned Topics should have a dedicated clearly labelled group.
- Inactive items should remain discoverable but visually subdued.
- Each row should remain a direct link to its System / Topic detail page.
- Keep useful compact metadata, but do not make every metric equally visually prominent.

Suggested row priority:

1. classification name;
2. hierarchy position;
3. case count relevant to the classification;
4. question count for Topics where useful;
5. status / warning badges.

### B. Collapsible Systems

Each System group should be collapsible so an administrator can keep only the area currently being curated open.

Recommended behavior:

- Systems expanded by default when the taxonomy is still small;
- preserve expansion state for the current page session where practical;
- search automatically reveals matching branches;
- an explicit `Expand all / Collapse all` control is useful on desktop.

Do not hide a matching search result merely because its parent was previously collapsed.

### C. Progressive disclosure for creation

Replace the permanently expanded creation form with a clear `New classification` action.

Opening it may reveal an inline panel, drawer, or dialog using the existing fields:

- Name;
- Kind;
- Parent System for a newly created Topic where applicable;
- Description.

The creation flow must retain the current rule that Systems are top-level and Topics may initially be unassigned.

### D. Explicit hierarchy-edit mode

Do not render a second always-visible hierarchy list.

Provide a deliberate `Reorganize hierarchy` action that switches the workspace into an editing mode or opens a dedicated editing surface.

Preferred behavior:

- browsing mode remains the default;
- hierarchy editing is clearly labelled as a global change;
- only Topic rows need editable parent controls;
- System rows remain fixed as top-level;
- the full valid parent option set remains available;
- staged changes remain reviewable before submission;
- the existing `Validate & apply staged hierarchy` atomic mutation remains the commit action;
- exiting edit mode without applying should not silently mutate anything.

A useful enhancement is to show a small staged-change count such as `3 changes` before apply.

Avoid introducing drag-and-drop in the first iteration. Parent selection is less visually novel but is explicit, keyboard accessible, and maps directly to the existing validated mutation contract.

### E. Compact coverage summary

Coverage is important but should behave like a dashboard status rather than a large preamble.

Recommended summary:

```text
Coverage ready
4 Systems · 37 Topics · 126 active Cases
0 unassigned Topics · 0 uncovered Cases
```

When curation is required, make the warning state prominent and provide expandable / drill-down lists for:

- unassigned Topics;
- uncovered Cases.

The detailed lists do not need to consume vertical space when there is no problem.

### F. Better filtering

Keep text search, and add lightweight filters useful for curation:

- All;
- Systems;
- Topics;
- Unassigned;
- Inactive.

These may be chips, a compact select, or another low-friction control.

Search results should preserve enough hierarchy context to explain where each match belongs.

### G. Keep detail pages as the editing destination

The library should remain optimized for navigation and global hierarchy organization.

Do not turn it into a second full editor for:

- Topic questions;
- Case assignments;
- System↔Tag exposure;
- detailed identity editing.

Those belong on the existing System / Topic detail pages.

## Desktop layout recommendation

Use the available horizontal space instead of stacking all controls vertically.

A reasonable desktop composition is:

```text
┌─────────────────────────────────────────────────────────────┐
│ Systems & Topics                         New classification │
│ Coverage summary                                             │
├─────────────────────────────────────────────────────────────┤
│ Search................................   Filters   Reorganize │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  hierarchical taxonomy browser                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

If hierarchy editing needs more horizontal room, the browser can switch into a two-column edit row:

```text
Topic / breadcrumb                     Parent
```

without duplicating the full browser underneath itself.

## Mobile behavior

On narrow screens:

- keep search and primary actions easy to reach;
- stack row metadata beneath the classification name;
- preserve visible indentation without forcing horizontal scrolling;
- allow System sections to collapse;
- use the same explicit hierarchy-edit mode rather than a permanently rendered second list;
- avoid wide six-column table semantics.

## Accessibility expectations

- Collapsible System groups must expose expanded/collapsed state to assistive technology.
- Search and filters need persistent labels or accessible names.
- Hierarchy indentation must not be the only way ancestry is communicated; retain breadcrumb/context text where useful.
- Parent selectors require accessible labels naming the Topic being moved.
- Status and warning meaning must not depend on color alone.
- Keyboard navigation must remain complete for browsing, creation, and hierarchy editing.

## Suggested implementation scope

This should remain a focused Admin UX PR.

Likely files:

```text
src/routes/admin/topics/+page.svelte
src/routes/admin/topics/+page.server.js        # only if filter/read-model support genuinely requires it
src/routes/admin/topics/[conceptId]/+page.svelte  # small navigation/copy cleanup only
```

If the hierarchical browser becomes substantial, prefer extracting a focused Svelte component rather than making the route another large UI hotspot.

Do not add a schema migration for this work.

Do not modify learner routing.

Do not change production taxonomy data.

Do not move System↔Tag editing away from System detail.

## Acceptance criteria

- [ ] The default `/admin/topics` view contains only one full rendering of the taxonomy.
- [ ] Systems and nested Topics are visually understandable as a hierarchy without reading every breadcrumb.
- [ ] Unassigned Topics are easy to find.
- [ ] Text search remains available.
- [ ] Admins can narrow to Systems, Topics, unassigned Topics, and inactive classifications without scanning the full library.
- [ ] Creation is available from the top of the page without permanently occupying a large panel.
- [ ] Hierarchy editing is an explicit mode / surface rather than a second always-visible taxonomy copy.
- [ ] Existing validated atomic hierarchy apply semantics are preserved.
- [ ] Systems remain top-level and cannot acquire a parent.
- [ ] Nested Topic hierarchies remain supported.
- [ ] Coverage warnings remain visible and actionable without dominating the page when coverage is healthy.
- [ ] System / Topic rows still navigate to their existing detail pages.
- [ ] The detail-page hierarchy shortcut reaches the hierarchy editing surface correctly.
- [ ] Copy no longer describes Additional Study Topics as current authoring behavior.
- [ ] Mobile layout avoids a wide table and remains usable without horizontal scrolling.
- [ ] No schema, learner-routing, System↔Tag, or production-data behavior changes are introduced.

## Validation approach

For presentation-only iterations, use the repository's normal Vite/HMR workflow and inspect the page at desktop and narrow widths.

Before implementation handoff:

1. run `npm run agent:checks`;
2. run focused tests if any filtering or hierarchy behavior changes;
3. run `npm run validate:full` when local command execution is available;
4. inspect GitHub CI when working remotely.

Manual UX checks should include:

- small taxonomy;
- many Topics under one System;
- several Systems;
- nested Topic depth greater than one;
- unassigned Topics;
- inactive System / Topic;
- search matching a deeply nested Topic;
- hierarchy edit with several staged parent changes;
- mobile/narrow viewport.

## Explicitly out of scope

- taxonomy schema changes;
- learner navigation changes;
- automatic taxonomy reclassification;
- Case Primary Topic mutation from this library;
- Case Tag mutation from this library;
- System↔Tag exposure editing from this library;
- drag-and-drop hierarchy editing in the first iteration;
- production data curation or migration.
