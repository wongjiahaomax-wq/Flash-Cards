# Taxonomy active filter

Status: implementation-ready small UX change.

## Goal

On **Admin → Systems & Topics**, add an `Active` filter alongside the existing taxonomy filters so the workspace can show only active Systems and Topics.

## Required behavior

- Filter row becomes: `All | Active | Systems | Topics | Unassigned | Inactive`.
- `Active` shows only taxonomy items where `isActive` is true.
- Search continues to work within the Active subset and preserves the existing hierarchy/context behavior.
- `All` remains the default.
- Existing `Systems`, `Topics`, `Unassigned`, and `Inactive` behavior remains unchanged.
- Existing expand/collapse, focus, Organize mode, Case reveal/selection, drag/drop, staging, and persistence behavior remains unchanged.

## Scope

Keep this a narrow client/model filtering change. Do not investigate or modify the intermittent folding behavior as part of this PR. Do not add server/database changes, URL persistence, or refactor the taxonomy workspace.

## Acceptance

- `Active` is available as a filter chip.
- Selecting `Active` excludes every inactive System/Topic and retains active items.
- Active + search returns only matching active taxonomy with the existing required hierarchy context.
- Switching back to `All` restores inactive rows that otherwise qualify.
- Existing filter behavior remains covered and unchanged.
- Add focused executable model coverage for the new Active filter; use existing component coverage only where already lightweight and appropriate.
- Follow repository-owned validation and report what ran.

## Work state

Implement in this existing Draft PR/branch. Do not create another PR, merge, or mark Ready for Review until review is complete.
