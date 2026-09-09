# Slide Import Reviewer — Inline Learner-Image Crop Plan

_Status: implementation-ready plan for Draft PR #172 after first-pass planning review. Do not create a second implementation PR, mark Ready, or merge until implementation and review are complete._

## Goal

Add the smallest practical in-review correction workflow for learner images that were cropped incorrectly during slide extraction:

```text
see bad learner image
→ Adjust crop
→ Asset-linked source slide appears in-place
→ drag crop box / edges / corners
→ Save crop
→ learner image is replaced in-place
→ continue reviewing
```

This is deliberately not a general-purpose image editor.

## Fixed product scope

For a manifest-backed fixed learner image:

- show `Adjust crop` on the learner-image card;
- edit inline in that same card; no modal and no separate page;
- use only the Asset review record's existing `sourceRefs` mapped through `reviewMap.sourceCoverage[].previewPath`;
- use a free-aspect crop rectangle;
- support moving the whole crop and resizing from four edges + four corners;
- provide only `Reset`, `Cancel`, and `Save crop`;
- rasterize with native browser Canvas APIs;
- replace bytes at the existing learner Asset path;
- recompute SHA-256;
- set `extractionMethod = "human_crop"`;
- preserve existing autosave/restore, reviewed-bundle backup, deterministic finalization, and exact-fingerprint semantics.

Do not add:

- third-party crop/image-editing dependencies;
- zoom/pan controls in v1;
- rotation, filters, drawing, OCR, or AI-assisted recropping;
- automatic matching of the current crop back onto the source slide;
- arbitrary source-page browsing from the crop editor;
- crop-coordinate persistence or review-map/schema changes;
- path renaming or new image formats;
- production Admin/importer, D1, R2, deployment, or extraction-pipeline changes.

`package.json` dependency lists remain unchanged.

## Existing architecture to reuse

The current reviewer already owns the required mutation and persistence boundaries:

- learner media live behind the bundle file store;
- manual `Replace image` replaces exact learner-image bytes;
- media overrides participate in local snapshot/restore;
- replacement invalidates linked Asset reviews and recomputes SHA-256;
- object URLs can be invalidated per path;
- backup/finalization consume the current file-store bytes;
- `operationGuard` serializes protected reviewer operations;
- `reviewer.html` is generated from maintainable sources.

Do not create a parallel image store, save queue, operation lock, export path, or review state model.

## UX contract

### Normal state

Each eligible learner-image card exposes:

```text
[Adjust crop]
```

Keep the existing `Replace image` fallback available.

### Entering crop mode

Clicking `Adjust crop` replaces the learner-image preview area in that card with the linked source preview and crop rectangle.

Show the source identity, for example:

```text
Cropping from source-001 · page/slide 10
```

Initial crop = the full source preview:

```text
{ x: 0, y: 0, width: 1, height: 1 }
```

Do not infer the prior crop.

### Pointer interaction

Use Pointer Events with pointer capture.

Required behavior:

- `pointerdown` on the crop body/handle starts one drag only when no drag is active;
- record exactly one active `pointerId` and drag mode (`move`, `n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`);
- call `setPointerCapture(pointerId)` on the interaction element once the drag is accepted;
- process `pointermove` only for the recorded active `pointerId`;
- ignore unrelated/secondary pointer events;
- finish and clear drag state on matching `pointerup`;
- also clear drag state on matching `pointercancel` and `lostpointercapture`;
- release pointer capture where appropriate and safe; cleanup must be idempotent;
- crop must remain inside source bounds and must not collapse below the defined minimum size.

A simple crop box with dimmed outside area is sufficient.

### Controls

Crop mode exposes only:

```text
Reset   Cancel   Save crop
```

`Reset` restores full-source bounds.

`Cancel` exits crop mode with **no media mutation, review-status mutation, SHA change, cache invalidation, or persistence write**.

Unsaved crop geometry is transient. Ordinary navigation may discard it without confirmation.

Once `Save crop` has been accepted, however, the save becomes a protected operation and navigation/open/export/finalize serialization rules below apply.

## Source-selection safety

