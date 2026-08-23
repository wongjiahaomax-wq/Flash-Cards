# Admin image authoring workflow

_Status: implemented on current `main`. The current contract incorporates the PR #29 authoring baseline, PR #34 Image Management V2, PR #56–#58 exact-image/reusable-question authoring, PR #59 same-image replacement, PR #62 alternative-option removal/archive semantics, PR #63 lifecycle cleanup views, and PR #72 Compact fast-review presentation._

_Last updated: 24 August 2026_

This document records the current Admin image-authoring interaction contract. Learner stimulus semantics remain defined by fixed Case Assets and optional Alternative Sets; Image Library organisation, Asset lifecycle, and media-quality replacement must not blur those semantics.

Terminology:

```text
Topic      = learner study route/hierarchy
Tag        = cross-cutting clinical metadata
Collection = Image Library organisational bucket
Asset      = one exact global teaching-media identity
```

A Collection is not a Topic, Tag, or stimulus group.

## 1. Case editor order

The common flow remains:

```text
Topics → Case → Images → Case questions → Preview
```

The Images section preserves two learner relationship types:

- **Fixed image** — `case_assets`; shown in every applicable Review.
- **Alternative Set** — `stimulus_groups` containing `stimulus_group_options`; one active, non-removed option is selected per active set when a Review begins.

Case-specific captions/order/group membership remain relationship metadata. Filename, alt text, source/licence, Collection, Asset status, supersession lineage, and Reusable Image Questions are global Asset-level concerns.

## 2. Author-facing question scope

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

## 3. Transparent fixed-image conversion

When an author assigns a Case-specific Image Question or explicitly reuses an Asset Question on a currently fixed image, the app may atomically:

1. preflight the complete mutation;
2. create an active one-option Stimulus Group with `selection_count = 1`;
3. convert the fixed relationship into that option;
4. preserve Asset identity;
5. preserve Case-specific caption;
6. preserve effective learner-visible behavior;
7. attach the requested exact-option question or reusable-image opt-in.

The author does not need to invent an Alternative Set merely to express exact-image teaching.

The conversion and assignment are one semantic mutation. Failure must not leave the fixed image partially converted.

## 4. Existing Case-question scope changes

A whole-Case question can be changed to an exact image/stimulus while preserving Prompt identity/answer where valid.

The operation must preserve cross-group Prompt conflict rules and clean incompatible Topic reuse only under established safe semantics.

After the move, the question no longer belongs in the whole-Case Questions list.

Existing Case-specific Image Questions are not automatically promoted to Reusable Image Questions.

## 5. Image-card question contract

Every fixed-image card and individual alternative option should expose compact category counts before **Manage questions**:

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

## 6. Prompt precedence/invariant

Within one selected stimulus context:

```text
Case-specific exact-image question
> explicitly reused Asset Question
> set-wide question
> broader Case/Topic/shared knowledge
```

Only one copy of a Prompt enters a Review.

The same Prompt cannot independently become stimulus-specific in two active groups in the same Case when both groups may be selected in one Review. The invariant includes reusable-image opt-ins.

## 7. Same-Case option Move

Moving an option between active Alternative Sets in the same Case re-parents the existing option in place.

Preserve:

- `stimulus_group_options.id`;
- Asset identity;
- Case-specific caption;
- active state;
- Case-specific exact-option questions;
- reusable-image opt-ins, subject to current cross-group/coverage validity.

Set-wide questions stay with their original set.

## 8. Deactivate versus Remove from Case

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

## 9. Asset picker and upload

**Add images from library** remains a bounded searchable picker rather than embedding the full library in the Case editor.

Authors may browse eligible Assets, select several, attach as fixed images, add to an Alternative Set through safe relationship endpoints, and upload through the protected R2 pipeline.

Attaching an Asset never automatically attaches Reusable Image Questions.

Normal guardrails remain authoritative: authorization, supported type/size, managed storage ceiling, immutable object key, optional source metadata, and no invented provenance.

## 10. General fixed-versus-alternative safety

Outside exact-image question/reuse operations, do not silently convert fixed images merely because a relationship-management action needs a stimulus option.

Bulk Add-to-alternative-set rejects conflicting fixed/current option relationships rather than silently guessing intent. Existing option Move/Restore paths should be used where applicable.

## 11. Image Library scalability

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

## 12. Asset status versus derived lifecycle usage

