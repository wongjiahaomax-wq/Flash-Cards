# Admin Image Deduplication — implementation plan

_Status: Draft planning contract for implementation in this same PR/branch. Third planning-review amendments are incorporated. Tranche 1 implementation is in progress; Tranche 2 remains intentionally untouched. Do not create a follow-up implementation PR._

## Goal

Add a Production Admin workflow that lets a human certify that two global image Assets are clinically and educationally interchangeable representations of the same teaching image, choose one canonical survivor, union reusable image knowledge onto that survivor, and reclaim the duplicate R2 object without permitting the retired duplicate to be reacquired or chained into another dedupe.

This PR has exactly two implementation tranches:

```text
Tranche 1 — Human-certified canonical Asset merge + durable cleanup fence
Tranche 2 — Visual duplicate discovery that proposes pairs to Tranche 1
```

The Admin is the final identity authority. Discovery may propose candidate pairs but must never merge automatically.

---

# Fixed product / architecture decisions

1. **Certification is stronger than visual sameness.** The Admin must certify that the chosen survivor is clinically and educationally interchangeable for every retained A/B context shown by the review, preserves required visible content, and introduces no answer-bearing annotation/overlay.
2. **One canonical Asset remains for this dedupe.** Survivor A keeps its Asset ID, R2 bytes, alt text and global Asset metadata. Duplicate B becomes a durable cleanup-pending tombstone and is physically removed only after all cleanup guards pass.
3. **Reusable Image Questions are unioned.** B-only questions move to A with the same Asset Question ID. A-only questions remain. Same-Prompt collisions use the deterministic rules below.
4. **Reusable-question opt-ins do not broaden.** Canonicalization preserves the exact pre-merge opt-in set after ID remapping; no Case gains a reusable question merely because A now owns it.
5. **Physically retained Active Reviews block the merge.** Do not rewrite frozen active Review context in this PR. Expiry/non-resumability alone is not cleanup: if the physical `active_review_*` rows still retain B/B-key/B-question provenance, dedupe is blocked until those rows are actually removed.
6. **Retired legacy Reviews are never rewritten.** `reviews`, `review_questions`, and `review_assets` remain zero-data cutover sentinels. Any nonzero or unreadable legacy count blocks dedupe.
7. **R2 reclamation is intentional.** After Phase 1 safely claims B, Phase 2 deletes B's teaching-image object only while A's authoritative survivor object still exists.
8. **Higher-resolution replacement remains a separate, non-destructive lifecycle.** Do not overload `superseded_by_asset_id` or redesign replacement in this PR.
9. **Production only.** No Preview Admin merge endpoint. Any retained Preview relationship to B blocks the claim regardless of Preview status/expiry.
10. **A schema migration is required.** Current `main` reaches `0027`; at this implementation head the expected migration is `0028_admin_image_deduplication.sql`. Luna re-checked the migration head before creating it after `main` advanced beyond the planning snapshot.
11. **No new image-processing dependency.** Tranche 2 stays browser-side and dependency-free: no AI/embeddings, OpenCV/ORB, Sharp/server Canvas, WASM vision stack, vector DB, or persisted fingerprint table.
12. **No Import Package / Slide Import Reviewer changes.** Deduplication remains an Admin Image Library maintenance workflow.

---

# Tranche 1 — Human-certified canonical Asset merge

## 1. Schema and durable dedupe tombstone

Add:

```text
assets.deduplicated_into_asset_id nullable FK -> assets.id ON DELETE RESTRICT
```

and an index.

Semantics:

```text
NULL
→ ordinary Asset lifecycle

B.deduplicated_into_asset_id = A.id
→ B is a cleanup-pending dedupe tombstone whose canonical survivor is A
→ B.is_active MUST be false
→ B may not acquire a new media/question/application reference
→ B may not be reactivated
→ the non-null tombstone is immutable until B row DELETE
```

This field is distinct from `superseded_by_asset_id`.

### Chain prevention

A source/duplicate candidate X may not be claimed when either is true:

```text
X.deduplicated_into_asset_id IS NOT NULL
OR
EXISTS child_asset WHERE child_asset.deduplicated_into_asset_id = X.id
```

Therefore:

```text
B → A cleanup pending
attempt A → C
→ reject
```

A survivor target must have `deduplicated_into_asset_id IS NULL`.

Multiple independent cleanup-pending duplicates may point to the same stable survivor A, but A itself cannot be used as a destructive dedupe source while any incoming dedupe tombstone exists.

The cleanup retry for B must also require no incoming dedupe tombstone targets B.

### Database guards

Application preflight is not the race authority. Migration triggers/check-equivalent guards must enforce at minimum:

