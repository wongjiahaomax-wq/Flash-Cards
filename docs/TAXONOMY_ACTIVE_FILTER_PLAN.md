# Taxonomy status and type filters

Status: implementation-ready small UX change.

## Goal

On **Admin → Systems & Topics**, separate the current single taxonomy filter row into two composable filter dimensions so the default working view shows active taxonomy only while inactive taxonomy can be added or isolated when needed.

## Required behavior

### Status visibility

Provide two independent toggle chips:

`Active | Inactive`

Defaults:

- `Active` = on.
- `Inactive` = off.

Supported states:

- Active on + Inactive off → show active taxonomy only.
- Active on + Inactive on → show both active and inactive taxonomy.
- Active off + Inactive on → show inactive taxonomy only.
- Do not allow both status toggles to be off at the same time; toggling off the sole enabled status should leave it enabled/no-op rather than producing an empty status selection.

### Taxonomy type

Provide a separate mutually exclusive type filter:

`All | Systems | Topics | Unassigned`

Defaults:

- `All` selected.

Semantics:

- `All` → all taxonomy kinds allowed by the current status visibility.
- `Systems` → Systems allowed by the current status visibility.
- `Topics` → Topics allowed by the current status visibility.
- `Unassigned` → unassigned Topics allowed by the current status visibility.

Status and type filters compose. Examples:

- Active + All → active Systems and Topics only.
- Active + Systems → active Systems only.
- Active + Inactive + Topics → active and inactive Topics.
- Inactive only + Unassigned → inactive unassigned Topics only.

Search must compose with both filter dimensions and preserve the workspace's existing hierarchy/context semantics.

## Preserve

- Existing search semantics apart from composing with the new status/type filters.
- Existing expand/collapse, focus, Organize mode, Case reveal/selection, drag/drop, staging, and persistence behavior.
- Existing taxonomy hierarchy semantics and active/inactive data meaning.
- Existing visible-row count semantics: the count should continue to reflect the rows actually produced by the workspace model.

## Scope

Keep this a narrow client/model filtering change.

Do not:

- investigate or modify the intermittent folding behavior in this PR;
- add server/database/schema changes;
- add URL persistence for these filters;
- change taxonomy activation/deactivation rules;
- refactor the taxonomy workspace beyond what is necessary to represent the two filter dimensions.

Prefer the smallest current-architecture implementation. It is acceptable to replace the current single `WorkspaceFilter` shape with explicit status/type filter state if that is the cleanest minimal implementation.

## Acceptance

Executable coverage should prove the production row-building behavior for the important combinations:

- default state is Active on, Inactive off, All type;
- default state excludes inactive Systems/Topics and retains active ones;
- enabling Inactive while Active remains on shows both statuses;
- disabling Active while Inactive is on shows inactive taxonomy only;
- the last enabled status cannot be turned off;
- Systems, Topics, and Unassigned each compose correctly with status visibility;
- search composes correctly with status + type filtering while preserving required ancestor/context behavior;
- switching filter combinations restores rows that otherwise qualify;
- existing filtering behavior unrelated to this change remains covered.

Use focused executable model coverage. Add component interaction coverage only if an existing lightweight harness makes the status-toggle behavior straightforward to prove; do not introduce new test infrastructure solely for this small UX change.

Follow repository-owned validation and report what actually ran.

## Work state

Implement in this existing Draft PR/branch. Do not create another PR, merge, or mark Ready for Review until review is complete.
