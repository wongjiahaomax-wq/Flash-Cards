# Systems & Topics Visual Admin Workspace

_Status: agreed product/UX plan; implementation pending._

_Last updated: 26 August 2026_

## Goal

Redesign `/admin/topics` into a visual taxonomy and Case-classification workspace that makes a growing System / Topic hierarchy easier to understand, edit, and maintain.

The workspace should let an administrator:

1. visually browse Systems and nested Topics;
2. create Systems, Topics, and subtopics directly in context;
3. edit Topic identity and hierarchy without navigating to a separate hierarchy manager;
4. reveal the Cases directly assigned to a Topic when needed;
5. see each revealed Case by its human-readable Case title/name;
6. change a Case's canonical Primary Topic from the same workspace;
7. add or remove Case Tags from the same workspace;
8. perform supported bulk Case classification changes;
9. stage all structural/classification changes for review before applying them;
10. preserve existing taxonomy, learner-routing, and data-integrity semantics.

This is intentionally more than a cosmetic table redesign. The page should become the primary Admin workspace for organizing taxonomy structure and Case classification while preserving existing domain boundaries.

No schema migration is expected for this UX work.

## Locked product decisions

The following decisions are agreed for this redesign.

### 1. Parent Topics remain real Topics

Broad groupings such as `Arrhythmias` are normal Topics, not a new Folder or Category entity.

The existing hierarchy remains valid:

```text
System: Cardiology
└── Topic: Arrhythmias
    ├── Topic: Atrial fibrillation
    ├── Topic: Atrial flutter
    └── Topic: Ventricular tachycardia
```

A parent Topic may therefore be learner-selectable under existing learner semantics and may participate in existing Topic hierarchy/question behavior. The Admin redesign must not silently introduce a separate structural-only concept.

Simple `System → Topic` remains a valid and expected common shape. The UI must support deeper Topic nesting without implying that every System needs intermediate parent Topics.

### 2. Drag/drop changes are staged, not immediately persisted

Drag-and-drop is an interaction for proposing hierarchy/classification changes.

A drop updates only local staged state. Nothing is persisted until the administrator reviews the staged changes and chooses `Validate & apply`.

### 3. Cases are hidden by default

Cases do not permanently appear throughout the taxonomy tree.

A Topic shows its direct Case count and provides a deliberate way to reveal its Cases, either inline in the tree and/or through the Topic inspector.

This preserves a compact taxonomy view as the number of Cases grows.

### 4. Case Tags are editable from this workspace

When a Case is selected, the administrator may:

- change its Primary Topic;
- add Case Tags;
- remove Case Tags.

Tags remain flat, cross-cutting classification. Tags must not become draggable hierarchy nodes.

System↔Tag exposure remains a separate System-level concern and stays on the System detail workflow.

### 5. Revealed Cases always show their human-readable Case title/name

The primary visible label for a Case in the workspace is its stored human-readable Case title.

Do not render Cases primarily as IDs, opaque identifiers, or generic labels such as `Case 123`.

Example:

```text
▼ Atrial fibrillation
   4 direct Cases

   • New-onset atrial fibrillation
   • AF with rapid ventricular response
   • Post-operative atrial fibrillation
   • AF with mitral stenosis
```

Internal IDs may remain available for debugging or detailed Admin views, but should not compete with the Case title in the ordinary workspace.

Long Case titles should wrap reasonably rather than being aggressively truncated to the point that Cases cannot be distinguished.

## Current product contracts to preserve

The redesign must keep these current invariants:

- **System** is a top-level learner-navigation grouping.
- **Topic** is the canonical Case classification and direct reusable Topic-question context.
- Cases attach to Topics, never Systems.
- Current Case-local classification is exactly one Primary Topic plus zero or more Case Tags.
- Additional Study Topics are retired from current authoring behavior.
- System↔Tag exposure remains separate from Case-local Tag membership.
- Systems are always top-level.
- Topics may be nested beneath a System or another Topic.
- Topics may temporarily be unassigned during curation.
- Inactive classifications remain discoverable to Admins where relevant.
- Existing hierarchy graph validation remains authoritative.
- Existing Case Primary Topic mutation invariants remain authoritative.
- Detailed Case content authoring remains in the Case editor.

