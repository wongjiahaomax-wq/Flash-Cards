# Admin Image Deduplication — implementation plan

_Status: Draft planning contract for implementation in this same PR/branch. Second-pass planning review amendments are incorporated below. Implementation has not started. Do not create a follow-up implementation PR._

## Goal

Add a Production Admin workflow that lets a human certify that two global image Assets are clinically and educationally interchangeable representations of the same teaching image, choose one canonical survivor, union reusable image knowledge onto that survivor, and reclaim the duplicate R2 object without permitting the retired duplicate to be reacquired or chained into another dedupe.

The feature has exactly two implementation tranches in this PR:

```text
Tranche 1 — Human-certified canonical Asset merge + durable cleanup fence
Tranche 2 — Visual duplicate discovery that proposes pairs to Tranche 1
```

The Admin is the final identity authority. Discovery may propose pairs but must never merge automatically.

---

# Fixed product / architecture decisions

1. **Human certification is stronger than visual sameness.** The Admin must certify that the selected survivor is clinically and educationally interchangeable for every retained A/B usage shown by the review, preserves required visible content, and introduces no answer-bearing annotation/overlay.
2. **One canonical Asset remains.** Survivor A keeps its Asset ID, R2 object, alt text and Asset metadata. Duplicate B is first converted into a durable cleanup-pending tombstone, then its R2 object and D1 row are removed.
3. **Reusable Image Questions are unioned.** B-only questions move to A with the same Asset Question ID. A-only questions remain. Same-Prompt collisions follow the explicit rules below.
4. **Existing reusable-question opt-ins do not broaden.** Canonicalization preserves the exact pre-merge opt-in set after ID remapping; reuse is never automatically enabled in additional Cases.
5. **Active Reviews block the merge.** Do not rewrite a frozen active Review from B to A in this PR. If any current `active_review_assets` row uses B or B's storage key, or any current active Review question references a B Asset Question, the merge is blocked until that active Review is completed/discarded/expired/replaced. A stale active Review snapshot that tries to persist B after the claim is rejected by the database tombstone fence.
6. **Retired legacy Reviews are never rewritten.** `reviews`, `review_questions` and `review_assets` remain zero-data cutover sentinels. Any nonzero or unreadable legacy count blocks dedupe.
7. **R2 reclamation is intentional.** Once Phase 1 safely claims B and the no-reference contract holds, B's teaching-image object is permanently deleted.
8. **Higher-resolution replacement remains a separate lifecycle.** Do not overload `superseded_by_asset_id` or change current replacement behavior.
9. **Production only.** No Preview Admin merge endpoint. Any retained Preview relationship to B blocks the claim regardless of Preview status/expiry.
10. **A schema migration is required.** Current `main` reaches migration `0025`; at this reviewed head the expected new migration is `0026_admin_image_deduplication.sql`. Luna must re-check the actual migration head before creating it if `main` advances.
11. **No new image-processing dependency.** Tranche 2 stays browser-side and dependency-free: no AI/embeddings, OpenCV/ORB, Sharp/server Canvas, WASM vision stack, vector DB or persisted fingerprint table.
12. **No Import Package / Slide Import Reviewer changes.** Deduplication remains an Admin Image Library maintenance workflow.

---

# Tranche 1 — Human-certified canonical Asset merge

## 1. Required schema and durable tombstone

Add:

```text
assets.deduplicated_into_asset_id nullable FK -> assets.id ON DELETE RESTRICT
```

and an index on the column.

Semantics:

```text
NULL
→ ordinary Asset lifecycle

B.deduplicated_into_asset_id = A.id
→ B is a cleanup-pending dedupe tombstone whose canonical survivor is A
→ B.is_active MUST be false
→ B may not acquire any new media/question/application reference
→ B may not be reactivated
→ B's non-null tombstone may not be changed or cleared; only DELETE may remove the row
```

The field is separate from supersession.

### Chain prevention

Dedupe chains are forbidden.

A source/duplicate candidate X may not be claimed if either is true:

```text
X.deduplicated_into_asset_id IS NOT NULL
OR
EXISTS asset child WHERE child.deduplicated_into_asset_id = X.id
```

Therefore, after B → A commits but B cleanup is pending, A has an incoming dedupe tombstone and **A cannot later become the source in A → C**. Multiple independent tombstones may point to the same stable canonical survivor A, but A itself cannot be retired until all incoming tombstones are physically cleaned.

A survivor target must itself have `deduplicated_into_asset_id IS NULL`.

