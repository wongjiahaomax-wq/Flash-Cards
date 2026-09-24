# Source Coverage — complete-slide gallery and large viewer

Status: **implementation plan only**. Implement within this same Draft PR; no reviewer code has been changed by the planning commit.

## Product outcome

In the **existing offline Slide Import Reviewer**, the **Source coverage** control opens its existing coverage workspace. Keep its current list/table as the default view, and add a `List | Gallery` switch **inside Source Coverage**. The gallery must expose **every original slide/page in the loaded review bundle**, in source order, including non-Case, title, reference and answer slides. This is for inspecting the entire deck alongside the existing Case reviewer; it is not a new authoring or editing surface.

## User experience and acceptance

1. **Complete, legible gallery.** Desktop gallery uses **two generously sized thumbnails per row**, filling available Source Coverage width; narrow/mobile uses one per row. Preserve each original image's aspect ratio (no cropping). Display original slide/page number and existing classification / linked Case context (where present). For multiple source files, clearly separate or label decks with filenames and restart numbering per source; preserve source-file and page order. Missing/unavailable preview paths get a clear placeholder while the coverage row remains present.
2. **Large slide viewer.** Clicking any available slide image opens a viewport-filling viewer that uses the **existing source-preview image**, not a low-resolution cropped thumbnail. Fit the whole slide initially within the available viewport, preserving aspect ratio. Provide accessible Close, Previous, Next, and zoom controls with fit-to-screen and **100% native-pixel** inspection; allow zoom above 100% and pan when zoomed. The image should occupy most of the display rather than an existing small Case-source panel. Never promise resolution beyond what the review ZIP actually supplies.
3. **Complete deck navigation.** Previous/Next traverse consecutive source pages **including non-Case slides**; do not filter by Case status or coverage classification. Show source filename and original page number so multiple-deck bundles are unambiguous. Closing the large viewer returns to the gallery at the same slide/scroll position. Switching back to List preserves the existing coverage behavior.
4. **No lost work.** Opening/closing Source Coverage, switching List/Gallery, opening the slide viewer and navigating slides **must not discard or reset unsaved Case edits, current Case, review status or current review progress**. Reuse the existing workspace navigation/lifecycle rather than resetting or reloading the review bundle. Keep the existing per-Case source viewer and crop workflows intact.
5. **Offline and responsive.** Use `reviewMap.sourceFiles`, `reviewMap.sourceCoverage[].previewPath`, and source previews **already inside the opened ZIP**. Do not require internet, a server, API, new extraction output, or a schema change. Preserve existing lazy archive/image loading and bounded caching: entering the gallery must not eagerly decode/decompress every full-resolution slide for large decks. Load images as needed using existing file-store/preview URL lifecycle where possible; release temporary viewer resources on close as appropriate.

## Implementation boundaries

Start from the **actual current branch head** and inspect the directly affected reviewer source, existing Source Coverage UI, image loading/cache and relevant tests, following root and scoped `AGENTS.md`. Maintainable sources are under `tools/slide-import-review/src/` and `index.template.html`; regenerate committed `reviewer.html` through the repository build script, **do not hand-edit it**. Use current components/helpers when present and keep this a narrowly scoped read-only UI change.

Do **not** modify source preparation/extraction, `review-map.json` schema, manifest, deterministic finalization, production importer, Cloudflare, R2/D1 or review approval rules. Do not build a separate slide browser, image-processing pipeline or new cache architecture.

## Proportional acceptance proof

- Exercise the **actual offline reviewer UI** with a representative bundle: enter Source Coverage, toggle List/Gallery, verify all numbered slides including non-Case material appear; open a slide, inspect it at fit and native-pixel zoom, navigate and return to the original gallery position. Verify multi-source labeling if supported by an existing fixture.
- Verify at the rendered UI layer that a draft Case edit survives opening/closing gallery/viewer and returning to review. Check a narrow viewport and keyboard-operable viewer close/navigation.
- Keep tests focused on the changed UI and any new small helpers. Run current repository-owned validation, including `npm run slide-review:test`, `npm run slide-review:build` and generated-artifact consistency; report actual results and any manual checks. Do not add an extensive E2E suite for this read-only feature.

## Luna 5.6 handoff

Continue **this exact Draft PR and branch**, implementing the plan here; do not create another PR or restart from `main`. Inspect actual current code and repository guidance with progressive retrieval, choose the simplest implementation satisfying these behaviors, commit/push to this PR, and report final head SHA, validation and any limitations. **Do not merge, deploy or mark Ready for Review.**
