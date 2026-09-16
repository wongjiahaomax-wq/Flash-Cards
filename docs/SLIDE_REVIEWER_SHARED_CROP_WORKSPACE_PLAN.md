# Slide Import Reviewer — Shared Crop Workspace Plan

_Status: implementation-ready after first-pass planning review. Planning and implementation belong in this same Draft PR; do not create a second PR, mark Ready, or merge until implementation and review are complete._

## Goal

Make learner-image cropping practical when a Case contains multiple images by moving the active crop editor out of the narrow learner-image card and into the large central **Original source** pane, and make the boundary between the central source workspace and right-side **Proposed import** workspace user-resizable.

Intended workflow:

```text
review Case
→ optionally drag the Source ↔ Proposed import divider to allocate working space
→ click Adjust crop on one learner image
→ if exactly one valid Asset-linked source exists, select it automatically
→ if multiple valid Asset-linked sources exist, explicitly choose one from that Asset's existing source picker
→ central pane enters crop mode using that validated Asset source
→ drag the crop rectangle or resize from its edges/corners
→ right-side Asset card remains the selected target and keeps showing the currently saved learner image
→ Save crop
→ learner image refreshes from the newly committed bytes
→ central pane returns to normal source review
→ continue reviewing
```

This is a UX/layout improvement to the existing crop feature, not a new image editor or workspace framework.

## Product contract

### 1. One shared large crop workspace

The central source pane becomes the crop canvas while an Asset is being adjusted.

Do not render the interactive crop canvas inside the narrow learner-image card. The right-side Asset remains the crop target and should stay visibly selected.

Normal source-review behavior returns when crop mode exits.

The central crop workspace is the only interactive crop preview. Do not add a second live cropped-preview pipeline in the Asset card.

### 2. Asset-linked crop source is authoritative

Crop source safety remains an Asset-level boundary.

While crop mode is active, the validated Asset-linked source held by the crop session is authoritative. The central crop workspace must render that source directly even if the ordinary Case source viewer had a different page selected immediately before crop entry.

Ordinary Case-level source selection/rendering must not overwrite, substitute, or constrain the active crop source.

The currently visible Case source page must never become the crop source merely because it is visible.

If two Assets come from the same source page, switching between those Assets may leave the same page visible, but the active crop session must still belong to the newly selected Asset.

### 3. Single-source and ambiguous-source behavior

Preserve the existing source-selection safety contract explicitly:

- **exactly one usable Asset-linked source** → `Adjust crop` may start directly and that source is selected automatically;
- **multiple usable Asset-linked sources** → keep the existing explicit Asset source picker; do not silently choose the first source or reuse an unrelated Case source selection;
- `Adjust crop` starts only after the selected path is one of that Asset's valid source candidates;
- **no usable Asset-linked source** → crop remains unavailable/disabled and the existing fallback remains available.

The source picker may remain in the Asset card because it identifies which Asset-linked source will be used. Moving the interactive crop surface to the central pane does not remove this ambiguity safeguard.

### 4. Preserve drag + resize crop editing

The large central crop surface must preserve the existing crop interaction contract:

- drag the whole crop rectangle to move it;
- resize from all four edges and all four corners;
- keep the crop inside source bounds;
- preserve current minimum-size behavior;
- preserve pointer capture/cleanup behavior so dragging remains stable when the pointer leaves the crop surface.

Do not replace the existing crop geometry/pointer implementation with a new interaction system merely because the rendering location changes.

### 5. Resizable Source ↔ Proposed import workspace divider

Add one draggable vertical splitter between the central **Original source** workspace and the right-side **Proposed import** workspace.

The purpose is to let the reviewer temporarily give more width to the source/crop area or more width to question/answer editing.

Required desktop/side-by-side behavior:

- the left **Cases** queue keeps its existing layout/width behavior; this PR does not make every column independently resizable;
- dragging the splitter horizontally resizes only the central and right working panes;
- both panes retain sensible minimum widths so neither can be accidentally collapsed or made unusable;
- source content and Proposed import content reflow inside their pane rather than overflowing across the splitter;
- the selected split remains across ordinary reviewer rerenders and while navigating between Cases during the current reviewer session;
- crop mode uses the same current split rather than forcing a special fixed width;
- entering/exiting crop mode does not reset the split;
- use the smallest native implementation that fits the current layout, such as a local/session split value applied to the existing grid; do not add a split-pane dependency or general layout framework.

A narrow visible grab target and resize cursor should make the divider discoverable without materially reducing workspace width.

Persistence across browser reload/reopening the reviewer is not required.

#### Splitter pointer lifecycle

Use a bounded Pointer Events lifecycle rather than document-wide unmanaged dragging:

- accept one primary pointer only;
- capture the accepted pointer on drag start where supported;
- process moves only for the active pointer;
- ignore secondary/unrelated pointers;
- finish on matching `pointerup`;
- also clean up on matching `pointercancel` and `lostpointercapture`;
- cleanup is idempotent and cannot leave the divider stuck in a dragging state.

