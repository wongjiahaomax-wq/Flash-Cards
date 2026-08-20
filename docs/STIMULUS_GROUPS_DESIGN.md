# Flash-Cards — Optional Stimulus Groups Design

_Status: implemented additive Case/stimulus behavior on current `main`. The core schema landed in `0002_optional_stimulus_groups.sql`; later authoring work added exact-image scope, Reusable Image Questions, and identity-preserving media replacement without changing the one-selected-option-per-group learner model._

_Last updated: 20 August 2026_

## Core principle

> **Stimulus grouping is an optional behavioral layer that emerges from ordinary Case content. It must not become a prerequisite for importing, creating, or studying a Case.**

The Case / Asset / Question model remains fundamental. Stimulus groups provide exact selected-stimulus context when a Case needs interchangeable examples or image-specific teaching.

## 1. Why stimulus groups exist

Some teaching Cases have one stable clinical context but several interchangeable examples of the same stimulus type.

```text
Case: Hypercalcaemia

Alternative ECGs
- ECG A — shortened QTc
- ECG B — shortened QTc + another finding
- ECG C — another shortened-QTc tracing
```

The learner normally sees one selected ECG for a given Review rather than every alternative together.

A Case may also have several independent stimulus families:

```text
Case: Multiple myeloma with hypercalcaemia

ECG group   — choose one
X-ray group — choose one
```

One Review can therefore select one ECG and one X-ray while retaining one coherent Case.

## 2. Backward compatibility is mandatory

Existing ordinary Cases continue to work without stimulus-group metadata:

```text
Case
├── vignette
├── zero or more fixed Case Assets
└── contextual / reusable questions
```

All active ungrouped `case_assets` remain fixed stimuli and are shown in configured order.

Stimulus groups remain progressive enrichment. A reviewed import does not need to anticipate every future alternative or exact-image question.

Recommended progression:

1. import/enter the Case normally;
2. keep current images fixed and questions Case-wide when that is semantically correct;
3. when several images are genuinely interchangeable, create/use an alternative set;
4. when a question depends on one exact image, use the author-facing specific-image scope;
5. when knowledge is intrinsically true of the exact Asset wherever deliberately reused, curate it as a Reusable Image Question.

## 3. Assets remain globally reusable, but exact-Asset knowledge now exists

A stimulus group does not turn an Asset into a Case-owned object.

The same Asset may be:

- fixed in one Case;
- an alternative option in another Case;
- reused in several unrelated Cases.

The Asset itself still does not own the diagnosis, Topic, Tags, Case meaning, or alternative-group meaning.

However current `main` also supports **Reusable Image Questions**: canonical Prompt/answer knowledge that is intrinsically true of one exact Asset. These are stored in `asset_questions` and are separate from Case-specific exact-option questions.

Critically:

```text
same Asset reused elsewhere
≠ automatically reuse its Asset Questions
```

Every exact Case/stimulus usage must explicitly opt in through `stimulus_option_asset_questions`.

## 4. Current selection rule

Each active stimulus group selects **exactly one active option** when a Review is created.

A Case may contain zero, one, or several independent active groups.

Selection is frozen into `review_assets`; refreshing or revisiting an existing Review must not rerandomize alternatives.

Values greater than one selected option per group remain deferred unless real content demonstrates a need.

## 5. Fixed stimuli and selected alternatives coexist

A Review may contain both:

- every active fixed Case Asset; and
- one selected option from every active stimulus group.

```text
Case
Fixed: laboratory chart
ECG group: select ECG B
X-ray group: select skull X-ray
```

All selected/fixed stimuli are snapshotted in learner order with the relevant group/option provenance.

## 6. Question context remains layered

Current question sources include:

```text
Case-specific exact stimulus-option question
explicitly reused Asset Question for the selected option
stimulus-group question
Case question
exact Study Topic question
Tag-shared Question
eligible inheritable ancestor Topic question
```

For duplicate Prompt IDs, current precedence is:

```text
Case-specific exact stimulus option question
> explicitly reused Asset Question for selected option
> stimulus group question
> Case question
> exact Study Topic question
> Tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate set is deduplicated by `question_prompt_id`.

`question_prompts` continues to store wording only. Answers live on the contextual/reusable relationship that makes them correct.

## 7. Group-level questions

Use a group-level Question when the prompt and answer remain valid for every option in that alternative set.

```text
Group: Hypercalcaemia ECG alternatives

Prompt:
What QT interval abnormality is demonstrated?

Answer:
Shortened QTc.
```

If any active option in that group is selected, the group-level Question is eligible.

This avoids duplicating the same relationship across every option.

## 8. Case-specific exact-image questions

Use an exact-option relationship when the selected image changes either relevance or the correct contextual answer.

```text
Prompt: Describe this ECG.

ECG A answer:
Sinus rhythm with shortened QTc.

ECG B answer:
Sinus rhythm with shortened QTc and right bundle branch block.
```

These questions belong to the Case's stable `stimulus_group_option` identity. Reusing the same global Asset in another Case does not carry the Case-specific question with it.

## 9. Reusable Image Questions are a distinct exact-Asset layer

Use a Reusable Image Question only when the Prompt and canonical answer are intrinsically true of the exact Asset itself.

```text
Asset ECG-123
Prompt: What does this ECG show?
Answer: Widespread concave ST elevation with PR depression.
```

The canonical relationship is:

```text
assets
└── asset_questions
    └── question_prompts
```

A Case/stimulus uses that canonical question only through:

```text
stimulus_group_option
└── stimulus_option_asset_questions
    └── asset_question
```

This preserves the distinction:

```text
Case-specific exact-image teaching
= stimulus_option_questions