The crop source is a learner-media safety boundary.

Build candidate preview paths only from the current Asset review record's `sourceRefs`, resolving each `(sourceId, page)` through `reviewMap.sourceCoverage` to an existing `previewPath` in the opened bundle.

Rules:

1. **One usable candidate** → use it directly.
2. **Multiple usable candidates** → use `selectedSourcePath` only if it is one of those Asset candidates. Otherwise require the reviewer to select one of the Asset's existing source references first; do not silently choose another page.
3. **No usable candidate** → crop is unavailable/disabled with a concise explanation; manual `Replace image` remains available.

Never use an unrelated Case source page merely because it is currently visible in the left source panel.

Cropping does not clear, downgrade, rewrite, or hide existing warnings, including answer-leakage warnings.

## Crop geometry contract

Prefer a small pure helper module such as `tools/slide-import-review/src/crop.js` for geometry/pixel conversion only.

Use normalized source-image coordinates:

```text
x, y, width, height ∈ [0, 1]
```

Required helper behavior:

- full-page initial rectangle;
- move while preserving size and clamping to bounds;
- resize by all eight directions while preserving the opposite edge/corner;
- enforce a small minimum visible crop size derived from rendered dimensions rather than a large arbitrary normalized constant;
- convert normalized geometry to integer natural-image pixel bounds without escaping the source;
- never upscale: output dimensions equal the selected natural-source pixel dimensions.

Avoid geometry based on hidden `object-fit` letterboxing offsets. Pointer coordinates must map directly to the rendered image box.

## Output format

Preserve the learner Asset's current path and MIME:

- `image/png` Asset → encode PNG;
- `image/jpeg` Asset → encode JPEG with one documented high-quality value, `quality: 0.98`.

Do not lower JPEG quality dynamically to make an oversized crop pass.

A crop whose encoded output exceeds `PRODUCTION_LIMITS.maxImageBytes` fails visibly and leaves the existing learner Asset untouched.

## Protected-operation serialization

### Crop Save must use the existing `operationGuard`

An accepted crop Save is a protected reviewer operation. Do not create a separate crop-operation lock or concurrency state machine.

Required sequence:

```text
Save crop clicked
→ acquire operationGuard token for crop save
→ if guard acquisition fails, do not start save work
→ disable conflicting reviewer operations through existing guard UI behavior
→ perform all precommit work
→ re-check guard/session/generation
→ commit bytes + review metadata
→ persist through existing path and await completion
→ finish operationGuard
```

Acquire the guard **before the first asynchronous decode/raster/hash step**. Holding the guard only around the final mutation is insufficient because backup/finalize/open could otherwise observe the old image while the accepted crop Save is still pending.

While crop Save is active:

- `Back up reviewed bundle` / reviewed export must not start;
- `Create Import ZIP` / Finalize must not start;
- opening another bundle must not start;
- a second crop Save must not start;
- if another protected operation was already active, crop Save must not start.

The guard remains active until the crop commit has gone through the existing persistence path. Therefore, when a later export/finalize/open operation is accepted, it observes the committed cropped state, not the old learner bytes.

Do not bypass `operationGuard` with a second mutex/flag simply for crop operations.

### Unload protection

An accepted in-flight crop Save counts as in-flight/unsaved work for `beforeunload` protection from the instant the guard accepts it until the protected save finishes or fails.

Prefer deriving this from the existing protected-operation state/token rather than maintaining a parallel unsynchronized boolean. The implementation may expose a small helper such as `hasProtectedUnsavedWork()` if needed, but the source of truth remains the existing operation guard/crop operation identity.

## Strict precommit boundary

This boundary is non-negotiable.

### Phase A — prepare, with zero bundle mutation

Complete **all fallible preparation work** before writing learner bytes or mutating manifest/review state:

```text
resolve Asset-linked source
→ ensure/decode source image and non-zero natural dimensions
→ normalize crop to natural pixel rectangle
→ create Canvas/context
→ draw source crop
→ encode Blob
→ materialize Uint8Array
→ verify non-empty bytes
→ verify detected MIME matches existing Asset MIME
→ verify production size limit
→ compute SHA-256 of final bytes
```

