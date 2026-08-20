# Flash-Cards — Authoring Model

_Last updated: 20 August 2026_

This document describes the preferred administrator mental model for entering and refining teaching content. Product language takes precedence over database-table names in normal authoring UI.

## 1. Authoring hierarchy

```text
Topic
└── Case
    ├── fixed images
    ├── alternative image sets
    └── contextual questions
```

Cross-cutting concepts remain distinct:

```text
Tag                     = cross-cutting clinical metadata
Shared Question         = reusable knowledge eligible by one Case Tag
Reusable Image Question = reusable knowledge intrinsic to one exact Asset
Collection              = Image Library organisation only
```

Do not collapse these into one taxonomy.

## 2. Topic = learner study route

A Topic is the Admin-facing name for the existing `concepts` model. A Case has exactly one primary/default Topic and zero or more Additional Study Topics. The same stored Case may therefore be encountered through more than one valid Study Topic.

Attach an Additional Study Topic only when every valid random configuration of the Case remains a legitimate example of that Topic.

## 3. Case = one coherent clinical presentation

A Case is one coherent scenario/study unit. Different stems, causes, findings, or educational intent generally remain separate Cases even when they share Topics or Tags.

Use Case questions when the answer depends on that exact presentation.

## 4. Images: fixed versus alternatives

Use fixed Case images when all of them should appear whenever the Case is reviewed. Fixed images are ordered and may have Case-specific captions.

Use an alternative image set when the presentation and educational intent remain the same but the example stimulus can vary. One active option is selected per active set when a Review starts and is frozen for that Review.

A Case may contain several independent sets, for example one ECG set and one X-ray set.

### Same image at better quality versus a different image

Asset identity remains clinically meaningful. Use the production Image detail action **Replace with higher-resolution version** only for a better-quality copy of the **same underlying image**.

```text
same image + higher quality/resolution
→ replacement workflow

different image + same condition
→ new independent Asset
```

Replacement creates a new Asset/R2 object for current authoring while retaining the old Asset/media for historical Reviews. It is not a general way to substitute another ECG, X-ray, photograph or diagram showing the same diagnosis.

## 5. Question scope is an author-facing choice

The normal question is:

> **Where should this question apply?**

The principal scopes are:

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

### This whole Case

Use Case scope when the question remains relevant and correct regardless of which stimulus is selected. Only this scope can normally expose Topic reuse.

### Only in this Case

Use the existing exact-option scope when the answer depends on the exact selected image **and this Case context**.

Example:

```text
What is the most likely diagnosis in this patient?
→ Acute pericarditis.
```

The answer belongs to the Case/stimulus relationship. Reusing the global Asset elsewhere does not carry this question with it.

### Reusable with this image

Use a Reusable Image Question when the wording and answer are intrinsically true of the exact image Asset itself.

Example:

```text
Asset: ECG-123

What does this ECG show?
→ Widespread concave ST elevation with PR depression.
```

The canonical question belongs to the global Asset. A Case/stimulus using the same Asset receives it **only after an explicit opt-in**.

> Reusing an Asset in another Case does not automatically carry its reusable Image Questions. The author must opt that Case/stimulus usage in.

This prevents accidental cross-Case leakage while still allowing one canonical Prompt/answer to serve several deliberate uses.

Higher-resolution replacement is the one narrow operation where current reusable content is deliberately carried forward: the old Asset Questions remain historically attached to the old Asset, while new Asset Question rows are cloned onto the replacement and current production opt-ins are remapped to those clones. Prompt identities and canonical answers are preserved; historical Review provenance is not rewritten.

## 6. Fixed-image conversion is an implementation detail

Do not create a parallel fixed-image-question system.

When an author assigns an exact-option question or explicitly opts a fixed image into a Reusable Image Question, the application may transparently convert:

```text
fixed case_assets relationship
→ one-option stimulus group
→ image-specific question relationship
```

The operation preserves Asset identity, Case-specific caption, and learner-visible behavior. With one active option and `selection_count = 1`, the image still appears whenever the Case is reviewed.

Preflight validation must occur before destructive relationship changes and the semantic mutation must be atomic.

## 7. Group-level questions are an advanced middle scope

Use a Stimulus Group Question when the same answer applies to every option in one alternative set but is not broad enough for the whole Case or a reusable Topic/Shared scope.

Do not populate every possible layer merely for conceptual completeness.

## 8. Question Prompt wording is not the answer

`question_prompts` stores reusable wording only.

Answers belong to contextual relationships:

```text
Topic Question
Case Question
Stimulus Group Question
Exact-option Question
Reusable Image Question
Shared Question
```

A Reusable Image Question stores its canonical answer on `asset_questions`, never on `question_prompts`.

## 9. Author at the broadest valid scope

Attach a question at the broadest scope where its answer and educational meaning remain reliably correct.

| Example | Preferred scope |
|---|---|
| How is severe symptomatic hypocalcaemia treated? | Topic |
| What is the likely cause in this patient? | Case |
| What applies to every image in this alternative set? | Stimulus Group |
| What does this exact ECG intrinsically show wherever it is reused? | Reusable Image Question |
| What is the diagnosis in this patient given this ECG? | Exact image, Only in this Case |
| What reusable knowledge applies to every Case carrying one clinical Tag? | Shared Question |

Starting conservatively at Case/exact-option scope and promoting later is acceptable. Do not infer reusability automatically from matching text or answers.

## 10. Tags and Shared Questions

Tags remain flat cross-cutting metadata and do not replace Topics.

