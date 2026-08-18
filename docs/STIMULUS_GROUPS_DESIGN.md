# Flash-Cards — Optional Stimulus Groups Design

_Status: implemented additive Case/stimulus behavior. The core schema landed in `0002_optional_stimulus_groups.sql`; later Admin/image-management work extended authoring without changing the learner model described here._

_Last updated: 18 August 2026_

## Core principle

> **Stimulus grouping is an optional behavioral layer that emerges from ordinary Case content. It must not become a prerequisite for importing, creating, or studying a Case.**

The existing Case / Asset / Question model remains fundamental.

## 1. Why stimulus groups exist

Some teaching Cases have one stable clinical context but several interchangeable examples of the same stimulus type.

Example:

```text
Case: Hypercalcaemia

Alternative ECGs
- ECG A — shortened QTc
- ECG B — shortened QTc + another finding
- ECG C — another shortened-QTc tracing
```

The learner should normally see one selected ECG for a given Review rather than every alternative together.

A Case may also have several independent stimulus families:

```text
Case: Multiple myeloma with hypercalcaemia

ECG group   — choose one
X-ray group — choose one
```

One Review can therefore select one ECG **and** one X-ray while retaining one coherent Case.

## 2. Backward compatibility is mandatory

Existing ordinary Cases work without stimulus-group metadata:

```text
Case
├── vignette
├── zero or more fixed Case Assets
└── contextual / reusable questions
```

All active ungrouped `case_assets` remain fixed stimuli and are shown in configured order.

Stimulus groups are progressive enrichment. An imported Case does not need to be authored with alternatives before it is useful.

Recommended progression:

1. import/enter the Case normally;
2. keep current images fixed and questions contextual;
3. when several images are genuinely interchangeable, convert/add them as alternatives;
4. add set-wide or exact-option questions only when real educational differences require them.

## 3. Assets remain globally reusable

A stimulus group does not turn an Asset into a Case-owned object.

The same Asset may be:

- fixed in one Case;
- an alternative option in another Case;
- reused in several unrelated Cases.

The Asset itself does not own the diagnosis, Topic, Tags, question set, or group meaning.

Conceptually:

```text
Case
├── fixed Case Asset
├── stimulus group: ECG
│   ├── option A -> Asset A
│   ├── option B -> Asset B
│   └── option C -> Asset C
└── stimulus group: X-ray
    ├── option A -> Asset D
    └── option B -> Asset E
```

## 4. Current selection rule

Each active stimulus group selects **exactly one active option** when a Review is created.

A Case may contain zero, one, or several independent active groups.

Selection is frozen into `review_assets`; refreshing/revisiting an existing Review must not rerandomize alternatives.

Values greater than one option per group remain deferred unless real content demonstrates a need.

## 5. Fixed stimuli and selected alternatives coexist

A Review may contain both:

- every active fixed Case Asset; and
- one selected option from every active stimulus group.

Example:

```text
Case
Fixed: laboratory chart
ECG group: select ECG B
X-ray group: select skull X-ray
```

All selected/fixed stimuli are snapshotted in learner order with the relevant group/option provenance.

## 6. Question context remains layered

Stimulus groups extend the existing contextual-answer model rather than creating a second question system.

Current question sources include:

```text
exact stimulus-option question
stimulus-group question
Case question
exact Study Topic question
Tag-shared Question
eligible inheritable ancestor Topic question
```

For duplicate Prompt wording, current precedence is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate set is deduplicated by `question_prompt_id`.

`question_prompts` continues to store wording only; contextual relationships supply the answer that is correct at each level.

## 7. Group-level questions

Use a group-level Question when the prompt and answer remain valid for every option in that alternative set.

Example:

```text
Group: Hypercalcaemia ECG alternatives

Prompt:
What QT interval abnormality is demonstrated?

Answer:
Shortened QTc.
```

If any active option in that group is selected, the group-level Question is eligible.

This avoids duplicating the same relationship across every option.

## 8. Option-specific questions and overrides

Use an exact-option relationship when the selected image changes:

- whether the Question is relevant; or
- what the correct answer is.

Example:

