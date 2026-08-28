# Admin image authoring workflow

_Status: current repository authoring contract. It incorporates the merged PR #29/#34/#56–#59/#62/#63/#72 behavior plus PR #108's Original/Alternative production authoring changes. PR #108 being present in this branch is not proof of production migration/deployment._

_Last updated: 28 August 2026_

This document records the current Admin image-authoring interaction contract. Learner stimulus semantics remain defined by fixed Case Assets plus optional stimulus families with explicit Original/Alternative roles; Image Library organisation, Asset lifecycle, and media-quality replacement must not blur those semantics.

Terminology:

```text
Topic       = learner study route/hierarchy
Tag         = cross-cutting clinical metadata
Collection  = Image Library organisational bucket
Asset       = one exact global teaching-media identity
Original    = canonical principal option in a curated stimulus family
Alternative = eligible substitutable non-Original option in that family
```

A Collection is not a Topic, Tag, or stimulus group.

## 1. Case editor order

The common flow remains:

```text
Topics → Case → Images → Case questions → Preview
```

The Images section preserves two learner relationship types:

- **Always shown / supporting image** — `case_assets`; shown in every applicable Review.
- **Stimulus family / Alternative Set** — `stimulus_groups` containing `stimulus_group_options`; one eligible option is selected per active set when a Review begins.

For a curated production family, `stimulus_groups.original_option_id` identifies the explicit Original. Core selects that option. Expanded selects an eligible non-Original Alternative when one exists and otherwise falls back to Original. Legacy uncurated families with `original_option_id = NULL` retain the previous random eligible-option behavior until curated.

Case-specific captions/order/group membership remain relationship metadata. Filename, alt text, source/licence, Collection, Asset status, supersession lineage, and Reusable Image Questions are global Asset-level concerns.

## 2. Starting an Alternative Set from an ordinary image

When an Admin explicitly chooses ordinary Case image A and selects **Start Alternative Set**, that choice supplies unambiguous source semantics: A is the principal image from which the family is being created.

The production domain operation is atomic:

```text
ordinary case_assets A
→ create stimulus group with original_option_id = NULL
→ create/preserve A as the group's option
→ explicitly assign that option as Original
→ remove the old ordinary case_assets relationship
```

The operation preserves Asset identity and Case-specific caption. If conversion or Original assignment fails, A remains an ordinary Case image and no partial family is left behind.

This must not be confused with generic option insertion. Adding options sequentially never infers Original from “first inserted”, display order, filename, caption, or name. Only an explicit source-aware authoring operation or explicit **Make Original** action assigns the pointer.

## 3. Author-facing question scope

Question authors should use:

```text
Where should this question apply?

- This whole Case
- A specific image or stimulus
```

Image/stimulus cards keep two ownership categories explicit:

```text
Case-specific Image Questions
Reusable Image Questions
```

**This whole Case** creates/edits a Case Question and may expose safe Topic reuse.

**A specific image or stimulus** creates/edits the exact-option contextual relationship and appears as a Case-specific Image Question beside that image.

**Reusable Image Questions** are canonical exact-Asset teaching content. The answer belongs to `asset_questions`; a Case receives it only through explicit `stimulus_option_asset_questions` opt-in.

Reusing an Asset in another Case must never silently add its reusable questions.

## 4. Transparent fixed-image conversion

When an author assigns a Case-specific Image Question or explicitly reuses an Asset Question on a currently fixed image, the app may atomically:

1. preflight the complete mutation;
2. create an active one-option Stimulus Group with `selection_count = 1`;
3. convert the fixed relationship into that option;
4. preserve Asset identity;
5. preserve Case-specific caption;
6. preserve effective learner-visible behavior;
7. attach the requested exact-option question or reusable-image opt-in.

The author does not need to invent an Alternative Set merely to express exact-image teaching.

The conversion and assignment are one semantic mutation. Failure must not leave the fixed image partially converted. A source-aware conversion may explicitly assign the preserved option as Original; the generic option insertion primitive itself remains order-agnostic.

