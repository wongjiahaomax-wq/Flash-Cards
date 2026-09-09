# Slide Import Reviewer — Workspace Visual Polish Plan

_Status: planning-only Draft PR. Implementation is intended for GPT-5.6 Luna in Codex after the current inline-crop reviewer work has landed/reconciled._

## Goal

Improve the Slide Import Reviewer's desktop UI/UX primarily through layout, spacing, typography and visual hierarchy, without changing the review workflow or review semantics.

The reviewer should feel like a clean professional review workstation while preserving the current core task:

```text
select Case
→ read the source slide at large size
→ compare proposed learner content
→ review/edit Q&A
→ set existing review states
```

The source slide remains the visual centre of gravity. It must not become materially smaller at a normal desktop viewport just to make the Case queue wider or the UI prettier.

## Why this change

The current desktop layout is functional but visually cramped:

- the Case queue is fixed at about 190 px and long Case titles wrap into narrow vertical stacks;
- Case title, status and technical metadata compete for the same small space;
- major workspace regions are visually close together and rely heavily on nested borders;
- the right-hand review pane repeats source identifiers and routine metadata more than necessary;
- the native browser file chooser makes the otherwise application-like tool look unfinished;
- typography, spacing and selection hierarchy can be more deliberate without adding workflow complexity.

This PR should solve those presentation problems only.

## Design invariants

1. **Preserve source readability.** At a representative 1680 px desktop viewport, the rendered source slide must remain approximately the same usable visual width/height as before this PR. Widening the Case queue must not materially shrink the source evidence pane.
2. **No workflow redesign.** Existing navigation, approval, warning override, Q&A editing, persistence, crop editing, source selection and finalization behavior remain unchanged.
3. **No new dependency.** Use the existing standalone reviewer architecture and ordinary HTML/CSS/JavaScript.
4. **Preserve responsive behavior.** Narrow layouts must remain usable with no forced horizontal scrolling and must retain the existing single-column/mobile fallback unless current code requires an equivalent safer adaptation.
5. **Preserve evidence access.** Any visual compaction of provenance must retain direct clickable source-page access and the same underlying source-selection behavior.
6. **Generated artifact discipline.** Work in the maintainable reviewer sources and regenerate `reviewer.html` through the existing build path; do not hand-maintain the generated standalone file independently.

## Scope

### 1. Widen and clean up the Case queue

Increase the desktop Case queue from its current narrow fixed width to a responsive width approximately in this design range:

```text
250–270 px at a 1680 px desktop viewport
reasonable minimum around 240–250 px
reasonable maximum around 280 px
```

Do not treat those numbers as a requirement to hard-code one exact width if the current layout supports a cleaner responsive expression such as `clamp(...)`.

The Case queue should gain modestly more breathing room:

- increase internal row padding;
- slightly increase separation between Cases;
- keep the human-facing Case title dominant;
- render technical/package-local ID text smaller and visually secondary;
- keep status compact and prevent it from unnecessarily squeezing the title;
- preserve selected/hover/focus clarity;
- avoid adding extra queue metadata such as Topic, question count or source pages in this PR.

Desired information hierarchy:

```text
G6PD deficiency / haemolytic anaemia          Pending
4 · case-004
```

The selected Case should be obvious without a visually heavy boxed outline. Prefer a restrained selected treatment such as a tinted background plus a narrow accent indicator, while retaining accessible focus indication.

### 2. Preserve source-pane visual size while reallocating width

The source pane must remain approximately as large as it is now at representative desktop width.

When the Case queue becomes wider, absorb most of the horizontal cost from the right-hand review pane rather than shrinking the source pane.

Do **not** apply the earlier idea of making the source side smaller than today merely to achieve an even source/review split.

Implementation should tune the actual current grid rather than blindly copying fixed values, but the acceptance invariant is:

```text
wider Case queue
+
source slide remains materially unchanged in readable size
+
right review pane becomes only as narrow as necessary
```

The source pane should remain visually plain and evidence-first. Do not add decorative UI around the slide that consumes meaningful space.

### 3. Improve major workspace spacing

Use a consistent restrained spacing system so the three work regions feel clearly separated without wasting pixels.

Target direction:

```text
outer workspace padding: ~18–20 px
major column gap: ~16–20 px
panel internal padding: ~14–16 px
smaller internal gaps using a consistent 4/8/12/16/24-style scale
```

These are design targets, not a requirement to scatter magic numbers. Reuse CSS variables/custom properties if that simplifies consistency without broad refactoring.

Do not significantly inflate Q&A-card vertical spacing; the user still needs high information density.

### 4. Improve typography and visual hierarchy

Make the reviewer easier to scan through modest typography changes:

- application/panel titles should be clearly differentiated from field labels and technical metadata;
- reduce the visual dominance of package-local IDs;
- avoid unnecessary bold text where normal weight is sufficient;
- maintain readable medical/source text sizes;
- keep source links clearly identifiable and accessible;
- do not introduce a new font dependency.

