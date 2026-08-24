# Flash-Cards — Content Model Examples

_Last updated: 25 August 2026_

This document gives practical examples for representing teaching material using the current implemented model. Prefer these examples over fixed Anki-style front/back assumptions.

For underlying rules, also read `AUTHORING_MODEL.md`, `V1_DATA_MODEL.md`, `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md`, `STIMULUS_GROUPS_DESIGN.md`, `TAGGING_STAGE_B_BEHAVIOR.md`, `REUSABLE_IMAGE_QUESTIONS.md`, and `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md`. `MULTI_TOPIC_STUDY_ROUTES.md` is historical only.

## 1. Case stem belongs to the Case

A clinical vignette is Case-level context, separate from the image Asset, Question Prompt, answer, Topic, and Tags.

```text
Case
Internal title: Post-operative hypocalcaemia ECG
Primary Topic: Prolonged QTc
Case Tags:
- Hypocalcaemia
- Post-thyroidectomy

Stem:
A patient develops symptoms after head and neck surgery.

Fixed Asset:
ECG image

Case questions:
- What ECG abnormality is present?
- What is the likely cause in this patient?
```

The stem is snapshotted into each learner Review. A Case may also have a blank stem for neutral image recognition.

## 2. One Asset can be reused across multiple Cases

An Asset is reusable media, not the owner of a diagnosis.

One prolonged-QTc ECG can be attached to:

```text
Case A: neutral prolonged-QTc recognition
Case B: post-operative hypocalcaemia with prolonged QTc
```

The same Asset/R2 object is reused. Each Case may provide different vignette, captions, canonical Primary Topic, Case Tags, questions, and answers.

Do not upload a duplicate merely because the educational context changes.

If the exact Asset also has canonical Reusable Image Questions, attaching the Asset to another Case still does **not** automatically opt those questions in. Media reuse and Asset Question reuse are separate author decisions.

## 3. One Case has one canonical Topic; alternate concepts use Tags

Current Case classification is:

```text
Case: Hypercalcaemia with shortened QTc

Primary Topic
- Hypercalcaemia

Case Tags
- Short QTc
```

The Case's Primary Topic is its canonical educational home and direct reusable Topic-question context.

If another System should expose this Case through `Short QTc`, explicitly expose the relevant Tag in that System. A Tag route can then reach the same Case without creating a second Case Topic or changing `study_concept_id` away from `Hypercalcaemia`.

Do not create an Additional Study Topic merely for alternate discovery. Historical secondary Topic rows may remain stored as inert compatibility data; current authoring does not recreate them.

If a finding exists only on one randomly selected image, keep it stimulus-specific rather than elevating it to Case-level classification.

Example:

```text
Alternative ECGs
A — shortened QTc
B — shortened QTc + Osborn waves
C — shortened QTc
```

`Short QTc` can reasonably be a Case Tag because every valid configuration demonstrates it. `Osborn waves` should remain exact-image teaching if only option B demonstrates it.

## 4. Fixed images versus alternative images

### Images that must be seen together

Use fixed Case Assets.

```text
Case: Pityriasis rosea

Fixed image 1: Herald patch
Fixed image 2: Later truncal eruption
```

Both are shown together in every applicable Review.

### Interchangeable examples of the same Case

Use an Alternative Set.

```text
Case: Hypercalcaemia

Alternative ECG set — choose one per Review
- ECG A
- ECG B
- ECG C
```

The Case context stays the same; one active, non-removed option is chosen and frozen for that Review.

Place questions at the highest scope where both relevance and answer remain valid:

```text
Topic Question                  → reusable knowledge for the canonical Topic
Case Question                   → valid for this clinical presentation
Stimulus Group Question         → valid for every image in one set
Case-specific Image Question    → selected image + this Case context
Reusable Image Question         → intrinsically true of the exact Asset wherever deliberately reused
```

### Several independent alternative sets

```text
Case: Multiple myeloma with hypercalcaemia

ECG set — choose one
- ECG A
- ECG B

X-ray set — choose one
- Skull X-ray
- Humerus X-ray
- Pelvis X-ray
```

One Review might snapshot `ECG B + Skull X-ray`; another may later snapshot `ECG A + Pelvis X-ray`.

## 5. Same Prompt, different contextual answers

Reusable wording is separate from the answer.

