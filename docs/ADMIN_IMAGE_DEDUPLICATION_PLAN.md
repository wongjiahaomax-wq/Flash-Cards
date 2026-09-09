# Admin Image Deduplication — implementation plan

_Status: Draft planning contract for implementation in this same PR/branch. Do not create a follow-up implementation PR._

## Goal

Add a Production Admin workflow that lets a human certify that two global image Assets are the same underlying teaching image, choose the canonical survivor, merge all current/reusable knowledge onto that survivor, and reclaim the duplicate R2 object.

The feature has exactly two implementation tranches in this PR:

```text
Tranche 1 — Human-confirmed canonical Asset merge
Tranche 2 — Visual duplicate discovery that proposes pairs to Tranche 1
```

The human Admin is the final identity authority. Software may propose likely duplicates but must never automatically merge images.

## Product decisions already made

1. **Same-image confirmation is authoritative.** Once the Admin confirms A and B are the same underlying image, the application may canonicalize B into A even if resolution, crop, compression, or dimensions differ.
2. **One canonical Asset remains.** The selected survivor keeps its Asset ID and R2 object. The duplicate must not remain as an active parallel Asset after a successful merge.
3. **Reusable Image Questions are unioned.** Questions that exist only on the duplicate move to the survivor; questions already on the survivor remain. This is part of the core merge, not a later feature.
4. **Existing per-Case opt-ins do not broaden.** Merging the global question libraries must preserve each stimulus option's existing explicit reusable-question choices. A Case that used only Q3 before the merge does not automatically gain Q1/Q2 merely because the canonical Asset now owns them.
5. **Historical question/answer snapshots stay untouched.** Where an old Asset Question ID must be collapsed into a surviving Asset Question ID, provenance references may be canonicalized, but stored prompt/answer snapshots are not rewritten.
6. **Active Review media follows the canonical Asset.** Admin-certified duplicate identity permits `active_review_assets.asset_id` and `storage_key_snapshot` to be rewritten to the survivor. Exact duplicate bytes are not retained solely for an in-progress Review.
7. **R2 space reclamation is intentional.** The duplicate teaching-image object should be permanently deleted once its application references have been canonicalized safely.
8. **Higher-resolution replacement remains a separate operation.** Do not rewrite or remove the existing supersession workflow in this PR. Deduplication means “two existing Assets are the same image; make one canonical and remove the other.” Replacement retains its existing lineage/history semantics.
9. **Production only.** No Preview Admin merge UI or mutation endpoint. Preview-owned Assets are never merge candidates.
10. **No schema migration in this PR.** Use current relationships and a guarded two-phase cleanup rather than adding fingerprint, merge-history, or cleanup-queue tables. If implementation evidence proves a schema change is genuinely required, stop and amend this plan before adding one.
11. **No new image-processing dependency.** Tranche 2 uses browser Canvas plus small deterministic matching helpers. Do not add OpenCV, AI/embedding models, WASM image stacks, Sharp, Canvas packages, or a vector database.

## Existing contracts to preserve

The repository already has:

- a global Image Library and multi-selection UI;
- immutable private teaching-image R2 keys;
- Production/Preview ownership guards;
- higher-resolution replacement with race-safe D1 batching;
- `asset_questions` as reusable knowledge attached to an exact Asset;
- explicit `stimulus_option_asset_questions` opt-ins;
- active Review media snapshots containing both Asset ID and storage-key snapshot.

Reuse those patterns rather than creating a parallel Asset system.

---

# Tranche 1 — Human-confirmed canonical Asset merge

## UX

Add a Production Admin deduplication surface at:

```text
/admin/images/deduplicate
```

The existing Image Library selection flow should expose **Compare / merge duplicates** only when exactly two production images are selected. It navigates to the deduplication page with those two Asset IDs.

The comparison page must show both images large enough for clinical inspection and, for each Asset:

- Admin image name;
- dimensions when available from the browser;
- current Topic/usage summary;
- reusable Image Question count;
- source/provenance metadata where present;
- Collection where present.

