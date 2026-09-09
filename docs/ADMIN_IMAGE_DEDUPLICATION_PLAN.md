# Admin Image Deduplication — implementation plan

_Status: Draft planning contract for implementation in this same PR/branch. First-pass planning review amendments are incorporated below. Implementation has not started. Do not create a follow-up implementation PR._

## Goal

Add a Production Admin workflow that lets a human certify that two global image Assets are clinically and educationally interchangeable representations of the same teaching image, choose one canonical survivor, merge current/reusable knowledge onto that survivor, and reclaim the duplicate R2 object without leaving any path that can reacquire the retired duplicate.

The feature has exactly two implementation tranches in this PR:

```text
Tranche 1 — Human-confirmed canonical Asset merge + durable cleanup fence
Tranche 2 — Visual duplicate discovery that proposes pairs to Tranche 1
```

The human Admin is the final identity authority. Software may propose likely duplicates but must never automatically merge images.

## Product and architecture decisions already made

1. **Human certification is stronger than visual sameness.** The Admin must certify that the chosen survivor is clinically and educationally interchangeable for every current A/B usage and reusable question shown by the merge review, preserves all required visible content, and introduces no answer-bearing annotation/overlay that would change learner meaning.
2. **One canonical Asset remains.** The selected survivor keeps its Asset ID, R2 object, alt text, and Asset metadata. The duplicate is retired behind a durable dedupe tombstone and is physically removed only after its R2 cleanup succeeds.
3. **Reusable Image Questions are unioned.** Questions that exist only on the duplicate move to the survivor; questions already on the survivor remain. Same-Prompt collisions follow the explicit rules below.
4. **Existing per-Case reusable-question opt-ins do not broaden.** A Case that used only Q3 before the merge does not automatically gain Q1/Q2 merely because the canonical Asset now owns them.
5. **Current active Review media follows the canonical Asset.** Admin certification permits current `active_review_assets` rows that use the duplicate to be rewritten to the survivor Asset/storage key. Prompt/answer/caption/alt-text snapshots are otherwise preserved.
6. **Retired legacy completed-Review provenance is never rewritten.** Current Production is expected to have zero rows in legacy `reviews`, `review_questions`, and `review_assets`; any unexpected non-zero or unreadable legacy count blocks dedupe fail-closed.
7. **R2 space reclamation is intentional.** Exact old duplicate bytes are not retained solely because an active Review previously froze B; after safe canonicalization, B's teaching-image object is deleted.
8. **Higher-resolution replacement remains separate and unchanged.** Deduplication means “two existing Assets are Admin-certified interchangeable; make one canonical and remove the other.” Existing supersession lineage keeps its current history semantics.
9. **Production only.** No Preview Admin merge endpoint. Preview-owned Assets are never candidates, and any retained Preview relationship to B blocks the dedupe claim until Preview cleanup actually removes that relationship.
10. **A schema migration is required.** The earlier no-migration decision is withdrawn. A durable dedupe tombstone is necessary to close D1/R2 races and distinguish cleanup-pending dedupe Assets from ordinary inactive/archived Assets.
11. **No new image-processing dependency.** Tranche 2 uses browser Canvas plus small deterministic matching helpers. Do not add OpenCV, AI/embedding models, WASM image stacks, Sharp, Canvas server packages, or a vector database.
12. **No Import Package or Slide Import Reviewer changes.** Deduplication remains an Admin Image Library maintenance operation.

## Required schema/tombstone amendment

Add one nullable self-reference to `assets` in the next migration at implementation head (expected next migration after current `0020`; confirm the actual next number before creating it):

```text
assets.deduplicated_into_asset_id nullable FK -> assets.id ON DELETE RESTRICT
```

Add an index on this column.

Semantics:

```text
NULL
→ ordinary Asset lifecycle (active, archived/inactive, superseded, etc.)

non-NULL A.id on Asset B
→ B is a dedupe tombstone whose canonical survivor is A
→ B must be inactive
→ B must never acquire a new application/media/question reference
→ only the dedicated dedupe-cleanup retry may physically remove B
```

This field is deliberately separate from `superseded_by_asset_id`; do not overload supersession lineage.

The migration must also add database triggers that reject **new or updated references to a dedupe-tombstoned Asset**. Application guards are helpful UX but are not the race-safety authority. At minimum protect:

```text
case_assets.asset_id
stimulus_group_options.asset_id
asset_questions.asset_id
active_review_assets.asset_id
active_review_assets.storage_key_snapshot
assets.superseded_by_asset_id (as a target)
```

For `active_review_assets`, reject when either:

```text
NEW.asset_id points to an Asset with deduplicated_into_asset_id IS NOT NULL
OR
NEW.storage_key_snapshot equals the storage_key of such an Asset
```

Also add a trigger/check-equivalent guard that prevents a tombstoned Asset from becoming active again and prevents self-deduplication (`B.deduplicated_into_asset_id = B.id`).

