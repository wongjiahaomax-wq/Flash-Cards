# Admin image authoring workflow

_Status: current authoring contract plus the Compact fast-review implementation on `agent/case-editor-fast-review-compact`. The Compact redesign is not a claim of production deployment._

_Last updated: 22 August 2026_

This document records the Admin image-authoring interaction contract. Learner stimulus semantics remain defined by fixed Case Assets and optional stimulus groups/options; Image Library organisation and media-quality replacement must not blur those semantics.

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
Topics → Case → Images → Case questions → All questions in this Case → Preview
```

The final audit is Compact-only. Classic mode preserves the preceding workflow/presentation.

Images appear before Case questions because the selected stimuli often determine which exact questions are useful.

The Images section preserves two learner relationship types:

- **Fixed image** — `case_assets`; shown in every applicable Review.
- **Alternative image set** — `stimulus_groups` containing `stimulus_group_options`; one active option is selected per active set when a Review begins.

Case-specific captions remain on the Case/stimulus relationship. Filename, alt text, source, licence, Collection, supersession lineage, and Reusable Image Questions remain global Asset-level data/content.

## 2. Author-facing question scope

Question authors should not have to reason about database relationships. The Case-editor scope choice is:

```text
Where should this question apply?

- This whole Case
- A specific image or stimulus
```

When an image/stimulus is involved, the image card keeps two ownership categories explicit:

```text
Case-specific Image Questions
Reusable Image Questions
```

**This whole Case** creates/edits a Case Question and may expose **Also reuse this question in the Topic**.

**A specific image or stimulus** creates/edits the existing exact-option relationship and appears as a **Case-specific Image Question** beside that image. Topic sharing is not a compatible ordinary option and contradictory submitted form data must be rejected server-side.

**Reusable Image Questions** are a separate exact-Asset reuse model. **Reusable with this image** means the Prompt/answer is intrinsically true of the exact global Asset. The canonical answer belongs to `asset_questions`; a Case receives it only through an explicit `stimulus_option_asset_questions` opt-in.

Reusing an Asset in another Case must never silently add its reusable questions. The author must opt that Case/stimulus usage in.

The stimulus picker includes both current fixed Case images and active options in existing Alternative image sets. Use thumbnails plus filename, Case caption and set context where available.

The production Image Library Asset detail page remains a canonical global management surface for Reusable Image Questions. The Case editor also exposes the active reusable questions for the exact Asset inside **Manage questions**, where production authors can create canonical reusable questions, edit canonical answers, and explicitly reuse/remove them for the current stimulus. Exact contextual questions remain separate as **Case-specific Image Questions**.

## 3. Transparent fixed-image conversion for exact or reusable questions

General image-management operations still keep fixed-versus-alternative conversion explicit. One deliberate exception exists when image-specific question semantics require a stimulus option.

When an author assigns a Case-specific Image Question or explicitly reuses an Asset Question on a currently fixed image, the app may transparently:

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

Every Case-wide question should visibly identify its scope as **This whole Case** and provide an easy path to change it to **A specific image or stimulus**.

Changing Case → stimulus:

- reuses the existing Question Prompt identity where appropriate;
- preserves the relationship-specific answer exactly;
- deactivates/removes the active Case-wide relationship;
- creates/reactivates the Case-specific Image Question relationship;
- preserves the cross-Stimulus-Group Prompt conflict invariant;
- removes Topic reuse only under the existing safe semantics, never by deleting legitimate use belonging to another Case.

After the move, the question no longer belongs in the Case Questions list.

Existing Case-specific Image Questions are not automatically promoted to Reusable Image Questions. Reusability is an explicit editorial decision.

## 5. Keep Case Questions tidy

The Case Questions section contains only questions that apply to the whole Case regardless of the selected stimulus.

Do not duplicate Case-specific Image Questions or reusable-image opt-ins into that section. Alternative-set-wide questions remain at the set level.

Compact mode additionally renders the same current relationships in a final **All questions in this Case** audit. That audit is a read-only source/provenance projection for review/navigation; it does not create duplicate database records or become a learner-selection path.

## 6. Compact stimulus review and question management

Fixed and alternative image cards use clinically useful contain-fit previews and can open the shared Admin image viewer.

### 6.1 Fast-review surface

Compact mode now prioritises the actual clinically relevant Prompt/Answer pairs over counts-only cards.

For every alternative option, the main Compact scroll flow shows:

```text
ALTERNATIVE · <set name>