- non-null tombstone requires `NEW.is_active = false`;
- self-deduplication is rejected;
- once `OLD.deduplicated_into_asset_id IS NOT NULL`, UPDATE may not change or clear it;
- a tombstoned Asset may not become active;
- setting X's tombstone is rejected while another Asset points to X through `deduplicated_into_asset_id`;
- survivor target is rejected if it is itself tombstoned;
- new/updated references to a tombstoned Asset are rejected in:
  - `case_assets.asset_id`;
  - `stimulus_group_options.asset_id`;
  - `asset_questions.asset_id`;
  - `active_review_assets.asset_id`;
  - `active_review_assets.storage_key_snapshot` when it equals a tombstoned Asset's `storage_key`;
  - `assets.superseded_by_asset_id` when the **target** is tombstoned.

These guards apply to shared Production/Preview tables. Once B is claimed, no writer may reacquire B.

The migration is additive: all existing rows receive NULL and require no backfill.

## 2. Authoritative Asset eligibility contract

Eligibility is server-owned and must be reasserted at submit/Phase 1; UI selection is never authority.

### Survivor A must be

```text
exists
type = image
preview_session_id IS NULL
is_active = true
deduplicated_into_asset_id IS NULL
superseded_by_asset_id IS NULL
R2 object at A.storage_key exists before Phase 1
```

A may have incoming `deduplicated_into_asset_id` rows from earlier cleanup-pending duplicates because A is being kept, not deleted.

A may also be the target of an existing higher-resolution supersession predecessor because deleting A is not part of this merge. If repository invariants make such a target inactive, the `is_active=true` rule already excludes it.

### Duplicate/source B must be

```text
exists
type = image
preview_session_id IS NULL
is_active = true before claim
deduplicated_into_asset_id IS NULL before claim
superseded_by_asset_id IS NULL
no incoming dedupe tombstone points to B
no Asset P has P.superseded_by_asset_id = B.id
R2 object at B.storage_key exists before Phase 1
```

The incoming supersession blocker is mandatory: B cannot be physically deleted while another Asset uses B as its `superseded_by_asset_id` target.

### Other hard blockers

Reject before Phase 1, and reassert inside Phase 1 where race-relevant:

- same Asset ID on both sides;
- any retained same-Case A+B usage across fixed/stimulus relationships;
- any physically retained Active Review reference to B/B-key/B-owned Asset Question;
- any retained Preview relationship to B;
- any forbidden outgoing/incoming dedupe state;
- any forbidden outgoing/incoming supersession state for B;
- any nonzero/unreadable legacy Review sentinel;
- unresolved reusable-question conflict;
- prospective cross-group Prompt invariant violation;
- missing authoritative A or B R2 object.

Do not invent repair/collapse semantics inside dedupe.

## 3. Higher-resolution replacement interaction

Keep existing higher-resolution replacement semantics unchanged.

An incoming dedupe tombstone:

```text
B.deduplicated_into_asset_id = A.id
```

means A cannot be used as a **destructive dedupe/delete source** while B cleanup is pending.

It does **not** by itself block the existing non-destructive higher-resolution replacement of A, because replacement retains A's D1 row and A's R2 bytes as lineage/history.

Therefore PR #174 must not add a general trigger saying "incoming dedupe tombstone blocks any update/supersession of A".

If A is higher-resolution-replaced after B → A Phase 1 but before B cleanup:

- A row must remain;
- A's original `storage_key` object must remain;
- B cleanup may proceed only after reloading A and freshly proving that exact A object still exists;
- B's tombstone remains B → A; do not retarget it to the replacement Asset C;
- do not modify higher-resolution replacement logic except where the new tombstone column must be tolerated.

This PR must not broaden into replacement-family redesign.

## 4. Migration / Production deployment ordering

Required Production order:

```text
1. implementation/review completes
2. apply additive D1 migration while old Worker is still running
3. verify migration success
4. deploy Worker that reads/writes deduplicated_into_asset_id
5. only then allow Admin dedupe
```

Do not deploy the new Worker before the migration. The additive migration is old-Worker-compatible because all existing tombstones are NULL.

No Production migration/deployment is part of this implementation task unless explicitly requested later.

## 5. Admin entry points and cleanup-pending visibility

Add:

```text
/admin/images/deduplicate
```

The Image Library exposes **Compare / merge duplicates** only when exactly two eligible Production images are selected.

The dedupe page also exposes a discoverable **Cleanup pending** section for every Production image where:

```text
deduplicated_into_asset_id IS NOT NULL
```

Each entry shows duplicate name/ID, survivor name/ID, claim/update time when available, cleanup blocker reason, and **Retry storage cleanup**.

Tombstones must not masquerade as ordinary inactive/archived Assets. Either exclude them from ordinary inactive lists or label them explicitly as `Dedupe cleanup pending` with navigation to the retry surface. Never allow ordinary reuse/selection.

Do not add generic inactive-Asset deletion.

## 6. Certification evidence — every retained Production context

The Admin must certify over every retained Production relationship that Phase 1 would rewrite, not only currently learner-visible usage.

For each A/B Asset show:

- large image preview;
- image name;
- alt text;
- source label / source URL / licence;
- Collection;
- MIME/storage identity and active/supersession/dedupe state;
- dimensions when display decoding succeeds;
- all retained Production `case_assets`;
- all retained Production `stimulus_group_options`;
- all associated reusable Asset Questions;
- contextual Stimulus Group/Option questions;
- **each retained Case's full `vignette_md`;**
- **each retained Case's retained `case_questions` Prompt/answer/active state.**

Every retained usage is labelled as applicable:

```text
Current learner-relevant
Retained inactive Case
Retained inactive Stimulus Group
Retained inactive Stimulus Option
Retained removed-from-Case Stimulus Option
```

Do not hide inactive/removed retained context; those rows still participate in certification and physical-delete safety.

### Per retained Case context

For every Case appearing on either side, show:

- Case ID/title;
- Case `is_active`;
- full `vignette_md` rendered literally;
- canonical Primary Topic ID/name;
- displayed System ancestry IDs/names;
- every retained `case_question` belonging to that Case:
  - Case Question ID;
  - Prompt ID/text;
  - `answer_md`;
  - `is_active`;
- relationship kind: fixed or stimulus option;
- for fixed usage: `display_order`, `caption_md`, `created_at`;
- for stimulus usage:
  - Group ID/name/active state;
  - Option ID/display order/caption/`is_active`/`removed_from_case`;
  - contextual `stimulus_group_questions` Prompt ID/text/answer/active state;
  - contextual `stimulus_option_questions` Prompt ID/text/answer/active state.

`case_questions` are certification-only; dedupe does not move or edit them. They are shown because replacing the image must remain educationally valid in the Case's complete learner context.

For fixed `case_assets`, do not invent a relationship ID. Its identity is the `(case_id, asset_id)` relationship and actual columns.

### Reusable Image Question evidence

For each Asset Question show:

- Asset Question ID;
- Prompt ID/text;
- answer;
- active state;
- exact opt-in count;
- affected retained/current Case + Group + Option context.

### Same-Case A+B blocker

Build retained Case-ID sets for A and B across all fixed relationships and all stimulus options regardless active/removed state. Any intersection blocks dedupe, including:

```text
A fixed + B fixed
A fixed + B option
A option + B fixed
A/B options in same group
A/B options in different groups of same Case
inactive/removed variants of all above
```

No collapse semantics in this PR.

## 7. Safe rendering

All persisted/package-controlled text on the certification surface must use normal escaped Svelte text rendering.

Includes:

- filenames;
- Case title/vignette;
- Case, Group, Option, reusable-question Prompt/answer text;
- captions;
- Topic/System names;
- metadata/provenance/licence.

Rules:

- no unsanitized `{@html}`;
- no ad-hoc Markdown-to-HTML rendering on this page;
- preserve line breaks with CSS such as `white-space: pre-wrap`.

Add focused executable/client coverage with HTML/event-handler-looking persisted values proving literal display.

## 8. Physically retained Active Review policy

B must have **zero physically retained Active Review references** at claim time.

Do not filter the blocker by `active_reviews.expires_at`. An expired/non-resumable Review may still physically exist until a later cleanup/create path deletes it. Expiry is not evidence of deletion.

Block whenever retained rows contain any of:

```text
active_review_assets.asset_id = B.id
OR active_review_assets.storage_key_snapshot = B.storage_key
OR active_review_questions.source_asset_question_id references an Asset Question currently owned by B
```

The blocker query must consider the physical retained row set, including rows whose parent Review is already expired.

If both A and B occur in one retained Review, that is explicitly blocked.

UI wording should not tell the Admin that expiry alone is sufficient. Prefer:

```text
This image is still retained by N learner Review snapshot(s).
Complete/discard/replace the Review or allow the application's Review cleanup to remove the stored snapshot, then retry.
```

Do not expose learner identity.

### Stale-snapshot race

Required:

```text
T1 builds snapshot containing B but has not persisted
T2 Phase 1 sees zero physically retained B Review references
T2 tombstones B
T1 attempts INSERT active_review_assets(B,B-key)
→ DB tombstone trigger rejects
→ Review creation maps to existing stale/content-unavailable behavior
```

If a B Review persistence commits before Phase 1, Phase 1's in-batch physical-row assertion aborts the merge.

Late Review rows are not part of the authoring fingerprint; they are governed by the in-batch zero-retained-B assertion plus tombstone trigger.

## 9. Survivor metadata and authoritative R2 checks

A's metadata wins. Dedupe never overwrites A's:

- image name;
- alt text;
- source label;
- source URL;
- licence;
- Collection;
- MIME type;
- storage key;
- R2 bytes.

B metadata/provenance/licence that will be discarded must be visible.

### Before Phase 1

Server-side authoritative storage checks must prove:

```text
A.storage_key exists in R2
B.storage_key exists in R2
```