These triggers apply to Production and Preview rows because the underlying reference tables are shared. This is intentional: after B is claimed, no writer—importer, Case/stimulus authoring, Preview authoring, reusable-question authoring, or active-Review persistence—may reacquire B.

The migration is additive for existing data: existing Assets receive `NULL` and require no backfill.

## Existing contracts to preserve

Reuse the existing:

- global Image Library and multi-selection patterns;
- immutable private teaching-image R2 keys;
- Production/Preview ownership guards;
- race-safe D1 batch/sentinel pattern from higher-resolution replacement;
- `asset_questions` exact-Asset reusable knowledge model;
- explicit `stimulus_option_asset_questions` opt-ins and cross-group Prompt guards;
- active Review snapshot model containing Asset ID + storage-key snapshot;
- central teaching-image R2 delete helper.

Do not create a parallel Asset/media store or second question model.

---

# Tranche 1 — Human-confirmed canonical Asset merge

## 1. Admin UX and certification evidence

Add the Production Admin surface:

```text
/admin/images/deduplicate
```

The existing Image Library selection flow exposes **Compare / merge duplicates** only when exactly two eligible Production images are selected. Manual comparison remains available independently of Tranche 2 discovery.

The comparison page must show both images large enough for clinical inspection and must show enough affected context for the Admin to certify interchangeability rather than merely visual resemblance.

For each Asset show:

- Admin image name;
- large image preview;
- dimensions when the browser can decode them;
- alt text;
- source label;
- source URL;
- licence/permission;
- Collection;
- active/inactive/supersession/dedupe state;
- current Primary Topic/System usage summary;
- all current affected Production Case usages, with Case title, Primary Topic, relationship type, Case/stimulus caption, and Stimulus Group/Option name where applicable;
- reusable Image Questions with Prompt, canonical answer, active state, and opt-in usage/blast radius;
- active Review usage count only (no learner-identifying detail is needed for certification).

For fixed `case_assets`, do not describe a nonexistent relationship ID. Preserve and display the actual relationship identity/properties: `case_id + asset_id` composite relationship, `display_order`, `caption_md`, and `created_at` as applicable. For Stimulus Options, preserve the real stable `stimulus_group_options.id`.

The duplicate side must clearly label metadata that will be discarded. In particular, differing duplicate alt text, provenance/source URL, licence, image name, and Collection must be visible before confirmation.

The survivor's `alt_text` is protected: the merge must never overwrite it from B. Duplicate provenance/licence is not silently merged into A. If the Admin wants to retain or reconcile B metadata, they must edit A separately before/after dedupe.

Admin chooses **Keep left** or **Keep right**.

The final confirmation must be explicit and substantially equivalent to:

> I have reviewed both images and the affected Case/reusable-question context shown above. I certify that the selected survivor is clinically and educationally interchangeable for every current use of either image, preserves all required visible content, and does not introduce an answer-bearing annotation or overlay. I understand the duplicate Asset metadata/provenance will be discarded and its stored image will be permanently deleted.

No automatic merge and no “approve by score” shortcut.

## 2. Server-owned merge plan and freshness

Do not let the Svelte component infer mutation semantics.

Provide a server/domain read model conceptually equivalent to:

```js
getDuplicateAssetMergePlan({ db, survivorAssetId, duplicateAssetId })
```

It returns:

- both Asset/metadata records;
- affected current Production Case/stimulus usages;
- retained Preview blockers;
- active Review usage and A+B collision state;
- reusable-question union/conflict model;
- per-question blast radius;
- supersession blockers;
- legacy Review sentinel state;
- a deterministic `mergePlanFingerprint` over the mutation-relevant state shown to the Admin.

The fingerprint must include enough current state to reject a stale confirmation, including at least Asset IDs/storage keys/state/update markers, affected relationship identities/counts, Asset Question IDs/Prompt IDs/answers/active states/update markers, opt-in identities, active Review A/B usage identities, and retained Preview blocker identities.

On submit, the server must **recompute the entire merge plan and conflict set**. It must reject:

- stale `mergePlanFingerprint`;
- any newly appearing conflict;
- any missing conflict resolution;
- any extra/stale resolution for a conflict that no longer exists;
- a resolution whose Prompt/Asset Question IDs do not exactly match the current recomputed conflict.

Do not trust hidden form fields as authority for conflicts, affected references, active states, or cleanup eligibility.

## 3. Domain operation

Implement one focused server/domain operation conceptually equivalent to:

```js
mergeDuplicateImageAssets({
  db,
  bucket,
  survivorAssetId,
  duplicateAssetId,
  mergePlanFingerprint,
  confirmedInterchangeable,
  questionConflictResolutions
})
```

Keep mutation logic out of Svelte routes/components. A dedicated module such as `src/lib/server/db/asset-deduplication.js` is preferred rather than mixing this lifecycle into `asset-replacement.js`.

Also provide one narrow retry operation:

```js
retryDuplicateAssetCleanup({ db, bucket, duplicateAssetId })
```

