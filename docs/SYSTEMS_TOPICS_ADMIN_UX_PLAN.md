# Systems & Topics Visual Admin Workspace

_Status: **implemented and merged in PR #99** (`5ca184c87ef3226fee79d812afbeb885f1c1cba8`). This document is retained as the design/implementation record for the current `/admin/topics` workspace._

_Last reconciled: 28 August 2026_

## Goal

`/admin/topics` is the visual taxonomy and Case-classification workspace for browsing and maintaining Systems, nested Topics, canonical Case Primary Topics, and Case Tags without introducing another taxonomy entity.

The implementation replaced the previous duplicated flat taxonomy list + separate hierarchy-manager presentation with one tree + inspector workspace.

## Current product contracts

The workspace preserves these current invariants:

- **System** is a top-level learner-navigation grouping.
- **Topic** is the canonical Case classification and direct reusable Topic-question context.
- Cases attach to Topics, never Systems.
- Current Case-local classification is exactly one Primary Topic plus zero or more Case Tags.
- Additional Study Topics are retired from current authoring behavior.
- System↔Tag exposure remains separate from Case-local Tag membership.
- Systems remain top-level roots.
- Topics may nest beneath a System or another Topic.
- Topics may temporarily be unassigned during curation.
- Existing taxonomy graph validation remains authoritative.
- Existing Case Primary Topic and Case Tag mutation invariants remain authoritative.
- Detailed vignette/image/question authoring remains in the full Case editor.

## Implemented workspace

### Browse / inspect

The current workspace supports:

- one visual System/Topic tree with arbitrary nested Topic depth;
- collapse/expand and System focus;
- `All / Systems / Topics / Unassigned / Inactive` filtering;
- search across System names, Topic names, breadcrumbs, and loaded direct Case titles while retaining ancestor context;
- contextual creation of Systems, Topics, and subtopics;
- Topic inspector counts for Direct Cases, Descendant Cases, Subtopics, and reusable Topic questions;
- Cases hidden by default and revealed deliberately;
- revealed Cases shown by human-readable Case title and direct canonical Primary Topic ownership.

Parent Topics remain real Topics. No Folder/Category entity was introduced.

## Organize mode and unified staged review

Structural/classification mutations are deliberate and staged rather than written immediately.

The current workspace can stage changes from all three domains at the same time:

```text
Topic hierarchy
Case Primary Topic
Case Tags
```

Hierarchy moves, Case Primary Topic changes, and Case Tag changes may therefore coexist in one pending review. The UI shows them together in one staged-review surface and submits them through one `Validate & apply all changes` workspace action.

Mixed staging has one ordering constraint: stage any Topic hierarchy moves before staging Case Primary Topic or Case Tag changes. Once Case-classification changes are pending, further Topic moves are disabled until the pending batch is applied or discarded.

This is a **unified review/apply workflow**, not a claim that the three underlying mutation domains form one database transaction.

### Topic hierarchy staging

Admins can stage Topic moves:

```text
Topic → System
Topic → Topic
Topic → Unassigned
```

Systems remain roots and cannot be moved beneath another classification.

Desktop drag/drop is supported, and every move also has a keyboard/mobile-friendly `Move to…` fallback.

Self, descendant, and inactive invalid targets are rejected before staging where possible. Apply carries the loaded/expected parent so stale hierarchy changes fail closed before canonical writes begin.

### Case Primary Topic staging

Admins can stage single or bounded bulk Case Primary Topic changes, including different selected Cases targeting different Topics within the same staged review.

Important rules:

- target must be an active Topic;
- Cases never attach directly to Systems;
- the existing 60-Case bulk boundary is retained;
- loaded and projected Primary Topic are distinct in the inspector;
- apply carries each Case's expected loaded Primary Topic so stale classification fails closed;
- the established canonical Primary Topic mutation functions remain authoritative.

No Additional Study Topic is created.

### Case Tag staging

Admins can stage Case Tag additions/removals for selected Cases, including supported bulk operations, in the same staged review as hierarchy and Primary Topic changes.

Tags remain flat metadata and are not hierarchy nodes or drag targets.

Staged Tag changes retain the loaded membership expectation. Server preflight rejects stale membership before delegating to the established canonical Case Tag mutation functions.

System↔Tag exposure remains outside this workspace.

## Apply, stale-state, and concurrency boundary

The unified workspace helper completes **all requested current-state preflight checks before the first canonical write**:

```text
validate staged hierarchy
→ validate staged Case Primary Topics
→ validate staged Case Tags
→ first canonical write
```

This catches stale hierarchy, stale Primary Topic state, stale Case/Tag membership, inactive Primary Topic targets, and invalid/inactive Tag-add targets that are visible at preflight time before any domain writer begins.

After successful preflight, the established domain writers are invoked sequentially for the non-empty domains. D1/Drizzle does **not** provide one serializable transaction across those canonical writers, so this workflow must not be described as one cross-domain rollback/atomic transaction. A narrow concurrent-change or later operational-failure window remains after preflight.

The accurate guarantee is therefore:

> one mixed staged review + one workspace apply action + all-domain fail-before-first-write preflight, followed by the existing canonical domain writers without a claimed cross-domain serializable transaction.

## Accessibility / interaction boundary

Drag/drop is not the only mutation path. Explicit move/change controls remain required for keyboard/narrow-screen workflows.

Hierarchy is communicated with labels/breadcrumb context rather than indentation alone, and Case rows use the Case title as their accessible/visual identity.

## Explicitly out of scope

- new Folder/Category taxonomy entity;
- learner-routing semantic changes;
- Additional Study Topic revival;
- moving System↔Tag exposure into this workspace;
- replacing detailed Topic-question management;
- replacing the full Case editor;
- arbitrary freeform canvas coordinates;
- production taxonomy/Case-data migration or curation merely as part of this UX implementation;
- claiming one serializable/rollback transaction across hierarchy + Primary Topic + Case Tags.

## Authority

For current behavior, use this order:

1. current `/admin/topics` route/component and taxonomy/Case domain functions;
2. current executable contract/model tests;
3. `V1_DATA_MODEL.md` / `AUTHORING_MODEL.md` for semantics;
4. this document for UX/design rationale;
5. PR #99 history for implementation/review context.