Browser image rendering is not mutation authority.

If either is missing, block before tombstone creation.

### Immediately before every Phase-2/retry B-object delete

Reload A and B, then **freshly re-verify that the exact current `A.storage_key` exists in R2 immediately before calling delete on B.storage_key**.

This check is required for:

- automatic Phase-2 cleanup immediately after Phase 1;
- every Admin/manual cleanup retry;
- any idempotent retry after a prior partial failure.

If A's object is missing at that moment:

```text
do NOT delete B.storage_key
do NOT delete B D1 tombstone row
keep B inactive tombstone → A
return cleanup blocked: canonical survivor media missing
surface blocker in Cleanup pending UI
```

This protects against:

```text
Phase 1 commits B → A
A object disappears before Phase 2
```

The cleanup path must never treat an earlier pre-Phase-1 A `head` result as sufficient.

## 10. Server-owned merge plan and complete decision fingerprint

Provide:

```js
getDuplicateAssetMergePlan({ db, survivorAssetId, duplicateAssetId })
```

It returns the complete certification model plus deterministic `mergePlanFingerprint`.

Fingerprint input is canonical, sorted, serialization-stable and includes every decision-relevant displayed value.

### Asset state

- A/B IDs;
- names/alt text;
- source label/URL/licence;
- Collection ID/name;
- MIME/storage key;
- active state;
- outgoing/incoming dedupe state;
- outgoing/incoming supersession state;
- relevant timestamps/update markers.

### Retained Case/taxonomy state

For every retained A/B Case context:

- Case ID/title/active state;
- full `vignette_md`;
- Primary Topic ID/name;
- displayed System ancestry IDs/names;
- every retained `case_question`:
  - ID;
  - Prompt ID/text;
  - answer;
  - active state;
- fixed relationship caption/order/created-at;
- retained/current classification state.

### Stimulus state

- Group ID/name/active state and other displayed state;
- Option ID/order/caption/active/removed state;
- displayed Group/Option Question ID, Prompt ID/text, answer, active state.

### Reusable questions / opt-ins

- Asset Question IDs;
- Prompt IDs/text;
- answers;
- active states;
- exact opt-in identities and displayed Case/Group/Option context.

### Blocker state

- retained Preview references;
- dedupe incoming/outgoing state;
- supersession incoming/outgoing state;
- legacy sentinel state;
- same-Case collision state.

Physically retained Active Review rows remain outside the fingerprint because they are independently asserted atomically at Phase 1.

Use SHA-256 or existing deterministic cryptographic digest only for plan staleness, never for image identity.

## 11. Submit recomputation and recompute→D1 race closure

On submit:

1. recompute the full merge plan;
2. reject stale `mergePlanFingerprint`;
3. recompute question conflicts/prospective invariant validation;
4. reject missing/extra/stale conflict resolutions;
5. verify current A/B R2 existence;
6. enter Phase 1 with exact expected authoring snapshot.

Recompute alone is insufficient. Phase 1 begins with a database-enforced **exact set-and-value equality assertion** against the recomputed snapshot.

Use current D1 sentinel patterns; canonical JSON + `json_each`/CTE comparisons is acceptable. Any mismatch aborts the entire batch.

The in-batch equality guard must prove neither missing nor extra rows and unchanged decision values for:

- both Asset rows and complete incoming/outgoing dedupe/supersession state;
- every retained A/B `case_assets` relationship;
- every displayed retained Case value:
  - title;
  - `vignette_md`;
  - active state;
  - Primary Topic/taxonomy display values;
- every retained Case Question ID/Prompt ID/text/answer/active state;
- every retained A/B stimulus option and displayed Case/Group/Option values;
- every displayed Group/Option Question ID/Prompt ID/text/answer/active state;
- every A/B Asset Question value;
- every affected reusable-question opt-in;
- retained Preview blocker state;
- legacy sentinel zero state;
- same-Case A+B collision state;
- complete incoming supersession blocker state for B.

Do not let set-based B→A updates silently absorb newly added/changed authoring state.

Examples that must stale-abort:

- new retained Case/stimulus usage;
- Case `vignette_md` change;
- Case Question Prompt/answer/active-state change;
- caption/order/status change;
- Group/Option question change;
- Asset Question Prompt/answer/active-state change;
- opt-in added/removed;
- supersession or dedupe state change.

Once the equality guard succeeds, D1 batch atomicity prevents authoring interleaving inside Phase 1. Post-claim B-reference writes are rejected by tombstone triggers.

## 12. Reusable Image Question union

Recompute by `question_prompt_id` on submit.

### A-only

Keep unchanged.

### B-only

```text
UPDATE existing B row asset_id B → A
preserve Asset Question ID, Prompt ID, answer and is_active
```

Do not clone.

### Same Prompt + same answer

Answer equality is exact after line-ending normalization only.

```text
A-Q survives
B-Q usages/opt-ins canonicalize to A-Q
B-Q deleted
result_is_active = A.is_active OR B.is_active
```