Until SHA-256 has completed successfully, the following must remain unchanged:

- `fileStore()` learner bytes / media override;
- Asset manifest record;
- linked Asset review status;
- linked Asset review SHA/extraction method;
- warnings/sourceRefs/reviewNotes/confidence;
- cache/object URL state;
- persistence state.

A failure in decode, rasterization, Blob creation, MIME detection, size validation, or **SHA-256** leaves the old bytes and metadata exactly intact.

### Phase B — revalidate ownership immediately before commit

After all preparation succeeds and immediately before the first mutation, verify all captured ownership still matches:

- `operationGuard.isCurrent(cropSaveToken)`;
- same `loadGeneration`;
- same bundle object/identity;
- same Case id;
- same Asset id and path;
- same crop-session token/source path;
- Asset/review relationships needed for commit still resolve as expected.

If any check fails, abandon the prepared bytes without mutation.

### Phase C — commit one prepared result

Only after Phase B succeeds:

1. `fileStore().set(existingAssetPath, preparedBytes)`;
2. apply the prepared digest and review metadata to every linked Asset review;
3. invalidate only the affected learner-image cache/object URL;
4. refresh review queue/status calculations;
5. persist via the existing autosave/snapshot path and await it;
6. re-render from the new stored bytes;
7. finish the protected operation.

The commit result for a crop is:

```text
same Asset id
same Asset path
same Asset MIME
same originalFilename
same altText/sourceLabel/sourceUrl/licence
same CaseAsset relationship/caption/displayOrder
new learner-image bytes
new SHA-256
extractionMethod = human_crop
non-rejected linked Asset reviews = needs_review
rejected linked Asset reviews remain rejected
```

Warnings, confidence, `sourceRefs`, and `reviewNotes` remain unchanged.

Do not mutate `source-previews/`.

### Shared replacement helper

Reuse/refactor the existing manual image-replacement path only enough to prevent validation/invalidation semantics from drifting.

A good shape is a two-stage boundary:

```text
prepare/validate/hash replacement bytes   // no bundle mutation
commit prepared learner-image replacement // minimal deterministic mutation + persist
```

The crop path must preserve Asset MIME/original filename. Manual `Replace image` keeps its existing behavior, including its current allowed MIME/file-name updates. Do not accidentally change manual replacement UX while sharing helpers.

## Async stale-work rules

At Save start capture:

- operation token;
- `loadGeneration`;
- bundle reference/identity;
- Case id;
- Asset id/path;
- source preview path;
- crop-session token and geometry snapshot.

Preparation may cross async boundaries such as decode, Canvas/Blob conversion, hashing, and persistence. Re-check ownership after relevant async boundaries and always immediately before commit.

Stale completion must never:

- write into a later bundle;
- write into a different Case/Asset;
- change review statuses;
- call persistence for a later bundle;
- release/finish a different operation token;
- render stale DOM as current.

Because the accepted crop Save owns `operationGuard`, ordinary protected bundle-open/export/finalize operations should be blocked rather than racing it.

## Proposed implementation surface

Keep the change in `tools/slide-import-review/`.

Expected maintainable files:

- `src/app.js`
  - crop-session state;
  - Asset-source resolution integration;
  - inline editor rendering/wiring;
  - pointer-capture lifecycle;
  - Canvas rasterization;
  - protected crop-save orchestration;
  - prepare → revalidate → commit integration;
  - shared learner-image replacement helper where appropriate;
  - beforeunload protected-save awareness.
- `src/crop.js` (preferred)
  - pure geometry/pixel conversion, and pure source-candidate helpers if that remains cohesive.
- `index.template.html`
  - minimal crop styling/handles.
- `scripts/build.mjs`
  - bundle `crop.js` into standalone reviewer if added.
- `tests/crop.test.js` (preferred)
  - geometry/source-resolution helper coverage.
- `tests/browser-transitions.test.js`
  - actual crop entry/cancel/save, pointer wiring, protected-operation races, stale completion, failure atomicity, unload behavior.