The dedicated cleanup retry for tombstone B must also require **no incoming dedupe tombstone targets B**. This is defensive even though the claim guard should make such a chain impossible.

### Database guards

Application preflight is not the race authority. The migration must add D1 triggers/check-equivalent guards enforcing at minimum:

- setting a non-null tombstone requires `NEW.is_active = false`;
- self-deduplication is rejected;
- once `OLD.deduplicated_into_asset_id IS NOT NULL`, UPDATE may not change or clear that value;
- a tombstoned Asset may never become active;
- setting X's tombstone is rejected if any other Asset currently points to X through `deduplicated_into_asset_id`;
- the survivor target is rejected if it is itself tombstoned;
- new/updated references to a tombstoned Asset are rejected in:
  - `case_assets.asset_id`;
  - `stimulus_group_options.asset_id`;
  - `asset_questions.asset_id`;
  - `active_review_assets.asset_id`;
  - `active_review_assets.storage_key_snapshot` when it equals a tombstoned Asset's `storage_key`;
  - `assets.superseded_by_asset_id` when the target is tombstoned.

These guards apply to all shared tables, including Preview writers. After B is claimed, no current/future writer can reacquire B.

The migration is additive: all existing Assets receive NULL and need no backfill.

## 2. Migration / deployment ordering

Production ordering is mandatory:

```text
1. merge code only after review
2. apply the additive D1 migration first while the old Worker is still running
3. verify migration success
4. only then deploy the Worker that reads/writes deduplicated_into_asset_id
5. only after the new Worker is live may an Admin perform a dedupe
```

Do not deploy a Worker that requires the new column/triggers before the Production migration is applied. The additive migration is old-Worker-compatible because no tombstones exist until the new dedupe feature creates them.

No Production migration/deployment is part of implementation work unless explicitly requested later.

## 3. Admin entry points and cleanup-pending visibility

Add:

```text
/admin/images/deduplicate
```

The existing Image Library exposes **Compare / merge duplicates** only when exactly two eligible Production images are selected.

The dedupe page also has a clearly discoverable **Cleanup pending** section listing every Production image where:

```text
deduplicated_into_asset_id IS NOT NULL
```

Each entry shows duplicate image name/ID, canonical survivor name/ID, claim/update time where available, and a **Retry storage cleanup** action. This is the only generic Admin recovery surface for failed physical cleanup.

Dedupe tombstones must not masquerade as ordinary inactive/archived images. Normal Image Library presentation should either exclude them from ordinary inactive results or render an explicit `Dedupe cleanup pending` state with navigation to the retry surface. They must never be eligible for ordinary reuse/selection.

Do **not** add a broad `delete unused inactive image` action.

## 4. Certification evidence — all retained Production usage

The Admin must certify over **every retained Production relationship** that Phase 1 must rewrite, not only currently learner-visible usage.

For each A/B Asset show:

- large image preview;
- image name;
- alt text;
- source label / source URL / licence;
- Collection;
- storage/media state and active/supersession/dedupe state;
- dimensions when available for display;
- all retained Production fixed `case_assets` rows;
- all retained Production `stimulus_group_options` rows;
- reusable Asset Questions;
- contextual Stimulus Group and Stimulus Option questions for every retained option/group using A/B.

Every retained usage must be clearly classified as one of:

```text
Current learner-relevant
Retained inactive Case
Retained inactive Stimulus Group
Retained inactive Stimulus Option
Retained removed-from-Case Stimulus Option
```

Do not hide retained/inactive rows merely because they are not currently selectable by learners; they still prevent B deletion and are certification-relevant.

For each retained Case usage show decision-relevant context:

- Case ID/title and active state;
- canonical Primary Topic ID/name and System ancestry used for context;
- relationship kind (fixed vs stimulus option);
- fixed `display_order`, `caption_md`, `created_at` where applicable;
- Stimulus Group ID/name/active state;
- Stimulus Option ID/display order/caption/`is_active`/`removed_from_case`;
- contextual `stimulus_group_questions` and `stimulus_option_questions`: Prompt ID/text, answer, active state.

For fixed `case_assets`, do not invent a relationship ID: identity is the retained `(case_id, asset_id)` relationship plus its actual columns. Stimulus Option ID remains the stable contextual identity.

For each reusable Image Question show:

- Asset Question ID;
- Prompt ID/text;
- answer;
- active state;
- exact opt-in count;
- affected retained/current Case + Group + Option context.

### Same-Case A+B blocker

Build the retained Case-ID set for A and for B across **both** fixed relationships and all stimulus options, irrespective of Case/group/option current state.