### Same Prompt + different answer

Require exactly one current resolution:

```text
Keep survivor answer
Use duplicate answer
```

A-Q remains canonical ID. No synthesized answer. Result active state is `A.is_active OR B.is_active`.

### Prospective cross-group validation

Validate the full post-merge opt-in graph for every state combination, including:

- A inactive / B active;
- A active / B inactive;
- both active;
- different-answer resolution yielding active canonical row.

If union would violate the existing cross-Stimulus-Group Prompt invariant, block merge. Do not silently inactivate or override.

If both are inactive, result remains inactive.

### Exact opt-in preservation

Post-merge opt-ins are exactly the pre-merge union after question-ID remapping and duplicate pair collapse. No inferred opt-ins.

Conflict UI shows per-side Asset Question ID, Prompt, answer, active state, opt-in count, retained/current Case titles, Group/Option context and prospective blocker state.

## 13. Contextual Case/Stimulus questions are certification-only

Dedupe does not move/edit:

```text
case_questions
stimulus_group_questions
stimulus_option_questions
```

They are displayed and fingerprinted because they determine whether the Admin can safely certify A for B's complete educational context.

Any change in Prompt text, answer or active state after recompute must make the Phase-1 equality guard fail.

## 14. Phase-1 atomic mutation order

After server/R2 preflight, use one atomic D1 batch:

```text
A. exact expected-authoring-state equality assertion
B. zero physically retained Active Review B/B-key/B-question-provenance assertion
C. zero retained Preview B assertion
D. zero same-Case retained A+B collision assertion
E. exact Asset eligibility:
   - A valid survivor
   - B valid source
   - no incoming dedupe tombstone on B
   - no forbidden B outgoing/incoming supersession
F. temporarily remove affected reusable opt-ins if needed
G. move/collapse reusable Asset Questions using validated resolutions
H. canonicalize every retained Production media relationship B → A
   - every Production case_assets row
   - every Production stimulus_group_options row
I. recreate exactly preserved canonical opt-in set
J. final no-reference assertion for B
K. conditional claim in one UPDATE:
   B.is_active = false
   B.deduplicated_into_asset_id = A.id
L. exact-claim sentinel:
   B inactive
   tombstone exactly A.id
```

Do not update Active Review rows.

### Final B no-reference assertion

Before claim, prove B has no:

- Production/Preview `case_assets`;
- Production/Preview stimulus option;
- `asset_questions` ownership;
- physically retained Active Review Asset ID/storage-key reference;
- physically retained Active Review B-owned Asset Question provenance;
- incoming dedupe tombstone;
- forbidden supersession:
  - B.superseded_by_asset_id must be NULL;
  - no P.superseded_by_asset_id = B.id;
- other known direct Asset FK required for physical deletion.

If implementation discovers another Asset-owning FK, add it to guards/tests before continuing.

## 15. Race/interleaving contract

### Authoring change before Phase 1

Any certification-relevant authoring change after recompute/before Phase 1:

```text
exact equality assertion fails
→ no canonicalization
→ no tombstone
→ no R2 delete
→ refresh/re-certify
```

Explicitly include forced interleavings for Case `vignette_md` and Case Question changes.

### Review persistence before Phase 1

```text
physical B Review rows commit
→ in-batch zero-retained-B assertion fails
→ no claim
```

This applies even when `expires_at` is already in the past.

### Stale Review persistence after claim

```text
snapshot built before claim
→ B/B-key insert after tombstone
→ DB trigger rejects
```

### Post-claim authoring

Any writer attempting to reference B is rejected by tombstone trigger.

### Concurrent dedupe

Only one exact B claim wins; loser performs no R2 deletion.

### Tombstone chain

```text
B → A cleanup pending
attempt A → C
→ incoming-tombstone source guard rejects
```

## 16. Phase-2 R2 cleanup and retry

After Phase 1, the tombstone fence closes D1/R2 reference TOCTOU.

For **every** automatic cleanup and retry:

```text
1. reload B and A
2. require B.is_active=false
3. require B.deduplicated_into_asset_id=A.id
4. require tombstone unchanged/immutable
5. require no incoming dedupe tombstone targets B
6. require A row still exists
7. require A is not itself dedupe-tombstoned
8. strict B no-reference recheck:
   - Production/Preview
   - physically retained Active Review rows regardless expires_at
   - Asset Questions
   - supersession incoming/outgoing
9. legacy Review sentinels still zero
10. FRESH authoritative R2 existence check for exact A.storage_key
11. if A object missing: STOP; keep B object + tombstone; report cleanup blocked
12. delete ONLY B.storage_key
13. missing B object is idempotent success where helper permits
14. delete B D1 row under same tombstone/no-reference guards
```

Never pass A.storage_key to R2 delete.