```text
Prompt:
Describe this ECG.

Case-specific Image Question on option A:
Sinus rhythm with prolonged QTc.

Case-specific Image Question on option B:
Sinus rhythm with prolonged QTc and right bundle branch block.
```

Do not duplicate Prompt text merely because the correct answer changes. Store the answer on the contextual relationship where it is correct.

## 6. Case-specific versus Topic-reusable questions

Use a Case Question when the answer depends on the exact presentation.

```text
What is the likely cause in this patient?
→ Post-operative hypoparathyroidism.
```

Use a Topic Question when the Prompt and answer remain valid across compatible Cases whose canonical Topic makes that reusable scope appropriate.

```text
Topic: Hypocalcaemia
Question: How is severe symptomatic hypocalcaemia treated?
```

It is acceptable to begin conservatively with Case Questions and promote genuinely reusable knowledge later.

## 7. Set-wide versus Case-specific Image Questions

Use a Stimulus Group Question if it applies to every option in one Alternative Set.

```text
Alternative set: Hypocalcaemia ECGs

Question:
What QT interval abnormality is demonstrated by these ECG examples?
→ Prolonged QTc.
```

Use a Case-specific Image Question for an incidental or variable finding in one selected option.

```text
ECG B only:
What additional conduction abnormality is present?
→ Right bundle branch block.
```

That question belongs to the `stimulus_group_option`, not to the global Asset.

## 8. Reusable Image Questions versus Case-specific Image Questions

Use a Reusable Image Question only when the Prompt and canonical answer are intrinsically true of the **exact Asset itself**, independent of the surrounding Case.

```text
Asset: ECG-123

Reusable Image Question:
What does this ECG show?
→ Widespread concave ST elevation with PR depression.
```

The canonical question belongs to ECG-123. A Case using ECG-123 receives it only through explicit opt-in.

Contrast:

```text
Case: Acute pericarditis after a viral prodrome
Asset: ECG-123

Case-specific Image Question:
What is the most likely diagnosis in this patient?
→ Acute pericarditis.
```

The diagnosis depends on the Case context and therefore remains Case-specific.

Removing one reusable opt-in affects only that exact stimulus usage; it does not archive the canonical Asset Question or affect another Case.

## 9. Same image at higher resolution versus a different clinical image

Use **Replace with higher-resolution version** only for a better-quality copy of the **same underlying image**.

```text
Old low-resolution ECG scan
→ same ECG scan at higher resolution
→ use higher-resolution replacement
```

A different ECG remains a separate Asset even if it demonstrates the same diagnosis.

Legitimate higher-resolution replacement preserves current Case/stimulus semantics while historical Reviews continue to use old snapshotted bytes and provenance.

## 10. Primary Topic and Case Tags are different

```text
Case: Post-thyroidectomy hypocalcaemia with QT prolongation

Primary Topic
- Prolonged QTc

Case Tags
- Hypocalcaemia
- Post-thyroidectomy
```

The Primary Topic is canonical. The Tags provide cross-cutting meaning and can support contextual learner discovery.

For example:

```text
Cardiovascular → Prolonged QTc [Topic]
Endocrine      → Hypocalcaemia [Tag]
```

Both routes may select the same Case, but direct Topic-question resolution remains based on `Prolonged QTc`.

A Case Tag does not automatically become learner navigation. The relevant System must explicitly expose that Tag.

## 11. Question Tags do not automatically inherit Case Tags

Suppose a Case has:

```text
Case Tags
- Hypocalcaemia
- Prolonged QTc
- Post-thyroidectomy
```

A contextual Question asking:

```text
What are the causes of hypocalcaemia?
```

may reasonably have only:

```text
Question Tags
- Hypocalcaemia
```

It should not automatically inherit every Case Tag.

## 12. Shared Question = reusable knowledge by one Reuse Scope Tag

```text
Shared Question
Prompt: What ECG abnormality is associated with severe hypocalcaemia?
Answer: QT prolongation / prolonged QTc

Reuse Scope Tag
- Hypocalcaemia

Descriptive Tags
- Hypocalcaemia
- Prolonged QTc
```

The Reuse Scope Tag controls eligibility. Descriptive Tags explain what the Question teaches/tests and do not create eligibility.

If a selected Case has the active `Hypocalcaemia` Tag, this Shared Question can join the Expanded eligible pool. System↔Tag exposure is not required for Shared Question eligibility and does not create eligibility by itself.