Case-specific Image Questions
[small exact image] | Prompt | Answer | Save

Reusable Image Questions used in this Case
[small exact image] | Prompt | Answer | Save canonical answer
```

On wide screens, Prompt and Answer remain side-by-side. Tablet/mobile widths reflow rather than compressing the content into one-line cells.

The exact image thumbnail is repeated as a compact identity reference and opens the existing shared Admin image viewer. This avoids requiring the author to remember which ECG/X-ray/photograph a lower question row belongs to.

For active set-wide questions, Compact mode shows directly editable:

```text
SET-WIDE · <set name>
Prompt | Answer | Save
```

No exact image is falsely attached to a set-wide question.

### 6.2 Used versus available reusable questions

The reusable headline/count logic still counts only active `asset_questions` whose `question_prompts` row is also active.

`used in this Case` means an explicit opt-in for that exact stimulus option. `available to reuse` is the remaining active reusable questions for the Asset. Under normal valid state:

```text
total reusable = used here + available
```

Archived Asset Questions or inactive Prompts do not appear in current visible counts. Dormant opt-in rows may remain so reactivation restores the valid used state without destructive relationship rewriting.

A fixed image cannot normally already have a reusable opt-in. Opting one in uses the established safe fixed-image → one-option conversion; the resulting option then reports and displays the exact used/available split.

**Available-but-unused reusable questions remain secondary.** They are represented by their count and the existing management surface, but their Prompt/Answer content is not placed into the Case fast-review flow or final Case audit.

### 6.3 Manage questions remains the structural surface

**Manage questions** remains available for structural/low-frequency operations such as:

- adding Case-specific Image Questions;
- moving an existing Case Question to the exact stimulus;
- creating reusable Asset Questions;
- adding/removing explicit reusable opt-ins;
- destructive/removal actions;
- other relationship-management operations.

It is no longer required merely to read the Q&A that is already participating in the Case.

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

An available reusable question may still be rejected by existing authoring invariants, including cross-Stimulus-Group Prompt conflicts. The review surface must never silently permit an invalid relationship.

Removing an opt-in moves a question from `used` to `available` without editing or archiving the canonical Asset Question.

Alternative option cards retain active state, ordering, caption editing and explicit same-Case **Move to another set…** behaviour.

## 7. Compact image overview strips

Compact mode adds lightweight dependency-free horizontal image overview strips where useful:

- several fixed images → one ordered fixed-image strip;
- every non-empty Alternative Set → one ordered set-specific strip.

The strips preserve display order and keep membership explicit (`FIXED` or `ALTERNATIVE · <set name>`). They support touch/trackpad scrolling, keyboard-focusable targets, and left/right scroll buttons on wider screens. Activating a strip item jumps to the corresponding detailed image/Q&A block.

The strips are navigation/overview surfaces only. They do not change selection semantics or store carousel state.

## 8. Final “All questions in this Case” audit

Compact mode derives a final Case-centred audit from the same bounded `selectedCase` read model.

It includes current active Case-participating rows from:

- Case-wide questions;
- Case-specific exact-image questions;
- explicitly-used Reusable Image Questions;
- set-wide questions.

It excludes available-but-unused reusable Asset Questions and inactive/non-participating relationships.

The audit order is deterministic and structural, preserving existing ordering inside each scope. No global cross-scope learner order is persisted.

Image-specific and reusable rows identify the exact image source. Their source indicator exposes a hover/focus/tap preview and can open the shared Admin viewer. Set-wide rows expose a small set representation rather than claiming one option owns the question.

## 9. Exact-option identity, reusable Asset identity, and Prompt invariant

A Case-specific Image Question belongs to the Case's `stimulus_group_option`, not to the global Asset. Reusing the same Asset elsewhere does not carry those Case-specific questions with it.

A Reusable Image Question belongs to the exact global `Asset`. Its answer is canonical across all opt-ins, but each stimulus option independently decides whether to use it.

The invariant remains:

> The same Question Prompt cannot be independently attached to multiple active Stimulus Groups within one Case where both groups may be selected in the same Review.

The invariant includes reusable Asset Question opt-ins. Do not bypass it during fixed-image conversion, Case-question moves, reusable-image opt-in, higher-resolution replacement, or later legacy question edits.

Within one selected stimulus context, precedence resolves duplicate Prompt IDs as:

```text
Case-specific Image Question
> explicitly reused Asset Question
> group question
> broader Case/Topic/shared knowledge
```

Only one copy of a Prompt can enter a Review.

## 10. Same-Case option Move

Image Management V2 permits:

```text
Case A / Alternative Set 1 / Option X
→ Case A / Alternative Set 2 / Option X
```

The operation re-parents the existing option in place and preserves option ID, Asset identity, Case-specific caption, active state, and Case-specific Image Questions/answers.

Reusable-image opt-ins are attached to the option identity and therefore move with that option, subject to the same cross-group Prompt/coverage validity. Set-wide questions remain with their original sets.

## 11. Remove from Case remains distinct from Move

Removing an option from a Case archives/removes that Case relationship according to the existing safety semantics. It does not:

- move the option to another set;
- silently convert the option into a fixed image;
- delete the reusable Asset;
- delete historical Review provenance.

The Compact redesign preserves **Move to another set…**, **Remove from Case**, reorder, active/inactive state, caption management, picker/upload, and fixed-image placement workflows.

## 12. Asset picker and ordinary uploads

**Add images from library** remains a bounded searchable picker rather than rendering the full library inside the Case editor.

Administrators can search/browse eligible Assets, select several Assets, attach them as fixed images, add them to an alternative set through the safe relationship endpoint, and upload a new image through the protected R2 media pipeline.

Attaching an Asset does not automatically attach any Reusable Image Question belonging to it.

Normal guardrails remain authoritative: authenticated/authorized writes, supported type/size, managed R2 storage ceiling, immutable production object key, optional source/provenance metadata, and no invented attribution.

## 13. General fixed-versus-alternative safety

Outside image-question semantic operations, do not silently convert an image merely because it is selected in another image-management control.

Bulk Add-to-alternative-set rejects a fixed relationship rather than silently converting it. If an Asset is already in another alternative set in the same Case, use the explicit same-Case Move operation. Inactive options are not silently reactivated by bulk Add.

## 14. Image Library scalability and Collections

The full `/admin/images` and `/preview-admin/images` libraries retain Image Management V2 behaviour: 60 Assets per server-backed page, exact result count, deterministic filtering/sort, bounded selection and bulk mutations, and explicit cross-page selection rules.

Image Collections remain organisational only. Deleting/changing a Collection never changes Case relationships, Tags, questions, Reviews, learner routing, or R2 identity.

Reusable Image Questions are teaching content, not Collection metadata.

## 15. Production / Preview behaviour

Reusable Image Questions are global production Asset-level teaching content in this implementation.

Production Admin may create/edit/archive canonical Asset Questions and opt production Case/stimulus usages in or out.

Preview may render the Compact review distinction where shared Case-editor data makes it safe, but must never gain production reusable-question mutation authority. Canonical reusable content is read-only in Preview. Preview Admin must not mutate production Assets, production Asset Questions, production Question Prompts, production Cases, or production stimulus relationships.

Existing Preview-safe Case/image behavior remains unchanged.

The higher-resolution replacement operation is also production-only. Preview-owned Assets are not eligible source Assets, Preview Admin has no equivalent replacement action, and Preview-owned Case/stimulus relationships are never silently rewritten by a production replacement.

A production Asset referenced by a **live Preview workspace** is temporarily ineligible for replacement. Both fixed Preview `case_assets` references and Preview `stimulus_group_options` references block replacement. The operation checks this before upload and inside the D1 claim so a race causes the batch to fail and the new R2 object to be cleaned up.

## 16. Stimulus-specific coverage

Reusable Image Questions explicitly opted into the selected stimulus are stimulus-specific candidates because the resolver attaches the selected `stimulusGroupId`/`stimulusOptionId` context to them.

They therefore participate in learner `Automatic`, `All`, and `Fixed` selection through the existing final eligible pool and count toward configured coverage when selected for that group. They are not artificially forced into every Review unless existing coverage rules require enough stimulus-specific questions.

Auto-created one-option groups retain the ordinary no-guarantee baseline unless an author later configures coverage.

## 17. Asset metadata versus Case metadata

Global reusable Asset data/content includes administrator filename/name, alt text, source label/URL, licence, Collection, active state, immutable storage identity, supersession lineage, and Reusable Image Questions.

Case relationship metadata includes fixed/alternative membership, display order, Case-specific caption, Case-specific Image Questions, group membership/settings/questions, and the explicit decision to opt a stimulus into a canonical Reusable Image Question.

Removing an opt-in from one Case must not archive or delete the global Asset Question.

## 18. Shared editing and Review snapshots

Editing a canonical reusable answer changes future Reviews for every current opt-in. Existing/in-progress Reviews remain unchanged because `review_questions` snapshots Prompt and answer text at Review creation.

Reusable Image Questions add `source_asset_question_id` provenance with `source_type = asset`.

Prompt wording remains globally reusable wording. The Questions Library shared-edit/stale-usage guard includes active Asset Question usage so canonical Prompt edits cannot bypass existing blast-radius confirmation merely because the new scope is involved.

The Compact Case review keeps reusable Prompt wording visible but routes shared-wording edits to the existing guarded global surface. It does not add an unsafe Case-local Prompt rewrite for canonical Asset Questions.

## 19. Replace with higher-resolution version

The production Image detail page exposes **Replace with higher-resolution version** for one narrow case:

```text
same underlying image + better quality/resolution
→ replacement workflow

