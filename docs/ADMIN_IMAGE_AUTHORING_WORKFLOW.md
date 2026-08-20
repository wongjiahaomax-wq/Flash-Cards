# Admin image authoring workflow

_Status: implemented baseline plus Reusable Image Questions and the higher-resolution replacement workflow on the current feature branch. PR #29 established the Case image-authoring baseline, PR #34/Image Management V2 extended scalable library behaviour, PR #56 added Case-question → exact-option moves, and the stimulus-scope authoring follow-up makes fixed and alternative images equivalent targets from the author's perspective._

_Last updated: 20 August 2026_

This document records the current Admin image-authoring interaction contract. Learner stimulus semantics remain defined by fixed Case Assets and optional stimulus groups/options; Image Library organisation and media-quality replacement must not blur those semantics.

Terminology:

```text
Topic      = educational / learner Case classification
Tag        = cross-cutting clinical metadata
Collection = Image Library organisational bucket
Asset      = one exact global teaching-media identity
```

A Collection is not a Topic, Tag, or stimulus group.

## 1. Case editor order

The common authoring flow is:

```text
Topics → Case → Images → Case questions → Preview
```

Images appear before Case questions because the selected stimuli often determine which exact questions are useful.

The Images section preserves two learner relationship types:

- **Fixed image** — `case_assets`; shown in every applicable Review.
- **Alternative image set** — `stimulus_groups` containing `stimulus_group_options`; one active option is selected per active set when a Review begins.

Case-specific captions remain on the Case/stimulus relationship. Filename, alt text, source, licence, Collection, supersession lineage, and Reusable Image Questions remain global Asset-level data/content.

## 2. Author-facing question scope

Question authors should not have to reason about database relationships. The normal mental model is:

```text
Where should this question apply?

- This whole Case
- Only in this Case / exact image context
- Reusable with this image
```

**This whole Case** creates/edits a Case Question and may expose **Also reuse this question in the Topic**.

**Only in this Case / exact image context** creates/edits the existing exact-option question. Topic sharing is not a compatible ordinary option and contradictory submitted form data must be rejected server-side.

**Reusable with this image** means the Prompt/answer is intrinsically true of the exact global Asset. The canonical answer belongs to `asset_questions`; a Case receives it only through an explicit `stimulus_option_asset_questions` opt-in.

Reusing an Asset in another Case must never silently add its reusable questions. The author must opt that Case/stimulus usage in.

The stimulus picker includes both current fixed Case images and active options in existing Alternative image sets. Use thumbnails plus filename, Case caption and set context where available.

The production Image Library Asset detail page remains a canonical global management surface for Reusable Image Questions. The Case editor also exposes the active reusable questions for the exact Asset inside **Manage questions**, where production authors can create canonical reusable questions, edit canonical answers, and explicitly reuse/remove them for the current stimulus. Exact contextual questions remain separate as **Case-specific Image Questions**.

## 3. Transparent fixed-image conversion for exact or reusable questions

General image-management operations still keep fixed-versus-alternative conversion explicit. One deliberate exception exists when image-specific question semantics require a stimulus option.

When an author assigns an exact-image question or explicitly reuses an Asset Question on a currently fixed image, the app may transparently:

1. validate the complete mutation before changing relationships;
2. create an active one-option Stimulus Group with `selection_count = 1`;
3. convert the fixed Case image into that option;
4. preserve the Asset identity;
5. preserve the Case-specific caption;
6. preserve active learner-visible behaviour;
7. attach the exact-option relationship or reusable-image opt-in as requested.

The generated group name should be deterministic and human-readable from existing Asset metadata. The author must not need to invent a set name merely to express image-specific question scope.

The conversion and question assignment are one semantic mutation. Preflight validation must happen before destructive scope changes, and D1 batch semantics must prevent a failed assignment from leaving the fixed image unexpectedly converted.

With one active option, that image remains selected whenever the Case is reviewed, preserving the previous fixed-image learner behaviour.

## 4. Existing Case-question scope changes

Every Case-wide question should visibly identify its scope as **This whole Case** and provide an easy path to change it to **Only in this Case / a specific image**.

Changing Case → stimulus:

- reuses the existing Question Prompt identity where appropriate;
- preserves the relationship-specific answer exactly;
- deactivates/removes the active Case-wide relationship;
- creates/reactivates the exact-image relationship;
- preserves the cross-Stimulus-Group Prompt conflict invariant;
- removes Topic reuse only under the existing safe semantics, never by deleting legitimate use belonging to another Case.

After the move, the question no longer belongs in the Case Questions list.

Existing exact-option questions are not automatically promoted to Reusable Image Questions. Reusability is an explicit editorial decision.

## 5. Keep Case Questions tidy

The Case Questions section contains only questions that apply to the whole Case regardless of the selected stimulus.