A may have become non-destructively superseded by higher-resolution replacement after Phase 1. That alone does not block B cleanup so long as A row remains and exact A.storage_key still exists.

### Cleanup failure states

R2 delete failure:

```text
A remains canonical
B remains inactive tombstone → A
B object remains
Cleanup pending remains visible
```

A object missing immediately before B delete:

```text
B object MUST remain
B tombstone row MUST remain
Cleanup pending reason = canonical survivor media missing
```

B R2 delete succeeds but B D1-row delete fails:

```text
B tombstone remains
B object may be absent
retry revalidates A object + all guards and completes idempotently
```

Ordinary inactive/archived Assets cannot use this retry.

## 17. Certification wording

Final confirmation should be substantially equivalent to:

> I have reviewed both images and every retained Case, vignette, Case question, stimulus and reusable-question context shown above. I certify that the selected survivor is clinically and educationally interchangeable for all of those uses, preserves all required visible content, and does not introduce an answer-bearing annotation or overlay. I understand the duplicate's global Asset metadata/provenance will not be copied automatically and its stored image will be permanently deleted only after the canonical survivor media is reverified.

If B has any physically retained Active Review reference, confirmation controls are disabled.

## 18. Tranche-1 executable acceptance matrix

Static/regex checks are supplemental only. Add executable migration/domain/route coverage proving at minimum:

1. migration is additive and existing Assets get NULL tombstone;
2. tombstone requires inactive state;
3. non-null tombstone cannot be changed/cleared by UPDATE;
4. tombstoned Asset cannot be reactivated;
5. self-dedupe rejected;
6. source with incoming dedupe tombstone cannot be claimed;
7. tombstoned target cannot be survivor;
8. B→A cleanup-pending then attempted A→C rejected;
9. cleanup retry rejects tombstone with incoming dedupe reference;
10. `case_assets` INSERT/UPDATE cannot acquire tombstoned B;
11. `stimulus_group_options` INSERT/UPDATE cannot acquire tombstoned B;
12. `asset_questions` INSERT/UPDATE cannot acquire tombstoned B;
13. `active_review_assets` cannot acquire tombstoned B by ID;
14. `active_review_assets` cannot use B tombstoned storage key with another Asset ID;
15. supersession cannot newly target tombstoned B;
16. authoritative eligibility rejects non-image, Preview, inactive, outgoing-dedupe or superseded A/B as specified;
17. B with incoming dedupe tombstone is rejected;
18. B with `B.superseded_by_asset_id != NULL` is rejected;
19. B with any P where `P.superseded_by_asset_id=B.id` is rejected and cannot be physically cleaned;
20. A with incoming dedupe tombstone cannot be destructive dedupe source;
21. existing non-destructive higher-resolution replacement remains permitted for A with incoming B→A tombstone when its existing replacement invariants pass;
22. higher-resolution replacement does not retarget/remove B→A tombstone or delete A R2;
23. all retained Production B fixed relationships move to A, including inactive Cases, preserving relationship values;
24. all retained B stimulus options move to A, including inactive/removed rows, preserving stable option IDs/context;
25. read model labels current vs inactive/removed retained states correctly;
26. any retained same-Case A+B intersection across fixed/options/groups blocks;
27. certification includes each retained Case's full `vignette_md`;
28. certification includes every retained Case Question ID/Prompt text/answer/active state;
29. certification includes contextual Group/Option Prompt/answer/state;
30. B-only reusable questions move to A with same IDs/states;
31. same-Prompt/same-answer collapse applies OR-active and exact opt-in preservation;
32. same-Prompt/different-answer requires exactly one current resolution and selected answer + OR-active;
33. stale/missing/extra conflict resolution rejected;
34. prospective cross-group conflicts block all relevant active-state combinations;
35. per-side reusable-question blast radius accurate;
36. survivor alt text/metadata/storage key/R2 bytes never change; B provenance/licence not copied;
37. retained Preview B reference blocks regardless session status including expired/cleanup_required;
38. unexpected nonzero/unreadable legacy Review sentinel blocks with no mutation/R2 delete;
39. physically retained Active Review B Asset ID blocks even if parent `expires_at` is past;
40. physically retained Active Review B storage-key snapshot blocks even if expired;
41. physically retained Active Review B-owned Asset Question provenance blocks even if expired;
42. active Review containing both A and B blocks;
43. simply making an Active Review expired/non-resumable does not unblock until physical retained rows are removed;
44. stale active Review snapshot built before claim but persisted after claim is rejected by DB guard;
45. B Review persistence immediately before Phase 1 makes in-batch guard abort;
46. server blocks Phase 1 when A R2 object missing;
47. server blocks normal merge when B R2 object missing;
48. persisted HTML/event-handler-looking certification values render literally;
49. fingerprint changes when Case vignette changes;
50. fingerprint changes when retained Case Question Prompt/answer/active state changes;
51. fingerprint changes for all other decision-relevant displayed changes;
52. submit recomputation rejects stale browser fingerprint;
53. forced interleaving new Case/stimulus usage after recompute/before Phase 1 aborts;
54. forced interleaving Case vignette change after recompute/before Phase 1 aborts;
55. forced interleaving Case Question Prompt/answer/active state change after recompute/before Phase 1 aborts;
56. forced interleaving caption/order/Case/Group/Option state change aborts;
57. forced interleaving Asset Question change aborts;
58. forced interleaving reusable opt-in add/remove aborts;
59. forced interleaving Group/Option question change aborts;
60. no late authoring write is silently absorbed by set-based B→A updates;
61. successful Phase 1 leaves zero protected B references before tombstone;
62. post-claim B reference attempt rejected;
63. Phase-2 cleanup freshly verifies A.storage_key immediately before deleting B;
64. A object disappears after Phase 1 → B object is NOT deleted, B tombstone remains, cleanup blocked shown;
65. same A-missing rule applies on retry;
66. successful cleanup deletes only B.storage_key;
67. Phase-1 failure performs no R2 delete;
68. R2 failure leaves durable cleanup-pending tombstone visible;
69. retry accepts only valid dedupe tombstone and is idempotent for already-missing B object where helper permits;
70. ordinary inactive/archived Asset never appears as cleanup-pending and cannot use retry;
71. concurrent/double merge claims B at most once and loser performs no R2 delete;
72. Preview Admin has no equivalent mutation endpoint;
73. Production route auth/domain-error mapping follows current Admin patterns.

