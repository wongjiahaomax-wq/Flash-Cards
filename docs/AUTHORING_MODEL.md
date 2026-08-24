# Flash-Cards — Authoring Model

_Last updated: 25 August 2026_

This document describes the preferred administrator mental model for entering and refining teaching content. Product language takes precedence over database-table names in normal authoring UI.

## 1. Authoring hierarchy

```text
System
└── Topic hierarchy
    └── Case
        ├── Case Tags
        ├── fixed images
        ├── alternative image sets
        └── contextual questions
```

Cross-cutting concepts remain distinct:

```text
Primary Topic             = canonical teaching identity of one Case
Tag                       = cross-cutting clinical metadata / contextual discovery
Shared Question           = reusable knowledge eligible by one Case Tag
Reusable Image Question   = reusable knowledge intrinsic to one exact Asset
Collection                = Image Library organisation only
System↔Tag exposure       = learner-navigation curation, not Case ownership
```

Do not collapse these into one taxonomy.

## 2. Primary Topic and Case Tags

A current Case has exactly one canonical **Primary Topic**.

The Primary Topic answers:

> **What does this Case fundamentally teach?**

It controls the Case's direct reusable Topic-question context.

Use **Case Tags** for clinically meaningful alternate/cross-cutting concepts:

> **What else does this Case demonstrate or how should it be discoverable contextually?**

When a System explicitly exposes one of those Tags, the learner may reach the Case through that Tag without changing the Case's canonical Topic-question context.

Additional Study Topics are retired. Do not create a secondary Case↔Topic relationship to make a Case appear elsewhere. Changing Primary Topic replaces the canonical current relationship rather than keeping the old Topic as an alternate route.

Historical secondary Topic rows remain legacy compatibility data, and historical Reviews remain immutable historical truth. Neither requires a cleanup migration or an ordinary-authoring rewrite.

## 3. Case = one coherent clinical presentation

A Case is one coherent scenario/study unit. Different stems, causes, findings, or educational intent generally remain separate Cases even when they share Topics or Tags.

Use Case questions when the answer depends on that exact presentation.

## 4. Images: fixed versus alternatives

Use fixed Case images when all of them should appear whenever the Case is reviewed. Fixed images are ordered and may have Case-specific captions.

Use an alternative image set when the presentation and educational intent remain the same but the example stimulus can vary. One active option is selected per active set when a Review starts and is frozen for that Review.

A Case may contain several independent sets, for example one ECG set and one X-ray set.

An alternative option has three separate lifecycle states: active/current, inactive but still present in the Case, and removed from the Case. **Deactivate** stops future learner selection while keeping the option visible for authoring and allowing Reactivate. **Remove from Case** hides the relationship from the normal Case editor and future selection, but retains the reusable Asset, the option identity, and its historical question/provenance relationships. Asset activation is independent; removing a Case relationship never deletes the Asset or its R2 object.

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

The normal Case-editor scope choice is:

```text
This whole Case
A specific image or stimulus
```

Once an image/stimulus is involved, the image card keeps ownership explicit with two separate categories:

```text
Case-specific Image Questions
= exact image/stimulus questions belonging only to this Case context

Reusable Image Questions
= canonical questions belonging to the exact global Asset
```

Across the full authoring model, the principal scopes are:

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

### This whole Case

Use Case scope when the question remains relevant and correct regardless of which stimulus is selected. Only this scope can normally expose Topic reuse.

### A specific image or stimulus — Case-specific Image Question

Use the existing exact-option scope when the answer depends on the exact selected image **and this Case context**.

Example:

```text
What is the most likely diagnosis in this patient?
→ Acute pericarditis.
```

The answer belongs to the Case/stimulus relationship. Reusing the global Asset elsewhere does not carry this question with it.

### Reusable Image Question — Reusable with this image

Use a Reusable Image Question when the wording and answer are intrinsically true of the exact image Asset itself.