If the intersection is non-empty, block dedupe. This includes:

```text
A fixed + B fixed
A fixed + B option
A option + B fixed
A/B options in the same group
A/B options in different groups of the same Case
inactive/removed retained variants of any of the above
```

Do not invent collapse semantics for this PR.

## 5. Active Review policy — block rather than rewrite

An active Review is frozen learner context, including media, captions, alt text, Prompt/answer snapshots and source provenance. To keep certification tractable and avoid changing frozen cardinality/context, **B must have zero active Review usage at claim time**.

Block when any current active Review has:

```text
active_review_assets.asset_id = B.id
OR active_review_assets.storage_key_snapshot = B.storage_key
OR active_review_questions.source_asset_question_id references an Asset Question currently owned by B
```

If a Review contains both A and B, it is necessarily blocked as a subset of this rule; retain an explicit test for that case.

The comparison page should show a non-identifying blocker such as:

```text
This duplicate is currently frozen in N active Review(s). Complete/discard/expire those Reviews before merging.
```

Do not expose learner identity.

### Stale-snapshot race

Required race behavior:

```text
T1 builds Review snapshot containing B but has not persisted it
T2 Phase 1 exact-state guard sees zero committed B active Reviews
T2 claims/tombstones B
T1 attempts INSERT active_review_assets(B, B-key)
→ DB tombstone trigger rejects it
→ Active Review creation maps to current content-unavailable/stale-content behavior
```

If T1 persists B before Phase 1 begins, Phase 1's in-batch no-active-B assertion fails and the dedupe does not claim/delete anything.

Late Active Reviews are intentionally **not** part of the authoring plan fingerprint; they are governed by the in-batch zero-active-B assertion plus post-claim tombstone trigger.

## 6. Safe rendering of certification content

All persisted/package-controlled text shown by this page must render literally through normal escaped Svelte text bindings.

This includes filenames, Case titles, captions, Topic/System names, Group names, metadata/provenance, Prompt text and answers.

- no unsanitized `{@html}`;
- no ad-hoc Markdown-to-HTML path on this review surface;
- preserve line breaks with CSS such as `white-space: pre-wrap` where useful.

Add focused coverage with HTML/event-handler-looking persisted strings proving they are displayed as text, not executable markup.

## 7. Survivor metadata contract and R2 authority

A's global Asset metadata wins. Dedupe must never copy B metadata into A automatically and must never overwrite A's:

- image name;
- alt text;
- source label;
- source URL;
- licence;
- Collection;
- MIME type;
- storage key;
- R2 bytes.

The UI must visibly mark B metadata/provenance/licence that will be discarded.

Before Phase 1, the server—not browser image loading—must verify the survivor R2 object exists using the authoritative bucket/storage helper (`head` or established equivalent). Also verify B's object exists for a normal merge; if either expected object is missing, block and require storage repair rather than creating a tombstone against an unusable canonical image.

R2 existence verification is preflight authority for media availability; D1 tombstone/reference guards remain the race authority for references.

## 8. Server-owned merge plan and full decision fingerprint

Provide a domain read model conceptually equivalent to:

```js
getDuplicateAssetMergePlan({ db, survivorAssetId, duplicateAssetId })
```

It returns the complete certification model and a deterministic `mergePlanFingerprint`.

The fingerprint is computed server-side from canonical, sorted, serialization-stable data and must cover **every decision-relevant value displayed to the Admin**, not merely IDs/counts. Include at minimum:

### Asset values
- both Asset IDs;
- image names;
- alt text;
- source label/URL/licence;
- Collection ID/name;
- MIME/storage key;
- active/supersession/dedupe state;
- relevant timestamps/update markers.

### Retained Case / taxonomy context
- Case ID/title/active state;
- Primary Topic ID/name;
- displayed System ancestry IDs/names;
- fixed relationship caption/order/created-at;
- all retained relationship classification states.

### Stimulus context
- Group ID/name/active state and other displayed state;
- Option ID/order/caption/active/removed state;
- every displayed Stimulus Group/Option question ID, Prompt ID/text, answer and active state.

### Reusable questions / opt-ins
- Asset Question IDs;
- Prompt IDs/text;
- answers;
- active states;
- exact opt-in relationship identities and displayed Case/Group/Option context.

### Blocker-relevant state
- retained Preview relationship identities;
- supersession/dedupe incoming/outgoing state;
- legacy sentinel state.

Active Review rows are excluded from the fingerprint for the reason described above and receive an independent atomic zero-use assertion.

Use SHA-256 or another deterministic cryptographic digest already available in the runtime only for **plan staleness**, not image identity.

