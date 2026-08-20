# Reusable Image Questions

_Status: implemented and merged on current `main` via PR #58; integrated with PR #59 higher-resolution Asset replacement. Production migration/deployment state must be verified separately from merge state._

_Last updated: 20 August 2026_

## Product scope

A **Reusable Image Question** is canonical teaching knowledge that is intrinsically true of one exact global Asset. It stores reusable Prompt wording through `question_prompts`, while its canonical answer is stored on the Asset Question relationship.

The Case-editor scope choice is:

```text
This whole Case
A specific image or stimulus
```

When an image/stimulus is involved, authors should distinguish:

```text
Case-specific Image Question
= exact image/stimulus teaching that belongs only to this Case context

Reusable Image Question
= canonical teaching that belongs to the exact global Asset
```

Across the full authoring model, the scopes are:

```text
exact reusable Asset
→ Reusable Image Question / Reusable with this image

exact Asset in this particular Case/stimulus context
→ A specific image or stimulus / Case-specific Image Question

every option in one alternative set
→ Stimulus Group Question

whole clinical presentation
→ Case Question

general reusable knowledge
→ Topic / Shared Question
```

Reusing an Asset in another Case does **not** automatically carry its Reusable Image Questions. The author must explicitly opt that Case/stimulus usage in.

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

Current `main` contains the Reusable Image Question migrations:

```text
0009_reusable_image_questions.sql
0010_reusable_image_reactivation_guard.sql
```

Their presence on `main` is a repository/schema fact. Do not infer production application solely from merge status.

## Fixed images

There is no parallel fixed-image-question table. Assigning a Case-specific Image Question or opting a fixed Case image into a Reusable Image Question uses the established identity-preserving conversion:

```text
fixed case_assets relationship
→ one-option stimulus group
→ exact image/stimulus relationship
```

The conversion preserves Asset identity and Case caption. With one active option and `selection_count = 1`, the image continues to appear whenever that Case is reviewed. Preflight validation is completed before the atomic D1 batch removes the fixed relationship.

## Learner resolution

Only reusable Asset Questions explicitly opted into the **selected active stimulus option** are eligible. Eligibility also requires the production Asset Question and Question Prompt to be active and the Asset identity to match.

Prompt precedence is:

```text
Case-specific Image Question for the selected option
> Reusable Image Question explicitly selected for that stimulus
> Stimulus Group Question
> Case Question
> exact Study Topic Question
> Tag-shared Question
> eligible ancestor Topic Questions
```

The final pool remains deduplicated by `question_prompt_id`. Reusable Image Questions carry the selected group's `stimulusGroupId`, so existing stimulus-specific coverage rules apply naturally.

A duplicate Prompt may override within the same selected group according to the precedence above. Independently selectable groups may not create ambiguous duplicate Prompt configurations.

## Review snapshots

When selected, a Reusable Image Question snapshots its Prompt and answer into `review_questions` exactly like other question sources. The provenance row uses:

```text
source_type = asset
source_asset_question_id = <canonical Asset Question>
```

Editing the canonical answer changes future Reviews only. Existing/in-progress Review snapshots are immutable.

## Admin behavior

Production Admin can manage reusable questions from the Image Library Asset detail page and from the exact image's **Manage questions** surface in the Case editor.

Every fixed-image or alternative-option card exposes the compact ownership/count distinction:

```text
Case-specific Image Questions · N

Reusable Image Questions · N
X used in this Case · Y available to reuse
```

If none are currently used:

```text
Reusable Image Questions · 3
3 available to reuse
```

If no active reusable questions exist:

```text
Reusable Image Questions · 0
```

The reusable total counts active `asset_questions` backed by active `question_prompts`. `used in this Case` means an explicit opt-in for that exact stimulus option; `available to reuse` is the remaining active reusable questions for that Asset.

The collapsed card shows counts/status only. Full Prompt/answer content and actions remain inside **Manage questions**.

The management surface keeps three concepts separate:

```text
Case-specific Image Questions
= contextual questions belonging only to this Case + image

Reusable Image Questions used in this Case
= canonical Asset Questions explicitly opted into this exact stimulus

Reusable Image Questions available to reuse
= active canonical Asset Questions not currently opted into this exact stimulus
```

Removing from one Case deletes only the opt-in relationship. Archiving/deactivating the canonical Asset Question is a separate global action.

Prompt wording remains editable through the Questions Library shared-edit path; active Asset Question usages are included in its blast-radius/stale-usage count.

Preview Admin receives no reusable-image mutation endpoint. Database triggers additionally reject Preview-owned Assets or Prompts as Reusable Image Question backing content.

## Higher-resolution Asset replacement

PR #59 is merged on current `main` and defines the one narrow operation where current reusable image content is deliberately carried forward to a new Asset identity.

Use replacement only for:

```text
same underlying image + better quality/resolution
→ higher-resolution replacement

different ECG/X-ray/photo/diagram + same condition
→ separate independent Asset
```

For successful Asset A → Asset B replacement:

1. A's existing `asset_questions` rows remain attached to A for historical provenance.
2. Each Asset Question is cloned onto B with a new Asset Question ID.
3. The clone preserves `question_prompt_id`, canonical `answer_md`, and active/inactive state.
4. Question Prompts are reused rather than duplicated.
5. Current production `stimulus_option_asset_questions` opt-ins are remapped from the old Asset Question IDs to the corresponding B clones.
6. Existing Stimulus Option IDs remain stable, so Case-specific Image Questions remain on the same contextual option identity.
7. Historical `review_questions.source_asset_question_id` rows are never rewritten.

This is intentionally different from mutating the old Asset Question rows in place. Old Reviews must continue to point to the canonical Asset Question relationship that existed when the Review was created.

Current `main` contains `0011_asset_supersession.sql` for the narrow Asset lineage used by replacement. Presence on `main` does not itself prove production migration application or Worker deployment.

See `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` for the complete race, Preview, historical media and R2/D1 failure-safety contract.

## Import Package v1

`flashcards-import-v1` is unchanged. Initial reviewed imports continue to reconstruct ordinary Case questions and image relationships. Reusable-image authoring is later editorial enrichment.

Existing `stimulus_option_questions` are not migrated or inferred as reusable.

## Deferred / non-goals

The merged Reusable Image Question and higher-resolution replacement model does **not** add:

- generic Asset families;
- `image_identity`;
- generic version-history UI;
- automatic visual same-image detection;
- automatic deduplication;
- bulk Asset replacement;
- different-clinical-image substitution through replacement;
- automatic reusable-question opt-in merely because an Asset is reused;
- automatic promotion of existing Case-specific Image Questions;
- Import Package v2.