This retry is legal only when the Asset already has `deduplicated_into_asset_id IS NOT NULL`. Do **not** add a generic “delete unused inactive image” operation in this PR.

## 4. Asset eligibility and hard blockers

Both IDs must be distinct existing Production image Assets.

Survivor A must be:

- `preview_session_id IS NULL`;
- active;
- `deduplicated_into_asset_id IS NULL`;
- not superseded by another Asset;
- not an already-retired dedupe source.

Duplicate B must be:

- `preview_session_id IS NULL`;
- active before the claim;
- `deduplicated_into_asset_id IS NULL` before the claim;
- not superseded;
- not the target of an existing `superseded_by_asset_id` predecessor.

Hard blockers:

- same Asset ID on both sides;
- any current Case or current Stimulus Group containing both A and B in a configuration that would collide after B → A; treat this as invalid data and fail closed rather than inventing collapse semantics;
- any **single active Review containing both A and B**; fail closed before mutation and repeat this assertion at commit time;
- any retained Preview relationship to B, regardless of Preview status or expiry;
- any supersession lineage involving B that would be broken by deletion;
- any nonzero/unreadable legacy Review sentinel count;
- any unresolved question conflict or prospective reusable-question invariant violation.

## 5. Preview boundary — block on all retained references

Do not use the existing “live Preview only” replacement rule for dedupe cleanup.

B cannot be claimed while **any** Preview-owned Case relationship still references it, including relationships belonging to sessions that are:

```text
active
expired
cleanup_required
or otherwise retained but not yet physically cleaned
```

Check both:

```text
case_assets -> cases.preview_session_id IS NOT NULL
stimulus_group_options -> stimulus_groups -> cases.preview_session_id IS NOT NULL
```

Status is irrelevant. If the row still exists, dedupe must instruct the Admin to complete/reset/retry Preview cleanup first.

Repeat the retained-Preview zero-reference assertion inside the Phase-1 commit/claim, not only at page load.

After B is tombstoned, the new database reference triggers prevent any Preview writer from reacquiring B.

## 6. Legacy completed-Review boundary

Current V1 treats physical legacy tables as zero-data cutover sentinels:

```text
reviews
review_questions
review_assets
```

Dedupe must never rewrite them.

Before Phase 1, read their counts through a narrow raw-D1 helper. If any count is nonzero or cannot be read, fail closed with an operational error. Add executable coverage with unexpected legacy rows proving no dedupe mutation or R2 delete occurs.

Do not add legacy compatibility writers or provenance-rewrite code.

## 7. Survivor metadata contract

A remains authoritative. Do not mutate A's:

- image name;
- alt text;
- source label;
- source URL;
- licence;
- Collection;
- MIME type;
- storage key;
- R2 bytes.

The only survivor mutations permitted by dedupe are those required by reusable-question union on A's existing `asset_questions` rows (answer/active state where explicitly defined below) and normal `updated_at` effects on rows actually changed.

Relationship-level captions remain relationship metadata and move with their existing Case/stimulus context unchanged.

## 8. Relationship canonicalization

For B → A, canonicalize current references:

```text
case_assets.asset_id                       B → A
stimulus_group_options.asset_id            B → A
active_review_assets.asset_id              B → A
active_review_assets.storage_key_snapshot  B.storage_key → A.storage_key
```

For fixed `case_assets`, the primary key contains `(case_id, asset_id)`; there is no independent relationship ID to preserve. Preserve the Case, display order, caption, and creation metadata while changing only the Asset identity.

For `stimulus_group_options`, preserve the stable option ID, group, display order, caption, active/removed state, and all Case-specific question relationships.

For active Review rows, preserve display order, caption snapshot, alt-text snapshot, source Stimulus IDs, and unrelated Review data. Only current media identity/storage key is canonicalized.

Use set-based D1 updates over all current rows matching B in the Phase-1 batch. Do not rely on preflight-captured ID arrays as the sole update authority, because a writer may commit a B reference after preflight but before Phase 1 starts.

## 9. Active Review race contract

The known dangerous interleaving is:

```text
T1 build active Review snapshot containing B/B-key
T2 dedupe preflight
T2 Phase 1
T1 persist active_review_assets(B, B-key)
T2 delete B R2
```

This must be impossible.

The required fence is:

1. Phase 1 updates all committed `active_review_assets` rows matching B/B-key to A/A-key using set-based SQL.
2. Phase 1 sets `B.deduplicated_into_asset_id = A.id` and `B.is_active = false` inside the same atomic D1 batch.
3. The migration trigger on `active_review_assets` rejects any later INSERT/UPDATE whose `asset_id` is tombstoned B **or whose `storage_key_snapshot` equals B's tombstoned storage key**.
4. Because D1 batch writes are atomic/serialized, an active-Review persistence either:
   - commits before Phase 1 and is captured by the set-based canonicalization; or
   - executes after the tombstone is visible and is rejected by the trigger.
5. Active Review creation maps the dedupe-trigger failure to the existing content-unavailable/stale-content style outcome rather than resuming/accepting a Review that contains B.