## 13. Context still wins over broader reusable knowledge

Current duplicate-Prompt precedence is:

```text
Case-specific Image Question for the selected option
> explicitly reused Asset Question for the selected option
> Stimulus Group Question
> Case Question
> exact canonical Study Topic Question
> Tag-shared Question
> nearest eligible ancestor Topic Question
> more distant eligible ancestor Topic Question
```

The final pool is deduplicated by Prompt ID. More contextual answers win.

## 14. Question pool and count follow educational intent

First choose source eligibility for the Review:

```text
Original/Core
→ Case + stimulus-owned sources

Expanded Learning
→ Original/Core + Topic/ancestor + Tag-shared + opted-in Asset sources
```

Then the Case applies:

```text
Automatic
All
Fixed N
```

Do not force one question from every source type merely for variety.

## 15. Internal Case titles may contain diagnoses

Useful Admin titles can be explicit:

```text
Post-operative hypocalcaemia ECG
Anterior STEMI ECG A
Pityriasis rosea image pair
```

Do not expose diagnosis-bearing internal titles to learners when they reveal the answer.

## 16. Image Collections are operational, not educational

Changing a Collection does not change:

- Primary Topic;
- Case Tags;
- System↔Tag exposure;
- Case/Alternative Set relationships;
- questions;
- learner routing;
- Reviews;
- R2 identity.

Do not use Collections as clinical taxonomy.

## 17. Same-Case option Move preserves exact-option teaching

If an image was placed in the wrong Alternative Set within the same Case, move the existing option rather than delete/recreate it.

```text
Case A / Set 1 / Option X
→ Case A / Set 2 / Option X
```

The move preserves option identity, Asset, caption, active state, Case-specific Image Questions, and reusable-image opt-ins subject to normal validity rules. Set-wide Questions remain with their original sets.

## 18. Imported Anki/slide material should remain simple first

A typical reviewed source note can initially map to:

```text
Primary Topic
└── Case
    ├── vignette
    ├── fixed ECG Asset
    └── Case Questions
```

After import, enrich only where useful:

```text
add Case Tags
→ curate System↔Tag exposure where contextual learner discovery is useful
→ add Question Tags
→ group interchangeable images
→ move context-dependent prompts to Case-specific Image Questions when needed
→ promote exact-Asset knowledge to Reusable Image Questions when intrinsically true of that Asset
→ promote genuinely reusable Tag-scoped knowledge to Shared Questions
→ use Image Collections for Admin organisation
→ replace media only with a better-quality copy of the same underlying image
```

Do not require a complete Tag taxonomy or reuse model before content is useful.

Import Package v1 retains `secondaryTopicIds` only as an empty compatibility field; do not use imports to recreate Additional Study Topics.

## 19. Marks should remain structured if introduced later

Source cards may contain prompts such as:

```text
ECG finding (2)
Name 2 physical examination findings (4)
```

Do not permanently bake marks into reusable Prompt wording merely because the source used them. If marks become important, represent them as structured metadata in a separately designed feature.

## 20. Practical rule of thumb

When adding material, ask:

1. What is the coherent Case presentation?
2. What single Primary Topic best captures what the Case fundamentally teaches?
3. Which other concepts belong as Case Tags?
4. Which of those Tags should be explicitly exposed in which Systems for contextual learner discovery?
5. Which images must always appear together?
6. Which images are interchangeable alternatives?
7. Does this question apply to the whole Case or a specific image/stimulus?
8. If image-specific, is it Case-specific or intrinsically true of the exact Asset as a Reusable Image Question?
9. Does one question apply to every option in an Alternative Set as a Stimulus Group Question?
10. Which questions remain correct as canonical Topic knowledge?
11. Which reusable knowledge remains correct across Cases with one explicit Reuse Scope Tag as a Shared Question?
12. Which Question Tags describe the knowledge tested without changing ownership?
13. Does a Collection help organise media without changing educational semantics?
14. Is a proposed media change literally the same image at better quality, or a different clinical image?

The current core rule is:

> **Keep one canonical Primary Topic per Case; use Tags for cross-cutting meaning and contextual discovery; keep Case/stimulus answers at the context that makes them correct; reuse exact-Asset knowledge only with explicit opt-in; and do not reintroduce Additional Study Topics merely because historical secondary rows still exist.**