## 5. Existing Case-question scope changes

A whole-Case question can be changed to an exact image/stimulus while preserving Prompt identity/answer where valid.

The operation must preserve cross-group Prompt conflict rules and clean incompatible Topic reuse only under established safe semantics.

After the move, the question no longer belongs in the whole-Case Questions list.

Existing Case-specific Image Questions are not automatically promoted to Reusable Image Questions.

## 6. Image-card question contract

Every fixed-image card and individual stimulus option should expose compact category counts before **Manage questions**:

```text
Case-specific Image Questions · N

Reusable Image Questions · N
X used in this Case · Y available to reuse
```

The reusable total counts active `asset_questions` backed by active Prompts. `used in this Case` means explicit opt-in for that exact stimulus; `available to reuse` is the remainder.

Inside **Manage questions**, preserve:

```text
Case-specific Image Questions
= only this Case + image context

Reusable Image Questions used in this Case
= canonical Asset Questions explicitly opted into this exact stimulus

Reusable Image Questions available to reuse
= active canonical Asset Questions not opted into this exact stimulus
```

Removing one opt-in changes only that exact stimulus usage. It never archives the canonical Asset Question or another Case's opt-in.

## 7. Prompt precedence/invariant

Within one selected stimulus context:

```text
Case-specific exact-image question
> explicitly reused Asset Question
> set-wide question
> broader Case/Topic/shared knowledge
```

Only one copy of a Prompt enters a Review.

The same Prompt cannot independently become stimulus-specific in two active groups in the same Case when both groups may be selected in one Review. The invariant includes reusable-image opt-ins.

## 8. Make Original and correcting a wrong Original

**Make Original** reassigns the family pointer to an eligible existing option. It does not recreate the Asset, Stimulus Option, caption/order, exact-option Questions, or Reusable Image Question opt-ins.

The safe correction sequence is:

```text
Original A was chosen/uploaded by mistake
→ add correct image B to the same family
→ Make Original B
→ B becomes Original; A becomes an ordinary Alternative
→ then decide whether to keep, deactivate, remove, move, or support A
```

Changing Original affects future Review creation only. A historical Review created while A was Original retains the snapshotted A Asset/Stimulus Option and question provenance.

Successful **Make Original** returns the Admin to `#stimulus-curation`. SvelteKit `redirect()` belongs after successful fallible database work, outside the broad database-error `try/catch`, because `redirect()` throws internally.

## 9. Same-Case option Move

Moving an option between active Alternative Sets in the same Case re-parents the existing option in place.

Preserve:

- `stimulus_group_options.id`;
- Asset identity;
- Case-specific caption/order;
- active state;
- Case-specific exact-option questions;
- reusable-image opt-ins, subject to current cross-group/coverage validity.

Set-wide questions stay with their original set.

If the option is the current Original of its source family, application preflight rejects the move with an actionable error until another eligible option is promoted first. Database triggers remain defense in depth.

## 10. Deactivate versus Remove from Case

These are different operations and must remain visibly distinct.

### Deactivate

```text
stimulus_group_options.is_active = false
```

The option remains part of the Case's ordinary authoring history but is excluded from current learner selection.

### Remove from Case

```text
stimulus_group_options.removed_from_case = true
```

The option disappears from normal current Case authoring/learner selection while its row remains for relationship/history integrity.

Removal preserves:

- the global Asset and R2 object;
- Stimulus Option identity;
- exact-option questions;
- reusable-image relationships/history;
- Review provenance/foreign-key integrity.

Re-adding the same Asset to its original Alternative Set may restore the archived option when current validation and retained teaching invariants permit it. Cross-set conflicts remain rejected.

**Remove from Case does not convert the image to fixed, deactivate/delete the global Asset, or delete R2 bytes.**

For the current Original, both **Deactivate** and **Remove from Case** are rejected in the application/domain layer before the write with an actionable instruction to choose another Original first. After B is made Original, former Original A may be deactivated or removed normally. The database trigger remains a fallback invariant rather than the normal UX error surface.