- `README.md`
  - document `Adjust crop`, Asset-linked source limitation, and that Save is a protected operation.
- generated `reviewer.html`
  - regenerate through the existing build path only.

If current code makes a slightly different split materially simpler, preserve these behavior contracts and avoid broad refactoring.

## Implementation tranches

### Tranche 1 — geometry + prepare/commit replacement boundary

Implement/test:

- normalized geometry helpers;
- source-pixel conversion;
- minimal shared image prepare/commit helpers;
- validation + SHA occurring before mutation;
- existing manual `Replace image` behavior unchanged.

Checkpoint proof:

- geometry helper tests pass;
- executable SHA-failure test proves old bytes and metadata remain untouched;
- existing replacement/dependency-invalidation tests remain green;
- no schema/dependency change.

### Tranche 2 — inline crop UI + source safety + pointer lifecycle

Implement/test:

- `Adjust crop` action;
- Asset-linked source resolution only;
- full-source initial crop;
- move + eight resize directions;
- pointer capture and active `pointerId` filtering;
- cleanup on `pointerup`, `pointercancel`, `lostpointercapture`;
- Reset/Cancel/Save controls;
- transient unsaved crop discarded on ordinary navigation.

Checkpoint proof:

- executable browser transition proves source eligibility and Cancel no-op;
- executable pointer wiring proves capture + cleanup;
- manual smoke verifies move/resize without a modal.

### Tranche 3 — protected Canvas Save + atomic commit

Implement/test:

- Canvas crop-to-bytes;
- PNG/JPEG encoding contract;
- acquire `operationGuard` before async preparation;
- full precommit validation + SHA;
- immediate generation/session/operation re-check;
- deterministic prepared-result commit;
- persistence awaited before guard release;
- unload protection while crop Save is active;
- stale-work rejection.

Checkpoint proof:

- actual save transition mutates exact expected learner Asset bytes/metadata;
- raster/MIME/size/SHA failures are atomic;
- deferred crop-save race proves backup, Finalize, and bundle-open cannot start/observe the old image while Save is pending, and after completion the next protected operation sees the new bytes;
- duplicate Save cannot race;
- stale completion cannot mutate a later state.

### Tranche 4 — regression/docs/build/handoff

- complete focused executable regression coverage;
- update README;
- regenerate `reviewer.html`;
- perform representative-bundle manual smoke;
- run repository-required slide-review and final handoff validation;
- keep PR Draft until review says otherwise.

## Executable acceptance matrix

Static/regex inspection may supplement but cannot satisfy these items.

| Invariant | Required behavior | Required executable proof |
| --- | --- | --- |
| Geometry | move + 8-direction resize remain bounded and respect minimum size | direct helper tests |
| Source safety | crop source cannot escape Asset `sourceRefs` | source-resolution/browser transition test |
| Pointer lifecycle | one active pointer is captured; secondary pointers ignored; up/cancel/lost-capture clean up | executable DOM/event wiring test |
| Cancel | no byte/status/SHA/cache/persist mutation | actual cancel transition |
| Precommit atomicity | decode/raster/MIME/size/SHA failures leave old state unchanged | executable failure tests including forced SHA rejection |
| Save serialization | accepted crop Save owns existing `operationGuard` until persistence completes | deferred protected-operation race test |
| Export/finalize/open isolation | while crop Save is deferred, backup, Finalize, and bundle-open do not run/observe old media; after completion subsequent operation sees new media | actual deferred save + operation attempts |
| Unload safety | accepted in-flight crop Save triggers unload protection until completed/failed | executable beforeunload state test |
| Save mutation | exact Asset path receives prepared bytes; SHA + `human_crop` + non-rejected invalidation applied | actual save transition |
| Metadata stability | crop preserves stable Asset/CaseAsset metadata | executable save assertions |
| Rejected semantics | linked rejected Asset review remains rejected | executable save assertion |
| Stale isolation | invalid generation/session/token cannot commit prepared bytes | deferred stale-work test |
| Persistence | crop override enters existing snapshot/restore only for exact fingerprint | executable save + snapshot/restore test |
| Replace regression | manual `Replace image` behavior remains unchanged | existing + focused regression tests |
| Standalone artifact | generated reviewer matches maintainable sources | existing build/check path |