Do not conflate Asset status with relationship-derived usage.

### Asset status

```text
Active
Inactive
```

This is directly managed lifecycle state.

### Derived usage

**Current** means an active Asset is attached to an active production Case as a fixed image, or belongs to an active, non-removed option in an active Alternative Set.

**Historical only** means there is no Current use, but retained production Case/option relationships, Review Asset snapshots, Reusable Image Questions, or supersession relationships still require provenance.

**Unused** means neither Current use nor retained historical/provenance dependency exists.

Preview-session relationships do not affect production classification.

Lifecycle filters and oldest-first views support cleanup decisions but do not physically delete Assets/R2 objects.

Migration `0013_review_assets_asset_lookup.sql` adds the Asset-leading `(asset_id, review_id)` lookup index used by historical Review classification/counting.

## 13. Higher-resolution replacement

The production Image detail page exposes **Replace with higher-resolution version** only for:

```text
same underlying image + better quality/resolution
```

A different ECG/X-ray/photograph/diagram showing the same diagnosis is a separate Asset.

Successful A → B replacement:

```text
create new immutable R2 object
create Asset B
claim active unsuperseded production Asset A
move current production fixed/option relationships A → B
preserve Stimulus Option IDs, order, caption, group identity
clone A Asset Questions to new B Asset Questions
remap current production reusable opt-ins
A.is_active = false
A.superseded_by_asset_id = B.id
```

Old Asset Questions and old R2 bytes remain for historical provenance. Existing Reviews are not rewritten.

Exactly one concurrent replacement may claim A. A losing/new object is cleaned up if the D1 semantic batch fails.

## 14. Historical Review media

`review_assets.storage_key_snapshot` is authoritative for the exact media shown when a Review began.

Study uses an authenticated Review-owned media route that verifies learner/Review/Review-Asset ownership, reads only the snapshotted R2 key, and can serve historical bytes after the current Asset becomes inactive/superseded.

Owner-specific media uses revalidation semantics; the ordinary active-Asset route remains separate.

Therefore:

```text
old Review → old snapshotted object
future Review → current Asset/object
```

## 15. Production / Preview behavior

Shared Questions and Reusable Image Questions remain global production-curated content. Preview may render safe counts/status but may not create/edit/archive canonical reusable content or manipulate production opt-ins.

Higher-resolution replacement is also production-only.

A production Asset referenced by a live Preview workspace temporarily blocks replacement. Preview fixed/option relationships are never silently rewritten by replacement.

Preview Case relationship operations must still respect the same option active/removed semantics when cloning/mutating Preview-owned content.

## 16. Compact fast-review presentation

Compact Case editor mode keeps current image-bound and set-wide Prompt/Answer content visible for review, uses image strips/source previews, and includes an **All questions in this Case** audit.

Available-but-unused Reusable Image Questions remain secondary rather than appearing as if they are current learner content. Inactive/removed relationships must not be presented as participating current learner stimuli.

Classic mode remains available and underlying authoring/learner semantics are shared.

## 17. Import boundary

Import Package v1 remains unchanged by Reusable Image Questions, option archival, lifecycle cleanup views, and higher-resolution replacement.

Reviewed imports may reconstruct ordinary Cases/fixed images/Case Questions first and gain these richer editorial semantics later through production Admin.

## 18. Regression expectations

Changes to image/question authoring should protect:

- fixed versus Alternative Set semantics;
- whole-Case versus Case-specific exact-image versus Reusable Image Question ownership;
- explicit reusable opt-in and no automatic cross-Case leakage;
- canonical answers outside `question_prompts`;
- atomic fixed-image conversion + assignment;
- one Prompt per Review and cross-group conflict protection;
- option Move identity preservation;
- Deactivate versus Remove from Case distinction;
- restore safety for archived options;
- lifecycle Current/Historical only/Unused classification and Preview exclusion;
- immutable historical Prompt/answer/media snapshots;
- stable Stimulus Option IDs through replacement;
- cloned rather than mutated historical Asset Questions;
- old/new immutable R2 retention and failed-new-object cleanup;
- live Preview replacement blocking;
- production/Preview ownership isolation;
- current Image Library bounds/Collections;
- Import Package v1 compatibility.

## 19. Validation authority

Use root `AGENTS.md` and `AGENT_TASK_MAP.md`. `agent:checks` should identify the relevant ordinary and specialized checks; do not maintain a separate divergent command list here.