Admin chooses **Keep left** or **Keep right**. Submission requires an explicit checkbox/confirmation equivalent to:

> I confirm these are the same underlying teaching image and the other copy may be permanently removed.

The confirmation panel must state that the duplicate Asset and its R2 object will be permanently removed and that survivor Asset metadata remains authoritative.

Do not add undo/version-history machinery in this PR.

## Canonical merge domain operation

Implement one server/domain operation conceptually equivalent to:

```js
mergeDuplicateImageAssets({
  db,
  bucket,
  survivorAssetId,
  duplicateAssetId,
  confirmedSameImage,
  questionConflictResolutions
})
```

Keep the mutation logic out of the Svelte route. The route validates/formats input and maps established domain errors; the domain helper owns the complete preflight and mutation.

A new focused module such as `src/lib/server/db/asset-deduplication.js` is preferred rather than expanding `asset-replacement.js` into two different lifecycle operations.

## Asset eligibility / preflight

Both IDs must be distinct existing Production image Assets.

The survivor must be:

- `preview_session_id IS NULL`;
- active;
- not itself superseded by another Asset.

The duplicate must be:

- `preview_session_id IS NULL`;
- active at claim time;
- not already superseded;
- not the successor target of an existing supersession predecessor. If deleting it would break `assets.superseded_by_asset_id` lineage, fail closed and require the Admin to choose a different survivor/duplicate arrangement.

Do not merge Preview-owned Assets.

Do not silently rewrite Preview workspace relationships. If the duplicate is referenced by a live/current Preview workspace in a way that prevents safe removal, fail with a clear message instructing the Admin to reset/expire that Preview and retry. Reuse the current replacement/Preview safety patterns where applicable.

Treat an impossible “same Case already contains both A and B” relationship collision as invalid data, not as a normal UX branch. Preflight it and fail closed with a repair message rather than inventing relationship-collapse semantics.

## Survivor metadata

The survivor Asset row is authoritative.

Do **not** automatically merge or overwrite:

- image name;
- alt text;
- source label;
- source URL;
- licence;
- Collection;
- MIME/storage identity.

The comparison UI must surface differing duplicate metadata so the Admin understands what will be discarded. Case/stimulus captions remain on their relationship rows and therefore survive the reference move unchanged.

## Relationship canonicalization

For the duplicate B → survivor A operation, canonicalize every current reference that must remain usable:

```text
case_assets.asset_id                       B → A
stimulus_group_options.asset_id             B → A
active_review_assets.asset_id               B → A
active_review_assets.storage_key_snapshot   B key → A key
```

Preserve relationship IDs, captions, display order, stimulus-option IDs, Case-specific questions, and all unrelated fields.

For `active_review_assets`, preserve caption/alt-text snapshots unless current executable invariants require otherwise. Only Asset identity/storage key need canonicalization for this feature.

Completed Review prompt/answer/rating/FSRS snapshots are never rewritten merely because media was deduplicated.

## Reusable Image Question union

Load A and B `asset_questions` grouped by `question_prompt_id`.

Apply these deterministic rules:

### A-only question

```text
A owns Q1
B has no Q1
→ keep Q1 unchanged on A
```

### B-only question

```text
B owns Q3
A has no Q3
→ update the existing Q3 row: asset_id B → A
→ keep the same Asset Question ID, Prompt ID, answer, active state, timestamps except normal updated_at
```

Do not clone a B-only Asset Question. Keeping its ID minimizes provenance churn.

### Same Prompt + same canonical answer

Compare canonical `answer_md` after line-ending normalization only. Do not perform semantic/AI/fuzzy answer equivalence.

```text
A-Q1 prompt=P answer=X
B-Q9 prompt=P answer=X
→ A-Q1 survives
→ remap B-Q9 usages/provenance to A-Q1
→ delete B-Q9
```

Resulting active state is logical OR (`A.is_active || B.is_active`) so a currently available identical question is not accidentally archived by canonicalization.