```text
Prompt: Describe this ECG.

ECG A answer:
Sinus rhythm with shortened QTc.

ECG B answer:
Sinus rhythm with shortened QTc and right bundle branch block.
```

ECG B may also have an extra Question that never appears with ECG A.

Exact-option teaching belongs to `stimulus_group_options` context, not to the global Asset.

## 9. Questions must not attach globally to Assets

Do not model:

```text
Asset -> questions
```

The same media can be reused with different educational intent.

An exact-image Question is approximately scoped to:

```text
Case + stimulus group + option + Asset
```

This prevents unrelated Case contexts from inheriting each other's questions.

## 10. Current question-count modes

Case-level selection is already flexible:

```text
Automatic
All
Fixed N
```

- **Automatic** uses the normal target/cap behavior plus configured stimulus-specific coverage.
- **All** includes every deduplicated eligible Question.
- **Fixed** respects the configured count.

Do not force one Question from every context merely for variety.

Shared/Topic questions join the same final candidate pool; their presence does not bypass Fixed limits.

## 11. Stimulus-specific coverage

A Case can require a minimum amount of selected-stimulus-specific questioning where educationally necessary.

Coverage exists to avoid showing a randomized image without meaningfully testing it.

Coverage validation must be preserved by authoring operations that can change available stimulus-specific Questions/options, including:

- adding/removing/deactivating options;
- fixed ↔ alternative conversion;
- option movement between sets;
- question changes;
- changes to compatible fixed Case question-count settings.

Do not make coverage a mandatory default for every simple Case.

## 12. Multi-Topic routing interaction

A Case may have a primary/default Topic plus Additional Study Topics.

The actual entry route becomes the Review's Study Topic. Stimulus selection remains independent of which Topic is the administrative default.

Important validity rule:

> An attached Study Topic is valid only if every valid random stimulus configuration remains a legitimate example of that Topic.

If only one alternative image demonstrates a finding, keep that finding exact-option-specific rather than attaching it as a Case-level Study Topic.

## 13. Review snapshot requirements

Review creation freezes:

- fixed Asset selections;
- selected group option for every active group;
- storage-key/caption/alt-text snapshots;
- group/option provenance;
- resolved Question Prompt/answer/order snapshots;
- contextual source provenance.

Later edits, option movement, Collection changes, or Tag curation do not rewrite historical Reviews.

## 14. Admin authoring behavior

Routine Case authoring remains simple:

```text
attach fixed images
→ optionally create/use alternative sets
→ add alternatives from bounded Asset picker/upload
→ author set-wide/exact-option Questions only when needed
```

Advanced controls include activation/order, coverage, multiple independent groups, and exact-option questions.

Image Management V2 adds an explicit identity-preserving **same-Case option Move** between alternative sets. It preserves the option ID, Asset, Case-specific caption, active state, and exact-option Questions. Set-wide Questions remain with their original group.

Cross-Case moves are not inferred.

## 15. Image Collections remain separate

Image Collections introduced by `0007_image_collections.sql` organize the global Admin Image Library only.

Collection membership does not affect:

- group membership;
- fixed/alternative stimulus semantics;
- learner selection;
- Topics/Tags;
- Questions;
- Review snapshots.

Do not use Collections as stimulus groups.

## 16. Import relationship

Import Package v1 does not require stimulus-group data as a prerequisite for useful content.

The first ECG corpus was successfully ingested using progressive enrichment. The 66-note source is now fully represented in production; additional grouping can be added during curation where real interchangeable examples exist.

## 17. Non-goals

Current stimulus-group behavior deliberately does not add:

- selection of multiple options from one group in one Review;
- global Asset-owned Questions;
- automatic conversion of Case Questions into exact-option Questions;
- stimulus-option → Topic learner routing;
- global media folders encoded as stimulus groups;
- automatic semantic inference from image content.

Add these only if real teaching content creates a concrete requirement.

## 18. Core invariant summary

```text
ordinary fixed Case Assets continue to work
+ each active alternative group selects exactly one active option
+ selections freeze at Review creation
+ exact-option context overrides group/Case/reusable context
+ question-count/coverage rules operate on the resolved deduplicated pool
+ authoring/library operations must preserve learner semantics
```