## Problems in the current page

### 1. The taxonomy is rendered twice

The current taxonomy library and hierarchy manager both render substantially the same set of classifications.

Page length therefore grows roughly with `2 × taxonomy size`.

### 2. A hierarchical domain is presented primarily as a flat list

Breadcrumbs technically encode ancestry, but the administrator has to read them row-by-row rather than perceiving the hierarchy visually.

### 3. Creating and reorganizing nested Topics is disconnected

The current creation experience makes direct System-parented Topics relatively obvious, while deeper Topic nesting is primarily exposed through the separate hierarchy manager.

The backend/domain supports nested Topics more naturally than the current UI communicates.

### 4. Case classification is separated from taxonomy curation

An administrator organizing a Topic hierarchy cannot naturally see which Cases are directly owned by each Topic or correct obvious Case classification mistakes in the same workspace.

### 5. Browsing and mutation are mixed without a strong mode distinction

Most visits should be safe browsing/inspection. Structural changes should be deliberate and reviewable.

### 6. Search/filtering does not scale well

Text search alone is insufficient for finding Systems, Topics, unassigned classifications, inactive classifications, and eventually Cases across a large taxonomy.

### 7. Creation permanently consumes vertical space

The current always-expanded creation form takes substantial space even when the administrator is only browsing.

### 8. Some copy still reflects retired Additional Study Topic behavior

The redesign should consistently use the current one-Primary-Topic + Case-Tags authoring model.

## Primary information architecture

The page should use a desktop `tree + inspector` workspace.

```text
┌──────────────────────────────────────────┬────────────────────────────┐
│ TAXONOMY                                 │ INSPECTOR                  │
│                                          │                            │
│ ▼ Cardiology                             │ Arrhythmias                │
│    ├─ ▼ Arrhythmias                      │ Topic                      │
│    │     ├─ Atrial fibrillation          │                            │
│    │     ├─ Atrial flutter               │ Cardiology → Arrhythmias   │
│    │     └─ Ventricular tachycardia      │                            │
│    ├─ Pericarditis                       │ Direct Cases       0       │
│    └─ Prolonged QTc                      │ Descendant Cases   8       │
│                                          │ Subtopics          3       │
│ ▶ Endocrine                              │                            │
│                                          │ [+ Add subtopic]           │
│                                          │ [Edit] [Move]              │
└──────────────────────────────────────────┴────────────────────────────┘
```

The tree is automatically laid out by hierarchy. It is not a freeform whiteboard and does not persist arbitrary x/y node positions.

## Browse mode

Browse mode is the default.

It should support:

- expand/collapse Systems;
- expand/collapse parent Topics;
- search;
- filters;
- System focus mode;
- selecting a System/Topic/Case into the inspector;
- revealing direct Cases for a Topic;
- opening existing detailed Admin pages;
- contextual creation.

Browse mode should not make accidental hierarchy/classification changes easy.

## Organize mode

A deliberate action such as `Organize taxonomy & Cases` enables visual mutation controls.

In this mode:

- draggable handles become visible where appropriate;
- valid drop targets become discoverable;
- dropped changes are staged locally;
- the UI shows the number of staged changes;
- the administrator can review/discard/apply the staged set.

The interface should communicate clearly that dragging does not save immediately.

## Visual Topic hierarchy editing

### Topic drag semantics

Dragging a Topic onto a System means:

```text
Topic → System
= make the Topic a direct child of that System
```

Dragging a Topic onto another Topic means:

```text
Topic → Topic
= make the dragged Topic a child of the target Topic
```

Dragging a Topic to the dedicated `Unassigned Topics` target means:

```text
Topic → Unassigned
= clear its parent
```

Systems remain roots and cannot be dragged underneath another classification.

The UI should prevent or reject obviously invalid drop targets before apply where possible, but server-side graph validation remains authoritative.

### Non-drag fallback

Every movable Topic also provides `Move to…`.

This opens a searchable hierarchy-aware parent picker and supports keyboard/mobile workflows.

Drag-and-drop must never be the only way to reorganize the taxonomy.

## Contextual creation

Creation should happen where the administrator is already working.

### Global creation

A top-level `+ New` action offers:

- New System;
- New Topic.

A globally created Topic can choose:

- Unassigned;
- a System;
- another valid Topic.

### Add Topic beneath a System

A System exposes `+ Add Topic`.

The System is automatically selected as the new Topic's parent.

### Add subtopic beneath a Topic

A Topic exposes `+ Add subtopic`.

The selected Topic is automatically used as the parent.

Example:

```text
Arrhythmias
└── + Add subtopic

Name: Atrial fibrillation
Parent: Cardiology → Arrhythmias
```

The newly created Topic should appear immediately in the correct tree location and become selected in the inspector.

A compact inline quick-add interaction is acceptable where it improves speed, provided the full create flow remains accessible.

## Topic inspector

Selecting a Topic should show at least:

- Topic name;
- full breadcrumb;
- active/inactive state;
- direct Case count;
- descendant/subtree Case count;
- subtopic count;
- reusable Topic-question count where already available/useful;
- actions: Edit, Move, Add subtopic, Show Cases, Open full Topic page.

For a broad parent Topic, direct vs descendant counts must remain distinct.

Example:

```text
Arrhythmias
Topic

Cardiology → Arrhythmias

Direct Cases        0
Descendant Cases    8
Subtopics           3
```

This helps distinguish a broad parent Topic from a leaf Topic without creating a new structural entity type.

## Topic identity editing

The inspector may support focused Topic editing directly in the workspace:

- name;
- description;
- active/inactive state where existing product behavior permits;
- parent, through the same staged hierarchy system.

Detailed Topic-question editing remains on the Topic detail page.

## Cases in the workspace

### Cases are direct children only

When a Topic reveals Cases, show Cases whose canonical Primary Topic is that Topic.

Do not duplicate descendant Cases under every ancestor Topic.

Ancestor Topics may show descendant/subtree counts, but inline Case rows represent direct ownership.

### Case row presentation

Every revealed Case row must prominently display the human-readable Case title/name.

Recommended compact row:

```text
• New-onset atrial fibrillation              12 Q · 2 tags
```

Optional secondary metadata may include:

- question count;
- Tag count;
- status/warning indicators.

The Case title remains visually primary.

Long titles may wrap to a reasonable second line.

### Case selection

Selecting a Case opens the Case inspector rather than navigating away immediately.

The inspector should include:

```text
CASE

New-onset atrial fibrillation

Primary Topic
Cardiology → Arrhythmias → Atrial fibrillation

Tags
Anticoagulation
Rate control

[Change Topic] [Edit Tags]
[Open full Case]
```

The full Case editor remains the destination for vignette, questions, images, and other detailed content authoring.

## Case Primary Topic editing

Dragging a Case onto a Topic stages a canonical Primary Topic change.

Example:

```text
New-onset AF
    ↓
Atrial flutter
```

means:

```text
Primary Topic
Atrial fibrillation
→ Atrial flutter
```

A Case must never be droppable onto a System because Cases attach to Topics, not Systems.

A non-drag `Change Primary Topic…` / `Move to…` searchable Topic picker must also be provided.

Because Primary Topic controls canonical classification and Topic-specific learning/question context, the staged-change review must describe this as a classification change rather than a cosmetic folder move.

## Case Tag editing

The Case inspector supports:

- searching existing Tags;
- adding one or more Tags;
- removing existing Tags.

Tag changes are staged with the rest of the workspace changes.

