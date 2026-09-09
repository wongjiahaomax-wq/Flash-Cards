# Slide Import Reviewer — Inline Learner-Image Crop Plan

_Status: implementation plan for a Draft PR. Plan only at creation; implementation should happen in this same PR. Do not create a second implementation PR._

## Goal

Add the smallest practical in-review correction workflow for learner images that were cropped incorrectly during slide extraction:

```text
see bad learner image
→ Adjust crop
→ linked source slide appears in-place
→ drag crop box / edges / corners
→ Save crop
→ learner image is replaced in-place
→ continue reviewing
```

The feature is intentionally narrow. It is not a general image editor.

## Current implementation facts to preserve

The current reviewer already has the core mutation/persistence machinery required for this feature:

- learner media are stored behind the review bundle file store;
- `Replace image` can replace exact learner-image bytes;
- replacement recomputes SHA-256;
- linked Asset review records are invalidated to `needs_review` except already-rejected reviews;
- binary overrides are persisted locally and restored only for the exact source-bundle fingerprint;
- object URLs can be invalidated per path;
- reviewed-bundle backup and deterministic finalization already consume the current file-store bytes;
- the standalone reviewer is generated from maintainable sources and must be rebuilt rather than hand-editing `reviewer.html`.

Use those existing paths instead of creating a parallel image state/persistence/export system.

## Non-negotiable scope

### In scope

For a manifest-backed fixed learner image:

- visible `Adjust crop` action on the learner-image card;
- inline crop editor in that same card; no modal and no separate page;
- source image comes only from that Asset review record's existing `sourceRefs` / `sourceCoverage.previewPath` evidence;
- free-aspect crop rectangle;
- mouse/pointer move of the whole crop rectangle;
- resize from all four edges and four corners;
- `Reset`, `Cancel`, `Save crop`;
- native browser Canvas rasterization;
- replace the existing learner Asset bytes at the same manifest path;
- recompute SHA-256;
- set `extractionMethod = "human_crop"`;
- preserve existing local autosave/restore/backup/finalize behavior;
- update reviewer documentation and generated standalone artifact.

### Explicitly out of scope

Do **not** add:

- a third-party crop/image-editing dependency;
- zoom/pan controls in v1;
- rotation;
- brightness/contrast/filters;
- annotations/drawing;
- OCR or AI-assisted recropping;
- automatic matching of the existing crop back onto the source slide;
- arbitrary source-page browsing from the crop editor;
- crop-coordinate persistence or review-map schema changes;
- a new image format or path-renaming scheme;
- production Admin/importer, D1, R2, schema, deployment, or extraction-pipeline changes.

`package.json` dependency lists should remain unchanged for this feature.

## UX contract

### Normal state

Each eligible learner-image card should expose a clear action near the displayed image:

```text
[Adjust crop]
```

Keep the existing `Replace image` fallback available under the current metadata/details area.

### Entering crop mode

Clicking `Adjust crop` replaces the learner-image preview area in that card with the linked source preview and an editable crop rectangle.

Do not use a modal or overlay dialog.

The crop editor should show enough context to make the source unambiguous, for example:

```text
Cropping from source-001 · page/slide 10
```

Initial crop selection is the **entire source preview**. Do not attempt image matching or infer the prior crop coordinates.

### Interaction

Use pointer events so the same implementation works for mouse and touch-capable pointers, but the acceptance target is ordinary desktop mouse use.

Required interactions:

- drag inside the crop box → move it;
- drag top/bottom/left/right handle → resize that edge;
- drag any corner handle → resize both axes;
- crop must stay inside the source image;
- crop must not collapse to zero/near-zero size;
- no aspect-ratio lock.

A simple dimmed-outside-selection effect is sufficient. Prefer a single crop box plus CSS `box-shadow`/equivalent over a complex masking system.

### Controls

Crop mode requires exactly these routine controls:

```text
Reset   Cancel   Save crop
```

`Reset` restores the crop rectangle to the full source preview.

`Cancel` exits crop mode with **no bundle mutation, no status change, and no persistence write**.

`Save crop` performs the explicit learner-image replacement described below.

### Leaving the Case/bundle

Unsaved crop UI state is transient and must not be persisted.

Navigating to another Case, changing to a state where the active Case is replaced, or opening another bundle should cancel/discard the transient crop editor without mutating learner media.

Do not add a confirmation dialog for this in v1. The only durable operation is `Save crop`.

## Source-selection safety

This is an important learner-media boundary.

The crop source must be resolved only from the **current Asset review record's** `sourceRefs`, mapped through `reviewMap.sourceCoverage` to an existing `previewPath` in the opened review bundle.

