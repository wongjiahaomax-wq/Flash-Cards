# Flash-Cards — Authoring Model

_Last updated: 19 August 2026_

This document describes the preferred administrator mental model for entering and refining teaching content. It intentionally uses product language rather than requiring authors to think in database-table names.

## 1. The authoring hierarchy

The main hierarchy remains:

```text
Topic
└── Case
    ├── fixed images
    ├── alternative image sets
    └── contextual questions
```

Three additional concepts sit across or beside that hierarchy:

```text
Tag        = cross-cutting clinical metadata
Shared Q   = reusable knowledge eligible by one Case Tag
Collection = Image Library organisation only
```

These concepts must not be collapsed into one taxonomy.

## 2. Topic = a learner study route

A Topic is the Admin-facing name for the existing `concepts` model.

Topics may be diagnoses, findings, investigations, procedures, or broader curriculum groupings.

Examples:

```text
Hypocalcaemia
Prolonged QTc
Anterior STEMI
Cardiology
```

Topics may form a hierarchy and may own reusable Topic questions.

A Case has exactly one **primary/default Topic** plus zero or more **Additional Study Topics**.

Example:

```text
Case: Vitamin-D-deficiency hypocalcaemia with prolonged QTc

Topics
- Hypocalcaemia   [Default]
- Prolonged QTc
```

The Case is stored once. A learner entering through either valid Topic may encounter it. The Topic route actually used becomes the Review's Study Topic and supplies direct reusable Topic questions for that Review.

### Study-Topic validity rule

Attach an Additional Study Topic only when every valid random configuration of the Case remains a legitimate example of that Topic.

> A learner entering through an attached Topic must never receive a valid stimulus selection that fails to demonstrate that Topic.

If only one alternative ECG contains Osborn waves, `Osborn waves` is not a valid Case-level Study Topic merely because that option exists. Keep that teaching point exact-image-specific.

## 3. Case = one coherent clinical presentation

A Case is one coherent clinical scenario/study unit.

Cases may have different stems, causes, findings, or educational intent even when they share Topics or Tags.

Example:

```text
Topic: Hypocalcaemia

├── Case: Post-thyroidectomy hypocalcaemia
│   └── different clinical context
│
└── Case: Vitamin-D-deficiency hypocalcaemia
    └── different clinical context
```

These remain separate Cases because the presentations are different.

Use Case questions when the answer depends on that exact presentation.

```text
What is the likely cause in this patient?
```

A post-thyroidectomy Case and a vitamin-D-deficiency Case should not share one answer merely because both belong to Hypocalcaemia.

## 4. Images: fixed versus alternatives

### Fixed images

Use fixed Case images when all of them should appear whenever the Case is reviewed.

Examples:

- a dermatology Case requiring two views of the same presentation;
- an ECG plus a radiograph that are both essential to the Case.

Fixed Case images are ordered and may have Case-specific captions.

### Alternative image sets

Use an alternative image set when the clinical presentation and educational intent remain the same but the example stimulus can vary between Reviews.

Example:

```text
Case: Hypercalcaemia

Alternative ECG set
├── ECG A — shortened QTc
├── ECG B — shortened QTc + incidental feature
└── ECG C — another shortened-QTc tracing
```

One active option is selected per active set when the Review starts and is frozen for that Review.

A Case may contain several independent sets:

```text
Case: Multiple myeloma with hypercalcaemia

├── ECG alternatives — choose one
└── X-ray alternatives — choose one
```

Do not duplicate the entire Case solely to vary a stimulus when an alternative set expresses the teaching intent more accurately.

## 5. Question scope is an author-facing choice

The normal authoring question is:

> **Where should this question apply?**

The Case editor exposes two ordinary scopes:

```text
This whole Case
A specific image / stimulus
```

Authors do not need to understand whether an image is currently stored as a fixed Case Asset or as a Stimulus Group Option before assigning a question.

### Case-wide questions

Use **This whole Case** when the question remains relevant and correct regardless of which stimulus is selected. Only this scope can normally expose **Also reuse this question in the Topic**.

### Stimulus-specific questions