Do not duplicate exact-image or reusable-image opt-ins into that section. Stimulus-specific contextual questions remain managed beside the image; canonical reusable questions are managed from the image's **Manage questions** surface and the Asset detail surface. Alternative-set-wide questions remain at the set level.

## 6. Stimulus cards and question management

Fixed and alternative image cards use clinically useful contain-fit previews and can open the shared Admin image viewer.

Every fixed-image card and every individual alternative-option card must expose both question categories before the author opens **Manage questions**. The compact card contract is:

```text
Case-specific Image Questions · N

Reusable Image Questions · N
X used in this Case · Y available to reuse

[Manage questions]
```

When `used = 0`, prefer the more compact reusable status:

```text
Reusable Image Questions · 3
3 available to reuse
```

When no active reusable questions exist:

```text
Reusable Image Questions · 0
```

The reusable headline counts only active `asset_questions` whose `question_prompts` row is also active. `used in this Case` means an explicit opt-in for that exact stimulus option. `available to reuse` is the remaining active reusable questions for the Asset. Under normal valid state:

```text
total reusable = used here + available
```

Archived Asset Questions or inactive Prompts do not appear in these visible counts. Dormant opt-in rows may remain so reactivation restores the valid used state without destructive relationship rewriting.

A fixed image cannot already have a reusable opt-in. It therefore normally shows all active reusable questions as available. Opting one in uses the established safe fixed-image → one-option conversion; the resulting option card then reports the exact used/available split.

The collapsed card shows **counts/status only**. It must not render full reusable answers, Case-specific answers, or expanded editing controls. Full question content and actions remain behind **Manage questions**.

Inside **Manage questions**, preserve the semantic split:

```text
Case-specific Image Questions
= questions belonging only to this Case + image context

Reusable Image Questions used in this Case
= canonical Asset Questions explicitly opted into this exact stimulus

Reusable Image Questions available to reuse
= active canonical Asset Questions not currently opted into this exact stimulus
```

Do not label the first category merely **Image-specific questions** because Reusable Image Questions are also image-specific.

An available reusable question may still be rejected by existing authoring invariants, including cross-Stimulus-Group Prompt conflicts. The compact card does not need a separate blocked count; the management action must retain existing validation and must never silently permit an invalid relationship.

Removing an opt-in moves a question from `used` to `available` without editing or archiving the canonical Asset Question.

Alternative option cards retain active state, ordering, caption editing and explicit same-Case **Move to another set…** behaviour.

## 7. Exact-option identity, reusable Asset identity, and Prompt invariant

An exact-image contextual question belongs to the Case's `stimulus_group_option`, not to the global Asset. Reusing the same Asset elsewhere does not carry those Case-specific questions with it.

A Reusable Image Question belongs to the exact global `Asset`. Its answer is canonical across all opt-ins, but each stimulus option independently decides whether to use it.

The invariant remains:

> The same Question Prompt cannot be independently attached to multiple active Stimulus Groups within one Case where both groups may be selected in the same Review.

The invariant includes reusable Asset Question opt-ins. Do not bypass it during fixed-image conversion, Case-question moves, reusable-image opt-in, higher-resolution replacement, or later legacy question edits.

Within one selected stimulus context, precedence resolves duplicate Prompt IDs as:

```text
exact Case-specific option question
> explicitly reused Asset Question
> group question
> broader Case/Topic/shared knowledge
```

Only one copy of a Prompt can enter a Review.

## 8. Same-Case option Move

Image Management V2 permits:

```text
Case A / Alternative Set 1 / Option X
→ Case A / Alternative Set 2 / Option X
```

The operation re-parents the existing option in place and preserves option ID, Asset identity, Case-specific caption, active state, and exact-option questions/answers.

Reusable-image opt-ins are attached to the option identity and therefore move with that option, subject to the same cross-group Prompt/coverage validity. Set-wide questions remain with their original sets.

## 9. Asset picker and ordinary uploads

**Add images from library** remains a bounded searchable picker rather than rendering the full library inside the Case editor.

Administrators can search/browse eligible Assets, select several Assets, attach them as fixed images, add them to an alternative set through the safe relationship endpoint, and upload a new image through the protected R2 media pipeline.

Attaching an Asset does not automatically attach any Reusable Image Question belonging to it.

Normal guardrails remain authoritative: authenticated/authorized writes, supported type/size, managed R2 storage ceiling, immutable production object key, optional source/provenance metadata, and no invented attribution.

## 10. General fixed-versus-alternative safety

Outside image-question semantic operations, do not silently convert an image merely because it is selected in another image-management control.

Bulk Add-to-alternative-set rejects a fixed relationship rather than silently converting it. If an Asset is already in another alternative set in the same Case, use the explicit same-Case Move operation. Inactive options are not silently reactivated by bulk Add.