This is local UI interaction state only; do not create a new operation guard or concurrency abstraction for the splitter.

#### Responsive/stacked behavior

The current reviewer has a responsive layout that stacks the source and Proposed import workspaces at narrower widths. Preserve that behavior.

When those panes are stacked rather than side-by-side:

- hide/disable the vertical splitter;
- do not apply desktop split widths to the stacked layout;
- do not introduce horizontal page scrolling merely to preserve the split;
- keep source review, crop controls, and Proposed import editing usable;
- when the viewport returns to the side-by-side layout in the same session, restore the previously selected desktop split.

Do not redesign the existing responsive breakpoint system unless a small bounded adjustment is required to preserve current usability.

### 6. Splitter is presentation-only

Dragging or restoring the workspace divider must not:

- mutate `manifest.json`-backed state;
- mutate `review-map.json`-backed state;
- change any review status;
- mark the review dirty;
- schedule/write autosave snapshots;
- affect reviewed-bundle backup contents;
- affect final Import ZIP contents.

The split is transient reviewer UI state only.

### 7. Crop-mode presentation and saved-image behavior

While cropping, the central pane should clearly identify the active target, for example:

```text
Adjust crop · Repeat thyroid function tests
Source: source-001 · page/slide 24
```

The right-side selected Asset card should remain visible and highlighted.

While crop geometry is still unsaved, keep showing the currently saved learner image in the Asset card. Do not build a separate live crop-rendering path there.

After a successful **Save crop**, refresh the Asset card from the newly committed learner bytes through the existing resource/cache path.

Keep the existing **Reset**, **Cancel**, and **Save crop** semantics. Their exact visual placement may follow the simplest current component structure as long as the active target and actions are unambiguous.

### 8. Save/cancel/switch semantics remain unchanged

This PR must preserve the existing crop mutation contract, including:

- Cancel is a no-op for learner media/review metadata;
- Save preserves the existing Asset identity/path/MIME and updates the cropped bytes through the current crop-save path;
- SHA/review invalidation/extraction-method behavior remains unchanged;
- existing protected-operation serialization, persistence, export/finalization behavior, stale-work protection, and failure atomicity remain unchanged.

Unsaved crop geometry remains transient.

If the reviewer switches from Asset A to Asset B without saving A, A's transient crop geometry is discarded with **no learner-byte, SHA, review-status, cache, or persistence mutation**. Do not add a confirmation dialog or draft-crop persistence system for this.

This PR should not redesign the crop-save pipeline.

## Multi-image UX

The main requirement is that multiple learner images no longer compete for tiny crop canvases in the right column.

Keep each learner Asset independently selectable with its own **Adjust crop** action. Selecting a different Asset transfers the shared central crop workspace to that Asset/source according to the source-safety rules above.

The resizable workspace divider complements this: the reviewer may widen the central pane for crop work and move it back when focusing on question/answer editing.

Do not introduce tabs, floating windows, a modal editor, zoom/pan, or another dedicated image-editing screen. They are not required for this task.

A small visual cleanup of the learner-image cards is allowed if needed to make the selected crop target obvious, but do not turn this into a broad reviewer redesign.

## Scope

Keep changes within `tools/slide-import-review/` plus this plan/documentation as appropriate.

Preserve current reviewer behavior outside crop-layout/source-selection integration and the single Source ↔ Proposed import splitter.

Do not change:

- review-map or import-package schemas;
- extraction pipeline;
- production Admin/importer;
- D1/R2/deployment;
- image formats or Asset paths;
- dependency list;
- crop-save architecture;
- left Cases queue sizing behavior;
- unrelated reviewer workspace layout.

Do not add a reusable pane-management abstraction unless current code already has one that is simpler to extend.

## Implementation guidance

Inspect the actual current reviewer implementation and reuse the existing crop session, source resolution, geometry, pointer handling, Canvas save, operation guard, persistence, and replacement logic.

Prefer the smallest refactor that separates:

```text
active crop session / validated Asset source / crop geometry
from
where the crop surface is rendered
```

When crop mode is active, the central pane should render from the active crop session's validated Asset source. When crop mode is inactive, it should render the ordinary Case source viewer.

The right-side Asset card should initiate/select the session, retain any existing ambiguous-source picker, visually identify the selected target, and show the saved learner image rather than owning a second interactive crop canvas.

For the workspace splitter:

- keep one reviewer-session split value outside the rerendered DOM;
- reapply it whenever the side-by-side workspace rerenders;
- clamp it against the actual current workspace/minimum pane widths;
- ignore it while the responsive layout is stacked;
- restore it when returning to side-by-side layout.

Do not create duplicate crop state, a second crop implementation, a live crop-preview subsystem, a generic resizable-panels subsystem, or persisted layout preferences.

## Executable acceptance contract