A Shared Question is reusable medical knowledge whose answer remains valid across Cases carrying one defined Reuse Scope Tag. Descriptive Tags do not create learner eligibility.

Reusable Image Questions are different: their reuse key is exact Asset identity, not a clinical Tag.

## 11. Current learner precedence

When the same Question Prompt appears from more than one source, the resolver uses:

```text
Case-specific exact-image question
> Reusable Image Question explicitly selected for that stimulus
> Stimulus Group question
> Case question
> exact Study Topic question
> Tag-shared question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final pool is deduplicated by `question_prompt_id`.

This means the most specific Case/stimulus context wins while broad reusable knowledge remains available where no narrower override exists.

The same Prompt may not be configured ambiguously across independently selectable stimulus groups in one Case.

Higher-resolution replacement does not change this precedence. It preserves existing Stimulus Option IDs so exact-image Case questions remain attached to the same contextual identity, and remaps current reusable opt-ins to cloned questions for the new Asset.

## 12. Question-count and coverage modes

Authors can configure Automatic, All, or Fixed question selection.

Reusable Image Questions enter the ordinary final eligible pool only when their selected stimulus explicitly opted in. They carry stimulus-group context and therefore count as stimulus-specific for existing coverage semantics.

Do not force one reusable image question into every Review unless the existing Case/group coverage configuration requires enough stimulus-specific questions.

## 13. Editing and removal semantics

A Reusable Image Question is shared canonical content.

Editing its canonical answer affects all current opt-ins for **future Reviews**. Existing and in-progress Reviews remain unchanged because Prompt/answer text is snapshotted at Review creation.

Prompt wording remains shared wording and is protected by the existing Questions Library blast-radius/stale-edit workflow. Asset Question usages are included in those usage counts.

Distinguish:

```text
Remove from this Case
→ delete only this stimulus option's opt-in

Archive reusable question
→ deactivate the global Asset Question
```

Removing one Case opt-in must not affect other Cases.

## 14. Production versus Preview

Reusable Image Questions are production-global Asset teaching content in the current implementation.

Production Admin may create/edit/archive them and explicitly opt production Case/stimulus usages in or out.

Preview Admin must not mutate production Assets, Asset Questions, Question Prompts, Cases, or stimulus relationships. Reusable-image mutation controls/endpoints are production-only and database triggers reject Preview-owned Assets or Prompts as reusable Asset Question backing content.

Higher-resolution replacement is also production-only. Preview-owned Assets cannot be replaced by this workflow, and Preview-owned Case/stimulus relationships are not silently rewritten.

## 15. Image Collection = organisation, not teaching meaning

Collections remain Admin library organisation only. Changing a Collection does not change Topics, Tags, Case relationships, questions, Reviews, learner routing, or R2 identity.

Reusable Image Questions are teaching content, not Collection metadata.

A higher-resolution replacement inherits the old Asset's Collection as ordinary semantic/organisational metadata; the operation still creates a new immutable storage identity.

## 16. Import and progressive enrichment

Reviewed slide/Anki imports should initially reconstruct ordinary Topic/Case/Asset/Case-question content faithfully. Import Package v1 remains unchanged.

Reusable-image authoring is later editorial enrichment. Existing exact-option questions are not migrated or promoted automatically merely because they use the same Asset or appear semantically similar.

Higher-resolution replacement is likewise a post-import Admin authoring operation; replacement/version fields are not added to Import Package v1.

## 17. Historical Review media

A Review freezes the exact media selected when it starts. `review_assets.storage_key_snapshot` is the historical media authority.

Study image URLs therefore resolve through an authenticated Review-specific route which verifies Review ownership and serves the snapshotted object key even if the original Asset was later superseded/inactivated. The normal current-Asset image route keeps rejecting inactive Assets.

This preserves:

```text
old Review → old image bytes
new Review → current replacement image bytes
```

without reactivating the old Asset or overwriting its R2 object.

## 18. Preferred routine workflow

```text
Topics
→ Case
→ Images
→ contextual Case/image questions
→ Preview
→ later enrichment/reuse where proven
```

When reviewing an image question, ask:

1. Is the answer intrinsically true of this exact Asset wherever it appears? → **Reusable with this image**.
2. Does the answer depend on this clinical Case/stimulus context? → **Only in this Case**.
3. Does it apply to every option in one alternative set? → **Stimulus Group Question**.
4. Does it apply to the whole presentation? → **Case Question**.
5. Is it general reusable knowledge? → **Topic / Shared Question**.

When replacing media, ask separately:

1. Is this literally the same underlying image, only at better quality/resolution? → **Replace with higher-resolution version**.
2. Is it another clinical image, even if it shows the same condition? → **Create/use a separate Asset**.

## 19. Schema boundaries to preserve

Do not add a parallel `topics` table: Topics remain `concepts`.

Do not add Tags or answers to `question_prompts`: Prompts remain wording only.

Do not use Collections as a substitute for Topics, Tags, or stimulus groups.

Do not add a parallel fixed-image-question table. Fixed images may be transparently represented as one-option stimulus groups when image-specific question scope requires it.

Do not infer reusable Image Questions from existing `stimulus_option_questions`.

Do not extend Import Package v1 merely to support editorial enrichment or higher-resolution replacement.

The narrow supersession field `assets.superseded_by_asset_id` records only “Asset A was superseded by Asset B”. Do not infer an Asset family, `image_identity`, generic version table, automatic visual matching, or arbitrary different-image replacement from this contract.