## 11. Image Library scalability and Collections

The full `/admin/images` and `/preview-admin/images` libraries retain Image Management V2 behaviour: 60 Assets per server-backed page, exact result count, deterministic filtering/sort, bounded selection and bulk mutations, and explicit cross-page selection rules.

Image Collections remain organisational only. Deleting/changing a Collection never changes Case relationships, Tags, questions, Reviews, learner routing, or R2 identity.

Reusable Image Questions are teaching content, not Collection metadata.

## 12. Production / Preview behaviour

Reusable Image Questions are global production Asset-level teaching content in this implementation.

Production Admin may create/edit/archive canonical Asset Questions and opt production Case/stimulus usages in or out.

Preview may render the compact distinction where shared Case-editor data makes it safe, but must never gain production reusable-question mutation authority. Reusable create/edit/reuse/remove controls are production-only. Preview Admin must not mutate production Assets, production Asset Questions, production Question Prompts, production Cases, or production stimulus relationships. No reusable-image mutation endpoint is exposed under Preview Admin, and database triggers reject Preview-owned Assets or Prompts as reusable Asset Question backing content.

Existing Preview-safe Case/image behavior remains unchanged.

The higher-resolution replacement operation is also production-only. Preview-owned Assets are not eligible source Assets, Preview Admin has no equivalent replacement action, and Preview-owned Case/stimulus relationships are never silently rewritten by a production replacement.

A production Asset referenced by a **live Preview workspace** is temporarily ineligible for replacement. For this boundary, live means the Preview session is `active` and `expires_at` is still in the future. Both fixed Preview `case_assets` references and Preview `stimulus_group_options` references block replacement. The operation checks this before uploading the replacement and repeats the condition when claiming the source Asset inside the D1 batch, so a Preview that becomes live during the operation causes the batch to fail and the new R2 object to be cleaned up.

Expired/non-live Preview relationships remain outside the mutation set; they are not rewritten.

## 13. Stimulus-specific coverage

Reusable Image Questions explicitly opted into the selected stimulus are stimulus-specific candidates because the resolver attaches the selected `stimulusGroupId`/`stimulusOptionId` context to them.

They therefore participate in learner `Automatic`, `All`, and `Fixed` selection through the existing final eligible pool and count toward configured coverage when selected for that group. They are not artificially forced into every Review unless existing coverage rules require enough stimulus-specific questions.

Auto-created one-option groups retain the ordinary no-guarantee baseline unless an author later configures coverage.

## 14. Asset metadata versus Case metadata

Global reusable Asset data/content includes administrator filename/name, alt text, source label/URL, licence, Collection, active state, immutable storage identity, supersession lineage, and Reusable Image Questions.

Case relationship metadata includes fixed/alternative membership, display order, Case-specific caption, exact-option contextual questions, group membership/settings/questions, and the explicit decision to opt a stimulus into a canonical Reusable Image Question.

Removing an opt-in from one Case must not archive or delete the global Asset Question.

## 15. Shared editing and Review snapshots

Editing a canonical reusable answer changes future Reviews for every current opt-in. Existing/in-progress Reviews remain unchanged because `review_questions` snapshots Prompt and answer text at Review creation.

Reusable Image Questions add `source_asset_question_id` provenance with `source_type = asset`.

Prompt wording remains globally reusable wording. The Questions Library shared-edit/stale-usage guard includes active Asset Question usage so canonical Prompt edits cannot bypass existing blast-radius confirmation merely because the new scope is involved.

## 16. Replace with higher-resolution version

The production Image detail page exposes **Replace with higher-resolution version** for one narrow case:

```text
same underlying image + better quality/resolution
→ replacement workflow

different image + same condition/diagnosis
→ create/use a separate Asset
```

This action must not be used to swap in another ECG, X-ray, photograph or diagram simply because it represents the same diagnosis.

Before submission the UI explains the current production impact and requires explicit confirmation that the upload is the same underlying image.

The successful semantic operation is:

```text
Asset A + old immutable R2 object
        ↓
create new immutable R2 object
create Asset B
        ↓
claim A for B inside the D1 batch
move current production relationships A → B
clone reusable Asset Questions AQs → new BQs
remap current production reusable opt-ins
        ↓
A.is_active = false
A.superseded_by_asset_id = B.id
```

### Fixed Case relationships

Current production `case_assets.asset_id` references move A → B in place. Case ID, display order and Case-specific caption are preserved.

### Alternative image options

Current production `stimulus_group_options.asset_id` references move A → B in place. The **Stimulus Option ID is preserved**, as are the Stimulus Group, display order, caption and active state.

Because exact-image Case questions belong to the Stimulus Option identity, existing `stimulus_option_questions` remain unchanged and continue to apply to the replacement image.