Tags remain visually separate from the hierarchical tree. Do not present Tags as parent/child nodes or drag targets.

Creating brand-new Tags from this workspace is not required unless existing reusable Tag-creation behavior can be integrated cleanly without expanding scope. Existing Tag management remains available elsewhere.

System↔Tag exposure remains outside this workspace.

## Bulk Case classification

When a Topic's Cases are visible in the inspector/list, the administrator should be able to multi-select Cases and stage supported bulk operations:

- Move selected Cases to a new Primary Topic;
- Add a Tag to selected Cases;
- Remove a Tag from selected Cases.

Bulk operations must use/reuse the same server-side domain invariants as single-Case operations.

The UI should respect existing backend limits rather than silently exceeding them.

## Search and filtering

Search should eventually cover:

- System names;
- Topic names;
- taxonomy breadcrumbs;
- revealed/searchable Case titles.

Searching for a deeply nested match should automatically reveal enough ancestors to explain the result's context.

Useful filters include:

- All;
- Systems;
- Topics;
- Unassigned;
- Inactive.

A Case-specific search/filter affordance may live in the Topic inspector if keeping Cases out of the default global tree produces a clearer UX.

## Focus mode

For large taxonomies, selecting/focusing a System should allow a scoped workspace such as:

```text
Systems & Topics / Cardiology

← All Systems

[Search Cardiology...]

▼ Arrhythmias
   ├── Atrial fibrillation
   ├── Atrial flutter
   └── Ventricular tachycardia

▼ Valvular disease
   ...
```

Focus mode should preserve context while avoiding a canvas containing every System at once.

## Staged-change review

Any staged mutation should contribute to a persistent change indicator/tray.

Example:

```text
4 staged changes                         [Review]
```

Review should group changes by type.

Example:

```text
Hierarchy

1. Atrial fibrillation
   Cardiology
   → Cardiology / Arrhythmias

Case Primary Topic

2. Case: New-onset AF
   Atrial fibrillation
   → Atrial flutter

Case Tags

3. Case: AF with mitral stenosis
   + Anticoagulation

4. Case: Post-operative AF
   - Electrolytes

[Discard all]                    [Validate & apply]
```

Case entries in the review should use the Case title as their primary identifier.

## Apply semantics

The final apply operation should validate current server state before writing.

The intended behavior is:

```text
all staged changes valid
→ apply the validated set

any staged change invalid
→ do not partially apply the set
```

The implementation should reuse existing taxonomy and Case classification mutation logic where possible rather than creating parallel semantics.

If a truly unified atomic operation across hierarchy + Case Topic + Case Tags cannot be guaranteed by the current D1/Drizzle execution model without disproportionate complexity, the implementation must explicitly document the transaction boundary and preserve the strongest practical all-or-nothing behavior. Do not silently claim atomicity that the runtime does not provide.

## Stale-state / concurrent-edit protection

Before applying staged changes, the server should verify that relevant original relationships still match what the workspace loaded/staged against.

If another administrator or process changed a Topic parent, Case Primary Topic, or relevant Case Tag membership in the meantime, fail safely and require refresh/review rather than silently overwriting newer curation.

The exact implementation may use version/fingerprint/original-value checks without requiring a schema migration if practical.

## Coverage summary

Coverage remains important but should be compact when healthy.

Example:

```text
Coverage ready
4 Systems · 37 Topics · 126 active Cases
0 unassigned Topics · 0 uncovered Cases
```

When curation is required, warnings should remain prominent and actionable.

## Accessibility and mobile behavior

### Accessibility

- expand/collapse controls expose state to assistive technology;
- hierarchy is not communicated by indentation alone; preserve breadcrumb/context where useful;
- draggable controls have accessible labels;
- every drag operation has a keyboard-operable `Move to…` / `Change…` alternative;
- status meaning does not depend on color alone;
- staged changes and validation errors receive appropriate focus/announcements;
- Case rows have accessible names based on the Case title.