### Same Prompt + different answer

This is an explicit Admin conflict, never an automatic merge.

The comparison page must display both answers and require one resolution:

```text
Keep survivor answer
Use duplicate answer
```

The survivor Asset Question row remains the canonical row/ID. If the Admin chooses the duplicate answer, update the survivor row's `answer_md`; then remap the duplicate row's references to the survivor row and delete the duplicate row.

Do not create a third synthesized answer.

### Opt-in semantics

Before changing Asset/Asset Question identities, capture all affected `stimulus_option_asset_questions` relationships.

After canonicalization, restore/remap only the opt-ins that existed before the merge:

- B-only moved Asset Question IDs remain the same;
- collapsed B question IDs map to the surviving A question IDs;
- duplicate `(stimulus_group_option_id, asset_question_id)` pairs collapse naturally;
- no new opt-in is created simply because A now owns more reusable questions.

Respect the existing cross-group Prompt invariants and Asset/option identity triggers. Order the D1 statements so temporary trigger-invalid states are not exposed. It is acceptable to remove affected opt-in rows inside the same atomic D1 batch and recreate the canonical set after Asset Question and stimulus-option identities are aligned.

## Review question provenance

If an Asset Question row from B is moved intact to A, its ID remains valid and Review provenance needs no ID change.

If B's Asset Question is collapsed into an existing A Asset Question, remap any source-Asset-Question references that would otherwise block deletion, including current active-review provenance and retained completed-review provenance as required by the current schema.

Do **not** change stored Prompt/answer snapshots while remapping provenance IDs.

## D1 race safety

Use the current higher-resolution replacement pattern as the model for double-submit/race safety.

The duplicate Asset is the claimed source. Within the canonicalization D1 batch:

1. verify the survivor is still an eligible active Production Asset;
2. move/remap all required relationships/questions;
3. conditionally claim the duplicate only if it is still the same active, non-Preview, non-superseded source and the relevant Preview guard still passes;
4. use a database-enforced sentinel/assertion so a zero-row conditional claim aborts the complete batch rather than appearing successful.

Two concurrent merges involving the same duplicate must not both succeed.

Do not rely only on preflight reads; repeat material eligibility at commit/claim time.

## R2 reclamation and crash-safe cleanup

Do not delete the duplicate R2 object before current references are canonicalized.

Use this two-phase sequence:

```text
Phase 1 — atomic D1 canonicalization
  - all live/current references B → A
  - reusable-question union/remap complete
  - duplicate B becomes inactive and unreferenced
  - B row is retained temporarily

Phase 2 — physical cleanup
  - delete B.storage_key through the existing teaching-image delete helper
  - after successful/idempotent R2 deletion, delete B's now-unused D1 row under a strict no-reference guard
```

This deliberately avoids a new cleanup table.

Failure semantics:

- Phase 1 failure → no canonicalization survives and no R2 deletion occurs.
- R2 deletion failure after Phase 1 → A is already canonical; B remains inactive/unreferenced with its object still present. Return a clear “merge complete, storage cleanup pending” Admin result. Never reactivate B or roll current relationships back.
- Final D1-row deletion failure after R2 deletion → B may remain as an inactive/unreferenced metadata row pointing to an already-removed object. This is not learner-facing corruption; expose/reuse the strict cleanup retry path.

Add a narrowly guarded **permanently delete unused inactive image** cleanup operation that can be used for such retries. It must prove server-side that the production Asset is inactive and has no Case/stimulus/active-Review/Asset-Question/supersession/Preview references before deleting its R2 object and row. Missing R2 object should be treated idempotently where the existing R2 API/helper semantics allow.

This cleanup action must not make superseded historical Assets deletable; supersession references are a hard blocker.

## Tranche 1 executable acceptance

Add executable domain/route coverage proving at minimum:

1. B used by different Cases than A canonicalizes all fixed/stimulus relationships to A while preserving captions/order/option IDs.
2. An active Review using B now references A and A's storage key, while other snapshots remain unchanged.
3. B-only reusable questions move to A with the same Asset Question IDs.
4. Same-Prompt/same-answer reusable questions collapse; B opt-ins/provenance remap to the surviving A question; no duplicate opt-ins remain.
5. Same-Prompt/different-answer merge is rejected until an explicit resolution is supplied, and each allowed resolution produces the selected canonical answer.
6. Existing stimulus-option reusable-question opt-ins are preserved exactly; the merge does not automatically opt Cases into newly available A questions.
7. On success, B has no application references, B's R2 key is the only teaching object deleted, and A's R2 key is never deleted.
8. Phase-1 failure performs no R2 deletion.
9. R2 cleanup failure leaves B inactive/unreferenced and returns cleanup-pending state; a guarded retry can finish deletion.
10. Concurrent/double submission can claim B only once.
11. Preview/supersession/preflight blockers fail before destructive cleanup.
12. Preview Admin has no equivalent mutation path.
13. Route/action auth and expected domain-error mapping remain consistent with current Admin patterns.

Static source assertions are supplemental only; the domain mutation behavior requires executable tests.

---

# Tranche 2 — Visual duplicate discovery

## Scope

Tranche 2 only proposes likely pairs. It must call the Tranche 1 comparison/merge workflow after the Admin chooses to inspect/merge a pair.

No discovery score may trigger a mutation automatically.

## Retrieval priority

Use taxonomy to keep the problem small:

```text
1. Same Primary Topic — default/first search
2. Same System — explicit widening action
3. All active Production images — explicit widening action only
```

An Asset remains global; do not add `topic_id` to Assets. Derive Topic/System candidate membership from current Case/stimulus usage exactly as the Image Library already does.

Only active Production image Assets participate in automatic discovery. Exclude Preview-owned and inactive/superseded sources from candidate generation.

Bound one scan to a reasonable existing Admin-library scale (prefer the existing ~300-Asset selection bound). If a scope exceeds the bound, require a narrower Topic/System or a bounded batch rather than freezing the browser.

## Matching implementation decision

Do not add AI, embeddings, SHA-only identity, ORB/OpenCV, or a server-side image decoder.

Implement an on-demand **dependency-free browser matcher** using Canvas and deterministic local perceptual fingerprints.

Use this concrete v1 algorithm:

1. Load candidate images through the existing authenticated same-origin Asset image route.
2. Decode in the browser (`createImageBitmap` or existing compatible image loading pattern) and draw to a small grayscale working canvas.
3. For each image, generate local region fingerprints rather than one whole-image hash:
   - include the full frame;
   - generate overlapping windows at approximately 80%, 60%, and 40% of image width/height;
   - slide windows on a coarse ~20% step so moderate arbitrary crops have nearby regions;
   - resize each region to 9×8 grayscale pixels and compute a 64-bit difference hash (dHash).
4. Compare image pairs by the minimum Hamming distance between their region hashes plus a small support count of additional near matches. This makes the proposal stage tolerant to resolution, JPEG/PNG recompression, and moderate cropping.
5. Rank likely pairs; do not label them “identical.” Use wording such as **Likely duplicate** / **Possible duplicate**.
6. Keep thresholds as named constants in the matching module and cover them with deterministic fixtures. Start conservatively; prioritize recall over perfect precision because the Admin must visually confirm every merge.

Do not persist fingerprints in D1 in this PR. Recompute on demand and cache only in the current browser/session memory as useful. A future persisted index is allowed only if real scale demonstrates the need.

## Discovery UX

The deduplication page should support:

```text
Topic [select]
[Find likely duplicates]

Likely pairs
┌──────────────┐   ┌──────────────┐
│ image A      │   │ image B      │
└──────────────┘   └──────────────┘
match ranking / shared Topic

[Compare]   [Not duplicate]
```

`Compare` opens the Tranche 1 side-by-side canonical merge state for that pair.

`Not duplicate` only dismisses the pair for the current page/session in v1. Do not add a durable negative-match table/schema in this PR.