Do not allow the crop editor to use an arbitrary Case source page merely because it is visible in the left source panel.

Resolve candidate crop source paths as unique valid preview paths.

Behavior:

1. **Exactly one usable source preview** → `Adjust crop` uses it directly.
2. **Multiple usable source previews** → use the currently selected source page only if its `previewPath` is one of this Asset's candidates. Otherwise require the reviewer to select one of the Asset's existing clickable source references first; do not silently choose a different page.
3. **No usable source preview** → disable/hide `Adjust crop` with a concise explanation; `Replace image` remains available.

This avoids adding a new source picker while preventing accidental cropping from unrelated/answer-side Case pages.

Existing Asset warnings remain visible. Cropping must not clear/downgrade answer-leakage or other warnings automatically.

## Crop geometry contract

Prefer a small pure helper module, e.g. `tools/slide-import-review/src/crop.js`, rather than embedding all geometry math into `app.js`.

Keep it narrowly scoped to crop geometry; do not build a generic image-editor framework.

Use **normalized source-image coordinates**:

```text
x, y, width, height ∈ [0, 1]
```

Reasons:

- geometry survives responsive re-rendering;
- pointer math is independent of natural source resolution;
- save-time mapping to source pixels is deterministic.

Required helper behavior:

- full-page initial rectangle `{ x: 0, y: 0, width: 1, height: 1 }`;
- move while preserving size and clamping to bounds;
- resize by `n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`;
- preserve the opposite edge/corner while resizing;
- enforce a small minimum visible crop size derived from rendered dimensions rather than a large arbitrary normalized constant;
- convert normalized rectangle to integer natural-image pixel bounds without escaping the source image;
- never upscale during save: output canvas pixel dimensions equal the selected natural-source pixel dimensions.

Do not use CSS `object-fit` geometry that introduces hidden letterboxing offsets. The crop wrapper should track the rendered image's actual aspect-ratio box so pointer coordinates map directly to the image.

## Save-crop byte pipeline

`Save crop` should use native browser APIs only:

```text
linked source-preview <img>
→ naturalWidth / naturalHeight
→ normalized crop → source pixel rectangle
→ canvas.drawImage(...)
→ canvas.toBlob(...)
→ Uint8Array
→ existing learner-image replacement/update path
```

### Output format

Preserve the learner Asset's current manifest MIME type and path.

- current `image/png` Asset → encode PNG;
- current `image/jpeg` Asset → encode JPEG at a single documented high-quality setting (`quality: 0.98`).

Do not automatically lower JPEG quality to make an oversized crop pass validation. If the resulting bytes exceed the current production image-size limit, fail visibly and leave the old learner image unchanged.

This is an explicit human-requested transformation, not background/silent recompression.

### Validation before mutation

Before replacing any bytes, require:

- source image has valid non-zero natural dimensions;
- crop converts to a non-zero pixel rectangle;
- Canvas context/rasterization succeeds;
- Blob/bytes are non-empty;
- resulting MIME bytes are detected as the Asset's existing JPEG/PNG MIME;
- resulting byte size is within `PRODUCTION_LIMITS.maxImageBytes`.

If any step fails:

- show an ordinary reviewer error;
- keep original learner bytes and metadata untouched;
- keep the crop editor available where practical so the reviewer can adjust and retry.

## Learner-Asset mutation semantics

Do not create a second mutation implementation for crop saves.

Factor/reuse a small internal helper around the existing replacement side effects so manual `Replace image` and `Save crop` cannot drift on validation/invalidation/persistence behavior.

For a successful crop, mutate only what is required:

```text
same Asset id
same Asset path
same Asset MIME type
same originalFilename
same altText/source metadata
same CaseAsset relationship/caption/displayOrder
new file bytes at existing path
new SHA-256
extractionMethod = human_crop
```

For every review record linked to that Asset:

- update `sha256` to the digest of the new bytes;
- set `extractionMethod = "human_crop"`;
- if status is not `rejected`, move it to `needs_review`;
- if status is already `rejected`, preserve rejected-child semantics;
- preserve warnings, confidence, sourceRefs, and reviewNotes unchanged.

Then:

- invalidate only the learner Asset path's cached object URL/bytes as current replacement behavior requires;
- refresh review queue/status calculations;
- persist through the existing autosave/snapshot path;
- re-render the learner image from the newly stored bytes.

Do not mutate the immutable `source-previews/` entry.

Do not add crop coordinates to `review-map.json`; the actual replacement media bytes are the durable reviewed learner Asset.

## Async/race safety

