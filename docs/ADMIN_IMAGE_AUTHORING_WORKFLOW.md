# Admin image authoring workflow

_Status: implemented baseline plus Reusable Image Questions on the current feature branch. PR #29 established the Case image-authoring baseline, PR #34/Image Management V2 extended scalable library behaviour, PR #56 added Case-question → exact-option moves, and the stimulus-scope authoring follow-up makes fixed and alternative images equivalent targets from the author's perspective._

_Last updated: 20 August 2026_

This document records the current Admin image-authoring interaction contract. Learner stimulus semantics remain defined by fixed Case Assets and optional stimulus groups/options; Image Library organisation must not change those semantics.

Terminology:

```text
Topic      = educational / learner Case classification
Tag        = cross-cutting clinical metadata
Collection = Image Library organisational bucket
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

Case-specific captions remain on the Case/stimulus relationship. Filename, alt text, source, licence, Collection, and Reusable Image Questions remain global Asset-level metadata/content.

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

The production Image Library Asset detail page is the canonical global management surface for Reusable Image Questions. It lists every Case/stimulus using that Asset, distinguishes explicit opt-ins, and provides **Reuse in this Case** / **Remove from this Case** actions. Exact contextual questions remain managed beside the Case image.

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

Do not duplicate exact-image or reusable-image opt-ins into that section. Stimulus-specific contextual questions remain managed beside the image; canonical reusable questions are managed from the Asset detail surface. Alternative-set-wide questions remain at the set level.

## 6. Stimulus cards and question management

Fixed and alternative image cards use clinically useful contain-fit previews and can open the shared Admin image viewer.

An image card should remain compact. Show the image, Case-specific caption/set context, image-specific question count/summary, and collapsed management controls where appropriate.

The author-facing distinction is:

```text
Only in this Case
→ exact-option question/answer

Reusable with this image
→ canonical Asset Question + explicit current stimulus opt-in
```

A reusable question may be discovered anywhere the exact same Asset is used, but discovery is not eligibility. Explicit reuse is always required.

Alternative option cards retain active state, ordering, caption editing and explicit same-Case **Move to another set…** behaviour.

## 7. Exact-option identity, reusable Asset identity, and Prompt invariant

An exact-image contextual question belongs to the Case's `stimulus_group_option`, not to the global Asset. Reusing the same Asset elsewhere does not carry those Case-specific questions with it.

A Reusable Image Question belongs to the exact global `Asset`. Its answer is canonical across all opt-ins, but each stimulus option independently decides whether to use it.

The invariant remains:

> The same Question Prompt cannot be independently attached to multiple active Stimulus Groups within one Case where both groups may be selected in the same Review.

The invariant includes reusable Asset Question opt-ins. Do not bypass it during fixed-image conversion, Case-question moves, reusable-image opt-in, or later legacy question edits.

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

## 9. Asset picker and uploads

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

Preview Admin must not mutate production Assets, production Asset Questions, production Question Prompts, production Cases, or production stimulus relationships. No reusable-image mutation endpoint is exposed under Preview Admin, and database triggers reject Preview-owned Assets or Prompts as reusable Asset Question backing content.

Existing Preview-safe Case/image behavior remains unchanged.

## 13. Stimulus-specific coverage

Reusable Image Questions explicitly opted into the selected stimulus are stimulus-specific candidates because the resolver attaches the selected `stimulusGroupId`/`stimulusOptionId` context to them.

They therefore participate in learner `Automatic`, `All`, and `Fixed` selection through the existing final eligible pool and count toward configured coverage when selected for that group. They are not artificially forced into every Review unless existing coverage rules require enough stimulus-specific questions.

Auto-created one-option groups retain the ordinary no-guarantee baseline unless an author later configures coverage.

## 14. Asset metadata versus Case metadata

Global reusable Asset data/content includes administrator filename/name, alt text, source label/URL, licence, Collection, active state, immutable storage identity, and Reusable Image Questions.

Case relationship metadata includes fixed/alternative membership, display order, Case-specific caption, exact-option contextual questions, group membership/settings/questions, and the explicit decision to opt a stimulus into a canonical Reusable Image Question.

Removing an opt-in from one Case must not archive or delete the global Asset Question.

## 15. Shared editing and Review snapshots

Editing a canonical reusable answer changes future Reviews for every current opt-in. Existing/in-progress Reviews remain unchanged because `review_questions` snapshots Prompt and answer text at Review creation.

Reusable Image Questions add `source_asset_question_id` provenance with `source_type = asset`.

Prompt wording remains globally reusable wording. The Questions Library shared-edit/stale-usage guard includes active Asset Question usage so canonical Prompt edits cannot bypass existing blast-radius confirmation merely because the new scope is involved.

## 16. Import and deferred replacement work

Import Package v1 remains unchanged. Reviewed imports reconstruct ordinary Cases, fixed images, and ordinary questions first; reusable-image authoring is editorial enrichment.

Do not infer existing `stimulus_option_questions` as reusable merely from matching Asset/Prompt/answer data.

Higher-resolution Asset replacement/versioning, `image_identity`, Asset families, replacement history, and automatic transfer of reusable questions to a replacement Asset are deliberately deferred to a separate follow-up.

## 17. Regression expectations

Changes to image/question authoring should protect:

- Case-wide versus contextual exact-image versus reusable exact-Asset mental model;
- explicit opt-in with no automatic cross-Case leakage;
- canonical answer storage outside `question_prompts`;
- clinically useful image display;
- atomic fixed-image conversion + question assignment;
- exact-option precedence over reusable Asset knowledge;
- one Prompt per Review;
- cross-group Prompt conflict protection;
- shared Prompt edit protection;
- stimulus-specific coverage behavior;
- immutable historical Review snapshots;
- removal of one opt-in without affecting others;
- one-option learner behavior equivalent to the previous fixed image;
- production/Preview ownership isolation;
- Import Package v1 compatibility;
- existing scalable Image Library and Collection rules.

## 18. Validation standard

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```