| Invariant | Required behavior | Required executable proof |
| --- | --- | --- |
| Single Asset source | one valid Asset source auto-selects and starts crop using that source | browser transition covering automatic source selection |
| Ambiguous Asset sources | multiple valid Asset sources require explicit Asset-source selection; no silent first-source choice | browser transition beginning with no candidate selected |
| Asset source authority | crop mode renders the validated Asset source even when an unrelated Case source was previously visible | focused source-selection regression |
| Multiple Assets | switching crop target selects the correct Asset/session, including two Assets sharing one source page | browser transition with multiple learner Assets |
| Unsaved target switch | switching A → B without saving A discards A geometry with zero media/review/persist mutation | focused browser transition |
| Large shared crop surface | active crop editor renders in the central source pane, not inside the narrow Asset card | production reviewer DOM/render assertion |
| Crop move + resize | crop can be dragged and resized from 4 edges + 4 corners after relocation | existing pointer/geometry tests remain green plus focused relocated-DOM interaction proof if needed |
| Workspace splitter | dragging the central/right divider changes only their widths, Cases is unaffected, and minimum widths are enforced | focused production DOM/pointer transition test |
| Splitter pointer cleanup | primary pointer capture works and up/cancel/lost-capture all end drag cleanly | focused DOM/event transition |
| Split retention across rerenders | chosen split survives Case navigation and at least one non-navigation rerender | browser transition covering both |
| Crop + splitter integration | entering/exiting crop mode does not reset the current workspace split | focused transition assertion |
| Responsive splitter | stacked layout hides/disables splitter and ignores desktop widths; returning to side-by-side restores the session split | rendered responsive transition/smoke plus light executable assertion where available |
| Splitter has no review persistence | divider movement does not dirty or mutate bundle/review/autosave state | focused state assertion |
| Unsaved Asset preview | Asset card keeps showing saved learner media during crop editing | DOM/render assertion |
| Cancel | exits shared crop mode and restores ordinary source review without media/review mutation | actual cancel transition |
| Save | existing crop-save semantics still apply and successful Save refreshes the Asset from committed bytes | actual save transition/regression coverage |
| Existing protections | protected save, stale-work, failure atomicity, export/finalization and persistence behavior do not regress | existing crop-save regression suite remains green |

Static/regex checks may supplement these tests but should not be the only proof for the interaction changes.

Do not add a heavyweight browser/testing dependency solely for layout measurement. Use the lightest current executable/rendered mechanism plus documented manual viewport smoke where CSS geometry cannot be reliably asserted in the existing harness.

## Manual smoke

Use a representative Case with at least two learner images and, if available, one Asset with multiple valid source references.

At representative desktop/intermediate widths already used by the reviewer workflow (including approximately 1680, 1440, and 1280 px) and around the existing responsive transition/narrow layout, confirm:

1. drag the Source ↔ Proposed import divider in both directions; both panes remain usable and Cases stays unchanged;
2. force an ordinary rerender and navigate to another Case; the chosen desktop split remains;
3. enter a stacked/narrow viewport: splitter disappears/does not force widths; return to desktop and the previous split returns;
4. with an unrelated Case source page visible, click **Adjust crop** on a single-source image A → centre switches to A's Asset-linked source and shows the large crop surface without resetting the split;
5. drag the crop rectangle and resize from at least one edge and one corner;
6. confirm image A's right-side card still shows the saved learner image while the crop is unsaved;
7. Cancel returns to normal source review without changing A or the chosen split;
8. adjust A again and Save → A preview refreshes from the committed cropped bytes;
9. for a multi-source Asset, confirm no source is silently chosen; explicitly select one valid Asset source before crop starts;
10. start adjusting A, then switch to image B without saving A → A remains unchanged and B gets its own correct crop session/source;
11. if A and B share one source page, the page may remain visible but the active target/session changes correctly;
12. other learner-image cards remain visible and are not themselves interactive crop canvases;
13. ordinary source review and Proposed import editing remain usable near both splitter limits and in the stacked layout.

## Completion

Implementation, focused tests, generated reviewer output, and any small README update required by the changed UX belong in this same PR.

Follow current repository guidance and progressive retrieval. Keep the PR Draft during implementation. Do not merge or mark Ready for Review.

## Luna 5.6 handoff

Continue Draft PR #183. Planning and implementation belong in this same PR; do not create another PR. Implement this plan, including the shared central crop workspace and single Source ↔ Proposed import divider. Preserve Asset-linked crop-source authority and existing ambiguous-source selection safety. The splitter is desktop/side-by-side UI only, must survive ordinary rerenders in-session, must disappear cleanly in the stacked responsive layout, and must not dirty or persist review data. Keep the Asset card on the saved learner image until Save succeeds. Preserve the existing crop/save safety architecture and left Cases queue behavior. Keep the solution small and native; no new dependency, generic layout subsystem, live second crop preview, or persisted layout preference. Run focused interaction/regression coverage plus the existing responsive/manual smoke and repository-required final validation. Do not mark Ready or merge.