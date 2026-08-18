# Flash-Cards — Content Model Examples

_Last updated: 18 August 2026_

This document gives practical examples for representing real teaching material using the **current implemented model**. Prefer these examples over falling back to fixed Anki-style front/back cards.

For the underlying rules, also read `AUTHORING_MODEL.md`, `V1_DATA_MODEL.md`, `STIMULUS_GROUPS_DESIGN.md`, `MULTI_TOPIC_STUDY_ROUTES.md`, and `TAGGING_STAGE_B_BEHAVIOR.md`.

## 1. Case stem belongs to the Case

A clinical vignette is Case-level context, separate from the image Asset, Question Prompt, and answer.

```text
Case
Internal title: Post-operative hypocalcaemia ECG
Primary/default Topic: Hypocalcaemia
Additional Study Topic: Prolonged QTc

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

The same Asset/R2 object is reused. Each Case may provide different vignette, captions, Study Topics, questions, and answers.

Do not upload a duplicate merely because the educational context changes.

## 3. One Case can have several Study Topics

A Case may be a legitimate learner example of more than one Topic.

```text
Case: Hypercalcaemia with shortened QTc

Topics
- Hypercalcaemia   [Default]
- Short QTc        [Additional Study Topic]
```

Studying either Topic may lead to the same Case. The actual entry route becomes the Review's Study Topic and supplies direct reusable Topic questions.

Do **not** attach an Additional Study Topic if some valid random stimulus selections would fail to demonstrate it.

Example:

```text
Alternative ECGs
A — shortened QTc
B — shortened QTc + Osborn waves
C — shortened QTc
```

`Short QTc` is a valid Case Study Topic because every option demonstrates it. `Osborn waves` is not a valid Case-level Study Topic if only option B demonstrates it.

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

Use an alternative stimulus group.

```text
Case: Hypercalcaemia

Alternative ECG set — choose one per Review
- ECG A
- ECG B
- ECG C
```

The Case context stays the same; one active option is chosen and frozen for that Review.

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

One Review might snapshot `ECG B + Skull X-ray`; another might later snapshot `ECG A + Pelvis X-ray`.

## 5. Same Prompt, different contextual answers

Reusable wording is separate from the answer.

```text
Prompt:
Describe this ECG.

Exact option A answer:
Sinus rhythm with prolonged QTc.

Exact option B answer:
Sinus rhythm with prolonged QTc and right bundle branch block.
```

Do not duplicate the Prompt text merely because the correct answer changes. Store the answer at the contextual relationship where it is correct.

## 6. Case-specific versus Topic-reusable questions

Use a Case question when the answer depends on the exact presentation.

```text
What is the likely cause in this patient?
→ Post-operative hypoparathyroidism.
```

Use a Topic question when the prompt and answer remain valid across compatible Cases studied through that Topic.

```text
Topic: Hypocalcaemia
Question: How is severe symptomatic hypocalcaemia treated?
```

It is acceptable to begin conservatively with Case questions and promote genuinely reusable knowledge later.

## 7. Set-wide versus exact-image questions

Use a set-wide question if it applies to every option in one alternative group.

```text
Alternative set: Hypocalcaemia ECGs

Question:
What QT interval abnormality is demonstrated by these ECG examples?
→ Prolonged QTc.
```

Use an exact-option question for an incidental or variable finding.

```text
ECG B only:
What additional conduction abnormality is present?
→ Right bundle branch block.
```

Do not attach option-specific teaching to the global Asset merely because the image is involved. The same Asset may be reused in another Case with different educational intent.

## 8. Case Tags do not replace Study Topics

Use Topics for learner routing. Use Tags for cross-cutting clinical meaning.

```text
Case: Post-thyroidectomy hypocalcaemia

Study Topics
- Hypocalcaemia [Default]
- Prolonged QTc

Case Tags
- Hypocalcaemia
- Prolonged QTc
- Post-thyroidectomy
```

These lists may overlap but have different semantics.

Additional Study Topics determine learner entry routes. Case Tags support curation/filtering and can create Shared Question eligibility.

## 9. Question Tags do not automatically inherit Case Tags

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

It should not automatically become a `Post-thyroidectomy` Question simply because its Case has that Tag.

## 10. Shared Question = reusable knowledge by one Reuse Scope Tag

Use a Shared Question when the same Prompt/answer remains correct across Cases carrying one explicit clinical Tag.

```text
Shared Question
Prompt: What ECG abnormality is associated with severe hypocalcaemia?
Answer: QT prolongation / prolonged QTc

