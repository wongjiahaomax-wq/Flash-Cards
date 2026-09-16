# Slide Import Reviewer — Shared Crop Workspace Plan

_Status: implementation-ready plan. Planning and implementation belong in this same Draft PR; do not create a second PR, mark Ready, or merge until implementation and review are complete._

## Goal

Make learner-image cropping practical when a Case contains multiple images by moving the active crop editor out of the narrow learner-image card and into the large central **Original source** pane.

Intended workflow:

```text
review Case
→ click Adjust crop on one learner image
→ central source pane automatically selects that Asset's linked source slide/page
→ central pane enters crop mode for that Asset
→ drag the crop rectangle or resize from its edges/corners
→ right-side Asset card remains the selected target and shows the crop result/preview
→ Save crop
→ central pane returns to normal source review
→ continue reviewing
```

This is a UX/layout improvement to the existing crop feature, not a new image editor.

## Product contract

### 1. One shared large crop workspace

The central source pane becomes the crop canvas while an Asset is being adjusted.

Do not render the interactive crop canvas inside the narrow learner-image card. The right-side Asset remains the crop target and should stay visibly selected.

Normal source-review behavior returns when crop mode exits.

### 2. Automatic source selection

Clicking **Adjust crop** on an eligible Asset must automatically select the source slide/page associated with that Asset and display it in the central pane.

Reuse the existing Asset-linked source safety rules. Crop mode must never silently use whatever Case source page happens to be visible.

- one usable Asset-linked source → select it automatically;
- multiple usable Asset-linked sources → preserve the existing explicit source-choice behavior rather than choosing an unrelated page;
- no usable Asset-linked source → crop remains unavailable and the existing fallback remains available.

If two Assets come from the same source page, switching between those Assets may keep the same page visible but must load the correct Asset crop session.

### 3. Preserve drag + resize editing

The large central crop surface must preserve the existing crop interaction contract:

- drag the whole crop rectangle to move it;
- resize from all four edges and all four corners;
- keep the crop inside source bounds;
- preserve current minimum-size behavior;
- preserve pointer capture/cleanup behavior so dragging remains stable when the pointer leaves the crop surface.

Do not replace the existing crop geometry/pointer implementation with a new interaction system merely because the rendering location changes.

### 4. Crop-mode presentation

While cropping, the central pane should clearly identify the active target, for example:

```text
Adjust crop · Repeat thyroid function tests
Source: source-001 · page/slide 24
```

The right-side selected Asset card should remain visible and highlighted. Keep only the information/actions needed to understand the target and result; the interactive source crop surface belongs in the centre.

Keep the existing **Reset**, **Cancel**, and **Save crop** semantics. Their exact visual placement may follow the simplest current component structure as long as the active target and actions are unambiguous.

### 5. Save/cancel semantics remain unchanged

This PR must preserve the existing crop mutation contract, including:

- Cancel is a no-op for learner media/review metadata;
- Save preserves the existing Asset identity/path/MIME and updates the cropped bytes through the current crop-save path;
- SHA/review invalidation/extraction-method behavior remains unchanged;
- existing protected-operation serialization, persistence, export/finalization behavior, stale-work protection, and failure atomicity remain unchanged.

This PR should not redesign the crop-save pipeline.

## Multi-image UX

The main requirement is that multiple learner images no longer compete for tiny crop canvases in the right column.

Keep each learner Asset independently selectable with its own **Adjust crop** action. Selecting a different Asset transfers the shared central crop workspace to that Asset/source.

Do not introduce tabs, floating windows, a modal editor, zoom/pan, or another dedicated image-editing screen unless the current implementation makes one of those strictly necessary. They are not part of this task.

A small visual cleanup of the learner-image cards is allowed if needed to make the selected crop target obvious, but do not turn this into a broad reviewer redesign.

## Scope

Keep changes within `tools/slide-import-review/` plus this plan/documentation as appropriate.

Preserve current reviewer behavior outside crop-layout/source-selection integration.

Do not change:

- review-map or import-package schemas;
- extraction pipeline;
- production Admin/importer;
- D1/R2/deployment;
- image formats or Asset paths;
- dependency list;
- crop-save architecture;
- unrelated reviewer workspace layout.

## Implementation guidance

Inspect the actual current reviewer implementation and reuse the existing crop session, source resolution, geometry, pointer handling, Canvas save, operation guard, persistence, and replacement logic.

Prefer the smallest refactor that separates:

```text
active crop session / crop geometry
from
where the crop surface is rendered
```

The central source pane should render the active crop surface when crop mode is active; otherwise it should render the ordinary source viewer.

The right-side Asset card should initiate/select the session and reflect the selected target/result rather than own a second interactive crop canvas.

Do not create duplicate crop state or a second crop implementation.

## Executable acceptance contract

| Invariant | Required behavior | Required executable proof |
| --- | --- | --- |
| Asset → source selection | Adjust crop selects only the clicked Asset's valid linked source | browser transition covering automatic source selection |
| Multiple Assets | switching crop target selects the correct Asset/session, including two Assets sharing one source page | browser transition with multiple learner Assets |
| Large shared crop surface | active crop editor renders in the central source pane, not inside the narrow Asset card | production reviewer DOM/render assertion |
| Move + resize | crop can be dragged and resized from 4 edges + 4 corners after relocation | existing pointer/geometry tests remain green plus focused browser interaction proof if current tests do not exercise the relocated DOM |
| Cancel | exits shared crop mode and restores ordinary source review without media/review mutation | actual cancel transition |
| Save | existing learner-image crop-save semantics still apply and the updated Asset is reflected in the right panel | actual save transition/regression coverage |
| Source safety | visible unrelated Case source page can never become the crop source by accident | focused source-selection regression |
| Existing protections | protected save, stale-work, failure atomicity, export/finalization and persistence behavior do not regress | existing crop-save regression suite remains green |

Static/regex checks may supplement these tests but should not be the only proof for the interaction changes.

## Manual smoke

Use a representative Case with at least two learner images.

Confirm:

1. click **Adjust crop** on image A → centre selects A's source page and shows a large crop surface;
2. drag the crop rectangle;
3. resize from at least one edge and one corner;
4. Cancel returns to normal source review without changing A;
5. adjust A again and Save → A preview updates;
6. click **Adjust crop** on image B → centre switches to B's source/session, or stays on the same page when appropriate while using B's own crop session;
7. other learner-image cards remain visible and are not themselves interactive crop canvases;
8. ordinary source review remains unchanged outside crop mode.

## Completion

Implementation, focused tests, generated reviewer output, and any small README update required by the changed UX belong in this same PR.

Follow current repository guidance and progressive retrieval. Keep the PR Draft during implementation. Do not merge or mark Ready for Review.