The result should look cleaner, not larger for its own sake.

### 5. Simplify borders/cards without hiding structure

The current UI contains many nested rectangles: panel border → question-card border → field border → status-control border.

Reduce visual noise where safe:

- keep clear outer panel/workspace boundaries;
- keep editable form controls clearly identifiable;
- make ordinary question-card boundaries more subtle;
- use background/spacing hierarchy rather than adding more borders/shadows;
- use only restrained shadows, if any;
- warnings/blockers must remain visually prominent and must not be visually softened into routine metadata.

No warning semantics change is allowed.

### 6. Refine Case status and selected-state presentation

Existing review states and underlying controls remain authoritative.

Improve their presentation only:

- compact status pills/badges where state is displayed passively;
- existing editable status controls remain usable and unchanged semantically;
- approved / needs-review / rejected / pending distinctions remain clear;
- colour supplements text rather than replacing it;
- preserve adequate contrast and keyboard focus visibility.

Suggested restrained state palette direction:

```text
neutral/slate: structure and ordinary controls
blue: selection and source links
green: approved
amber: needs review / warnings
red: rejected / blocking
```

Reuse existing palette values where practical rather than adding a second theme system.

### 7. Compact routine provenance presentation

The right-hand Q&A pane may become slightly narrower, so routine provenance should use space more efficiently.

For a single-source bundle, avoid repeating the same source identifier before every page reference when it adds no disambiguation.

Preferred human-facing direction:

```text
Prompt p.13 · Answer pp.14–15 · High confidence
```

rather than:

```text
Prompt source: source-001 p.13 · Answer source: source-001 p.14, source-001 p.15 · Confidence: high
```

Requirements:

- source page references remain clickable;
- clicking them must retain the existing source-preview selection/navigation behavior;
- multi-source bundles must still show enough source identity to disambiguate references;
- do not remove provenance from underlying review data;
- do not change review-map schema or source-reference semantics;
- warnings/review notes are not to be hidden solely to save space.

This is a rendering-format change only.

### 8. Polish the top file-opening/header area

Keep the same local/offline file-opening mechanism and native file input underneath, but present it more like an application control.

Desired direction:

```text
Flash-Cards Slide Import Reviewer
Abnormal laboratory results interpretation — Benjamin Seng — 24 July 2026
Saved locally · 9:42 pm                         [Open review ZIP]
```

Requirements:

- use an `Open review ZIP`-style visible control rather than exposing the raw browser `Choose File / No file chosen` presentation;
- retain the same accepted file types and local-only behavior;
- long batch titles must wrap or truncate gracefully without crowding controls;
- save/persistence state must remain visible;
- no new open/import workflow, drag/drop behavior or persistence behavior is introduced.

## Explicit non-goals

Do not add or change:

- sticky Case-review header;
- `Approve & Next` or other new workflow shortcuts;
- navigation semantics;
- review-state semantics or vocabulary;
- blocking-warning override semantics;
- Q&A bulk-accept semantics;
- persistence/fingerprint behavior;
- finalization/readiness behavior;
- source-page vetting behavior;
- inline crop behavior from the current crop PR;
- image replacement behavior;
- keyboard shortcut behavior;
- draggable/resizable columns;
- collapsible sidebar;
- searchable Case queue;
- new dependencies or UI frameworks;
- schema/package changes;
- extraction/Slide Prep behavior;
- Admin/importer/D1/R2/deployment/taxonomy behavior.

This must remain a visual/layout polish PR, not another reviewer architecture project.

## Interaction with the current inline-crop PR

The inline learner-image crop work is being developed separately and touches the same reviewer surface.

Do not implement this visual-polish plan against a stale pre-crop reviewer state if that work has not yet landed. Before implementation:

1. inspect the actual current `main` and current PR state;
2. if the inline-crop PR has landed, reconcile/rebase this branch onto that current `main` and preserve its behavior;
3. if it has not landed, do not duplicate or pre-implement crop-related UI here; report the dependency and keep this PR planning-only until the integration base is clear.

Visual changes must not break crop controls, crop-session layout, operation-guard behavior or crop-specific regression coverage once present.

## Implementation guidance for GPT-5.6 Luna in Codex

Use the repository's current root/scoped agent guidance and progressive retrieval. Start from the actual current reviewer source/layout/tests; broaden only when evidence requires it.

Prefer a small CSS/presentation diff plus minimal rendering-format changes over component or state refactoring.

Do not infer that visual polish authorizes cleanup of unrelated reviewer code.

Keep all event handlers/state transitions/persistence/finalizer logic unchanged unless a tiny presentation adaptation is strictly required. If implementation appears to require altering review semantics, stop and report the conflict rather than widening scope.

For the header file control, preserve the existing input element's functional behavior and accessibility; a styled label/button wrapper is sufficient if compatible with current code.

For provenance compaction, keep the existing source-link generation/selection mechanism as the behavioral owner. Change display formatting around it rather than creating a second source-navigation path.