### Reusable Image Questions

Existing `asset_questions.asset_id` values are never changed from A to B. Old Asset Questions remain attached to A so historical `review_questions.source_asset_question_id` keeps truthful provenance.

Instead, every reusable Asset Question is cloned to B with a new Asset Question ID while preserving Prompt ID, canonical answer and active/inactive state. Question Prompts are not duplicated.

Current production `stimulus_option_asset_questions` opt-ins are remapped from each old AQ to its corresponding cloned BQ after the preserved option has been moved to B, satisfying the existing Asset-identity trigger.

### Metadata and lineage

B inherits appropriate semantic/provenance metadata from A, including alt text, source label/URL, licence and Image Collection. The uploaded file supplies B's new immutable storage key, MIME type and appropriate original filename.

The narrow lineage field is `assets.superseded_by_asset_id`. A later quality upgrade may naturally produce A → B → C by replacing B. An already-superseded A cannot be directly replaced again or reactivated.

This is not generic Asset versioning. Do not infer Asset families, `image_identity`, automatic visual similarity/deduplication, arbitrary different-image replacement, or bulk replacement.

### Race and R2/D1 failure safety

R2 and D1 do not share a transaction. The route/domain operation follows:

```text
1. validate full replacement semantics, including no live Preview usage
2. upload one new immutable R2 object through existing guardrails
3. execute one D1 semantic batch
4. inside that batch, exactly one replacement may claim active unsuperseded A
5. if the claim or any later D1 statement fails, roll back the whole batch
6. on D1 failure, delete only the newly uploaded object
```

The claim is conditional on A still being active, production-owned, not already superseded, and not referenced by a live Preview workspace. A database-enforced assertion immediately after the conditional claim converts a zero-row/lost claim into a batch failure. Therefore concurrent/double submissions cannot both succeed: one replacement wins; the loser rolls back and its new R2 object is cleaned up.

A successful replacement keeps both old and new R2 objects. The old bytes are historical Review data and are not garbage-collected by this workflow.

## 17. Historical Review image delivery

`review_assets.storage_key_snapshot` is authoritative for the exact image a learner saw when a Review began.

Study pages now use an authenticated Review-specific media URL. Its server path:

- verifies authentication;
- rejects Preview Worker/Preview Admin learner access under the existing Study boundary;
- verifies the Review belongs to the learner;
- verifies the requested `review_assets` row belongs to that Review;
- reads only `storage_key_snapshot` as the R2 key;
- serves the historical object even if its original Asset is inactive/superseded;
- uses `Cache-Control: private, max-age=0, must-revalidate` so owner-specific Review media must re-run the authenticated ownership check before browser reuse, while retaining ETag-based `304 Not Modified` support;
- does not permit arbitrary R2-key access;
- returns not-found/denial for another learner without reading R2.

The ordinary `/api/assets/{assetId}/image` route retains its active-current-Asset semantics and continues to reject inactive Assets. Its existing long-lived private immutable cache policy remains separate from the owner-specific Review route.

Therefore:

```text
old Review → old snapshotted R2 object
new Review → current replacement Asset/R2 object
```

Historical Prompt/answer snapshots and `source_asset_question_id` are not rewritten.

## 18. Import boundary

Import Package v1 remains unchanged. Reviewed imports reconstruct ordinary Cases, fixed images and ordinary questions first; reusable-image authoring and higher-resolution replacement are later production Admin editorial operations.

Do not infer existing `stimulus_option_questions` as reusable merely from matching Asset/Prompt/answer data.

## 19. Regression expectations

Changes to image/question authoring should protect:

- Case-wide versus contextual exact-image versus reusable exact-Asset mental model;
- explicit reusable opt-in with no automatic cross-Case leakage;
- canonical answer storage outside `question_prompts`;
- clinically useful image display;
- atomic fixed-image conversion + question assignment;
- exact-option precedence over reusable Asset knowledge;
- one Prompt per Review;
- cross-group Prompt conflict protection;
- shared Prompt edit protection;
- stimulus-specific coverage behavior;
- immutable historical Review Prompt/answer snapshots;
- Review image delivery from `storage_key_snapshot`;
- stable Stimulus Option IDs through higher-resolution replacement;
- cloning rather than mutating historical Asset Questions;
- old/new immutable R2 retention and rollback cleanup of only the new object;
- exactly one successful replacement claim under double/concurrent submission;
- live Preview protection without Preview relationship rewrites;
- removal of one opt-in without affecting others;
- one-option learner behavior equivalent to the previous fixed image;
- production/Preview ownership isolation;
- Import Package v1 compatibility;
- existing scalable Image Library and Collection rules.

## 20. Validation standard

```sh
git diff --check
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
```