## 9. Submit recomputation and recompute→D1 race closure

On submit:

1. server recomputes the entire merge plan from current D1 state;
2. rejects a stale `mergePlanFingerprint`;
3. recomputes same-Prompt conflicts and prospective cross-group validation;
4. rejects missing, extra or stale conflict resolutions;
5. verifies authoritative A/B R2 existence;
6. enters Phase 1 with the exact recomputed expected authoring snapshot.

The recompute itself is **not sufficient**. A Case/question/opt-in writer could commit after recompute and before the D1 batch.

Therefore the first part of the Phase-1 atomic batch must contain a database-enforced **exact set-and-value equality assertion** against the expected recomputed snapshot. Use the current D1 sentinel style (for example canonical JSON payloads + `json_each`/CTE comparisons feeding a NOT-NULL sentinel) so mismatch aborts the whole batch.

The in-batch assertion must prove there are neither missing nor extra certification-relevant rows and that the relevant values are unchanged for:

- both Asset rows and incoming/outgoing dedupe/supersession state;
- every retained Production A/B `case_assets` relationship plus displayed Case/taxonomy values;
- every retained Production A/B stimulus option plus displayed Case/Group/Option values;
- every displayed contextual Stimulus Group/Option question value;
- every A/B Asset Question value;
- every affected reusable-question opt-in relationship;
- retained Preview blockers (still zero for B);
- legacy sentinel zero state;
- same-Case A+B retained-collision state.

Do **not** let set-based canonicalization silently absorb a newly created Case/stimulus usage, changed caption/order/state, changed Prompt/answer, new/removed opt-in or other unreviewed authoring change.

Because D1 batch statements are atomic/serialized, once this equality guard succeeds, competing authoring writes cannot interleave inside that Phase-1 batch. Any writer that committed before the guard causes a stale-plan abort; any B-reference writer after the tombstone is rejected by the new trigger.

## 10. Reusable Image Question union

Recompute by `question_prompt_id` on submit.

### A-only

```text
keep A row unchanged
```

### B-only

```text
UPDATE existing B row asset_id B → A
preserve Asset Question ID, Prompt ID, answer and is_active
```

Do not clone B-only rows.

### Same Prompt + same answer

Answer equality is exact after line-ending normalization only.

```text
A-Q survives
B-Q references/opt-ins canonicalize to A-Q
B-Q deleted
result_is_active = A.is_active OR B.is_active
```

### Same Prompt + different answer

Require exactly one current conflict resolution:

```text
Keep survivor answer
Use duplicate answer
```

A-Q remains the canonical ID. No synthesized answer. Resulting active state is also:

```text
A.is_active OR B.is_active
```

### Cross-group reactivation / union validation

The OR-active rule is only valid when the **prospective post-merge opt-in graph** satisfies the existing cross-Stimulus-Group Prompt invariant.

Validate for every state combination, including:

- A inactive / B active;
- A active / B inactive;
- both active;
- different-answer resolution yielding an active row.

B's dormant opt-ins can still create a conflict when unioned onto an already-active A question, so do not rely only on the existing `inactive → active` trigger. If the prospective graph violates the invariant, block the whole Asset merge; do not silently inactivate the question and do not add an override.

If both are inactive, result remains inactive and retained opt-ins are remapped without reactivation.

### Exact opt-in preservation

Canonical post-merge opt-ins are exactly the pre-merge union after question-ID remapping and duplicate pair collapse. No additional opt-in is inferred.

For each same-Prompt pair/conflict, show per-side blast radius: Asset Question ID, Prompt, answer, active state, opt-in count, retained/current Case titles, Group/Option names/states and whether prospective OR-active union is blocked.

## 11. Contextual Stimulus questions are certification-only

`stimulus_group_questions` and `stimulus_option_questions` are not moved by Asset dedupe; their contextual owners remain unchanged. They are displayed/fingerprinted because they are evidence the Admin must consider when deciding whether A can replace B in that context.

Any change to their Prompt/answer/active state between certification and Phase 1 invalidates the plan through the exact in-batch authoring-state assertion.

## 12. Phase-1 mutation order

After all server/R2 preflight succeeds, use one atomic D1 batch with this semantic order:

```text
A. exact expected-authoring-state assertion
B. independent no-active-Review-B assertion
C. no retained Preview B assertion
D. no same-Case retained A+B collision assertion
E. no incoming dedupe tombstone on source B; A/B chain/supersession eligibility assertions
F. temporarily remove affected reusable opt-ins if needed for trigger-safe canonicalization
G. move/collapse reusable Asset Questions using validated resolutions
H. canonicalize all retained Production media relationships B → A
   - every Production case_assets row, regardless current/inactive Case
   - every Production stimulus_group_options row, regardless group/option active/removed state
I. recreate exactly the canonical preserved opt-in set
J. final no-reference assertion for B
K. conditional tombstone claim in ONE update:
   B.is_active = false
   B.deduplicated_into_asset_id = A.id
L. exact-claim sentinel proving the tombstone points to A and B is inactive
```

Do not update active Review rows: Phase 1 requires zero B active Review use.

### Final B no-reference assertion

Before tombstone claim, prove B has no remaining:

- Production or Preview `case_assets` reference;
- Production or Preview stimulus-option reference;
- `asset_questions` ownership;
- active Review Asset ID/storage-key reference;
- active Review Asset Question provenance owned by B;
- forbidden supersession reference;
- incoming dedupe tombstone;
- other known direct Asset FK required for physical deletion.

If implementation discovery finds another current Asset-owning FK, add it to both the claim guard and tests before coding continues.

## 13. Writer/race contract

### Authoring writer commits before Phase 1

A new/changed Case, stimulus relationship, contextual question, Asset Question or opt-in that commits after submit recompute but before Phase 1 changes the exact authoring snapshot.

```text
Phase-1 equality assertion fails
→ no canonicalization
→ no tombstone
→ no R2 delete
→ Admin refreshes/re-certifies
```

### Writer attempts B reference after Phase 1

```text
tombstone visible
→ DB trigger rejects B reference
```

### Active Review commits before Phase 1

```text
active Review persists B/B-key
→ in-batch no-active-B assertion fails
→ merge does not claim B
```

### Stale active Review persists after Phase 1

```text
snapshot built before claim
→ insert B/B-key after claim
→ DB trigger rejects
```

### Concurrent dedupe

Only one exact B claim may win. A losing merge performs no R2 deletion.

### Tombstone chain attempt

```text
B → A cleanup pending
attempt A → C
→ incoming-tombstone source guard rejects
```

## 14. Phase-2 R2 cleanup

After Phase 1 commits, the tombstone/trigger fence closes the D1/R2 TOCTOU: no writer can acquire B between a no-reference recheck and R2 deletion.

Cleanup sequence:

```text
1. reload B and A
2. require B.is_active=false and B.deduplicated_into_asset_id=A.id
3. require B tombstone value is unchanged
4. require no incoming dedupe tombstone targets B
5. require A still exists and is not itself tombstoned
6. strict no-reference recheck, including retained Preview and active Review checks
7. legacy Review sentinels still zero
8. delete ONLY B.storage_key through central teaching-image delete helper
9. missing B object is idempotent success when helper semantics permit
10. delete B D1 row under the same tombstone/no-reference guards
```

Never pass A.storage_key to an R2 delete operation.

Failure after Phase 1:

```text
R2 failure
→ A remains canonical
→ B remains inactive tombstone → A
→ visible Cleanup pending entry

R2 succeeds but D1 row deletion fails
→ B remains tombstone; object may be absent
→ retry revalidates and finishes idempotently
```

The retry operation accepts only a valid dedupe tombstone. Ordinary inactive/archived Assets are never eligible.

## 15. Certification wording

Final confirmation should be substantially equivalent to:

> I have reviewed both images and every retained Case/stimulus/reusable-question context shown above. I certify that the selected survivor is clinically and educationally interchangeable for all of those uses, preserves all required visible content, and does not introduce an answer-bearing annotation or overlay. I understand the duplicate's Asset metadata/provenance will not be copied automatically and its stored image will be permanently deleted after the canonical merge succeeds.

If any active Review uses B, confirmation controls are disabled and the Review blocker is shown instead.

## 16. Tranche-1 executable acceptance matrix

Static/regex checks are supplemental only. Add executable migration/domain/route coverage proving at minimum:

1. migration is additive; existing Assets get null tombstone;
2. tombstone requires inactive state;
3. non-null tombstone cannot be changed or cleared by UPDATE;
4. tombstoned Asset cannot be reactivated;
5. self-dedupe is rejected;
6. source with incoming dedupe tombstone cannot be claimed;
7. tombstoned target cannot be used as survivor;
8. B→A cleanup-pending then attempted A→C is rejected;
9. cleanup retry rejects any tombstone with an incoming dedupe reference;
10. `case_assets` INSERT/UPDATE cannot acquire tombstoned B;
11. `stimulus_group_options` INSERT/UPDATE cannot acquire tombstoned B;
12. `asset_questions` INSERT/UPDATE cannot acquire tombstoned B;
13. `active_review_assets` INSERT/UPDATE cannot use tombstoned B ID;
14. `active_review_assets` cannot use B's tombstoned storage key with any Asset ID;
15. supersession cannot newly target tombstoned B;
16. all retained Production B fixed relationships move to A, including inactive Cases, preserving caption/order/created-at semantics;
17. all retained B stimulus options move to A, including inactive/removed rows, preserving stable option IDs/context;
18. certification read model labels current vs each retained inactive/removed state correctly;
19. any retained same-Case A+B intersection across fixed/options/same-or-different groups blocks merge;
20. certification includes contextual Stimulus Group/Option Prompt/answer/state accurately;
21. B-only reusable questions move to A with same IDs/states;
22. same-Prompt/same-answer collapse applies OR-active rule and exact opt-in preservation;
23. same-Prompt/different-answer requires exactly one current resolution and applies selected answer + OR-active rule;
24. stale/missing/extra conflict resolutions reject;
25. prospective cross-group conflicts for A-inactive/B-active, A-active/B-inactive and both-active unions block;
26. per-side reusable-question blast radius is accurate;
27. survivor alt text, metadata, storage key and R2 bytes never change; B provenance/licence is not copied;
28. retained Preview B reference blocks regardless active/expired/cleanup_required status;
29. unexpected nonzero/unreadable legacy Review sentinel blocks with no mutation/R2 delete;
30. any active Review using B Asset ID, B storage key or B Asset Question provenance blocks;
31. active Review containing both A and B blocks;
32. stale active Review snapshot built before claim but persisted after claim is rejected by DB guard;
33. active Review B persistence immediately before Phase 1 makes the in-batch guard abort the merge;
34. server blocks when authoritative survivor R2 object is missing;
35. server blocks normal merge when B R2 object is unexpectedly missing;
36. displayed persisted HTML/event-handler-looking values render literally and cannot execute;
37. mergePlanFingerprint changes when any decision-relevant displayed value changes, including Prompt text/state, caption/order/status, Case/Group/Option context or metadata;
38. submit recomputation rejects stale browser fingerprint;
39. forced interleaving: new retained Case/stimulus usage commits after recompute/before Phase 1 → exact in-batch equality guard aborts;
40. forced interleaving: caption/order/Case or Group/Option state changes after recompute/before Phase 1 → abort;
41. forced interleaving: Asset Question Prompt/answer/active state changes after recompute/before Phase 1 → abort;
42. forced interleaving: reusable opt-in added/removed after recompute/before Phase 1 → abort;
43. forced interleaving: contextual Group/Option question changes after recompute/before Phase 1 → abort;
44. no late authoring write is silently absorbed by set-based B→A updates;
45. successful Phase 1 leaves zero protected B references before tombstone;
46. post-claim attempt to add a B reference is rejected, closing D1/R2 TOCTOU;
47. cleanup deletes only B.storage_key;
48. Phase-1 failure performs no R2 delete;
49. R2 failure leaves durable cleanup-pending tombstone visible in Admin retry list;
50. retry accepts only valid dedupe tombstone and is idempotent for already-missing B object when storage helper permits;
51. ordinary inactive/archived Asset never appears as cleanup-pending and cannot use retry;
52. concurrent/double merge claims B at most once and loser performs no R2 delete;
53. Preview Admin has no equivalent mutation endpoint;
54. Production route auth/domain-error mapping follows current Admin patterns.

---

# Tranche 2 — Visual duplicate discovery

## 17. Candidate membership

Only active, non-Preview, non-superseded, non-tombstoned Production image Assets are automatic discovery candidates.

### Topic — default

Given Topic T, include X when X has at least one **current learner-relevant Production usage** in an active Case whose canonical Primary Topic is exactly T.

Current usage:

- fixed `case_assets` on an active Production Case;
- active non-removed Stimulus Option in an active Stimulus Group on an active Production Case.

Inactive/removed retained relationships are certification evidence once a pair is compared, but do not grant Topic discovery membership.

### System — explicit widening

Include X when its current Production Case usage has a canonical Primary Topic whose recursive ancestor chain contains selected System S at **any depth**. Do not assume Topics are direct children of Systems.

### Global — explicit widening

Include all eligible active Production image Assets, including currently unused active library Assets. Never auto-widen from Topic/System to global.

## 18. Scan bounds / resources

Use explicit constants:

```text
MAX_SCAN_ASSETS = 120
MAX_TOTAL_FETCH_BYTES = 96 * 1024 * 1024
MAX_SINGLE_FETCH_BYTES = existing validated teaching-image maximum
FETCH_CONCURRENCY = 4
DECODE_CONCURRENCY = 2
MAX_WORKING_DIMENSION = 768
MAX_WORKING_PIXELS = 768 * 768
YIELD_EVERY_PAIR_COMPARISONS = 100
```

Do not silently truncate a scope and imply completeness.

If candidate count >120, require a narrower scope or explicit bounded batch/page and label it as incomplete/bounded.

Count bytes using trusted `Content-Length` when present and actual Blob byte length before fingerprinting; stop before the cumulative scan exceeds 96 MiB and report a visible incomplete-scan warning. A failed/oversize fetch is non-destructive.

At most 2 images may be in decode/working-raster processing simultaneously. Retain only compact fingerprints after each image is processed.

After fingerprinting each image:

- `ImageBitmap.close()` where available;
- release Blob/object-URL references;
- clear/reset temporary Canvas backing dimensions;
- release pixel arrays once hashes are produced.

New scan/scope change/cancel uses an `AbortController` plus scan-generation token; abort outstanding fetches and prevent stale workers from committing results.

Yield to the browser every 100 unordered pair comparisons.

## 19. Deterministic fingerprint extraction

Browser decoding supplies pixels; matching mathematics is pure JS and testable from deterministic RGBA fixtures.

### Working raster

Preserve the decoded whole-image aspect ratio when drawing into a bounded working Canvas whose longest side is <=768 and whose total pixels are <=768².

Do **not** claim that each 9×8 hash preserves aspect ratio. Each selected source region is intentionally resampled directly to a 9×8 comparison grid.

### Alpha compositing

Before grayscale, composite each RGBA pixel onto opaque white using integer alpha `a` in [0,255]:

```text
Cwhite = round((C * a + 255 * (255 - a)) / 255)
```

for R/G/B separately.

Then:

```text
gray = round(0.299*Rwhite + 0.587*Gwhite + 0.114*Bwhite)
```

### Region families — include asymmetric crops

Use normalized `(widthFraction, heightFraction)` shapes:

```text
[1.0, 1.0]
[0.8, 0.8]
[0.6, 0.6]
[0.4, 0.4]
[0.8, 1.0]
[0.6, 1.0]
[1.0, 0.8]
[1.0, 0.6]
[0.8, 0.6]
[0.6, 0.8]
```

Origin rules:

- full frame: one origin `(0,0)`;
- if both dimensions are cropped: top-left, top-right, bottom-left, bottom-right, centre;
- if only width is cropped: left, centre, right;
- if only height is cropped: top, centre, bottom.

This yields exactly **38 region hashes per image** and explicitly covers one-sided horizontal/vertical border crops as well as rectangular asymmetric crops. Do not use the earlier scalar-only 30-region contract.

For each region, sample/resample deterministically into a 9×8 RGBA/grid, composite alpha, convert to grayscale, then compute a 64-bit row-major dHash from each pixel vs the pixel immediately right:

```text
bit = 1 when leftGray > rightGray else 0
```

Represent each 64-bit hash as JavaScript `BigInt`, never `Number`.

Hamming distance is exact popcount of `hashA ^ hashB` using `BigInt` operations.

## 20. Deterministic pair score / thresholds

For the 38 hashes of A and B:

```text
nearestA[i] = min Hamming(A[i], every B hash)
nearestB[j] = min Hamming(B[j], every A hash)
bestDistance = min(nearestA ∪ nearestB)
supportA = count(nearestA <= 8)
supportB = count(nearestB <= 8)
support = min(supportA, supportB)
top3DistanceSum = sum of the 3 smallest values in nearestA ∪ nearestB
```

Classify:

```text
Likely duplicate
→ bestDistance <= 6
AND support >= 3
AND top3DistanceSum <= 24

Possible duplicate
→ not Likely
AND bestDistance <= 10
AND support >= 2
AND top3DistanceSum <= 36

Otherwise
→ do not propose
```

Rank proposed pairs deterministically by:

```text
classification (Likely before Possible)
bestDistance ascending
top3DistanceSum ascending
support descending
canonical sorted Asset-ID pair ascending as final tie-break
```

Thresholds are conservative proposal thresholds, not identity proof. Admin certification remains mandatory.

## 21. Discovery UX / Not-duplicate lifetime

Show Topic selector and explicit widening controls:

```text
Find likely duplicates in Topic
Search this System
Search global library
```