Example:

```text
Asset: ECG-123

What does this ECG show?
→ Widespread concave ST elevation with PR depression.
```

The canonical question belongs to the global Asset. A Case/stimulus using the same Asset receives it **only after an explicit opt-in**.

> Reusing an Asset in another Case does not automatically carry its Reusable Image Questions. The author must opt that Case/stimulus usage in.

This prevents accidental cross-Case leakage while still allowing one canonical Prompt/answer to serve several deliberate uses.

Higher-resolution replacement is the one narrow operation where current reusable content is deliberately carried forward: the old Asset Questions remain historically attached to the old Asset, while new Asset Question rows are cloned onto the replacement and current production opt-ins are remapped to those clones. Prompt identities and canonical answers are preserved; historical Review provenance is not rewritten.

## 6. Fixed-image conversion is an implementation detail

Do not create a parallel fixed-image-question system.

When an author assigns a Case-specific Image Question or explicitly opts a fixed image into a Reusable Image Question, the application may transparently convert:

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
Case-specific Image Question
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
| What is the diagnosis in this patient given this ECG? | A specific image or stimulus — Case-specific Image Question |
| What reusable knowledge applies to every Case carrying one clinical Tag? | Shared Question |

Starting conservatively at Case/Case-specific Image Question scope and promoting later is acceptable. Do not infer reusability automatically from matching text or answers.

## 10. Tags, Systems, and Shared Questions

Tags remain flat cross-cutting metadata and do not replace the canonical Topic.

A Shared Question is reusable medical knowledge whose answer remains valid across Cases carrying one defined Reuse Scope Tag. Descriptive Tags do not create learner eligibility.

System↔Tag exposure is a separate global learner-navigation decision. Adding a Case Tag does not automatically expose that Tag in any System, and exposing a Tag in a System does not automatically attach it to a Case.

Reusable Image Questions are different again: their reuse key is exact Asset identity, not a clinical Tag.

## 11. Current learner precedence

When the same Question Prompt appears from more than one source, the resolver uses:

```text
Case-specific Image Question for the selected option
> Reusable Image Question explicitly selected for that stimulus
> Stimulus Group Question
> Case Question
> exact canonical Study Topic Question
> Tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final pool is deduplicated by `question_prompt_id`.

This means the most specific Case/stimulus context wins while broad reusable knowledge remains available where no narrower override exists.

The same Prompt may not be configured ambiguously across independently selectable stimulus groups in one Case.

Higher-resolution replacement does not change this precedence. It preserves existing Stimulus Option IDs so Case-specific Image Questions remain attached to the same contextual identity, and remaps current reusable opt-ins to cloned questions for the new Asset.

## 12. Question-count and coverage modes

Authors can configure Automatic, All, or Fixed question selection.

Reusable Image Questions enter the ordinary final eligible pool only when their selected stimulus explicitly opted in. They carry stimulus-group context and therefore count as stimulus-specific for existing coverage semantics.

Original/Core versus Expanded Learning controls which source families are eligible. This is separate from Automatic/All/Fixed count selection.

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

Production Admin may author the Case's Primary Topic and Case Tags, plus production-global reusable content.

Preview Admin shares global production Topics and Tags read-only. A Preview Case clone copies the canonical Primary Topic and Case Tags, but Preview does not gain global Tag/System mutation authority. Preview may replace its canonical Topic; Additional Study Topic mutation is fail-closed.

Preview Admin must not mutate production Assets, Asset Questions, Question Prompts, Cases, or stimulus relationships. Reusable-image mutation controls/endpoints are production-only and database triggers reject Preview-owned Assets or Prompts as reusable Asset Question backing content.

Higher-resolution replacement is also production-only. Preview-owned Assets cannot be replaced by this workflow, and Preview-owned Case/stimulus relationships are not silently rewritten.

## 15. Image Collection = organisation, not teaching meaning

Collections remain Admin library organisation only. Changing a Collection does not change Topics, Tags, Case relationships, questions, Reviews, learner routing, or R2 identity.

Reusable Image Questions are teaching content, not Collection metadata.

A higher-resolution replacement inherits the old Asset's Collection as ordinary semantic/organisational metadata; the operation still creates a new immutable storage identity.

## 16. Import and progressive enrichment

Reviewed slide/Anki imports should initially reconstruct ordinary Primary Topic/Case/Asset/Case-question content faithfully.

Import Package v1 retains the `secondaryTopicIds` field only for package-shape compatibility. It must be empty; reviewed imports and resumable staging/plan processing reject non-empty values rather than recreating Additional Study Topics.

Case Tags and System↔Tag exposure are later reviewed authoring/curation layers unless a future import contract explicitly includes them.

Reusable-image authoring is later editorial enrichment. Existing Case-specific Image Questions are not migrated or promoted automatically merely because they use the same Asset or appear semantically similar.

Higher-resolution replacement is likewise a post-import Admin authoring operation; replacement/version fields are not added to Import Package v1.

## 17. Historical Review media and taxonomy provenance

A Review freezes the exact media and question context selected when it starts. `review_assets.storage_key_snapshot` is the historical media authority.

Study image URLs therefore resolve through an authenticated Review-specific route which verifies Review ownership and serves the snapshotted object key even if the original Asset was later superseded/inactivated. The normal current-Asset image route keeps rejecting inactive Assets.

Historical Reviews created under the retired multi-Topic model may also retain a former secondary `study_concept_id`. Ordinary authoring must not rewrite that provenance.

This preserves:

```text
old Review → old image/question/taxonomy provenance
new Review → current canonical Topic + current media/question behavior
```

## 18. Preferred routine workflow

```text
Choose/confirm Primary Topic
→ add clinically useful Case Tags
→ Case details
→ Images
→ contextual Case/image questions
→ Preview
→ later enrichment/reuse where proven
```

When reviewing Case classification, ask:

1. What does this Case fundamentally teach? → **Primary Topic**.
2. What other clinically meaningful concepts does it demonstrate or need contextual discovery under? → **Case Tags**.
3. Should a Tag appear to learners inside a particular System? → curate **System↔Tag exposure** on the System surface, not in the Case editor.

When reviewing an image question, ask:

1. Does the answer apply to the whole clinical presentation? → **This whole Case**.
2. Does the answer depend on this exact image/stimulus in this Case? → **A specific image or stimulus / Case-specific Image Question**.
3. Is the answer intrinsically true of this exact Asset wherever it appears? → **Reusable Image Question / Reusable with this image**.
4. Does it apply to every option in one alternative set? → **Stimulus Group Question**.
5. Is it general reusable knowledge? → **Topic / Shared Question**.

When replacing media, ask separately:

1. Is this literally the same underlying image, only at better quality/resolution? → **Replace with higher-resolution version**.
2. Is it another clinical image, even if it shows the same condition? → **Create/use a separate Asset**.

## 19. Schema boundaries to preserve

Do not add a parallel `topics` table: Topics remain `concepts`.

Do not recreate Additional Study Topics through another Case↔Topic table. Alternate/cross-cutting Case classification is represented by Tags.

Do not add Tags or answers to `question_prompts`: Prompts remain wording only.

Do not use Collections as a substitute for Topics, Tags, or stimulus groups.

Do not add a parallel fixed-image-question table. Fixed images may be transparently represented as one-option stimulus groups when image-specific question scope requires it.

Do not infer Reusable Image Questions from existing `stimulus_option_questions`.

Do not extend Import Package v1 merely to support editorial enrichment or higher-resolution replacement.

The narrow supersession field `assets.superseded_by_asset_id` records only “Asset A was superseded by Asset B”. Do not infer an Asset family, `image_identity`, generic version table, automatic visual matching, or arbitrary different-image replacement from this contract.