## 11. Alternative → Always shown / supporting

A non-Original Alternative can move to **Always shown / supporting** without re-uploading or recreating its Asset:

```text
active Alternative option
→ create ordinary case_assets relationship with same Asset/caption
→ archive old option relationship
```

The old `stimulus_group_options.id` remains retained with its exact-option questions and reusable-image relationships/history. If that same Asset is later moved back into its original family and validation permits restoration, the archived option identity is restored rather than silently creating a different option.

The current Original cannot move to supporting until another option becomes Original first. Successful conversion returns to `#stimulus-curation` and follows the same SvelteKit redirect rule described above.

## 12. Asset picker and upload

**Add images from library** remains a bounded searchable picker rather than embedding the full library in the Case editor.

Authors may browse eligible Assets, select several, attach as supporting images, add to an Alternative Set through safe relationship endpoints, and upload through the protected R2 pipeline.

Attaching an Asset never automatically attaches Reusable Image Questions or automatically makes a generic newly inserted option Original.

Normal guardrails remain authoritative: authorization, supported type/size, managed storage ceiling, immutable object key, optional source metadata, and no invented provenance.

## 13. General supporting-versus-family safety

Outside exact-image question/reuse operations and the explicit source-aware **Start Alternative Set** workflow, do not silently convert ordinary Case images merely because a relationship-management action needs a stimulus option.

Bulk Add-to-alternative-set rejects conflicting ordinary/current option relationships rather than silently guessing intent. Existing option Move/Restore paths should be used where applicable.

One ordinary image must not be described as the Case's unique “Original” merely because there is exactly one `case_assets` row if an active uncurated stimulus family also exists. The curation UI should use the stricter no-active-family condition or neutral wording.

## 14. Image Library scalability

The full `/admin/images` library retains:

- 60-item server-backed pages;
- exact total count;
- deterministic search/filter/sort;
- explicit cross-page selection within one canonical query context;
- exact Select All up to 300 matches;
- refusal rather than silent truncation above 300;
- at most 30 unique Asset IDs per server mutation request;
- sequential client chunks for larger explicit selections.

Image Collections remain organisational only.

## 15. Asset status versus derived lifecycle usage

Do not conflate Asset status with relationship-derived usage.

### Asset status

```text
Active
Inactive
```

This is directly managed lifecycle state.

### Derived usage

**Current** means an active Asset is attached to an active production Case as an ordinary/supporting image, or belongs to an active, non-removed option in an active Alternative Set.

**Historical only** means there is no Current use, but retained production Case/option relationships, Review Asset snapshots, Reusable Image Questions, or supersession relationships still require provenance.

**Unused** means neither Current use nor retained historical/provenance dependency exists.

Preview-session relationships do not affect production classification.

Lifecycle filters and oldest-first views support cleanup decisions but do not physically delete Assets/R2 objects.

Migration `0013_review_assets_asset_lookup.sql` adds the Asset-leading `(asset_id, review_id)` lookup index used by historical Review classification/counting.

## 16. Higher-resolution replacement

The production Image detail page exposes **Replace with higher-resolution version** only for:

```text
same underlying image + better quality/resolution
```

A different ECG/X-ray/photograph/diagram showing the same diagnosis is a separate Asset and, if appropriate, should be added to the family then promoted with **Make Original**.

Successful A → B replacement:

```text
create new immutable R2 object
create Asset B
claim active unsuperseded production Asset A
move current production fixed/option relationships A → B
preserve Stimulus Option IDs, order, caption, group identity
preserve original_option_id when it points to that option ID
clone A Asset Questions to new B Asset Questions
remap current production reusable opt-ins
A.is_active = false
A.superseded_by_asset_id = B.id
```

Old Asset Questions and old R2 bytes remain for historical provenance. Existing Reviews are not rewritten.

