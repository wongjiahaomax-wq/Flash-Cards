# Flash-Cards — Authoring Model

_Last updated: 17 August 2026_

This document describes the preferred administrator mental model for entering and refining teaching content.

The product-facing hierarchy remains:

```text
Topic
└── Case
    └── Stimulus / alternative stimulus
```

A Case may belong to more than one Topic as an alternate learner study route. The database supports primary and secondary Concept relationships through `case_concepts`; the agreed design is documented in `MULTI_TOPIC_STUDY_ROUTES.md`.

Questions should be attached at the highest level where the prompt and answer remain valid.

---

## 1. Topic = what is being taught

A Topic is the administrator-facing name for the existing Concept model.

Topics do not have to be diseases. They may also be clinically meaningful examinable findings or interpretations.

Examples:

```text
Hypocalcaemia
Prolonged QTc
Anterior STEMI
Lytic bone lesions
```

A Topic can own reusable questions whose answers remain correct across compatible Cases studied through that Topic.

Examples for `Prolonged QTc`:

```text
How is QTc assessed?
What are the causes of prolonged QTc?
What complications are associated with marked QT prolongation?
```

The underlying `concept_questions` relationship remains responsible for reusable Topic questions.

Topics may also sit in the existing Concept hierarchy:

```text
Medicine
└── Endocrinology
    └── Calcium disorders
        ├── Hypocalcaemia
        └── Hypercalcaemia
```

The existing `inherit_to_descendants` behaviour remains an advanced reuse mechanism. It should not make routine content entry harder.

---

## 2. Case = one coherent clinical presentation

A Case is one coherent clinical scenario/study unit.

Cases may have different stems, causes, findings, or educational intent even when they share a Topic.

Example:

```text
Topic: Hypocalcaemia

├── Case: Post-thyroidectomy hypocalcaemia
│   └── Stem: patient develops symptoms after total thyroidectomy
│
└── Case: Vitamin-D-deficiency hypocalcaemia
    └── Stem: housebound patient with nutritional/risk-factor context
```

These remain separate Cases because their learner-facing clinical contexts differ.

Case questions should be used when the answer depends on that particular presentation.

Example:

```text
What is the likely cause in this patient?
```

The post-thyroidectomy Case may answer `post-operative hypoparathyroidism`, while the vitamin-D-deficiency Case has a different contextual answer.

The existing `case_questions` relationship remains responsible for this layer.

---

## 3. One Case may have several valid Topics

The agreed design uses the existing `case_concepts` relationship more fully.

Example:

```text
Case: Vitamin-D-deficiency hypocalcaemia with prolonged QTc

Topics:
- Hypocalcaemia        [Default]
- Prolonged QTc
```

The Case is stored once.

The desired learner behaviour is:

```text
Study Hypocalcaemia
-> this Case may be selected
-> Hypocalcaemia reusable Topic questions
   + Case/stimulus questions

Study Prolonged QTc
-> the same Case may be selected
-> Prolonged-QTc reusable Topic questions
   + the same Case/stimulus questions
```

Internally, one Topic remains `primary` as the Case's canonical/default administrative classification. Other attached Topics remain `secondary` in storage, but they are equally valid learner entry routes when configured.

Product-facing Admin language should therefore prefer:

```text
Topics
- Hypocalcaemia        [Default]
- Prolonged QTc
```

rather than implying that secondary Topics are weak tags.

Changing which attached Topic is the default should not change whether the Case is reachable from the other attached Topics.

### Important validity rule

Attach a Topic to a Case as a study route only when every valid random configuration of that Case remains a legitimate example of that Topic.

> **A learner entering through an attached Topic must never receive a valid stimulus selection that contradicts or fails to demonstrate that Topic.**

Safe example:

```text
Case: Hypercalcaemia
Topics:
- Hypercalcaemia
- Shortened QTc

Alternative ECGs:
- ECG A — shortened QTc
- ECG B — shortened QTc + Osborn waves
- ECG C — shortened QTc + another incidental feature
```

`Shortened QTc` is a valid Case Topic because every ECG option demonstrates it.

`Osborn waves` is not a valid Case Topic if only ECG B demonstrates it. That remains an exact-image-specific teaching point.

See `MULTI_TOPIC_STUDY_ROUTES.md` for the full design and the boundary where a future Asset/Stimulus-to-Topic relationship might become justified.

---

## 4. Stimulus = what the learner happens to see in that Case

A Case may have fixed images that should always appear.

