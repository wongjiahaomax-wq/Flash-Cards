# Slide Import Reviewer Performance + UX Plan

_Status: Draft implementation plan for the current PR. Do not treat this document as an implementation authority after the PR is complete._

## Objective

Make the local/offline Flash-Cards Slide Import Reviewer materially faster for realistic review bundles, especially large/image-heavy ZIPs, while improving the human-review workflow without weakening any existing review, provenance, persistence, or deterministic-finalization safety invariant.

The implementation should remain inside the existing `tools/slide-import-review/` architecture. This PR is the implementation vehicle; do not create a separate PR for the work described here.

## Current evidence / problem statement

The current reviewer does too much work before the reviewer can interact with the first Case:

1. `loadFile()` reads the whole ZIP into memory and computes a SHA-256 fingerprint over the complete archive.
2. `loadReviewBundle()` calls the ZIP reader, which walks and materializes every archive entry before returning, including all `source-previews/` and learner media.
3. Deflated entries are decompressed sequentially.
4. The reviewer then restores persisted state and immediately performs another persistence write.
5. `persist()` reconstructs and copies all `media/` bytes on ordinary edits/status changes even when no media changed.
6. Most navigation/status interactions rebuild the current workspace and recreate/revoke object URLs.
7. Once lazy loading is introduced, an unbounded byte/object-URL cache could simply move the large-bundle memory problem from startup to later navigation unless cache lifetime is deliberately bounded.
8. Reviewed-bundle export currently depends on fully materialized bundle bytes, so a naive lazy-loader refactor could regain performance during review but lose it again during backup/export.

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

## Large-bundle design requirements

These are mandatory because the primary target is large review ZIPs, not only small-bundle UI responsiveness.

### Keep the source archive as the backing store

Prefer a file/blob-backed archive abstraction rather than immediately converting the complete ZIP into `Map<path, Uint8Array>`.

Required behavior:

- index the ZIP central directory and required metadata using bounded/range reads where practical;
- avoid a second whole-archive copy solely for ZIP indexing;
- retain the original `File`/`Blob` (or equivalent immutable archive source) so individual entries can be read by offset when needed;
- eager materialization should be limited to control files required for review-model construction, primarily `manifest.json` and `review-map.json`;
- learner media and `source-previews/` should remain lazy until requested;
- safe-path, duplicate-name, offset/length, encryption, compression-method and local/central-header checks must still happen before an entry is trusted.

A different internal design is acceptable if it achieves the same bounded-memory/lazy-materialization behavior.

### Preserve exact fingerprint identity without freezing the UI

The complete source-bundle fingerprint remains authoritative for persistence restore identity.

Required behavior:

- do not replace the exact source fingerprint with a weaker metadata-only identity;
- move expensive fingerprint work off the main UI path where practical (for example a Worker or other non-blocking execution surface);
- do not allow persisted edits to be applied until an existing saved row has been proven to match the exact source fingerprint;
- if no persisted row exists for the parsed `bundleId`, the reviewer may render the fresh source state before fingerprint completion, but persistence must not commit an unverified/incorrect source identity;
- if a matching persisted row may exist, expose an explicit `Checking saved review…` state rather than letting a late restore overwrite user edits;
- switching bundles or closing the current load must invalidate stale fingerprint/load completions.

The goal is to preserve identity safety while preventing whole-file hashing from making the page appear hung.

### Bound memory growth over a long review session

Lazy loading is not sufficient if every visited image remains cached forever.

Required behavior:

- use a bounded cache for materialized binary entries/object URLs, preferably with an LRU or equivalent policy;
- track cache cost by bytes, not only entry count;
- keep the active Case resources resident and protect a small adjacent/prefetch window where useful;
- revoke object URLs and release byte references on eviction;
- invalidate only the affected path when a human replaces an image;
- fully clear bundle-owned caches/object URLs when switching bundles;
- avoid retaining decoded preview/image DOM nodes for Cases no longer displayed.

Do not choose a brittle hard-coded cache size without documenting the rationale; implementation may use a conservative byte budget suitable for browser memory constraints.

### Use bounded prefetch, not eager loading under a new name

