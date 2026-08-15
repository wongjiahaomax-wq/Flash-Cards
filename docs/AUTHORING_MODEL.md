# Flash-Cards — Authoring Model

_Last updated: 15 August 2026_

This document describes the preferred administrator mental model for entering and refining teaching content.

The database retains the existing `concepts`, `cases`, `stimulus_groups`, `stimulus_group_options`, and contextual question tables. **No schema migration is required for this authoring model.**

The product-facing hierarchy is:

```text
Topic
└── Case
    └── Stimulus / alternative stimulus
```

Questions should be attached at the highest level where the prompt and answer remain valid.

---

## 1. Topic = what is being taught

A Topic is the administrator-facing name for the existing Concept model.

Example:

```text
Topic: Hypocalcaemia
```

A Topic can own reusable questions whose answers remain correct across several different clinical presentations.

Examples:

```text
How is severe symptomatic hypocalcaemia treated?
What symptoms can hypocalcaemia cause?
What ECG interval abnormality is associated with hypocalcaemia?
```

The underlying `concept_questions` relationship remains responsible for these reusable Topic questions.

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

Cases under the same Topic may have different stems, causes, findings, or educational intent.

Example:

```text
Topic: Hypocalcaemia

├── Case: Post-thyroidectomy hypocalcaemia
│   └── Stem: patient develops symptoms after total thyroidectomy
│
└── Case: Vitamin-D-deficiency hypocalcaemia
    └── Stem: housebound patient with nutritional/risk-factor context
```

These should remain separate Cases because the learner-facing clinical context is different even though both test the same Topic.

Case questions should be used when the answer depends on that particular presentation.

Example:

```text
What is the likely cause in this patient?
```

The post-thyroidectomy Case may answer `post-operative hypoparathyroidism`, while the vitamin-D-deficiency Case has a different contextual answer.

The existing `case_questions` relationship remains responsible for this layer.

---

## 3. Stimulus = what the learner happens to see in that Case

A Case may have fixed images that should always appear.

It may also have interchangeable examples where only one image from a set should normally appear in a Review.

Example:

```text
Case: Post-thyroidectomy hypocalcaemia

Alternative ECG images
├── ECG A — prolonged QTc
├── ECG B — prolonged QTc plus another visible feature
└── ECG C — another valid tracing
```

All of these images belong to the same Case because the clinical presentation and educational intent remain the same.

The existing `stimulus_groups` and `stimulus_group_options` tables already model this behaviour. The first implementation continues to select exactly one active image per active alternative set for each Review.

A Case may also contain multiple independent alternative sets, for example one ECG set plus one X-ray set.

---

## 4. Image-specific questions should describe only what differs

Topic and Case questions remain eligible regardless of which alternative image is selected.

Only add an image-specific question when its relevance or answer depends on the exact selected image.

Example:

```text
Shared Topic/Case questions
- What is the diagnosis?
- How would you manage severe symptomatic hypocalcaemia?

ECG A-specific
- Describe this ECG.
  -> Sinus rhythm with prolonged QTc.

ECG B-specific
- Describe this ECG.
  -> Sinus rhythm with prolonged QTc and [additional visible feature].
- What additional ECG feature is present?
  -> [image-specific answer]
```

The existing `stimulus_option_questions` relationship remains responsible for exact-image contextual questions and answer overrides.

---

## 5. Group-level questions are useful but advanced

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

## 6. Authoring rule: attach a question at the highest valid level

Use this rule when deciding where a question belongs:

> **Attach the question at the highest level where its answer remains correct.**

| Question | Preferred level |
|---|---|
| How is severe symptomatic hypocalcaemia treated? | Topic |
| What is the likely cause in this patient? | Case |
| What question applies to every image in this one alternative set? | Alternative set / advanced |
| Describe this exact ECG. | Specific image |
| What additional finding is visible on this exact image? | Specific image |

This reduces duplication while preserving the ability to ask precise questions about exact stimuli.

---

## 7. Preferred Admin workflow

The common authoring path should expose simple product language rather than database terminology.

```text
Topics
└── Hypocalcaemia
    ├── Shared Topic questions
    └── Cases
        ├── Post-thyroidectomy hypocalcaemia
        └── Vitamin-D-deficiency hypocalcaemia
```

Inside a Case:

```text
Case details
Case questions
Images
Alternative images
Preview
```

For alternatives, the normal workflow should feel like:

```text
Existing Case image
-> start / move into an alternative image set
-> add another image
-> add only questions specific to that image
```

The Admin UI may retain advanced controls for:

- multiple independent alternative sets;
- set-level questions;
- stimulus-specific question coverage;
- active/inactive options;
- reordering.

Those controls should not dominate the routine workflow.

---

## 8. Anki and progressive enrichment

Imported or manually entered material does not need to arrive perfectly structured.

Recommended workflow:

1. create/import the Topic and Case normally;
2. preserve existing questions at Topic or Case level where appropriate;
3. attach images as ordinary Case images;
4. when multiple images are later recognized as interchangeable, convert them into alternatives;
5. add image-specific questions only for genuine differences.

This keeps stimulus structure an emergent property of real content rather than an import prerequisite.

---

## 9. Learner composition

For a Review of one selected Case and one selected alternative image, the eligible pool is conceptually:

```text
Topic questions
+
Case questions
+
Alternative-set questions, if any
+
Selected-image questions
```

More specific contextual relationships continue to win when the same reusable Question Prompt is present at several levels.

The existing precedence remains:

```text
selected stimulus option
> stimulus group
> Case
> primary Topic/Concept
> nearest inheritable ancestor Topic/Concept
> more distant eligible ancestor
```

The selected Case, selected stimuli, prompts, answers, and provenance continue to be snapshotted into the Review.

---

## 10. Schema decision

Do **not** add a separate `topics` table for this model.

The existing `concepts` table already provides:

- Topic identity;
- parent/child hierarchy;
- reusable Topic questions;
- Case membership through `case_concepts`;
- primary and secondary Topic relationships.

Creating parallel `topics` and `concepts` entities would make ownership and inheritance ambiguous.

Future schema changes should be driven by a distinct requirement such as curriculum collections, manual Case ordering within a Topic, or Topic-specific learner settings—not by the Topic → Case → Stimulus hierarchy itself.