Use **A specific image / stimulus** when relevance or the correct answer depends on the selected image.

Example:

```text
ECG A
What are the ECG changes?
→ Widespread concave ST elevation with PR depression.

ECG B
What are the ECG changes?
→ A different ECG-specific answer.
```

Exact-image questions remain attached to the Case-specific `stimulus_group_option`. Reusing the global Asset elsewhere does not carry those questions with it.

If the target is already an option in an Alternative image set, the exact-image relationship is created normally.

If the target is currently a fixed image, the Admin authoring operation may transparently represent it internally as a one-option Stimulus Group and attach the exact-image question there. The Asset identity and Case-specific caption are preserved. With one active option and `selection_count = 1`, learner-visible behaviour remains equivalent to the previous fixed image: that image is selected whenever the Case is reviewed.

This transparent conversion is an implementation detail of stimulus-specific question authoring. Authors should not have to manually open **Alternative-set actions** or invent a set name merely to say that one question applies to one image.

Moving an existing Case-wide question to a stimulus is a move of the relationship, not a copy: the existing Prompt wording is reused, the answer is preserved, the active Case-wide relationship is removed, and safe Topic-reuse semantics are applied. The Case Questions section therefore continues to contain only questions that apply to the whole Case.

## 6. Group-level questions are an advanced middle scope

Sometimes a question is valid for every option in one alternative set but is not a general Case or Topic question.

Example:

```text
Alternative set: Hypocalcaemia ECGs

What QT interval abnormality is demonstrated by these ECG examples?
→ QT prolongation.
```

This is a stimulus-group question.

Use group-level questions when they model real educational scope, not simply to fill every possible layer.

## 7. Question Prompt wording is not the answer

`question_prompts` stores reusable wording only.

A Prompt such as:

```text
What is the diagnosis?
```

has no single clinical answer. The answer belongs to the context in which the Prompt is used.

The same Prompt can therefore be reused while Case, Topic, group, option, or Shared Question relationships supply different correct answers.

## 8. Author questions at the broadest valid scope

The core rule is:

> **Attach a question at the broadest scope where its answer and educational meaning remain reliably correct.**

| Example | Preferred scope |
|---|---|
| How is severe symptomatic hypocalcaemia treated? | Topic: Hypocalcaemia |
| How is QTc assessed? | Topic: Prolonged QTc |
| What is the likely cause in this patient? | Case |
| What applies to every image in this one alternative set? | Alternative set |
| Describe this exact ECG. | Specific image |
| What finding is visible only on this image? | Specific image |
| What reusable knowledge applies to every Case carrying one clinical Tag? | Shared Question |

It is acceptable to start conservatively at Case scope and promote knowledge later once reuse is demonstrated by real content.

## 9. Tags describe cross-cutting clinical meaning

Tags do not replace Topics.

```text
Topic
= learner study route / hierarchy

Tag
= flat cross-cutting metadata
```

A Case may carry Tags such as:

```text
Hypocalcaemia
Prolonged QTc
Post-thyroidectomy
```

Contextual Case Questions may have their own Tags describing what they test.

Case Tags do not automatically become Question Tags. A Case may teach several concepts while an individual Question tests only one of them.

## 10. Shared Questions reuse knowledge by one Case Tag

A Shared Question is global reusable medical knowledge whose answer remains valid across Cases with a defined Tag.

Example:

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

The **Reuse Scope Tag** and **Descriptive Tags** are different concepts:

- Reuse Scope Tag = which tagged Cases make the Question eligible;
- Descriptive Tags = what knowledge the Question teaches/tests.

The current implementation requires exactly one active Reuse Scope Tag. Descriptive Tags never create learner eligibility.

## 11. Current learner precedence

When the same Question Prompt appears from more than one source, the current resolver uses:

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

This means exact image/Case context always wins over broad reusable knowledge using the same wording.

## 12. Case question-count modes

Authors can configure:

- **Automatic** — normal target/cap behavior with configured stimulus-specific coverage;
- **All** — every deduplicated eligible question;
- **Fixed** — a chosen count.

Do not force one question from every source layer for artificial variety. Question count should follow educational need.