different image + same condition/diagnosis
→ create/use a separate Asset
```

This action must not be used to swap in another ECG, X-ray, photograph or diagram simply because it represents the same diagnosis.

The successful semantic operation creates a new immutable R2 object and Asset, claims the old current Asset, moves current production relationships while preserving stable Stimulus Option IDs, clones reusable Asset Questions to the replacement Asset, remaps current reusable opt-ins, and marks the old Asset inactive/superseded.

Historical Review Prompt/answer/media provenance is not rewritten.

## 20. Historical Review image delivery

`review_assets.storage_key_snapshot` remains authoritative for the exact image a learner saw when a Review began.

Therefore:

```text
old Review → old snapshotted R2 object
new Review → current replacement Asset/R2 object
```

The Compact Case editor redesign does not alter this path.

## 21. Import boundary

Import Package v1 remains unchanged. Reviewed imports reconstruct ordinary Cases, fixed images and ordinary questions first; reusable-image authoring and higher-resolution replacement are later production Admin editorial operations.

Do not infer existing `stimulus_option_questions` as reusable merely from matching Asset/Prompt/answer data.

## 22. Regression expectations

Changes to image/question authoring should protect:

- Case-wide versus Case-specific Image Question versus reusable exact-Asset mental model;
- explicit reusable opt-in with no automatic cross-Case leakage;
- canonical answer storage outside `question_prompts`;
- Prompt + Answer visibility for current Case-participating questions in Compact mode;
- exact image identity beside image-linked Q&A;
- available-but-unused reusable questions staying secondary;
- fixed versus Alternative Set semantics;
- Move versus Remove distinction;
- atomic fixed-image conversion + question assignment;
- Case-specific Image Question precedence over reusable Asset knowledge;
- one Prompt per Review;
- cross-group Prompt conflict protection;
- shared Prompt edit protection;
- stimulus-specific coverage behavior;
- immutable historical Review Prompt/answer snapshots;
- Review image delivery from `storage_key_snapshot`;
- stable Stimulus Option IDs through higher-resolution replacement;
- production/Preview ownership isolation;
- Import Package v1 compatibility;
- existing scalable Image Library and Collection rules;
- Classic mode compatibility.

## 23. Validation standard

```sh
git diff --check
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
```

The current implementation PR should report any environment-limited validation explicitly rather than treating an unrun check as passing.