Small adjacent-case prefetch is acceptable to make navigation feel instant.

Required behavior:

- prioritize the active Case first;
- optionally prefetch only a small bounded set such as the next/previous Case resources after the active Case is usable;
- cap concurrent decompression/materialization work;
- cancel/ignore prefetch from a stale bundle/navigation generation;
- never let prefetch expand to all remaining previews/media merely because the browser is idle.

### Protect async lifecycle and save ordering

Large bundles make long-running asynchronous work more likely to overlap.

Required behavior:

- use a bundle/load generation token, `AbortController`, or equivalent guard so work started for an old bundle cannot mutate the new bundle UI/cache/persistence;
- debounced/coalesced saves must be versioned or serialized so an older save cannot complete after a newer save and overwrite it;
- bundle switch/navigation must not report `Saved` while a stale write is still outstanding;
- where a user action depends on persistence completion, flush the latest pending structured state before proceeding;
- final export/finalization must snapshot a coherent current state rather than racing a pending save or edit handler.

### Do not let backup/export undo the lazy-loading gains

`Back up reviewed bundle` and `Create Import ZIP` have different data needs and should behave accordingly.

Required behavior:

- production finalization should materialize only approved production media required by the selected manifest; it must not inflate `source-previews/`;
- reviewed-bundle backup must preserve all review-only material, but should avoid eagerly inflating every unchanged archive entry merely to write it back out when a safe copy-through/raw-entry reuse strategy is feasible;
- unchanged source previews and unchanged learner media should be reusable from the original archive source during reviewed-bundle backup;
- replacement media and edited JSON must override the corresponding source entries deterministically;
- heavy backup/export work should expose progress and remain cancellable/ignorable on bundle switch;
- do not hold duplicate full-archive + fully materialized-entry copies in memory if the implementation can safely avoid it.

The production finalizer must retain its current strict Import Package output behavior even if reviewed-bundle backup uses a more efficient internal ZIP path.

### Guard against malformed large archives before inflation

A local/offline tool can still be made unresponsive by malformed or adversarial archive metadata.

Required behavior:

- validate central-directory offsets, entry offsets and declared compressed/uncompressed lengths before slicing/decompressing;
- reject integer-overflow/out-of-file ranges;
- keep an explicit review-bundle entry-count guard;
- add a documented review-bundle-specific safety guard for pathological declared expansion where appropriate, without incorrectly applying the smaller production-package limits to legitimate review-only source previews;
- do not allocate declared uncompressed sizes up front merely because archive metadata requests them.

## Target outcomes

### Performance

1. Time-to-first-Case must no longer require decompressing/materializing all unrelated source previews.
2. Ordinary text/status edits must not copy or rewrite the complete learner-media set to IndexedDB.
3. Navigation/review decisions should avoid unnecessary full-image/object-URL churn.
4. Large valid bundles should remain responsive during routine Case-by-Case review.
5. Long-running load/hash/save/backup work should expose visible progress/status rather than appearing frozen.
6. Peak memory should be bounded by the active working set plus a documented cache/prefetch allowance, not by every preview visited in the session.
7. Finalization should not materialize review-only source previews.

Do not encode brittle wall-clock thresholds into the regression suite. Prefer structural tests that prove lazy materialization, bounded persistence writes, bounded cache behavior, correct cancellation, and correct cache invalidation.

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

### Tranche 1 — Archive index and lazy entry provider

Refactor the ZIP layer so archive indexing is separate from entry materialization.

Required behavior:

- implement the large-bundle backing-store requirements above;
- make it possible to load `manifest.json` and `review-map.json` without eagerly inflating every preview/media entry;
- expose an on-demand `getFile(path)`/equivalent that materializes and caches only requested entries;
- retain safe-path, duplicate-entry, ZIP method/encryption, local/central-header consistency and source-reference validation;
- retain the immutable source archive for later lazy reads and reviewed-bundle backup;
- do not introduce a CDN/package dependency solely for ZIP handling unless current repository guidance and review justify it.

### Tranche 2 — Fingerprint and restore lifecycle

Separate exact source identity from the first visible render where it is safe to do so.