## Executable acceptance contract

Important invariants should be proven at the behavioral/rendering layer rather than by static regex alone.

| Invariant | Required behavior | Required proof |
| --- | --- | --- |
| Source readability | At representative desktop width, widening the queue does not materially reduce the displayed source slide area compared with the pre-change reviewer | executable DOM/browser layout test if current harness supports measurable geometry; otherwise repository-supported rendered/browser smoke with explicit measured widths plus focused structural coverage |
| Queue width/hierarchy | Desktop queue is materially wider and long titles have more usable width; technical ID/status remain present | executable rendered reviewer/component/browser assertion at representative width |
| Responsive safety | Existing narrow/single-column behavior remains usable with no horizontal overflow | executable rendered/browser assertion at the current responsive breakpoint(s) |
| Provenance safety | Compact provenance still exposes clickable prompt/answer source links and selecting them drives the existing source-preview behavior | executable interaction through the actual rendered link/event path |
| Header file opening | Styled `Open review ZIP` control activates the real file input/load path; file acceptance/local behavior unchanged | executable interaction through the actual rendered control/input path where supported |
| Review semantics preserved | No status/navigation/persistence/finalization behavior changes are introduced | existing focused slide-review regression suite remains green; add only targeted coverage needed for changed UI paths |
| Generated artifact | Standalone reviewer remains synchronized | existing slide-review build/check path passes |

If the current slide-review test harness cannot reliably measure CSS geometry, do not add a heavy new browser dependency for this PR. Use the lightest existing executable/rendered mechanism plus a documented manual viewport smoke. Static/source inspection may supplement but must not be the only proof for clickable provenance or file-opening behavior.

## Manual acceptance smoke

At minimum use a representative review bundle containing:

- multiple Cases with several long Case titles;
- a Case with multiple source pages/thumbnails;
- several Q&A items with prompt/answer provenance;
- at least one warning/status variation;
- learner image/crop controls if the inline-crop PR has landed.

Check at approximately 1680 px desktop width:

1. Case queue is visibly wider and long titles usually fit in roughly 2–3 sensible lines rather than a narrow vertical stack.
2. Selected Case is obvious without a heavy visual box dominating the queue.
3. Source slide remains approximately the same readable size as before this PR.
4. Source thumbnails remain clear and directly selectable.
5. Right Q&A pane remains usable despite being slightly narrower.
6. Routine provenance is visibly shorter but every relevant source page is still directly clickable.
7. Warnings/blockers remain prominent.
8. Top file-opening area presents a clean `Open review ZIP` control and still opens the same review bundles.
9. Existing status editing, bulk Q&A behavior, warning override, persistence, source navigation and finalization behave unchanged.
10. If crop functionality is present, crop controls remain usable and visually coherent.

Also check the existing narrow responsive layout for overflow and control wrapping.

## Validation

During implementation use focused slide-review tests while iterating, then follow the current repository-owned checkpoint/handoff validation.

At minimum preserve the subsystem requirements:

```text
npm run slide-review:test
npm run slide-review:build
```

Then run the current repository-required final checks for the actual changed head and report what ran.

Do not weaken final validation because the change is mostly CSS.

## Acceptance criteria

This PR is implementation-complete when:

- the Case queue is materially more spacious and readable on desktop;
- long Case titles no longer feel forced into an excessively narrow column;
- the source slide remains approximately as large/readable as before at representative desktop width;
- the overall workspace has clearer spacing, typography and visual hierarchy;
- routine provenance consumes less visual space without losing direct evidence access;
- the top file-opening area looks application-like rather than exposing the raw browser file chooser;
- the right review pane remains fully usable;
- responsive/narrow layouts do not regress;
- all existing review/crop/persistence/finalization semantics remain unchanged;
- the generated standalone reviewer is in sync;
- focused and repository-required validation passes.

## Luna handoff

Use this when implementation starts:

> Continue this existing Draft PR; do not create a new PR or restart from `main`. First inspect the actual current head/main and whether the inline-crop reviewer PR has landed. If needed, reconcile this branch onto the current post-crop `main` before editing. Implement `docs/SLIDE_REVIEWER_WORKSPACE_VISUAL_POLISH_PLAN.md` as a bounded presentation/layout change. The hard invariant is that the source slide must remain approximately the same readable size at a representative 1680 px desktop viewport while the Case queue becomes materially wider and cleaner. Absorb most of the width cost from the right review pane, then compensate with compact provenance and reduced visual chrome. Preserve all review, navigation, persistence, warning-override, finalization, source-selection and crop behavior. Prefer CSS and minimal display-format changes; no new dependency, state model, workflow, schema or broad refactor. Add focused executable/rendered coverage for the changed interaction paths and responsive/layout invariants using the current harness; do not add a heavy browser framework solely for geometry. Regenerate `reviewer.html` through the existing build path, run current slide-review checks plus repository-required final validation, keep the PR Draft, and do not merge or mark Ready until independently reviewed.
