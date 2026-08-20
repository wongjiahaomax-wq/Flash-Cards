# Flash-Cards — Content Model Examples

_Last updated: 20 August 2026_

This document gives practical examples for representing real teaching material using the **current implemented model**. Prefer these examples over falling back to fixed Anki-style front/back cards.

For the underlying rules, also read `AUTHORING_MODEL.md`, `V1_DATA_MODEL.md`, `STIMULUS_GROUPS_DESIGN.md`, `MULTI_TOPIC_STUDY_ROUTES.md`, `TAGGING_STAGE_B_BEHAVIOR.md`, `REUSABLE_IMAGE_QUESTIONS.md`, and `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md`.

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

If the exact Asset also has canonical Reusable Image Questions, attaching the Asset to another Case still does **not** automatically opt those questions in. Reuse of the media and reuse of the Asset Question are separate author decisions.

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

Questions should be placed at the highest scope where both relevance and answer remain valid:

```text
Topic Question                  → knowledge shared across a Topic
Case Question                   → valid for this clinical presentation
Stimulus Group Question         → valid for every image in one set
Case-specific Image Question    → depends on the selected image + this Case context
Reusable Image Question         → intrinsically true of the exact Asset wherever deliberately reused
```

Acute Pericarditis example:

```text
Case: Acute pericarditis — radiating anterior chest pain

Alternative ECG set
├── ECG A → Case-specific Image Question: What are the ECG changes? → Answer A
├── ECG B → Case-specific Image Question: What are the ECG changes? → Answer B
└── ECG C → Case-specific Image Question: What are the ECG changes? → Answer C
```

The wording may be identical, but the answers belong to the individual image/stimulus relationships. Use the Admin Case editor's scope/move action to re-scope an existing Case Question without recreating it.

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

Case-specific Image Question on option A:
Sinus rhythm with prolonged QTc.

Case-specific Image Question on option B:
Sinus rhythm with prolonged QTc and right bundle branch block.
```

Do not duplicate the Prompt text merely because the correct answer changes. Store the answer at the contextual relationship where it is correct.

## 6. Case-specific versus Topic-reusable questions

Use a Case Question when the answer depends on the exact presentation.

```text
What is the likely cause in this patient?
→ Post-operative hypoparathyroidism.
```

Use a Topic Question when the Prompt and answer remain valid across compatible Cases studied through that Topic.

```text
Topic: Hypocalcaemia
Question: How is severe symptomatic hypocalcaemia treated?
```

It is acceptable to begin conservatively with Case Questions and promote genuinely reusable knowledge later.

## 7. Set-wide versus Case-specific Image Questions

Use a Stimulus Group Question if it applies to every option in one alternative group.

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

That question belongs to the `stimulus_group_option`, not to the global Asset. Reusing the same Asset in another Case does not carry this contextual question with it.

## 7A. Reusable Image Questions versus Case-specific Image Questions

Use a Reusable Image Question only when the Prompt and canonical answer are intrinsically true of the **exact Asset itself**, independent of the surrounding Case.

Example:

```text
Asset: ECG-123

Reusable Image Question:
What does this ECG show?
→ Widespread concave ST elevation with PR depression.
```

The canonical question belongs to ECG-123. A Case using ECG-123 receives it only through explicit opt-in.

Contrast this with:

```text
Case: Acute pericarditis after a viral prodrome
Asset: ECG-123

Case-specific Image Question:
What is the most likely diagnosis in this patient?
→ Acute pericarditis.
```

The diagnosis answer depends on the Case context and therefore stays Case-specific even though the ECG contributed to the reasoning.

The Case image card should make this distinction visible before editing:

```text
Case-specific Image Questions · 2

Reusable Image Questions · 3
1 used in this Case · 2 available to reuse
```

Here:

- `2` Case-specific Image Questions belong only to this Case + image context;
- `3` is the total number of active canonical Reusable Image Questions for the Asset whose Prompts are active;
- `1 used in this Case` means that exact stimulus option explicitly opted into one of those reusable questions;
- `2 available to reuse` are active canonical Asset Questions not currently opted into that stimulus.

If none are used yet:

```text
Reusable Image Questions · 3
3 available to reuse
```

If no active reusable questions exist:

```text
Reusable Image Questions · 0
```

Removing one opt-in moves that question back from `used` to `available`; it does not archive the canonical Asset Question or affect another Case.

## 7B. Same image at higher resolution versus a different clinical image

Use **Replace with higher-resolution version** only when the uploaded file is a better-quality copy of the **same underlying image**.

```text
Old low-resolution ECG scan
→ same ECG scan at higher resolution
→ use higher-resolution replacement
```

The replacement creates a new immutable Asset/R2 object for current authoring while preserving historical Review media and lineage.

A different ECG remains a different Asset even if it demonstrates the same diagnosis:

```text
ECG A: anterior STEMI
ECG B: another anterior STEMI from another patient/example

