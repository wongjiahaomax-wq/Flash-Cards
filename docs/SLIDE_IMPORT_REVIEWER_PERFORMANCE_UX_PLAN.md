# Slide Import Reviewer Performance + UX Plan

_Status: Draft implementation plan for the current PR. Do not treat this document as an implementation authority after the PR is complete._

## Objective

Make the local/offline Flash-Cards Slide Import Reviewer materially faster for realistic review bundles, especially image-heavy ZIPs, while improving the human-review workflow without weakening any existing review, provenance, persistence, or deterministic-finalization safety invariant.

The implementation should remain inside the existing `tools/slide-import-review/` architecture. This PR is the implementation vehicle; do not create a separate PR for the work described here.

## Current evidence / problem statement

The current reviewer does too much work before the reviewer can interact with the first Case:

1. `loadFile()` reads the whole ZIP into memory and computes a SHA-256 fingerprint over the complete archive.
2. `loadReviewBundle()` calls the ZIP reader, which walks and materializes every archive entry before returning, including all `source-previews/` and learner media.
3. Deflated entries are decompressed sequentially.
4. The reviewer then restores persisted state and immediately performs another persistence write.
5. `persist()` reconstructs and copies all `media/` bytes on ordinary edits/status changes even when no media changed.
6. Most navigation/status interactions rebuild the current workspace and recreate/revoke object URLs.

This makes time-to-first-Case scale with unrelated source previews and causes unnecessary memory/IndexedDB work during ordinary review.

The existing UI is functional but review-dense: navigation, filtering, Case decisions, source coverage, backup/export, and finalization share one toolbar; important review notes and batch warnings are not prominent; filtered queues can become stale after state changes; source-reference navigation is limited.

## Non-negotiable invariants

Preserve the current repository authorities and scoped `tools/slide-import-review/AGENTS.md` guidance.

Do not change these product/safety rules:

- local/offline review only; do not add network or production dependencies;
- `manifest.json` remains the production-shaped content authority during review;
- `review-map.json` remains provenance/review metadata;
- no second semantic/AI transformation step;
- deterministic finalization remains fail-closed;
- Import Package v1 compatibility remains intact;
- source coverage/page-bound validation remains intact;
- unresolved-question safety remains intact;
- learner-media / answer-leakage safeguards remain intact;
- rejected child Asset/Question semantics remain intact;
- persisted state must restore only for the exact opened source-bundle fingerprint;
- final production ZIP still strips review-only files;
- no silent image recompression or quality degradation.

Performance work must not bypass validation merely to render earlier. It may stage validation/loading so the first Case becomes interactive sooner, provided no invalid bundle is treated as valid and finalization/export continue to operate on fully validated data.

## Target outcomes

### Performance

1. Time-to-first-Case must no longer require decompressing/materializing all unrelated source previews.
2. Ordinary text/status edits must not copy or rewrite the complete learner-media set to IndexedDB.
3. Navigation/review decisions should avoid unnecessary full-image/object-URL churn.
4. Large valid bundles should remain responsive during routine Case-by-Case review.
5. Long-running load/save work should expose visible progress/status rather than appearing frozen.

Do not encode brittle wall-clock thresholds into the regression suite. Prefer structural tests that prove lazy materialization, bounded persistence writes, and correct cache invalidation.

### UX

The reviewer should make the normal review loop obvious:

```text
open bundle
→ review source vs proposed Case
→ edit if needed
→ approve / needs review / reject
→ automatically continue to the next relevant Case
→ back up reviewed work as needed
→ create final Import ZIP only when ready
```

Important warnings, notes, progress, and review state should be visible without requiring the user to inspect raw JSON.

## Implementation tranches

### Tranche 1 — Instrument and define the loading boundary

Before restructuring, make the runtime boundaries explicit enough to test.

Required behavior:

- separate archive indexing/metadata discovery from entry materialization;
- make it possible to load `manifest.json` and `review-map.json` without eagerly inflating every preview/media entry;
- retain safe-path, duplicate-entry, ZIP method/encryption, local/central-header consistency, and source-reference validation;
- preserve the exact source fingerprint used for IndexedDB restore identity;
- do not introduce a CDN/package dependency solely for ZIP handling unless current repository guidance and review justify it.

Design preference:

- maintain an archive-entry index containing path, compression method, offsets, compressed/uncompressed sizes and any metadata required for safe on-demand extraction;
- expose an on-demand `getFile(path)`/equivalent that materializes and caches only requested entries;
- keep JSON/control files eager because they are small and required to construct/validate the review model;
- treat source previews and unchanged learner media as lazy binary resources.

The implementation may choose a different internal API if it gives the same behavior and keeps the reviewer standalone/offline.

### Tranche 2 — Lazy preview/media materialization

Refactor the browser runtime so the first Case requires only the binary resources it actually displays.

Required behavior:

- opening a review bundle should not inflate all `source-previews/` before the first Case renders;
- only source pages referenced by the active Case should be loaded for its source panel;
- learner media should load on demand for the active Case;
- source coverage view may materialize preview data only when needed; it must not force all preview images to decode merely to list coverage rows;
- loaded bytes/object URLs should be cached by bundle path and reused across navigation;
- cache invalidation must occur correctly when a human replaces an image;
- switching bundles must revoke/release stale object URLs and references safely.

Validation must still ensure referenced preview/media paths are legitimate archive entries even when their bytes have not yet been inflated.

### Tranche 3 — Persistence redesign

Remove the current persistence amplification.

Required behavior:

- ordinary manifest/review-map edits persist structured state without serializing/copying every unchanged learner image;
- original media need not be duplicated in IndexedDB because it remains recoverable from the exact opened ZIP;
- persist only binary overrides that differ from the source bundle, primarily human replacement images;
- restore must merge persisted structured state and persisted binary overrides only when `bundleId` and exact source fingerprint both match;
- a different ZIP reusing the same `bundleId` must not inherit stale edits or media;
- legacy persistence should fail safely or be migrated explicitly; never silently mix incompatible state;
- coalesce/debounce bursts of writes where safe so rapid field/status changes do not create redundant full transactions;
- save status must accurately represent `Saving…`, saved success, and failure.

Do not weaken accidental-tab-close protection.

### Tranche 4 — Render and object-URL efficiency

Reduce unnecessary UI reconstruction.

Required behavior:

- do not recreate Blob/object URLs for unchanged source previews or learner media on every render;
- avoid rebuilding unrelated parts of the current Case when a narrow state change can be updated in place;
- answer reveal/hide should not force image recreation;
- simple child review-status changes should not reload images;
- display-order changes may rerender the affected Asset region but should not flush all cached media;
- navigation should reuse cached resources for previously visited Cases.

Keep the implementation maintainable; do not introduce a bespoke framework or excessive DOM micro-optimization.

### Tranche 5 — Review navigation and queue correctness

Improve the primary human-review workflow.

Required behavior:

- add a Case navigation rail/list or equivalent compact jump navigation showing Case title/number and review state;
- show blocking/problem indicators and confidence at a glance without overwhelming the list;
- provide clear progress such as reviewed/total and remaining/pending counts;
- make status/problem filters directly discoverable and clickable;
- after a review-state change, recompute the active filtered queue so a Case approved from `Pending` no longer remains incorrectly in that queue;
- preserve a sensible position when the current Case leaves the active filter;
- add `Next pending` / `Next problem` or equivalent efficient review navigation;
- optionally auto-advance after Case-level Approve/Needs review/Reject when it does not risk losing unsaved input;
- Prev/Next controls should reflect disabled boundary states.

Keyboard shortcuts must continue to avoid firing while the user is editing an input/textarea/select/contenteditable control.

### Tranche 6 — Source comparison UX

Keep source evidence visually available during long reviews.

Required behavior:

- keep the source comparison pane sticky where practical on desktop;
- support a useful zoom/fullscreen/open-large interaction for source previews;
- source references displayed on Questions/Assets should be actionable: selecting a source/page reference should navigate the source pane to that page when a preview exists;
- source thumbnails should load lazily;
- clearly distinguish source preview from proposed learner media;
- preserve mobile/small-window fallback behavior.

### Tranche 7 — Surface review metadata that matters

Expose information already present in the contract rather than hiding it in JSON.

Required behavior:

- prominently surface `batchWarnings`, especially blocking warnings;
- render Case `reviewNotes` and `caseBoundaryNotes`;
- render Asset `reviewNotes`;
- render Question `reviewNotes`;
- render unresolved-question `reviewNotes`;
- retain existing warning severity/code/message information;
- place low-value technical details such as SHA-256, internal IDs, extraction method and provenance fields behind a `Details`/advanced disclosure where this improves scanability;
- do not remove editability of fields currently supported by the reviewer.