Required behavior:

- preserve full exact fingerprint semantics;
- avoid main-thread UI freezing during whole-source hashing where practical;
- prevent late persisted-state restore from overwriting fresh edits;
- distinguish `Opening bundle`, `Checking saved review`, `Restoring review`, and `Ready` states where applicable;
- cancel/ignore stale load/fingerprint completions after a bundle switch.

### Tranche 3 — Lazy preview/media materialization + bounded cache

Refactor the browser runtime so the active Case loads only what it actually displays.

Required behavior:

- opening a review bundle should not inflate all `source-previews/` before the first Case renders;
- only source pages referenced by the active Case should be loaded for its source panel;
- learner media should load on demand for the active Case;
- source coverage view must not force preview bytes/image decode merely to list coverage rows;
- loaded bytes/object URLs should be reused while resident;
- cache must be bounded by bytes and evict safely;
- cache invalidation must occur correctly when a human replaces an image;
- switching bundles must revoke/release stale object URLs and references safely;
- optional prefetch must remain small, bounded and cancellable.

Validation must still ensure referenced preview/media paths are legitimate archive entries even when their bytes have not yet been inflated.

### Tranche 4 — Persistence redesign

Remove the current persistence amplification.

Required behavior:

- ordinary manifest/review-map edits persist structured state without serializing/copying every unchanged learner image;
- original media need not be duplicated in IndexedDB because it remains recoverable from the exact opened ZIP;
- persist only binary overrides that differ from the source bundle, primarily human replacement images;
- restore must merge persisted structured state and persisted binary overrides only when `bundleId` and exact source fingerprint both match;
- a different ZIP reusing the same `bundleId` must not inherit stale edits or media;
- legacy persistence should fail safely or be migrated explicitly; never silently mix incompatible state;
- coalesce/debounce bursts of writes where safe;
- serialize/version writes so stale transactions cannot overwrite newer state;
- save status must accurately represent `Saving…`, saved success, and failure;
- do not weaken accidental-tab-close protection.

### Tranche 5 — Render and object-URL efficiency

Reduce unnecessary UI reconstruction.

Required behavior:

- do not recreate Blob/object URLs for unchanged source previews or learner media on every render;
- avoid rebuilding unrelated parts of the current Case when a narrow state change can be updated in place;
- answer reveal/hide should not force image recreation;
- simple child review-status changes should not reload images;
- display-order changes may rerender the affected Asset region but should not flush all cached media;
- navigation should reuse resident cached resources for recently visited Cases;
- long Case lists/coverage tables should avoid rendering pathological numbers of expensive preview/image nodes; use pagination/windowing/virtualization only where evidence shows it is needed.

Keep the implementation maintainable; do not introduce a bespoke framework or excessive DOM micro-optimization.

### Tranche 6 — Review navigation and queue correctness

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

### Tranche 7 — Source comparison UX

Keep source evidence visually available during long reviews.

Required behavior:

- keep the source comparison pane sticky where practical on desktop;
- support a useful zoom/fullscreen/open-large interaction for source previews;
- source references displayed on Questions/Assets should be actionable: selecting a source/page reference should navigate the source pane to that page when a preview exists;
- source thumbnails should load lazily;
- clearly distinguish source preview from proposed learner media;
- preserve mobile/small-window fallback behavior.

### Tranche 8 — Surface review metadata that matters

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

### Tranche 9 — Clarify save/backup/finalize states

Reduce ambiguity between local autosave, reviewed-bundle backup, and production-package creation.

Required behavior:

- show explicit local save state and last successful save indication where feasible;
- present reviewed-bundle export as backup/portable reviewed work, distinct from production finalization;
- present finalization as the final deterministic step and expose readiness/blockers before or when invoked;
- backup/finalization must take a coherent snapshot of the latest edit state rather than racing pending saves;
- production finalization must not materialize `source-previews/`;
- reviewed-bundle backup should preserve all original review evidence while reusing unchanged archive entries efficiently where practical;
- expose progress for heavy backup/finalization work;
- do not imply that exporting a reviewed bundle imports anything into production;
- do not imply that creating `flashcards-import-v1.zip` writes D1/R2;
- preserve existing deterministic finalizer behavior and error reporting.

