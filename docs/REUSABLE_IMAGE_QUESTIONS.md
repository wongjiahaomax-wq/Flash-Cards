# Reusable Image Questions

_Status: implemented on `agent/reusable-image-questions` pending review._

## Product scope

A **Reusable Image Question** is canonical teaching knowledge that is intrinsically true of one exact global Asset. It stores reusable Prompt wording through `question_prompts`, while its canonical answer is stored on the Asset Question relationship.

The author-facing scopes are:

```text
exact reusable Asset
→ Reusable with this image

exact Asset in this particular Case/stimulus context
→ Only in this Case

every option in one alternative set
→ Stimulus Group Question

whole clinical presentation
→ Case Question

general reusable knowledge
→ Topic / Shared Question
```

Reusing an Asset in another Case does **not** automatically carry its reusable Image Questions. The author must explicitly opt that Case/stimulus usage in.

## Data model

```text
assets
└── asset_questions
    ├── question_prompt_id
    ├── answer_md
    └── is_active

stimulus_group_options
└── stimulus_option_asset_questions
    └── asset_question_id
```

`stimulus_option_asset_questions` is the explicit opt-in relationship. The database and application both require the Asset Question's `asset_id` to match the Stimulus Group Option's `asset_id`.

The same `(stimulus_group_option_id, asset_question_id)` pair is unique.

`question_prompts` continues to contain wording only. Reusable-image answers never move onto the Prompt.

## Fixed images

There is no parallel fixed-image-question table. Opting a fixed Case image into a Reusable Image Question uses the established identity-preserving conversion:

```text
fixed case_assets relationship
→ one-option stimulus group
→ explicit reusable-image-question opt-in
```

The conversion preserves Asset identity and Case caption. With one active option and `selection_count = 1`, the image continues to appear whenever that Case is reviewed. Preflight validation is completed before the atomic D1 batch removes the fixed relationship.

## Learner resolution

Only reusable Asset Questions explicitly opted into the **selected active stimulus option** are eligible. Eligibility also requires the production Asset Question and Question Prompt to be active and the Asset identity to match.

Prompt precedence is:

```text
Case-specific exact-image question
> Reusable Image Question explicitly selected for that stimulus
> Stimulus Group question
> Case question
> exact Study Topic question
> Tag-shared question
> eligible ancestor Topic questions
```

The final pool remains deduplicated by `question_prompt_id`. Reusable Image Questions carry the selected group's `stimulusGroupId`, so existing stimulus-specific coverage rules apply naturally.

A duplicate Prompt may override within the same selected group according to the precedence above. Independently selectable groups may not create ambiguous duplicate Prompt configurations.

## Review snapshots

When selected, a reusable Image Question snapshots its Prompt and answer into `review_questions` exactly like other question sources. The provenance row uses:

```text
source_type = asset
source_asset_question_id = <canonical Asset Question>
```

Editing the canonical answer changes future Reviews only. Existing/in-progress Review snapshots are immutable.

## Admin behavior

Production Admin can manage reusable questions from the Image Library Asset detail page. The page shows canonical shared content, usage count, Case/stimulus usages, and explicit actions to reuse or remove the question from a Case.

Removing from one Case deletes only the opt-in relationship. Archiving/deactivating the canonical Asset Question is a separate global action.

Prompt wording remains editable through the Questions Library shared-edit path; reusable Asset Question usages are included in its blast-radius/stale-usage count.

Preview Admin receives no reusable-image mutation endpoint. Database triggers additionally reject Preview-owned Assets or Prompts as reusable Asset Question backing content.

## Import Package v1

`flashcards-import-v1` is unchanged. Initial reviewed imports continue to reconstruct ordinary Case questions and image relationships. Reusable-image authoring is later editorial enrichment.

Existing `stimulus_option_questions` are not migrated or inferred as reusable.

## Deferred work

Higher-resolution Asset replacement/versioning is deliberately deferred. This implementation does not add `image_identity`, Asset families, replacement history, automatic transfer to a replacement Asset, or automatic reusable-question opt-in.