Crop save includes asynchronous image decode/rasterization/hash/persistence and must not be allowed to complete into stale reviewer state.

At save start, capture the current:

- `loadGeneration`;
- bundle identity/reference;
- Case id;
- Asset id/path;
- crop-session token/state.

After every asynchronous boundary that precedes mutation, and immediately before mutating file-store/manifest/review state, verify that the same bundle generation and crop session are still current.

If the user switches bundles/Cases or the crop session is cancelled while save work is pending, stale completion must be ignored and must not:

- write into the new bundle;
- alter statuses;
- call persistence for the new bundle;
- re-render stale DOM as current.

Disable the crop editor's own Save/Cancel/drag controls while an accepted Save operation is committing so duplicate saves cannot race each other. Do not freeze the entire reviewer with a new global operation model unless current implementation evidence requires it.

## Proposed implementation surface

Keep the change inside the existing reviewer subsystem.

Expected maintainable files:

- `tools/slide-import-review/src/app.js`
  - crop-session state;
  - source-candidate resolution integration;
  - inline editor rendering/wiring;
  - Canvas rasterization;
  - common learner-image byte commit path shared with `Replace image`;
  - stale-generation/session guards.
- `tools/slide-import-review/src/crop.js` (preferred)
  - normalized geometry operations and pixel conversion only.
- `tools/slide-import-review/index.template.html`
  - minimal crop editor/handle styling and responsive behavior.
- `tools/slide-import-review/scripts/build.mjs`
  - include the new helper module in the standalone build if `crop.js` is added.
- `tools/slide-import-review/tests/crop.test.js` (preferred)
  - executable pure geometry/source-selection tests where helpers live.
- `tools/slide-import-review/tests/browser-transitions.test.js`
  - executable reviewer-state/save/cancel/race behavior; do not substitute static regex/source inspection for these transitions.
- `tools/slide-import-review/README.md`
  - document `Adjust crop` and its source-page limitation.
- generated `tools/slide-import-review/reviewer.html`
  - regenerate via existing build path; do not hand-edit independently.

If the current code makes a slightly different file split materially simpler, keep the same behavioral contracts and avoid broad refactoring.

## Implementation tranches

### Tranche 1 — Geometry + common byte-commit path

- add/test normalized crop geometry helpers;
- identify/refactor the minimal common learner-image byte mutation helper shared by manual replacement and crop save;
- preserve current `Replace image` behavior exactly;
- no UI behavior change yet beyond what is needed to make the helper testable.

Checkpoint proof:

- geometry helper tests pass;
- existing replacement/dependency-invalidation tests still pass;
- no schema/dependency changes.

### Tranche 2 — Inline crop UI + source resolution

- add `Adjust crop` action;
- resolve only Asset-linked source previews using the rules above;
- render source preview inline with full-page initial crop;
- wire move + 8 resize directions;
- add Reset/Cancel/Save controls;
- cancel transient crop state on navigation/bundle replacement.

Checkpoint proof:

- executable browser-transition coverage proves entry/cancel/source eligibility behavior;
- manual local smoke confirms the box can be moved/resized without a modal.

### Tranche 3 — Rasterize + save safely

- implement Canvas crop-to-bytes;
- preserve current Asset MIME/path/metadata;
- validate bytes/size before mutation;
- commit through the common byte-update path;
- SHA/update linked reviews to `human_crop` + `needs_review` semantics;
- add generation/session guards and duplicate-save prevention;
- persist and re-render.

Checkpoint proof:

- executable browser test invokes the actual save transition with a deterministic/stubbed rasterizer boundary and proves exact state mutation;
- stale async completion test proves no mutation after generation/session change;
- oversize/wrong-MIME/rasterization failure leaves original bytes unchanged.

### Tranche 4 — Integration/docs/build/handoff

- update README;
- regenerate standalone `reviewer.html`;
- run the repository-owned slide-review specialized checks and final handoff validation;
- perform the manual representative-bundle smoke below;
- keep PR Draft until implementation and review are complete.

## Executable acceptance contract

Important invariants must be proven at the correct layer rather than only by source inspection.