Recommended copy direction (exact wording may change during implementation):

```text
Back up reviewed bundle
Create Import ZIP
```

### Tranche 10 — Regression coverage for large-bundle behavior

Add focused tests for the new behavior.

At minimum cover:

- archive index creation without eager decompression of unrelated binary entries;
- central-directory/range validation rejects malformed out-of-file offsets/sizes;
- on-demand inflation/materialization of a requested preview/media entry;
- active entry caching plus byte-budget eviction and object-URL cleanup;
- replacement image invalidates only the affected cached path;
- small bounded prefetch does not expand to all archive entries;
- stale prefetch/load completion after bundle switch is ignored;
- bundle switching fully releases old bundle resources;
- persistence stores structured state without all original media;
- persisted replacement media restores only for exact matching fingerprint;
- different source ZIP with same `bundleId` does not restore stale state;
- no late persisted restore can overwrite edits made to a fresh bundle while fingerprinting;
- coalesced/debounced persistence cannot lose the latest committed edit or allow an older transaction to win;
- filtered queue refresh after Case status changes;
- review-note/batch-warning rendering wiring;
- source-reference navigation wiring;
- finalization requests only production-required media and never source previews;
- reviewed-bundle backup preserves unchanged previews/media and edited overrides without requiring the normal review runtime to eagerly materialize everything;
- standalone build still uses the public safety facade;
- existing finalization/production compatibility suite remains green.

Prefer unit/contract tests and browser wiring tests over unstable performance timing tests. Add synthetic large-bundle fixtures/instrumentation that can assert which entries were read/inflated and peak/resident cache behavior without making the tests slow.

## Acceptance criteria

The PR is ready for final review when all of the following are true:

1. A valid review ZIP can show the first Case without materializing every unrelated `source-previews/` entry.
2. ZIP indexing does not require a second complete in-memory copy of all archive entries.
3. Exact source-fingerprint identity remains enforced without allowing a late restore to overwrite fresh edits.
4. Navigating to a Case loads only required previews/media not already resident/cached, plus at most a deliberately bounded prefetch window.
5. The binary/object-URL cache is bounded and releases evicted/bundle-switched resources.
6. Ordinary text/status edits persist without copying/writing all original learner media.
7. Human image replacement persists/restores correctly and invalidates the affected cached media only.
8. Save ordering cannot allow stale async writes to overwrite newer edits.
9. Active filters stay correct after Case/child state changes.
10. The normal review loop is visibly simpler, with review progress, efficient Case navigation, and source comparison kept accessible.
11. Batch warnings and all relevant `reviewNotes` are visible in the UI.
12. Source references can drive the source preview pane where preview evidence exists.
13. Backup/export and final Import ZIP creation are clearly distinguished.
14. Production finalization does not inflate/materialize review-only `source-previews/`.
15. Reviewed-bundle backup remains complete and portable without forcing routine review to eagerly materialize the whole archive.
16. Existing review safety invariants and deterministic finalization behavior are unchanged except for deliberate UX presentation changes.
17. Final `flashcards-import-v1.zip` remains accepted by the current production Import Package parser/compatibility tests.
18. Repository-required slide-review tests/build and final validation pass on the actual PR head.

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
- whether the source archive remains the backing store rather than being eagerly duplicated into per-entry bytes;
- whether exact fingerprint persistence identity remains safe under delayed/off-main-thread hashing;
- whether persistence amplification is actually removed rather than merely hidden behind a debounce;
- whether lazy loading preserves all ZIP/path/reference safety checks;
- whether cache growth is bounded over a long navigation session;
- whether cache invalidation and bundle switching can display stale media;
- whether stale async loads/prefetch/saves can mutate a newer bundle;
- whether persistence can lose edits during rapid changes or close/navigation events;
- whether reviewed-bundle backup reintroduces whole-archive materialization unnecessarily;
- whether production finalization avoids review-only preview loading;
- whether source/review metadata remains complete and auditable;
- whether filtered navigation remains correct after mutations;
- whether finalization behavior and production package compatibility remain unchanged.