It may also have interchangeable examples where only one image from a set should normally appear in a Review.

Example:

```text
Case: Post-thyroidectomy hypocalcaemia

Alternative ECG images
├── ECG A — prolonged QTc
├── ECG B — prolonged QTc plus another visible feature
└── ECG C — another prolonged-QTc tracing
```

All of these images belong to the same Case because the clinical presentation and educational intent remain the same.

The existing `stimulus_groups` and `stimulus_group_options` tables model this behaviour. The first implementation selects exactly one active image per active alternative set for each Review.

A Case may also contain multiple independent alternative sets, for example one ECG set plus one X-ray set.

---

## 5. Image-specific questions should describe only what differs

Topic and Case questions remain broader reusable/contextual layers.

Only add an exact-image question when its relevance or answer depends on the exact selected image.

Example:

```text
Shared Topic/Case questions
- How is prolonged QTc assessed?
- What are important causes of QT prolongation?

ECG A-specific
- Describe this ECG.
  -> Sinus rhythm with prolonged QTc.

ECG B-specific
- Describe this ECG.
  -> Sinus rhythm with prolonged QTc and right bundle branch block.
- What additional conduction abnormality is present?
  -> Right bundle branch block.
```

The existing `stimulus_option_questions` relationship remains responsible for exact-image contextual questions and answer overrides.

Do not add a Case Topic merely because one option contains an incidental finding.

---

## 6. Group-level questions are useful but advanced

Sometimes a question is valid for every image in one alternative set but is not appropriate as a general Topic or Case question.

That can remain a `stimulus_group_questions` relationship.

Example:

```text
Alternative set: Hypocalcaemia ECGs

What QT interval abnormality is demonstrated in this ECG set?
-> QT prolongation.
```

The Admin UI should treat this as an advanced capability rather than requiring authors to think about group-level relationships during ordinary content entry.

---

## 7. Authoring rule: attach a question at the highest valid level

Use this rule when deciding where a question belongs:

> **Attach the question at the highest level where its answer remains correct.**

| Question | Preferred level |
|---|---|
| How is severe symptomatic hypocalcaemia treated? | Topic: Hypocalcaemia |
| How is QTc assessed? | Topic: Prolonged QTc |
| What is the likely cause in this patient? | Case |
| What question applies to every image in this one alternative set? | Alternative set / advanced |
| Describe this exact ECG. | Specific image |
| What additional finding is visible on this exact image? | Specific image |

This reduces duplication while preserving precise stimulus interpretation.

---

## 8. Preferred Admin workflow

The common Case authoring path should expose simple product language rather than database terminology.

```text
Topics
→ Case
→ Images
→ Case questions
→ Preview
```

Images are part of authoring the clinical presentation, so they appear before Case questions. One top-level **Images** section contains both fixed images and alternative image sets while preserving their underlying semantics.

The administrator should be able to change which attached Topic is the default without rebuilding the Case.

Helper guidance should make the Topic validity rule visible:

> Add a Topic when this Case is a valid example of that Topic regardless of which alternative images are selected. Image-only findings that vary between alternatives should remain image-specific questions.

For images, the normal workflow is:

```text
Attach fixed image(s)
→ inspect them at clinically useful size
→ optionally start / move an image into an alternative set
→ add another image from the bounded Asset picker
→ add only questions specific to the exact image when needed
```

The Case editor must not permanently render the whole unused Asset Library. **Add images from library** opens a bounded, searchable, multi-select picker; uploading a new image remains available from that contained workflow. See `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` for the detailed interaction and bulk-selection contract.

Alternative sets should stay compact during routine authoring. Their image-specific questions can be collapsed when already populated, while set-wide questions, coverage and other settings remain discoverable advanced controls.

Advanced controls may remain available for:

- multiple independent alternative sets;
- set-level questions;
- stimulus-specific question coverage;
- active/inactive options;
- reordering.

Those controls should not dominate routine content entry.

---

## 9. Anki and progressive enrichment

Imported or manually entered material does not need to arrive perfectly structured.

Recommended workflow:

1. create/import the Topic and Case normally;
2. preserve existing questions at Topic or Case level where appropriate;
3. attach images as ordinary Case images;
4. attach additional Case Topics later when a useful alternate study route becomes obvious;
5. when multiple images are later recognized as interchangeable, convert them into alternatives;
6. add image-specific questions only for genuine differences.

This keeps both multi-Topic routing and stimulus structure as progressive enrichment rather than import prerequisites.