→ two independent Assets
→ do not use higher-resolution replacement
```

When A is legitimately replaced by higher-resolution B:

- current fixed/stimulus relationships move to B;
- Stimulus Option IDs remain stable;
- Case-specific Image Questions remain attached to those preserved option IDs;
- A's Reusable Image Questions remain historically attached to A;
- corresponding reusable questions are cloned onto B;
- current reusable opt-ins are remapped to B's clones;
- old Reviews continue to use the old snapshotted image bytes and old question provenance.

This does not create generic Asset families or automatic visual matching.

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

## 11. Context still wins over broader reusable knowledge

Suppose the same Prompt is available from several scopes.

Current precedence is:

```text
Case-specific Image Question for the selected option
> explicitly reused Asset Question for the selected option
> Stimulus Group Question
> Case Question
> exact Study Topic Question
> Tag-shared Question
> eligible ancestor Topic Question
```

The final pool is deduplicated by Prompt ID. The more contextual answer wins.

Example:

```text
Reusable Image Question on ECG-123:
What does this ECG show?
→ widespread concave ST elevation with PR depression

Case-specific Image Question in Case X using ECG-123:
What does this ECG show in the context of this patient's presentation?
→ acute pericarditis with widespread concave ST elevation and PR depression
```

If both use the same Prompt identity for one selected stimulus, the Case-specific Image Question wins.

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
- **Fixed** respects the configured count even when more Shared/Topic/Reusable Image Questions become eligible.

Reusable Image Questions explicitly opted into the selected stimulus carry stimulus context and participate in the ordinary eligible pool. They are not automatically forced into every Review unless the configured stimulus-specific coverage requires enough such questions.

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

Reusable Image Questions are teaching content, not Collection metadata.

## 15. Same-Case option Move preserves exact-option teaching

If an image was placed in the wrong alternative set within the same Case, Image Management V2 can move the existing option rather than delete/recreate it.

```text
Case A / Set 1 / Option X
→ Case A / Set 2 / Option X
```

The move preserves the option ID, Asset, caption, active state, and Case-specific Image Questions. Reusable Image Question opt-ins are also attached to that preserved option identity and move with it, subject to normal Prompt/coverage validity. Stimulus Group Questions remain with their original sets.

This operation is deliberately narrower than a generic Asset Move; cross-Case moves are not inferred.

## 16. Imported Anki/slide material should remain simple first

A typical reviewed source note can initially map to:

```text
Topic
└── Case
    ├── vignette
    ├── fixed ECG Asset
    └── Case Questions
```

After import, enrich only where useful:

```text
add Additional Study Topic
→ add Case/Question Tags
→ group interchangeable images
→ move context-dependent prompts to Case-specific Image Questions when needed
→ promote exact-Asset knowledge to Reusable Image Questions when it is intrinsically true of that Asset
→ promote genuinely reusable tag-scoped knowledge to Shared Questions
→ use Image Collections for Admin organisation
→ replace media only when a better-quality copy of the same underlying image becomes available
```

Do not require a complete Tag taxonomy or reuse model before content is useful.

The initial ECG migration validated this approach: the 66-note source deck is fully represented in production, and curation now proceeds on the imported content.

Import Package v1 remains intentionally simple; Reusable Image Questions and Asset supersession are later editorial authoring operations rather than required import-manifest concepts.

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
6. Does this question apply to **This whole Case** or **A specific image or stimulus**?
7. If image-specific, is it a **Case-specific Image Question** or intrinsically true of the exact Asset as a **Reusable Image Question**?
8. Does one question apply to every option in the alternative set as a Stimulus Group Question?
9. Which questions remain correct for the exact Study Topic?
10. Which reusable knowledge remains correct across Cases with one explicit Reuse Scope Tag as a Shared Question?
11. Which Tags describe the Case/question without changing ownership?
12. Does a Collection help organise the media without changing educational semantics?
13. Is a proposed media change literally the same image at better quality, or actually a different clinical image?

The current core rule is:

> **Reuse media when the media are the same; keep separate Cases when the clinical presentation differs; use alternative stimuli when the Case stays the same; keep Case-specific Image Questions on the Case/stimulus relationship; use Reusable Image Questions only for canonical knowledge intrinsic to one exact Asset with explicit opt-in; use Topics for study routes, Tags for cross-cutting meaning, Shared Questions for tag-scoped reuse, Collections only for Image Library organisation, and higher-resolution replacement only for the same underlying image.**