Exactly one concurrent replacement may claim A. A losing/new object is cleaned up if the D1 semantic batch fails.

## 17. Historical Review media and stimulus provenance

`review_assets.storage_key_snapshot` is authoritative for the exact media shown when a Review began. `source_stimulus_group_id` and `source_stimulus_option_id` preserve the exact selected family/option provenance.

Study uses an authenticated Review-owned media route that verifies learner/Review/Review-Asset ownership, reads only the snapshotted R2 key, and can serve historical bytes after the current Asset becomes inactive/superseded.

Owner-specific media uses revalidation semantics; the ordinary active-Asset route remains separate.

Therefore:

```text
old Review created with Original A → old snapshotted A/option provenance
Admin later promotes B       → old Review remains A
future Core Review           → B
```

## 18. Production / Preview behavior

Shared Questions and Reusable Image Questions remain global production-curated content. Preview may render safe counts/status but may not create/edit/archive canonical reusable content or manipulate production opt-ins.

Higher-resolution replacement is also production-only.

Issue #105's Original/Alternative authoring UX is production Admin + learner Review only. Migration `0016_original_stimulus_options.sql` deliberately does not auto-curate retained Preview-owned families, including pre-existing one-option families. Preview has no new Original-management UI, so migration must not accidentally turn ordinary Preview editing into protected-Original failures.

A production Asset referenced by a live Preview workspace temporarily blocks replacement. Preview fixed/option relationships are never silently rewritten by replacement.

Preview Case relationship operations continue to use existing ownership predicates and legacy active/removed behavior. Do not weaken Production-vs-Preview isolation to implement Original semantics.

## 19. Compact fast-review presentation

Compact Case editor mode keeps current image-bound and set-wide Prompt/Answer content visible for review, uses image strips/source previews, and includes an **All questions in this Case** audit.

Available-but-unused Reusable Image Questions remain secondary rather than appearing as if they are current learner content. Inactive/removed relationships must not be presented as participating current learner stimuli.

Classic mode remains available and underlying authoring/learner semantics are shared.

## 20. Import boundary

Import Package v1 remains unchanged by Reusable Image Questions, option archival, lifecycle cleanup views, higher-resolution replacement, and PR #108's post-import Original curation.

Reviewed imports may reconstruct ordinary Cases/images/Case Questions first and gain richer stimulus semantics later through production Admin. Extraction must not guess an Original from image order, filenames, captions, or visual prominence.

## 21. Regression expectations

Changes to image/question authoring should protect:

- source-aware Start Alternative Set preserving chosen image A as Original atomically;
- generic insertion remaining free of insert-order Original inference;
- curated Core → Original and Expanded → eligible Alternative/fallback Original;
- wrong-Original correction by promoting B before mutating A;
- clean application-level current-Original rejection for Deactivate/Remove/Move/Move-to-supporting;
- fixed/supporting versus Alternative Set semantics;
- whole-Case versus Case-specific exact-image versus Reusable Image Question ownership;
- explicit reusable opt-in and no automatic cross-Case leakage;
- canonical answers outside `question_prompts`;
- atomic fixed-image conversion + assignment;
- one Prompt per Review and cross-group conflict protection;
- option Move identity preservation;
- Deactivate versus Remove from Case distinction;
- restore safety and stable archived option identity;
- lifecycle Current/Historical only/Unused classification and Preview exclusion;
- immutable historical Prompt/answer/media/stimulus snapshots;
- stable Stimulus Option IDs and Original pointer through same-image replacement;
- cloned rather than mutated historical Asset Questions;
- old/new immutable R2 retention and failed-new-object cleanup;
- live Preview replacement blocking;
- migration `0016` leaving retained Preview editing usable;
- production/Preview ownership isolation;
- current Image Library bounds/Collections;
- Import Package v1 compatibility.

## 22. Validation authority

Use root `AGENTS.md` and `AGENT_TASK_MAP.md`. `agent:checks` should identify the relevant ordinary and specialized checks; do not maintain a separate divergent command list here.
