# Taxonomy context collapse fix

Status: implementation-ready small fix.

## Problem

On **Admin → Systems & Topics**, a System/Topic can show the collapsed chevron (`▸`) while its descendants remain visible when search/filter context is active.

The collapse button correctly updates `collapsedIds`, but `buildTaxonomyWorkspaceRows()` currently prunes descendants only when `needsContext` is false:

```ts
if (!needsContext && collapsedIds.has(item.id)) return;
```

`needsContext` becomes true for a non-empty search or any filter other than `all`, so explicit collapse state is ignored for row traversal in those states.

## Required behavior

An explicit collapsed node must hide its descendants regardless of whether search/filter context is active.

Preserve existing search/filter ancestor-context behavior otherwise. Do not change taxonomy hierarchy semantics, Case reveal behavior, focus mode, organize mode, drag/drop, or persistence.

## Scope

Keep this as a narrow client/model fix. Prefer the smallest implementation consistent with the current architecture; do not refactor the taxonomy workspace.

## Acceptance

- Collapsing a System such as Cardiology hides all descendant Topics in the normal `all` view.
- The same explicit collapse hides descendants while a non-empty search is active.
- The same explicit collapse hides descendants while a non-`all` taxonomy filter is active.
- Expanding restores the descendants that otherwise satisfy the current search/filter.
- `Collapse all`/`Expand all` retain coherent behavior under the same states.
- Add focused executable coverage against the production row-building behavior for these cases. If an existing lightweight component/browser harness already covers this workspace, add a click-level regression there too; do not introduce new test infrastructure solely for this fix.
- Follow repository-owned validation and report what ran.

## Work state

Implement in this existing Draft PR/branch. Do not create another PR, merge, or mark Ready for Review until review is complete.