Show scan progress and yield work in bounded chunks so an image-heavy Topic does not lock the Admin UI. Failed image decode/fetch should skip that Asset with a visible non-fatal scan warning; it must not mutate content.

## Tranche 2 executable acceptance

The matching core must be separable from DOM/image loading enough to receive deterministic pixel/grayscale fixtures in Node tests.

Cover at minimum:

- same source at different resolution ranks as a likely pair;
- moderate crop of the same source ranks as a likely pair;
- small compression/noise changes remain matchable;
- two merely similar medical-style synthetic patterns do not receive the strongest score solely because they share broad structure;
- Topic scope is the default and System/global widening requires explicit Admin action;
- inactive/Preview Assets are excluded;
- no matching/discovery path can invoke merge without the explicit human confirmation flow;
- scan work is bounded and decode failures are non-destructive.

Do not require real patient/production images in repository tests. Use deterministic synthetic fixtures or generated pixel matrices.

---

# Implementation order in this same PR

Luna should implement in exactly these two tranches, committing coherent checkpoints in the existing Draft PR branch:

```text
Tranche 1
  domain merge + cleanup safety
  → executable tests
  → manual compare/merge Admin UX
  → focused checkpoint validation

Tranche 2
  pure visual matching helpers/tests
  → Topic/System/global candidate read path
  → dedupe discovery UI wired to Tranche 1
  → focused checkpoint validation
```

Do not create another PR between tranches.

## Likely implementation surfaces

Use current repository routing to confirm exact files before editing, but the expected ownership is:

- new DB/domain helper for canonical Asset merge and cleanup;
- existing Image Library selection component for the exactly-two-images entry point;
- new `/admin/images/deduplicate` Production Admin route;
- small client-side visual-matching helper/module;
- focused tests beside current Asset replacement/Image Library/reusable-question tests;
- living image/reusable-question/R2 design documentation reconciliation after implementation.

Do not put domain mutation logic into Svelte components.

## Explicit non-goals

This PR does not add:

- automatic merges;
- AI/vision embeddings;
- SHA-based duplicate identity as the main matcher;
- OpenCV/ORB/Sharp/Canvas server dependencies;
- persistent fingerprint/vector tables;
- durable “not duplicate” decisions;
- bulk multi-pair auto-merge;
- Asset families or generic version history;
- Preview Admin dedupe mutation;
- Import Package version changes;
- slide reviewer/importer dedupe logic;
- automatic promotion of Case-specific questions into reusable questions;
- automatic reusable-question opt-in across all Cases using the canonical Asset;
- changes to FSRS scheduling/rating semantics.

A later authoring feature may inspect multiple Cases using one canonical Asset and propose Case-specific questions for promotion to Reusable Image Questions. That is intentionally outside this PR.

## Validation / handoff contract for Luna 5.6

Continue this exact Draft PR and branch; do not restart from `main` and do not create a second implementation PR.

At task start, use repository routing and progressive retrieval rather than rereading the whole repository. This task crosses Admin + DB + Asset/R2 + reusable-question boundaries, so ensure the current root/scoped guidance and relevant living image/question authorities are in context before mutation.

Use focused executable tests while implementing each tranche. At coherent checkpoints run the repository-selected compact validation. Before handoff:

1. run `npm run agent:checks -- --compact` and every final/specialized check it reports;
2. run the required DB/check/build/full validation applicable to the resulting change, including `npm run db:check` if any schema-facing definitions were touched even though no migration is planned;
3. run runtime smoke only if the implementation actually changes Worker/runtime/binding behavior as routed by current repository guidance;
4. inspect the complete `main` base → current PR head diff once at final review;
5. reconcile living docs so they no longer claim deduplication is absent or that all old same-image R2 bytes must always be retained;
6. keep the PR Draft. Do not mark Ready, merge, deploy, migrate, or mutate Production data.

If implementation discovers a genuine contradiction with current executable schema/triggers that requires changing one of the fixed decisions above, stop and amend this planning contract in the same PR before broadening implementation.