The UI must not reinterpret or rewrite source/review notes semantically.

### Tranche 8 — Clarify save/export/finalize states

Reduce ambiguity between local autosave, reviewed-bundle backup, and production-package creation.

Required behavior:

- show explicit local save state and last successful save indication where feasible;
- present reviewed-bundle export as backup/portable reviewed work, distinct from production finalization;
- present finalization as the final deterministic step and expose readiness/blockers before or when invoked;
- do not imply that exporting a reviewed bundle imports anything into production;
- do not imply that creating `flashcards-import-v1.zip` writes D1/R2;
- preserve existing deterministic finalizer behavior and error reporting.

Recommended copy direction (exact wording may change during implementation):

```text
Back up reviewed bundle
Create Import ZIP
```

rather than two similarly weighted generic export actions.

### Tranche 9 — Regression coverage

Add focused tests for the new behavior.

At minimum cover:

- archive index creation without eager decompression of unrelated binary entries;
- on-demand inflation/materialization of a requested preview/media entry;
- entry caching and correct invalidation for image replacement;
- bundle switching cleanup;
- persistence stores structured state without all original media;
- persisted replacement media restores only for exact matching fingerprint;
- different source ZIP with same `bundleId` does not restore stale state;
- coalesced/debounced persistence cannot lose the last committed edit;
- filtered queue refresh after Case status changes;
- review-note/batch-warning rendering wiring;
- source-reference navigation wiring;
- standalone build still uses the public safety facade;
- existing finalization/production compatibility suite remains green.

Prefer unit/contract tests and browser wiring tests over unstable performance timing tests. If a synthetic bundle helper is added, make it large enough to prove unrelated previews are not materialized but small enough to keep tests fast.

## Acceptance criteria

The PR is ready for final review when all of the following are true:

1. A valid review ZIP can show the first Case without materializing every unrelated `source-previews/` entry.
2. Navigating to a Case loads only required previews/media not already cached.
3. Ordinary text/status edits persist without copying/writing all original learner media.
4. Human image replacement persists/restores correctly and invalidates the affected cached media only.
5. Exact-fingerprint persistence identity remains enforced.
6. Active filters stay correct after Case/child state changes.
7. The normal review loop is visibly simpler, with review progress, efficient Case navigation, and source comparison kept accessible.
8. Batch warnings and all relevant `reviewNotes` are visible in the UI.
9. Source references can drive the source preview pane where preview evidence exists.
10. Backup/export and final Import ZIP creation are clearly distinguished.
11. Existing review safety invariants and deterministic finalization behavior are unchanged except for deliberate UX presentation changes.
12. Final `flashcards-import-v1.zip` remains accepted by the current production Import Package parser/compatibility tests.
13. Repository-required slide-review tests/build and final validation pass on the actual PR head.

## Non-goals

Do not expand this PR into:

- PPTX/PDF extraction changes;
- OCR or medical semantic extraction;
- taxonomy/Tag/Shared Question redesign;
- production Admin importer redesign;
- D1/R2/schema/migration changes;
- hosted/cloud reviewer infrastructure;
- a new review-map or Import Package version;
- silent learner-image recompression;
- broad repository UI refactoring unrelated to the local reviewer.

## Implementation discipline

Use the actual current repository state and scoped agent guidance. Start from the directly affected reviewer implementation/tests and broaden only when evidence requires it.

Keep the PR Draft while implementing. Do not merge or mark Ready for Review until the implementation is complete and independently reviewed.

For iteration, use focused reviewer tests. For handoff/final validation, follow the current repository-owned validation guidance and run the scoped slide-review test/build requirements.

## Final review focus

The final reviewer should independently verify:

- whether time-to-first-Case is structurally decoupled from unrelated preview inflation;
- whether persistence amplification is actually removed rather than merely hidden behind a debounce;
- whether lazy loading preserves all ZIP/path/reference safety checks;
- whether cache invalidation and bundle switching can display stale media;
- whether persistence can lose edits during rapid changes or close/navigation events;
- whether source/review metadata remains complete and auditable;
- whether filtered navigation remains correct after mutations;
- whether finalization behavior and production package compatibility remain unchanged.