Reusable exact-Asset teaching
= asset_questions + explicit stimulus opt-in
```

Do not infer one from the other automatically.

## 10. Transparent fixed-image conversion

There is no parallel fixed-image-question schema.

When an author assigns a Case-specific exact-image question or explicitly reuses an Asset Question on a currently fixed image, the application may transparently perform one semantic mutation:

```text
fixed case_assets relationship
→ one-option active stimulus group
→ option with the same Asset and Case caption
→ requested exact-option question or reusable-image opt-in
```

Preflight validation must occur before destructive relationship changes. If assignment fails, the image must not remain partially converted.

With one active option and `selection_count = 1`, learner-visible behavior remains equivalent to the prior fixed image.

## 11. Current question-count modes

Case-level selection remains:

```text
Automatic
All
Fixed N
```

- **Automatic** uses normal target/cap behavior plus configured stimulus-specific coverage.
- **All** includes every deduplicated eligible Question.
- **Fixed** respects the configured count.

Shared, Topic, and explicitly opted-in Asset Questions join the same final eligible pool. Their presence does not bypass Fixed limits.

## 12. Stimulus-specific coverage

Coverage exists to avoid showing a randomized stimulus without meaningfully testing it when the author explicitly requires that behavior.

Both Case-specific exact-option questions and explicitly reused Asset Questions carry selected stimulus-group/option context and therefore count as stimulus-specific candidates under the existing coverage model.

Coverage validation must be preserved by operations that can change available stimulus-specific content, including:

- adding/removing/deactivating options;
- explicit fixed/alternative conversions;
- transparent fixed-image conversion for image-specific question scope;
- option movement between sets;
- group/option question changes;
- reusable-image opt-in removal/addition/reactivation;
- changes to compatible Fixed question-count settings.

Do not make coverage mandatory for every simple Case or every auto-created one-option group.

## 13. Cross-Stimulus-Group Prompt invariant

The same Question Prompt cannot independently become stimulus-specific in multiple active groups in one Case when those groups can both be selected in the same Review.

The invariant spans:

```text
stimulus_group_questions
stimulus_option_questions
stimulus_option_asset_questions -> asset_questions.question_prompt_id
```

Within one selected group, precedence can resolve a more specific source over a broader source. Across independently selectable groups, duplicate stimulus-specific Prompt meaning would be ambiguous and is rejected.

Application validation is backed by D1 triggers from `0009_reusable_image_questions.sql`; `0010_reusable_image_reactivation_guard.sql` also prevents reactivating a dormant Asset Question into an invalid cross-group configuration.

## 14. Multi-Topic routing interaction

A Case may have a primary/default Topic plus Additional Study Topics.

The actual entry route becomes the Review's Study Topic. Stimulus selection remains independent of which Topic is the administrative default.

> An attached Study Topic is valid only if every valid random stimulus configuration remains a legitimate example of that Topic.

If only one alternative image demonstrates a finding, keep that finding stimulus-specific rather than attaching it as a Case-level Study Topic.

A Reusable Image Question does not change this routing rule: it is selected-stimulus teaching, not a new Study Topic relationship.

## 15. Review snapshot requirements

Review creation freezes:

- fixed Asset selections;
- selected group option for every active group;
- storage-key/caption/alt-text snapshots;
- group/option provenance;
- resolved Question Prompt/answer/order snapshots;
- contextual/reusable source provenance, including `source_asset_question_id` where applicable.

Later edits, option movement, Asset replacement, Collection changes, Tag curation, or canonical reusable-answer edits do not rewrite historical Reviews.

`review_assets.storage_key_snapshot` remains the historical media authority even when an Asset is later superseded.

## 16. Admin authoring behavior

Routine author-facing question scope is now:

```text
This whole Case
A specific image or stimulus
```

Beside each image, the UI distinguishes:

```text
Case-specific Image Questions
Reusable Image Questions
```

The collapsed image card reports reusable counts as total/used/available. `used in this Case` means an explicit opt-in for that exact stimulus usage; reusing the Asset itself does not imply use of its canonical questions.

Image Management V2 also supports identity-preserving **same-Case option Move** between alternative sets. It preserves option ID, Asset, caption, active state, Case-specific exact-option Questions, and reusable-image opt-ins, subject to the same cross-group/coverage invariants. Set-wide Questions remain with their original group.

Cross-Case option moves are not inferred.

## 17. Higher-resolution Asset replacement interaction

Higher-resolution replacement is only for a better-quality copy of the same underlying image.

For stimulus groups, current production `stimulus_group_options.asset_id` moves from old Asset A to replacement B while preserving the option ID. Therefore Case-specific `stimulus_option_questions` remain attached to the same contextual identity.

Reusable Asset Questions are not retargeted in place. They are cloned from A to B, and current production opt-ins on preserved options are remapped to the corresponding B questions. Historical Review provenance remains attached to A's old Asset Question IDs.

A different clinical image showing the same condition remains a separate Asset/option; do not use replacement to collapse distinct examples.

## 18. Image Collections remain separate

Image Collections organize the global Admin Image Library only.

Collection membership does not affect group membership, fixed/alternative semantics, learner selection, Topics/Tags, Questions, Review snapshots, or explicit reusable-image opt-ins.

Do not use Collections as stimulus groups.

## 19. Import relationship

Import Package v1 does not require stimulus-group data as a prerequisite for useful content.

The first ECG corpus was successfully ingested using progressive enrichment. Additional grouping, exact-image scope, Reusable Image Questions, and media-quality replacement are later editorial operations and do not extend the current import manifest.

## 20. Non-goals

Current stimulus-group behavior deliberately does not add:

- selection of multiple options from one group in one Review;
- automatic promotion of Case-specific exact-image questions into Reusable Image Questions;
- automatic reusable-question opt-in merely because an Asset is reused;
- stimulus-option → Topic learner routing;
- global media folders encoded as stimulus groups;
- automatic semantic inference from image content;
- arbitrary different-image substitution through the higher-resolution replacement workflow.

Add broader behavior only when real teaching content creates a concrete requirement.

## 21. Core invariant summary

```text
ordinary fixed Case Assets continue to work
+ each active alternative group selects exactly one active option
+ selections freeze at Review creation
+ Case-specific exact-option teaching and reusable exact-Asset teaching remain distinct
+ reusable Asset Questions require explicit per-stimulus opt-in
+ exact-option context overrides explicitly reused Asset knowledge for duplicate Prompts
+ the same Prompt cannot be independently stimulus-specific across selectable groups
+ question-count/coverage rules operate on the resolved deduplicated pool
+ transparent fixed-image conversion preserves learner-visible behavior
+ identity-preserving option Move/replacement preserves contextual question identity
+ historical Review snapshots/provenance remain immutable
```