Each proposed pair shows both images, scope/context and `Likely duplicate` or `Possible duplicate` only. Never say `Identical` based on the matcher.

`Compare` enters Tranche 1 and reloads the authoritative full retained certification plan.

`Not duplicate` stores the canonical sorted pair key in `sessionStorage` for the **current browser tab session**:

- survives route reload/navigation in the same tab;
- applies across Topic/System/global searches in that tab;
- does not persist to another tab/device/session;
- disappears when the tab session ends or storage is cleared.

Provide a small **Reset dismissed pairs** action.

## 22. Tranche-2 executable acceptance

The pure matching core must accept deterministic RGBA/pixel fixtures in Node tests. Cover at minimum:

1. same source at different resolution remains proposed;
2. JPEG-like/noise perturbation remains proposed;
3. symmetric crop remains proposed;
4. one-sided left crop remains proposed;
5. one-sided right crop remains proposed;
6. one-sided top crop remains proposed;
7. one-sided bottom crop remains proposed;
8. rectangular asymmetric border crop remains proposed;
9. merely similar medical-style synthetic patterns do not meet the strongest Likely threshold solely from broad structure;
10. transparent vs equivalent white-composited source hashes deterministically according to the alpha rule;
11. 64-bit hash values use `BigInt` and Hamming/popcount is exact above 2^53;
12. score/support/top3 formula and tie-breaking are deterministic;
13. Topic membership uses current learner-relevant exact Primary Topic only;
14. System widening resolves recursive ancestry, not only direct parent;
15. inactive/Preview/superseded/tombstoned Assets are excluded;
16. candidate count >120 does not silently truncate;
17. cumulative fetch budget >96 MiB stops with incomplete warning;
18. fetch concurrency never exceeds 4 and decode concurrency never exceeds 2 in controlled tests/helpers;
19. working raster never exceeds configured dimension/pixel bound;
20. cancellation aborts fetches, releases resources and prevents stale result publication;
21. decode/fetch failure is visible/non-fatal/non-mutating;
22. Not-duplicate pair persists only for current tab `sessionStorage` and reset clears it;
23. no discovery code path can invoke merge without Tranche-1 server comparison + explicit certification.

Do not use real patient/production images in repository tests.

---

# Implementation order — same Draft PR

Luna must implement in exactly two tranches on this branch:

```text
Tranche 1
  migration + tombstone/reference guards
  → executable migration/race tests
  → server merge-plan/read model + exact D1 stale-state guard
  → merge + cleanup domain operations/tests
  → manual compare/certification + cleanup-pending Admin UX
  → focused checkpoint validation

Tranche 2
  pure matcher + deterministic fixture tests
  → Topic/System/global candidate read path
  → bounded/cancellable discovery UI
  → Compare wiring to Tranche 1
  → focused checkpoint validation
```

Keep mutation logic out of Svelte components.

## Non-goals

Do not add:

- automatic merges;
- AI/vision embeddings;
- SHA as image identity;
- OpenCV/ORB/Sharp/server Canvas dependencies;
- persistent fingerprint/vector tables;
- durable negative-match storage;
- Asset families/version-history;
- generic inactive-Asset deletion;
- Preview Admin dedupe mutation;
- Import Package changes;
- Slide Reviewer/importer dedupe logic;
- automatic promotion of Case-specific questions into reusable questions;
- automatic opt-in of newly unioned reusable questions;
- FSRS scheduling/rating changes.

## Validation / Luna 5.6 handoff

Continue this exact Draft PR. Do not restart from `main`, create another PR, mark Ready, merge, deploy, apply Production migrations or mutate Production data without explicit instruction.

This task crosses Admin + schema/migrations + DB + Asset/R2 + reusable-question + active-Review boundaries. Follow current repository routing and progressive retrieval.

During implementation:

- use executable focused tests for each protected invariant/interleaving;
- migration/trigger tests must execute against current-schema SQLite/D1-style fixtures rather than regex-only inspection;
- static assertions may supplement but never replace domain/race tests;
- run `npm run db:check` for schema/migration work;
- use `npm run agent:checks -- --compact` at coherent checkpoints and every final/specialized check it reports;
- run repository-required final validation including full validation before handoff;
- run runtime smoke only if current routing says the implementation changes Worker/runtime/binding behavior;
- inspect the complete `main` → final head diff once at final review;
- reconcile living image/R2/reusable-question/data-model docs after implementation.

If implementation discovers an additional Asset-owning FK, trigger interaction or runtime constraint that materially changes this contract, amend this planning document in the same Draft PR before broadening implementation.