Also fail closed if a single existing active Review contains both A and B. Do not collapse that Review's two media rows because doing so would change display cardinality and can collide with `active_review_assets` uniqueness.

Executable tests must force both interleavings, not merely inspect trigger SQL.

## 10. Reusable Image Question union

Load A and B `asset_questions` grouped by `question_prompt_id` and recompute this model on submit.

### A-only

```text
A owns Q1
B has no Q1
→ Q1 remains unchanged
```

### B-only

```text
B owns Q3
A has no Q3
→ update existing Q3.asset_id B → A
→ preserve Q3 ID, Prompt ID, answer, and is_active
```

Do not clone B-only questions.

### Same Prompt + same canonical answer

Answer equality is exact after line-ending normalization only; no semantic/fuzzy equivalence.

```text
A-Q1 prompt=P answer=X
B-Q9 prompt=P answer=X
→ A-Q1 is canonical
→ B-Q9 opt-ins/current active-review provenance remap to A-Q1
→ B-Q9 is deleted
```

### Same Prompt + different canonical answer

This is an explicit Admin conflict. Show both canonical answers and require exactly one:

```text
Keep survivor answer
Use duplicate answer
```

The survivor Asset Question ID remains canonical. Choosing duplicate answer changes only the survivor row's `answer_md`; no synthesized third answer is allowed.

### Resulting `is_active` rule for all collapsed Prompt pairs

For **both identical-answer and different-answer collisions**:

```text
result_is_active = A.is_active OR B.is_active
```

However, this is not an unconditional reactivation.

Before merge, build the **prospective post-merge opt-in graph** for the canonical question after B opt-ins are remapped. Validate the existing cross-Stimulus-Group Prompt invariant against that prospective graph.

This validation is required when:

- A inactive + B active (explicit A-row reactivation);
- A active + B inactive (B's dormant opt-ins may broaden the active canonical question);
- both active (unioned opt-ins may create a new cross-group conflict);
- different-answer conflict resolution results in an active canonical row.

If the prospective active canonical question would violate the current cross-group invariant, block the entire Asset merge. Do not silently force the question inactive and do not add an Admin override in this PR. The Admin must resolve the question/opt-in authoring conflict first, then retry dedupe.

If both rows are inactive, the canonical result remains inactive; preserve/remap its retained opt-ins without reactivating it.

### Per-side question blast radius

For every same-Prompt conflict, show each side's:

- Asset Question ID;
- Prompt;
- answer;
- active/inactive state;
- number of explicit stimulus-option opt-ins;
- affected current Case titles;
- affected Stimulus Group/Option names;
- whether the post-merge OR-active state would trigger a cross-group blocker.

This context is part of the human certification surface.

### Opt-in preservation

Capture/recompute all affected `stimulus_option_asset_questions` rows and produce the exact canonical post-merge set:

- B-only moved Asset Question IDs stay the same;
- collapsed B Asset Question IDs map to A's canonical question ID;
- exact duplicate `(stimulus_group_option_id, asset_question_id)` pairs collapse;
- no new opt-in is created solely because A now owns additional reusable questions.

Order Phase-1 statements so the existing Asset-match/cross-group triggers never observe an invalid committed state. Removing/recreating the affected opt-in set inside the same atomic batch is acceptable if needed.

## 11. Active Review question provenance vs retired legacy provenance

For B-only Asset Questions moved intact to A, their IDs stay valid.

When B-Q collapses into A-Q:

- current `active_review_questions.source_asset_question_id` may be remapped B-Q → A-Q so the in-progress Review points to the canonical current relationship;
- `prompt_snapshot_md` and `answer_snapshot_md` must remain unchanged;
- retired legacy `review_questions` is never rewritten; unexpected legacy rows block dedupe before Phase 1.

Do not broaden this into historical migration support.

## 12. Durable D1 deletion claim

`is_active = false` alone is not a claim.

The authoritative claim is:

```text
B.is_active = false
B.deduplicated_into_asset_id = A.id
```

and it must be established inside Phase 1 only after canonicalization/safety assertions succeed.

Phase 1 must use the higher-resolution replacement style of a conditional source claim plus a database-enforced sentinel so a zero-row claim aborts the entire batch.

The claim condition must reassert at commit time that:

- B is the same active Production image;
- B is not already deduplicated/superseded;
- A is still the same eligible active Production image;
- no retained Preview relationship references B;
- no A+B active Review collision exists;
- B is not part of forbidden supersession lineage;
- no unexpected post-plan B reference/question state remains after the batch's canonicalization statements.

After the claim commits, database triggers—not application timing—are the durable no-new-reference fence.

## 13. Phase-1 atomic ordering and final in-batch assertions

The exact SQL shape may follow current repository patterns, but preserve this semantic order inside one D1 atomic batch:

```text
A. database-enforced pre-mutation assertions
   - no active Review contains both A and B
   - no retained Preview reference to B
   - expected current merge-plan entities still exist

B. temporarily remove/remap affected reusable-question opt-ins as needed

C. canonicalize reusable Asset Questions
   - move B-only rows to A
   - resolve/collapse same-Prompt rows using validated submitted resolutions
   - apply OR-active result only after prospective cross-group validation
   - remap active_review_questions provenance for collapsed current IDs

D. canonicalize all current media relationships with set-based updates
   - case_assets B → A
   - stimulus_group_options B → A
   - active_review_assets B/B-key → A/A-key

E. recreate the exact preserved canonical reusable-question opt-in set

F. database-enforced post-canonicalization assertion
   prove there is no remaining application reference that requires B:
   - no case_assets B
   - no stimulus_group_options B
   - no active_review_assets asset_id B
   - no active_review_assets storage_key_snapshot B.storage_key
   - no asset_questions B
   - no forbidden supersession reference involving B
   - no retained Preview B relationship

G. conditional claim
   set B.is_active=false, B.deduplicated_into_asset_id=A.id

H. exact-claim sentinel
   abort the whole batch unless B now carries exactly A.id as its dedupe tombstone
```

If unexpected state appears between submit-plan recomputation and D1 execution, constraints/assertions must abort rather than partially adapting to an unreviewed merge plan.

## 14. Phase-2 R2 cleanup and cross-store TOCTOU closure

After Phase 1 commits, B's tombstone triggers prevent any later writer from creating a B reference. Therefore the no-ref check before R2 deletion is no longer vulnerable to a new-reference TOCTOU.

Phase 2:

```text
1. reload B and A
2. require B.deduplicated_into_asset_id = A.id and B.is_active=false
3. re-run strict no-reference checks, including ANY retained Preview relationship
4. require legacy Review sentinels remain zero
5. delete only B.storage_key through the central teaching-image helper
6. treat already-missing B object as idempotent cleanup success when helper semantics permit
7. delete B's D1 row only under the same tombstone + no-reference guards
```

Never delete A's R2 object.

If step 5 fails:

```text
A remains canonical
B remains inactive tombstone → A
B R2 object remains
Admin result: merge complete; storage cleanup pending
```

If R2 deletion succeeds but B-row deletion fails:

```text
B remains inactive tombstone → A
B object may already be absent
retry operation rechecks guards, accepts missing B object, and finishes row deletion
```

Never reactivate B and never roll canonical relationships back after Phase 1 committed.

## 15. Cleanup retry provenance — no generic inactive deletion

`retryDuplicateAssetCleanup` must accept **only** an Asset satisfying:

```text
preview_session_id IS NULL
type = image
is_active = false
deduplicated_into_asset_id IS NOT NULL
survivor row still exists and is not itself retired by dedupe
strict no-reference checks pass
legacy Review sentinels are zero
```

An ordinary intentionally archived/unused inactive Asset has `deduplicated_into_asset_id IS NULL` and is not eligible.

Do not expose a broad “permanently delete unused inactive image” action as part of this PR.

## 16. Race/interleaving model that implementation must prove

### Active Review commits before dedupe Phase 1

```text
T1 active Review persists B/B-key
T2 Phase 1 starts
→ set-based Phase 1 sees and canonicalizes T1 row to A/A-key
→ tombstone commits
→ cleanup may proceed
```

### Dedupe commits before stale active Review persistence

```text
T1 snapshot captured B/B-key but not yet persisted
T2 Phase 1 canonicalizes + tombstones B
T1 INSERT active_review_assets(B,B-key)
→ database trigger rejects
→ no B/B-key active Review can appear after claim
```

### Case/stimulus/Asset Question writer races

For each protected reference table, test both sides of the claim boundary:

```text
writer commits before Phase 1
→ Phase 1 either canonicalizes reviewed/compatible state or final assertion aborts

writer attempts after Phase 1 tombstone
→ database trigger rejects B reference
```

### R2 delete window

```text
Phase 1 tombstone committed
strict no-ref recheck
R2 delete
```

No writer can acquire B between the recheck and R2 delete because the tombstone triggers reject all protected reference writes.

### Concurrent dedupe submissions

Only one exact B claim may win. Losing submission must perform no R2 deletion and must return a refresh/current-state error.

## 17. Tranche 1 executable acceptance matrix

Static/regex assertions are supplemental only. Add executable migration/domain/route tests proving at minimum:

1. additive migration leaves existing Assets with null dedupe tombstone and creates the required reference guards;
2. tombstoned B cannot be reactivated;
3. `case_assets` INSERT/UPDATE cannot reference tombstoned B;
4. `stimulus_group_options` INSERT/UPDATE cannot reference tombstoned B;
5. `asset_questions` INSERT/UPDATE cannot reference tombstoned B;
6. `active_review_assets` INSERT/UPDATE cannot use tombstoned B by Asset ID;
7. `active_review_assets` INSERT/UPDATE cannot use B's tombstoned storage key even with another Asset ID;
8. supersession cannot newly target tombstoned B;
9. B used by different Production Cases canonicalizes fixed/stimulus relationships to A while preserving actual fixed relationship properties and stable Stimulus Option IDs;
10. an active Review using only B becomes A/A-key while display/caption/alt-text/source snapshots remain unchanged;
11. an active Review already containing both A and B blocks dedupe and no mutation/R2 delete occurs;
12. forced interleaving: active Review B/B-key commits immediately before Phase 1 and is captured by set-based canonicalization;
13. forced interleaving: active Review snapshot B/B-key is built before Phase 1 but persists after the tombstone and is rejected by the database guard;
14. equivalent before/after-claim interleavings for representative Case/stimulus and reusable-question writers;
15. B-only reusable questions move to A with the same Asset Question IDs and unchanged active state;
16. same-Prompt/same-answer questions collapse with `is_active = OR`, exact opt-in preservation, and current provenance remap;
17. same-Prompt/different-answer conflict is rejected without an exact current resolution; both allowed answer choices produce the chosen canonical answer and `is_active = OR`;
18. stale/missing/extra question conflict resolutions are rejected after server-side recomputation;
19. A-inactive/B-active collapsed question is allowed only when prospective reactivation passes the existing cross-group invariant;
20. A-active/B-inactive and both-active unions are blocked when B opt-ins would create a prospective cross-group Prompt conflict;
21. per-side conflict/blast-radius read model reports Prompt, answer, active state, and affected current Case/group/option usages accurately;
22. merge never broadens reusable-question opt-ins beyond the canonicalized pre-merge set;
23. survivor alt text/Asset metadata/R2 key never change; duplicate differing provenance/licence is not copied into A;
24. any retained Preview relationship to B blocks Phase 1 regardless of session status, including expired/`cleanup_required` fixtures;
25. unexpected nonzero legacy `reviews`, `review_questions`, or `review_assets` blocks dedupe and those rows are never rewritten;
26. Phase-1 final assertion proves B has no remaining protected application/media/question reference before tombstoning;
27. after Phase 1, a newly attempted protected B reference is rejected, closing the D1-no-ref/R2-delete TOCTOU;
28. successful cleanup deletes only B.storage_key; A.storage_key is never passed to R2 deletion;
29. Phase-1 failure performs no R2 delete;
30. R2 deletion failure leaves the durable B → A tombstone and exposes cleanup-pending state;
31. cleanup retry succeeds only for a valid dedupe tombstone and treats an already-missing B object idempotently where supported;
32. an ordinary inactive/archived Asset without a dedupe tombstone is never eligible for retry cleanup;
33. concurrent/double merge can claim B only once and the losing path performs no R2 delete;
34. stale merge-plan fingerprint or changed affected relationships rejects submit before destructive cleanup;
35. Preview Admin has no equivalent mutation endpoint;
36. route auth and expected domain-error mapping remain consistent with Production Admin patterns.

---

# Tranche 2 — Visual duplicate discovery

## 18. Scope

Tranche 2 proposes likely pairs only. `Compare` enters the Tranche 1 evidence/certification workflow. No score, threshold, or discovery action can mutate content.

## 19. Candidate membership semantics

Assets remain global; do not add Topic/System fields to `assets`.

Only active, non-Preview, non-superseded, non-dedupe-tombstoned Production image Assets participate in discovery.

### Same Primary Topic — default

Given selected Topic T, include Asset X when X has at least one **current learner-relevant Production usage** in an active Case whose canonical `case_concepts.role='primary'` Topic is exactly T.

Current usage means:

- fixed: Production active Case has `case_assets.asset_id = X`;
- stimulus: Production active Case + active Stimulus Group + active non-removed Stimulus Option has `asset_id = X`.

Historical/inactive Case or removed/inactive option usage does not grant Topic candidate membership.

An Asset can belong to multiple candidate Topics through reuse in multiple Cases.

### Same System — explicit widening

Given selected System S, include Asset X when X has a current learner-relevant Production usage in a Case whose canonical Primary Topic is a descendant of S through `concepts.parent_id` by **any number of hierarchy levels**.

Do not assume Topics are always direct children of Systems. Resolve ancestry recursively by IDs. If future valid hierarchy contains nested intermediary Topics/System ancestors, membership is true when S appears anywhere in the Primary Topic's ancestor chain consistent with current taxonomy validity.

### Global — explicit widening

Include all eligible active Production image Assets, including currently unused active library Assets. Global scanning is never automatic after Topic/System search.

## 20. Bounded candidate scan

Use explicit constants in the client matching module:

```text
MAX_SCAN_ASSETS = 120
FETCH_DECODE_CONCURRENCY = 4
YIELD_EVERY_PAIR_COMPARISONS = 50
```

If a selected Topic/System/global scope exceeds `MAX_SCAN_ASSETS`, do not silently truncate and claim completeness. Require a narrower scope or an explicit bounded page/batch selection and label results as that bounded batch.

Compare each unordered pair at most once; maximum pair count for one 120-Asset scan is 7,140.

## 21. Deterministic browser dHash algorithm

No AI, embeddings, SHA identity, ORB/OpenCV, or server-side image decoder.

Fingerprint each successfully decoded image in the browser:

1. fetch through the existing authenticated same-origin Asset image route;
2. decode with `createImageBitmap` where supported, otherwise the existing compatible browser-image path;
3. sample deterministic rectangular windows at scales:

```text
SCALES = [1.0, 0.8, 0.6, 0.4]
STEP = 0.2
```

For scale `s`, use x/y normalized origins:

```text
0, 0.2, 0.4, ... <= 1 - s
```

including the exact final origin `1 - s` and deduplicating floating-point-equivalent positions. This yields:

```text
1.0 → 1 window
0.8 → 4 windows
0.6 → 9 windows
0.4 → 16 windows
TOTAL → 30 region hashes/image
```

4. preserve each region's source aspect ratio while resampling the region to a 9×8 RGB pixel grid;
5. grayscale each pixel deterministically as:

```text
gray = round(0.299*R + 0.587*G + 0.114*B)
```

6. compute a 64-bit row-major dHash by comparing each pixel to the pixel immediately to its right; bit = 1 when `left > right`, else 0.

### Pair distance/support

For image A hashes `HA` and B hashes `HB`:

```text
bestDistance = minimum Hamming distance over every (ha,hb)

nearestA(ha) = min distance from ha to any hb
nearestB(hb) = min distance from hb to any ha

SUPPORT_DISTANCE = 10
supportA = count(ha where nearestA(ha) <= 10)
supportB = count(hb where nearestB(hb) <= 10)
supportCount = min(supportA, supportB)

rankScore = 4 * bestDistance - min(supportCount, 8)
```

Lower `rankScore` is stronger.

Classification:

```text
Likely duplicate:
  bestDistance <= 6 AND supportCount >= 2

Possible duplicate:
  bestDistance <= 10 AND supportCount >= 1

Otherwise:
  do not surface in v1
```

Sort deterministically by:

```text
Likely before Possible
rankScore ascending
bestDistance ascending
supportCount descending
sorted Asset-ID pair ascending as final tie-break
```

These constants are the v1 contract. Tune them only through an explicit plan/test amendment, not ad-hoc UI changes during implementation.

The matcher is a retrieval aid, not semantic proof. Medical images with similar structure can still score highly; human certification remains mandatory.

## 22. Matching fixtures

The matching core must accept deterministic pixel/grayscale matrices independent of browser DOM so Node tests can exercise the algorithm.

Fixtures must be stronger than simple whole-frame resize tests. Include at least:

- asymmetric source pattern with several local anchors/features;
- same source resized substantially;
- off-centre moderate crop removing roughly 20–35% of one or more borders, then resized;
- same source with small deterministic pixel/noise/compression-like perturbation;
- same broad medical-style layout but a materially changed focal region that must rank weaker;
- different image with similar line density/large-scale structure that must not receive the strongest classification merely because it is, for example, ECG-like.

No real patient/production image fixtures.

## 23. Fetch/decode concurrency, cancellation, and resource release

One scan owns one `AbortController`/generation token.

Rules:

- at most 4 image fetch/decode jobs active concurrently;
- starting a new scan cancels the previous scan before beginning;
- navigation/component destruction cancels outstanding fetches;
- every decoded `ImageBitmap` is closed in `finally` after its fingerprint is produced;
- do not retain fetched Blobs/decoded images after fingerprinting;
- avoid object URLs where possible; if fallback creates one, revoke it deterministically;
- failed fetch/decode records one visible non-fatal warning and excludes that Asset from pair computation;
- yield to the browser event loop after every 50 unordered pair comparisons;
- stale/cancelled scan completions may not replace results/progress belonging to a newer generation.

No scan path may write D1/R2.

## 24. Discovery UX and Not-duplicate lifetime

The dedupe page supports:

```text
Topic [select]
[Find likely duplicates]

[Widen to System]
[Search global images]

Likely/possible pairs
[Compare] [Not duplicate]
```

Show current scope, candidate count, decoded/skipped count, pair-progress count, and non-fatal decode warnings.

`Compare` enters Tranche 1 with the exact two Asset IDs.

`Not duplicate` is **tab-session only** in v1:

- persist the unordered sorted Asset-ID pair in a versioned `sessionStorage` key;
- it survives page reloads/navigation in the same browser tab/session;
- it disappears when that tab session is closed;
- it is not written to D1 and is not shared across devices/tabs;
- subsequent scans in the same tab suppress that pair;
- if either Asset disappears/merges, stale session entries are harmless and may be ignored/cleaned opportunistically.

Do not add a durable negative-match table in this PR.

## 25. Tranche 2 executable acceptance

Cover at minimum:

1. deterministic fingerprint generation returns exactly the expected 30 regions for ordinary nonzero images;
2. dHash bit order/grayscale/Hamming distance is deterministic;
3. pair `bestDistance`, supportCount, rankScore, classification, sorting, and tie-break rules match the documented formula;
4. same source at materially different resolution ranks as Likely/Possible according to fixtures;
5. off-centre 20–35% crop + resize remains discoverable;
6. small deterministic perturbation remains discoverable;
7. merely similar synthetic medical-style patterns rank materially weaker and do not receive strongest classification solely from broad structure;
8. Topic candidate membership uses exact canonical Primary Topic and current learner-relevant Production usage only;
9. System candidate membership walks recursive ancestry rather than assuming a direct parent;
10. global widening is explicit and includes eligible active unused Production images;
11. inactive, Preview-owned, superseded, and dedupe-tombstoned Assets are excluded;
12. >120 scopes are never silently truncated as complete results;
13. no more than four fetch/decode operations run concurrently;
14. new scan cancels old scan and stale completion cannot overwrite new state;
15. bitmap/object-URL resources are released on success, decode failure, cancellation, and component destruction;
16. pair work yields at the documented bounded cadence;
17. decode/fetch failures are visible/non-destructive;
18. `Not duplicate` persists only for the current tab session and suppresses the pair on later scans in that tab;
19. no discovery/matching path can invoke merge without the explicit Tranche 1 certification submit.

---

# Implementation order in this same Draft PR

Luna implements exactly two tranches and stays in PR #174:

```text
Tranche 1
  migration + tombstone/reference guards
  → merge-plan read model + freshness/conflict model
  → canonical merge domain operation
  → cleanup retry domain operation
  → executable migration/race/R2/question tests
  → manual compare/merge Admin UX
  → focused checkpoint validation

Tranche 2
  pure deterministic matcher + fixtures/tests
  → Topic/System/global candidate read path
  → bounded/cancellable discovery client
  → discovery UI wired only to Tranche 1 Compare
  → focused checkpoint validation
```

Do not create another PR between tranches.

## Likely implementation surfaces

Use current repository routing to confirm exact files at coding start. Expected ownership includes:

- new migration + `schema.js` tombstone field/index;
- DB triggers guarding all relevant dedupe-tombstoned Asset references;
- new focused DB/domain module for merge-plan, canonical merge, and cleanup retry;
- active Review error mapping only as needed to present a clean content-unavailable result when the new database guard rejects a stale snapshot;
- existing Image Library selection component for the exactly-two-images entry point;
- new `/admin/images/deduplicate` Production Admin route/components;
- small pure client matching helper;
- focused tests alongside current Asset replacement, active Review, Image Library, reusable-question, migration/schema tests;
- living `V1_DATA_MODEL`, image/R2, reusable-question, and higher-resolution-replacement docs reconciled after implementation without changing replacement behavior.

Keep domain mutation out of Svelte components.

## Explicit non-goals

This PR does not add:

- automatic merges;
- AI/vision embeddings;
- SHA-based duplicate identity as the primary matcher;
- ORB/OpenCV/Sharp/server Canvas dependencies;
- persistent fingerprint/vector tables;
- durable server-side `Not duplicate` decisions;
- bulk multi-pair auto-merge;
- generic Asset families/version history;
- Preview Admin dedupe mutation;
- generic delete-unused-inactive-Asset capability;
- Import Package version changes;
- slide reviewer/importer dedupe logic;
- automatic promotion of Case-specific questions into reusable questions;
- automatic reusable-question opt-in across all Cases using the canonical Asset;
- changes to FSRS scheduling/rating semantics;
- legacy completed-Review migration/rewriting.

A later authoring feature may inspect multiple Cases using one canonical Asset and propose Case-specific questions for promotion to Reusable Image Questions. That remains outside PR #174.

## Validation / handoff contract for Luna 5.6

Continue this exact Draft PR and branch; do not restart from `main` and do not create a second implementation PR.

At coding start, use repository routing/progressive retrieval. This work crosses schema/migrations, Admin, DB, active Review, reusable-question, Preview ownership, and Asset/R2 lifecycle boundaries, so load the routed current authorities before mutation.

Use focused executable tests during each tranche. At coherent checkpoints run repository-selected compact validation. Before implementation handoff:

1. run `npm run agent:checks -- --compact` and every final/specialized check it reports;
2. run migration/schema checks including `npm run db:check` and the repository's migration contract coverage;
3. run focused Asset dedupe/reference-trigger/active-Review/reusable-question/R2 tests;
4. run required `check`, build, and full validation selected by current repository guidance;
5. run runtime smoke only if the implementation actually changes Worker/runtime/binding behavior as routed by current guidance;
6. inspect the complete intended `main` base → current PR head diff once at final review;
7. reconcile living docs so they accurately distinguish higher-resolution supersession from Admin-certified destructive dedupe and document the new tombstone/cleanup semantics;
8. keep PR #174 Draft. Do not mark Ready, merge, deploy, apply Production migration, or mutate Production data without explicit instruction.

If implementation discovers a genuine contradiction with current executable schema/D1 behavior that would require changing a fixed decision above, stop implementation and amend this planning contract in the same PR before broadening scope.