Stimulus-specific coverage can be used when a selected image/set would otherwise risk appearing without any question that meaningfully tests it.

## 13. Image Collection = organisation, not teaching meaning

Image Management V2 adds **Collections** for Admin library organisation.

Examples might be operational groupings such as a source batch, image cleanup set, or curation bucket.

A Collection is not:

- a Topic;
- a Tag;
- a stimulus group;
- a learner category.

An Asset belongs to zero or one Collection. No Collection is displayed as **Unsorted**.

Changing/deleting a Collection never changes Case relationships, Tags, questions, Reviews, or R2 identity.

## 14. Preferred routine Admin workflow

The common Case-authoring path is:

```text
Topics
→ Case
→ Images
→ Case questions
→ Preview
```

Within Images:

```text
attach fixed image(s)
→ inspect at clinically useful size
→ optionally create/use an alternative set
→ add or upload images
→ add only genuinely image-specific questions
```

Question authoring should keep the scope visible:

```text
Applies to this Case
→ managed in Case Questions

Applies to this stimulus
→ managed beside that image
```

Image cards should stay compact: show a question count and short prompt summaries, with editing/creation/removal inside **Manage questions** rather than rendering every answer form open by default.

The Case editor uses a bounded searchable Asset picker rather than rendering the entire unused Image Library.

Advanced controls remain available for:

- multiple alternative sets;
- set-wide questions;
- stimulus-specific coverage;
- activation/order;
- identity-preserving same-Case option Move.

They should not dominate simple content entry.

## 15. Image Library workflow

The current library supports server-backed pagination/search/filter/sort, Image Collections, explicit cross-page selection, exact Select All up to 300 matching Assets, and sequential bulk mutations in server-safe chunks of at most 30 Assets.

This workflow is for corpus management. It must not blur media organisation into learner stimulus semantics.

## 16. Anki/imported content should be progressively enriched

Imported material does not need to arrive perfectly normalized.

Recommended workflow:

1. extract/clinically review source material outside the production app;
2. construct strict Import Package v1;
3. import ordinary Topic/Case/Asset/questions;
4. preserve source content faithfully enough for review;
5. add Additional Study Topics when alternate learner routes become clear;
6. group interchangeable images when genuine alternatives emerge;
7. curate Case/Question Tags;
8. promote repeated knowledge to Shared Questions only when the answer is reliably reusable;
9. use Image Collections for operational organisation if helpful.

Tag fields are deliberately not required by Import Package v1.

The first ECG corpus validated this workflow: all 66 source notes are represented in production, and further work is now enrichment rather than ingestion.

## 17. Practical authoring checklist

When modelling new material, ask in this order:

1. **What is the coherent clinical presentation?** Create one Case.
2. **Which Topic should be the default?** Set the primary/default Study Topic.
3. **Is the Case always a valid example of another Topic?** Add an Additional Study Topic only if yes.
4. **Which stimuli must always appear?** Attach fixed images.
5. **Which stimuli are interchangeable examples of the same task?** Use alternative sets.
6. **Where should each contextual question apply?** Choose this whole Case or one specific stimulus.
7. **Which questions are truly reusable across a Topic?** Use Topic questions.
8. **Which knowledge is reusable across Cases carrying one clinical Tag?** Consider a Shared Question.
9. **What does the Case or Question teach?** Add explicit Tags where useful.
10. **How should the media be organised administratively?** Use a Collection if helpful, without changing teaching semantics.

## 18. Schema boundaries to preserve

Do not add a parallel `topics` table: Topics remain `concepts`.

Do not add Tags to `question_prompts`: Prompts remain wording only.

Do not use Collections as a substitute for Topics, Tags, or stimulus groups.

Do not add a parallel fixed-image-question table. Exact-image questions remain `stimulus_option_questions`; fixed images may be transparently converted to a one-option Stimulus Group when that scope is required.

Do not add Asset→Topic or stimulus-option→Topic routing solely to avoid using exact-image questions. Reconsider stimulus-level routing only if real learner behavior requires one Case whose valid alternatives belong to genuinely different Study Topics.

Do not add compound Shared Question reuse logic until real curated content demonstrates a need.