| Invariant | Required behavior | Required executable proof |
| --- | --- | --- |
| Crop geometry | move/8-direction resize stays in bounds and respects minimum size | direct geometry tests exercising helper functions |
| Source safety | crop can only start from Asset-linked `sourceRefs`; unrelated selected Case page is rejected | executable source-resolution/browser transition test |
| Cancel safety | Cancel makes no media/status/persistence mutation | browser transition invoking actual cancel path |
| Save mutation | successful Save replaces exact Asset-path bytes, updates SHA + `human_crop`, invalidates non-rejected linked reviews | browser transition invoking actual save path with deterministic rasterizer output |
| Metadata stability | id/path/MIME/originalFilename/alt text/caption/displayOrder are unchanged by crop | executable save assertion |
| Rejected semantics | already-rejected linked Asset review stays rejected | executable save assertion |
| Error atomicity | raster/MIME/size failure leaves original bytes/review metadata intact | executable failure-path tests |
| Async isolation | stale save completion after bundle/crop-session change cannot mutate current state | deferred-promise race test |
| Persistence | successful crop is present in media overrides/snapshot and survives exact-fingerprint restore path | executable save + snapshot/restore test where practical |
| Final artifact | standalone reviewer is generated from maintainable sources and is in sync | existing build/check test + `npm run slide-review:build` |

Static/regex checks may supplement these tests but do not satisfy the behavioral acceptance items above by themselves.

## Focused regression coverage

At minimum cover:

1. full-page initial crop rectangle;
2. move clamps at all image boundaries;
3. each edge resize and representative corner resizes;
4. minimum crop-size enforcement;
5. normalized-to-natural-pixel conversion with no out-of-bounds result;
6. one Asset source preview starts directly;
7. multiple Asset source previews require the currently selected page to be one of the candidates;
8. selected Case source page outside the Asset's sourceRefs cannot be used;
9. missing preview disables/fails crop safely while manual Replace remains available;
10. Cancel performs no mutation/persist;
11. Reset returns to full source bounds;
12. successful crop replaces bytes at the same Asset path and preserves stable metadata;
13. SHA is recomputed from actual cropped bytes;
14. extraction method becomes `human_crop`;
15. all non-rejected linked Asset reviews become `needs_review`; rejected review stays rejected;
16. warnings/sourceRefs/reviewNotes are preserved;
17. cached learner-image URL is invalidated while the source preview remains unchanged;
18. crop output over the production size limit fails atomically;
19. detected output MIME mismatch fails atomically;
20. stale async crop completion after navigation/bundle switch is ignored;
21. duplicate Save cannot commit twice/race;
22. crop media override participates in existing snapshot/restore semantics;
23. existing manual `Replace image` behavior remains unchanged;
24. generated `reviewer.html` remains in sync.

## Manual acceptance smoke

Use a representative review bundle containing a learner image that is visibly cropped incorrectly, such as a slide table where the current learner image omits some rows/columns.

Confirm the real workflow:

```text
open Case
→ inspect bad learner image
→ click Adjust crop
→ correct linked source slide appears inside that Asset card
→ drag crop edges/corners until the desired complete table/figure is selected
→ Save crop
→ card returns to normal learner-image view showing the new crop
→ Asset status is needs review
→ continue reviewing
```

Also confirm:

- no modal appears;
- source preview evidence in the left panel remains unchanged;
- Reset restores full-page selection;
- Cancel restores the original learner image with no status/save change;
- after Save, re-approving the image and navigating away/back shows the cropped learner bytes;
- closing/reopening the same source review ZIP restores the saved crop through existing exact-fingerprint local persistence;
- backing up the reviewed bundle preserves the cropped learner Asset;
- after required approvals, final `flashcards-import-v1.zip` contains the cropped learner Asset and no source-preview files;
- an Asset with ambiguous/multiple source pages does not silently crop from an unrelated selected Case page.

## Validation

Follow current repository routing and progressive retrieval rather than preloading unrelated docs.

For this subsystem the required specialized checks remain:

```text
npm run slide-review:test
npm run slide-review:build
```

Also run current `agent:checks` guidance and every final check it requires before handoff. Do not claim local checks ran unless they actually ran.

## Luna/Codex implementation instruction

When implementation begins:

> Continue this existing Draft PR; do not create a new PR or restart from `main`. Implement `docs/SLIDE_REVIEWER_INLINE_CROP_PLAN.md` in the current slide-reviewer architecture. Treat the UX, source-selection safety, mutation semantics, async-race rules, and executable acceptance matrix as required contracts. Keep the solution dependency-free and narrowly scoped. Use progressive retrieval from the current repository authorities, implement in the four tranches, run focused executable tests at each tranche, then run repository-required slide-review and handoff validation. Do not mark Ready or merge.

## Completion criteria

The PR is implementation-complete only when the ordinary reviewer can perform:

```text
bad learner image
→ Adjust crop
→ Asset-linked source preview inline
→ move/resize crop
→ Save crop
→ corrected learner image
→ needs review
→ continue
```

with no new dependency, no modal, no schema change, no production/importer change, no source-preview mutation, and executable proof of the important save/cancel/source/race invariants.