Reuse Scope Tag:
- Hypocalcaemia

Descriptive Tags:
- Hypocalcaemia
- Prolonged QTc
```

The Reuse Scope Tag controls eligibility. Descriptive Tags explain what the Question teaches/tests and do not create eligibility.

If a selected Case has the active `Hypocalcaemia` Tag, this Shared Question joins the normal eligible pool. It is not mandatory merely because it matches.

## 11. Context still wins over a matching Shared Question

Suppose the same Prompt is available as a Shared Question and as an exact Case or image question.

Current precedence is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> eligible ancestor Topic
```

The final pool is deduplicated by Prompt ID. The more contextual answer wins.

This lets the corpus reuse broad knowledge without sacrificing precise image/Case answers.

## 12. Question count follows educational need

The implemented Case modes are:

```text
Automatic
All
Fixed N
```

Do not force one question from every source type merely for variety.

- **Automatic** uses normal target/cap behavior plus configured stimulus-specific coverage.
- **All** asks every deduplicated eligible question.
- **Fixed** respects the configured count even when more Shared/Topic questions become eligible.

Use stimulus-specific coverage only when selected stimuli should reliably generate one or more specific questions.

## 13. Internal Case titles may contain diagnoses

Useful Admin titles can be explicit:

```text
Post-operative hypocalcaemia ECG
Anterior STEMI ECG A
Pityriasis rosea image pair
```

Do not expose diagnosis-bearing internal titles to learners when they reveal the answer. The learner UI should use neutral Case-review language.

## 14. Image Collections are operational, not educational

Image Management V2 allows zero or one Collection per Asset.

```text
Collection: ECG import batch 2026
Collection: Needs source review
Collection: Curated calcium ECGs
Unsorted
```

Changing a Collection does not change:

- Study Topics;
- Case Tags;
- Case/alternative-set relationships;
- questions;
- learner routing;
- Reviews;
- R2 identity.

Do not use Collections as a shortcut for clinical taxonomy.

## 15. Same-Case option Move preserves exact-option teaching

If an image was placed in the wrong alternative set within the same Case, Image Management V2 can move the existing option rather than delete/recreate it.

```text
Case A / Set 1 / Option X
→ Case A / Set 2 / Option X
```

The move preserves the option ID, Asset, caption, active state, and exact-option questions. Set-wide questions remain with their original sets.

This operation is deliberately narrower than a generic Asset Move; cross-Case moves are not inferred.

## 16. Imported Anki material should remain simple first

A typical reviewed source note can initially map to:

```text
Topic
└── Case
    ├── vignette
    ├── fixed ECG Asset
    └── Case questions
```

After import, enrich only where useful:

```text
add Additional Study Topic
→ add Case/Question Tags
→ group interchangeable images
→ promote exact-image questions if alternatives emerge
→ promote genuinely reusable knowledge to Shared Questions
→ use Image Collections for Admin organisation
```

Do not require a complete Tag taxonomy or reuse model before content is useful.

The initial ECG migration validated this approach: the 66-note source deck is fully represented in production, and curation now proceeds on the imported content.

## 17. Marks should remain structured if introduced later

Source cards may contain prompts such as:

```text
ECG finding (2)
Name 2 physical examination findings (4)
```

Do not permanently bake marks into reusable Prompt wording merely because the source used them. If marks become important, represent them as structured metadata in a separately designed feature.

## 18. Practical rule of thumb

When adding material, ask:

1. What is the coherent Case presentation?
2. Which Topic is the default Study route?
3. Is the whole Case always a valid example of another Topic?
4. Which images must always appear together?
5. Which images are interchangeable alternatives?
6. Which questions depend on the exact image/set/Case?
7. Which questions remain correct for the exact Study Topic?
8. Which reusable knowledge remains correct across Cases with one explicit Tag?
9. Which Tags describe the Case/question without changing ownership?
10. Does a Collection help organise the media without changing educational semantics?

The current core rule is:

> **Reuse media when the media are the same; keep separate Cases when the clinical presentation differs; use alternative stimuli when the Case stays the same; use Topics for study routes, Tags for cross-cutting meaning, Shared Questions for reviewed tag-scoped reuse, and Collections only for Image Library organisation.**