### Mobile/narrow screens

Do not require complex drag-and-drop on mobile.

Prefer:

- collapsible hierarchy;
- inspector as a sheet/full-width panel;
- `Move to…` and `Change Primary Topic…` pickers;
- contextual create buttons;
- staged-change review.

Desktop can make drag-and-drop the fastest interaction while mobile keeps the same capabilities through explicit controls.

## Suggested component boundaries

Avoid turning `src/routes/admin/topics/+page.svelte` into another large UI hotspot.

A likely structure is:

```text
src/routes/admin/topics/
  +page.svelte
  +page.server.js

src/lib/components/taxonomy-workspace/
  TaxonomyWorkspace.svelte
  TaxonomyToolbar.svelte
  TaxonomyTree.svelte
  TaxonomyNode.svelte
  TaxonomyCaseList.svelte
  TaxonomyInspector.svelte
  TaxonomyChangeTray.svelte
  TopicCreateEditor.svelte
  MoveTopicDialog.svelte
  MoveCaseDialog.svelte
  CaseTagEditor.svelte
```

Exact component names are not contractual. Prefer small cohesive TypeScript-backed modules/components consistent with current engineering guidance.

Server-side workspace read/write orchestration should remain near taxonomy/admin domain ownership and reuse existing validated functions rather than embedding data rules in Svelte actions.

## Suggested implementation sequence

### Milestone 1 — visual read-only taxonomy

- auto-laid-out hierarchical tree/list;
- nested Topic support;
- collapse/expand;
- System focus mode;
- compact coverage;
- search/filter basics;
- inspector selection.

### Milestone 2 — contextual creation and Topic editing

- global `+ New`;
- `+ Add Topic` from System;
- `+ Add subtopic` from Topic;
- Topic inspector editing;
- hierarchy-aware parent picker.

### Milestone 3 — staged Topic hierarchy drag/drop

- Organize mode;
- Topic drag/drop;
- `Move to…` fallback;
- staged-change tray;
- hierarchy review.

### Milestone 4 — Cases in the workspace

- direct Case counts;
- reveal/hide Cases;
- Case rows prominently showing human-readable Case titles;
- Case selection/inspector;
- Case search within the relevant scope.

### Milestone 5 — Case Primary Topic editing

- Case → Topic drag/drop;
- `Change Primary Topic…` fallback;
- meaningful classification warning/review copy;
- reuse single/bulk Primary Topic domain mutations.

### Milestone 6 — Case Tag editing

- add/remove Tags in Case inspector;
- multi-select Case operations;
- bulk add/remove Tag flows;
- preserve System↔Tag separation.

### Milestone 7 — unified validation/apply and concurrency safety

- validate staged hierarchy + Case classification changes;
- stale-state protection;
- strongest available all-or-nothing write boundary;
- clear recovery if validation fails.

### Milestone 8 — polish and validation

- keyboard/accessibility pass;
- mobile fallback flows;
- empty/loading/error states;
- large-taxonomy ergonomics;
- focused tests and full repository validation.

## Acceptance criteria

### Visual taxonomy

- [ ] Default `/admin/topics` contains one primary taxonomy rendering rather than separate browse and hierarchy-manager copies.
- [ ] Systems are visually dominant roots.
- [ ] Nested Topics are clearly understandable.
- [ ] Simple direct `System → Topic` structures remain natural and are not forced into artificial intermediate groups.
- [ ] Unassigned Topics are easy to find.
- [ ] Systems and parent Topics can collapse/expand.
- [ ] Focus mode supports working within one System.

### Creation/editing

- [ ] Admin can create a System from the workspace.
- [ ] Admin can create a Topic globally.
- [ ] Admin can add a Topic directly beneath a System.
- [ ] Admin can add a subtopic directly beneath a Topic.
- [ ] Parent context is preselected for contextual creation.
- [ ] Topic identity can be inspected/edited without requiring the old hierarchy-manager workflow.