---

# Tranche 2 — Visual duplicate discovery

## 19. Candidate membership

Only active, non-Preview, non-superseded, non-tombstoned Production image Assets are automatic discovery candidates.

### Topic — default

Given Topic T, include X when X has at least one current learner-relevant Production usage in an active Case whose canonical Primary Topic is exactly T.

Current usage:

- fixed `case_assets` on an active Production Case;
- active non-removed Stimulus Option in an active Stimulus Group on an active Production Case.

Inactive/removed retained relationships are certification evidence after comparison, not Topic-discovery membership.

### System — explicit widening

Include X when its current Production Case usage has a canonical Primary Topic whose recursive ancestor chain contains selected System S at any depth. Do not assume direct-parent only.

### Global — explicit widening

Include all eligible active Production image Assets, including currently unused active library Assets. Never auto-widen from Topic/System to global.

## 20. Scan resource bounds

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

Do not silently truncate and imply completeness.

If scope >120, require narrower scope or explicit bounded batch/page and label incomplete/bounded.

Count trusted `Content-Length` when present and actual Blob bytes before fingerprinting. Stop before >96 MiB and show incomplete warning.

At most 2 images may be decoding/working-raster processing simultaneously. Retain only compact fingerprints afterward.

Release resources:

- `ImageBitmap.close()` where available;
- Blob/object URL references;
- temporary Canvas dimensions;
- pixel arrays.

New scan/scope/cancel uses `AbortController` plus scan-generation token; abort outstanding fetches and prevent stale result publication.

Yield every 100 unordered pair comparisons.

## 21. Deterministic fingerprint extraction

Browser decoding supplies pixels; mathematics is pure JS and testable from deterministic RGBA fixtures.

### Working raster

Preserve whole-image aspect ratio when drawing into bounded Canvas longest side <=768 and total pixels <=768².

Each selected source region is intentionally resampled directly to 9×8; do not claim that individual hashes preserve aspect ratio.

### Alpha compositing

Composite RGBA to opaque white:

```text
Cwhite = round((C * a + 255 * (255 - a)) / 255)
```

Then:

```text
gray = round(0.299*Rwhite + 0.587*Gwhite + 0.114*Bwhite)
```

### Region families

Use normalized `(widthFraction,heightFraction)` shapes:

```text
[1.0,1.0]
[0.8,0.8]
[0.6,0.6]
[0.4,0.4]
[0.8,1.0]
[0.6,1.0]
[1.0,0.8]
[1.0,0.6]
[0.8,0.6]
[0.6,0.8]
```

Origins:

- full frame: `(0,0)`;
- both dimensions cropped: top-left/top-right/bottom-left/bottom-right/centre;
- width-only crop: left/centre/right;
- height-only crop: top/centre/bottom.

This yields exactly **38 hashes/image** and covers symmetric, one-sided horizontal/vertical, and rectangular asymmetric border crops.

For each region, resample to 9×8 RGBA, composite alpha, grayscale, then compute row-major 64-bit dHash:

```text
bit = 1 when leftGray > rightGray else 0
```

Represent hashes as JavaScript `BigInt`, never Number.

Hamming distance = exact popcount of `hashA ^ hashB` via BigInt operations.

## 22. Deterministic score / thresholds

For 38 hashes of A/B:

```text
nearestA[i] = min Hamming(A[i], every B hash)
nearestB[j] = min Hamming(B[j], every A hash)
bestDistance = min(nearestA ∪ nearestB)
supportA = count(nearestA <= 8)
supportB = count(nearestB <= 8)
support = min(supportA,supportB)
top3DistanceSum = sum of 3 smallest values in nearestA ∪ nearestB
```

Classification:

```text
Likely duplicate:
bestDistance <= 6
AND support >= 3
AND top3DistanceSum <= 24

Possible duplicate:
not Likely
AND bestDistance <= 10
AND support >= 2
AND top3DistanceSum <= 36

Otherwise:
do not propose
```

Ranking:

```text
Likely before Possible
bestDistance asc
top3DistanceSum asc
support desc
canonical sorted Asset-ID pair asc
```

Thresholds propose review only; they never prove identity.

## 23. Discovery UX / Not-duplicate lifetime

Controls:

```text
Find likely duplicates in Topic
Search this System
Search global library
```

Pairs show both images, scope/context and `Likely duplicate` / `Possible duplicate`; never `Identical`.

`Compare` enters Tranche 1 and reloads authoritative retained certification plan.

`Not duplicate` stores canonical pair key in current-tab `sessionStorage`:

- survives same-tab route reload/navigation;
- applies across Topic/System/global searches in that tab;
- not shared to another tab/device;
- clears when tab session/storage ends.

Provide **Reset dismissed pairs**.

## 24. Tranche-2 executable acceptance

Pure matching core accepts deterministic RGBA fixtures. Cover:

1. same source different resolution proposed;
2. JPEG-like/noise perturbation proposed;
3. symmetric crop proposed;
4. left crop proposed;
5. right crop proposed;
6. top crop proposed;
7. bottom crop proposed;
8. rectangular asymmetric crop proposed;
9. similar synthetic medical-style patterns do not reach strongest Likely solely from broad structure;
10. transparent vs white-composited source follows alpha rule;
11. 64-bit BigInt/Hamming exact above 2^53;
12. score/support/top3/tie-break deterministic;
13. Topic membership uses current exact Primary Topic;
14. System widening uses recursive ancestry;
15. inactive/Preview/superseded/tombstoned Assets excluded;
16. candidate count >120 not silently truncated;
17. >96 MiB fetch budget stops with incomplete warning;
18. fetch concurrency <=4, decode <=2;
19. working raster respects bounds;
20. cancellation releases resources and blocks stale publication;
21. decode/fetch failure visible/non-fatal/non-mutating;
22. Not-duplicate sessionStorage lifetime/reset correct;
23. discovery cannot invoke merge without Tranche-1 server comparison + explicit certification.

Do not use real patient/Production images in repository tests.

---

# Implementation order — same Draft PR

Luna implements exactly two tranches on this branch:

```text
Tranche 1
  migration + tombstone/reference guards
  → executable migration/race tests
  → server merge-plan/read model + exact D1 equality guard
  → merge + cleanup operations/tests
  → compare/certification + cleanup-pending Admin UX
  → focused validation

Tranche 2
  pure matcher + deterministic fixture tests
  → Topic/System/global candidate read path
  → bounded/cancellable discovery UI
  → Compare wiring to Tranche 1
  → focused validation
```

Keep mutation logic out of Svelte components.

## Non-goals

Do not add:

- automatic merges;
- AI/vision embeddings;
- SHA as image identity;
- OpenCV/ORB/Sharp/server Canvas;
- persistent fingerprint/vector tables;
- durable negative-match storage;
- Asset families/version-history;
- generic inactive-Asset deletion;
- Preview Admin dedupe;
- Import Package changes;
- Slide Reviewer/importer dedupe logic;
- automatic promotion of Case-specific questions to reusable questions;
- automatic opt-in of unioned reusable questions;
- FSRS scheduling/rating changes;
- redesign of higher-resolution replacement.

## Validation / Luna 5.6 handoff

Continue this exact Draft PR. Do not restart from `main`, create another PR, mark Ready, merge, deploy, apply Production migrations, or mutate Production data without explicit instruction.

This crosses Admin + schema/migrations + DB + Asset/R2 + reusable-question + Active Review boundaries. Use repository routing/progressive retrieval.

During implementation:

- executable focused tests for every protected invariant/interleaving;
- migration/trigger tests execute on current-schema SQLite/D1-style fixtures, not regex-only;
- static assertions may supplement but never replace domain/race tests;
- run `npm run db:check`;
- run `npm run agent:checks -- --compact` at coherent checkpoints and every final/specialized check it reports;
- run repository-required final/full validation;
- runtime smoke only when current routing says Worker/runtime/binding behavior changed;
- inspect complete `main` → final head diff once at final review;
- reconcile living image/R2/reusable-question/data-model docs after implementation.

If implementation discovers an additional Asset-owning FK, trigger interaction, Review-retention path, or runtime constraint that materially changes this contract, amend this planning document in this same Draft PR before broadening implementation.