## Minimum regression inventory

At minimum cover:

1. full-source initial rectangle;
2. move clamps at each boundary;
3. all edge resizes and representative corner resizes;
4. minimum-size enforcement;
5. normalized-to-natural pixel conversion stays in bounds;
6. one Asset source candidate starts directly;
7. multiple candidates require the selected source to be one of them;
8. unrelated Case source page cannot be used;
9. no usable preview fails safely while Replace remains available;
10. pointer capture occurs for accepted drag;
11. non-active pointer moves/up events are ignored;
12. pointerup cleanup;
13. pointercancel cleanup;
14. lostpointercapture cleanup;
15. Reset returns full bounds;
16. Cancel performs no mutation or persist;
17. successful crop replaces same Asset-path bytes and preserves stable metadata;
18. SHA is computed from final cropped bytes before mutation;
19. extraction method becomes `human_crop`;
20. non-rejected linked Asset reviews become `needs_review`; rejected stays rejected;
21. warnings/sourceRefs/reviewNotes/confidence remain unchanged;
22. only learner-image cache/object URL is invalidated;
23. oversized output fails atomically;
24. MIME mismatch fails atomically;
25. raster/decode failure fails atomically;
26. forced SHA failure leaves old bytes + metadata untouched;
27. stale generation/session/token completion cannot commit;
28. duplicate Save cannot race;
29. deferred accepted Save blocks reviewed-bundle export;
30. deferred accepted Save blocks Finalize;
31. deferred accepted Save blocks opening another bundle;
32. post-save protected operation sees new learner bytes;
33. in-flight crop Save participates in `beforeunload` protection;
34. media override survives existing exact-fingerprint snapshot/restore behavior;
35. manual `Replace image` remains unchanged;
36. generated `reviewer.html` is in sync.

## Manual acceptance smoke

Use a representative review bundle with a visibly incorrect learner crop, preferably a table/figure with omitted rows or columns.

Confirm:

```text
open Case
→ inspect bad learner image
→ Adjust crop
→ correct Asset-linked source appears inline
→ move/resize crop
→ Save crop
→ card returns to learner-image view with corrected crop
→ Asset is needs review
→ continue reviewing
```

Also confirm:

- no modal appears;
- left source evidence remains unchanged;
- Reset restores full source;
- Cancel restores original learner image with no save/status change;
- pointer drag does not get stuck when pointer leaves the crop surface;
- while Save is actively pending, backup/finalize/open bundle controls cannot race it;
- after Save, backup contains the cropped learner image;
- after required approvals, final Import ZIP contains the cropped learner image and no `source-previews/`;
- ambiguous multiple Asset sources never silently use an unrelated selected Case page.

## Validation

Follow current repository routing/progressive retrieval.

Required subsystem checks remain:

```text
npm run slide-review:test
npm run slide-review:build
```

Then run current `agent:checks` guidance and every final required check before handoff. Do not claim a check ran unless it actually ran.

## Luna/Codex implementation instruction

> Continue Draft PR #172. Do not create a new PR or restart from `main`. Implement this plan as the required contract. Keep the existing UX/source-selection/metadata/no-dependency/no-schema scope. In particular: serialize accepted crop Save through the existing `operationGuard`; complete decode/raster/MIME/size/SHA work before any bundle mutation; re-check operation + generation + session immediately before commit; use pointer capture with one active pointer and cleanup on up/cancel/lost capture; and satisfy the executable acceptance matrix rather than static source-inspection substitutes. Implement in the four tranches with focused executable tests, then run repository-required slide-review and final handoff validation. Do not mark Ready or merge.

## Completion criteria

The PR is implementation-complete only when the reviewer can perform:

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

with no new dependency, no modal, no schema change, no production/importer change, no source-preview mutation, no operation overlap with export/finalize/bundle-open, and executable proof of pointer, precommit atomicity, stale-work, persistence, and protected-operation invariants.