### Hierarchy organization

- [ ] Explicit Organize mode is available.
- [ ] Topics can be dragged to valid System/Topic/unassigned targets on desktop.
- [ ] Dragging only stages changes.
- [ ] A keyboard/mobile `Move to…` fallback exists.
- [ ] Systems remain top-level.
- [ ] Existing graph validation remains authoritative.

### Cases

- [ ] Cases are hidden by default.
- [ ] A Topic clearly shows its direct Case count.
- [ ] Admin can reveal direct Cases for a Topic.
- [ ] Every revealed Case prominently displays its human-readable Case title/name.
- [ ] Case IDs are not the primary ordinary-workspace label.
- [ ] Long Case titles remain distinguishable and may wrap appropriately.
- [ ] Selecting a Case shows its Primary Topic and Tags in the inspector.
- [ ] Admin can open the full Case editor from the inspector.

### Case classification

- [ ] Admin can stage a Case Primary Topic change through drag/drop.
- [ ] Admin can stage the same change through a searchable non-drag Topic picker.
- [ ] Cases cannot be assigned directly to Systems.
- [ ] Primary Topic review copy explains that the canonical classification is changing.
- [ ] Admin can add/remove Case Tags from the workspace.
- [ ] Tags are not represented as hierarchy nodes.
- [ ] Supported bulk Primary Topic and Tag operations are available for selected Cases.
- [ ] Existing one-Primary-Topic and active-Topic invariants are preserved.

### Review/apply

- [ ] All structural/classification changes are staged before persistence.
- [ ] Staged changes are reviewable by type.
- [ ] Case changes use human-readable Case titles in the review.
- [ ] Validation occurs against current server state before apply.
- [ ] Stale/conflicting changes fail safely.
- [ ] Partial writes are avoided to the strongest degree supported by the existing runtime, with the actual transaction boundary documented accurately.

### Boundaries

- [ ] No taxonomy schema migration is introduced solely for this redesign.
- [ ] Learner routing semantics do not change.
- [ ] Additional Study Topics are not reintroduced.
- [ ] System↔Tag exposure remains separate from Case Tag membership and is not moved into this workspace.
- [ ] Detailed Topic-question editing remains on Topic detail.
- [ ] Detailed Case content editing remains in the Case editor.
- [ ] Production taxonomy/Case data is not mutated merely as part of implementing the UI.

## Validation approach

Implementation should follow repository Admin UX and architecture guidance.

At minimum:

1. use Vite/HMR for visual iteration;
2. add focused characterization/tests around tree projection, staged changes, hierarchy validation, Case Primary Topic changes, Tag changes, bulk behavior, and stale-state handling as logic changes require;
3. run `npm run agent:checks`;
4. run `npm run validate:full` before handoff when local execution is available;
5. inspect GitHub CI;
6. manually exercise desktop and narrow/mobile layouts.

Manual UX coverage should include:

- a simple `System → Topic` taxonomy;
- nested Topic depth greater than one;
- a parent Topic with zero direct Cases but multiple descendant Cases;
- many Topics under one System;
- several Systems;
- unassigned Topics;
- inactive classifications;
- Topics with zero, one, and many direct Cases;
- long and similar Case titles;
- search matching a deep Topic;
- Case title search where implemented;
- one Topic drag;
- several staged Topic moves;
- one Case Primary Topic change;
- bulk Case Topic change;
- Case Tag add/remove;
- bulk Tag operation;
- stale-state conflict;
- validation failure with no partial apply;
- keyboard/non-drag movement;
- mobile/narrow viewport.

## Explicitly out of scope

- introducing a new Folder/Category taxonomy entity;
- changing learner-navigation semantics;
- reintroducing Additional Study Topics;
- moving System↔Tag exposure editing into this workspace;
- replacing the full Case editor;
- replacing detailed Topic-question management;
- storing freeform canvas node coordinates;
- production taxonomy or Case-data migration/curation as part of this UX PR.
