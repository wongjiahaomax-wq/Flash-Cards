# Flash-Cards — Multi-Topic Case Study Routes

_Last updated: 15 August 2026_

## Status

**Architecture approved for implementation planning. No learner/admin implementation or migration is included in this document.**

This design is the preferred next step before introducing any Asset-to-Topic relationship.

The key decision is:

> **A Case may belong to multiple existing Topics/Concepts, and every attached Topic may be a valid learner entry route. The existing `primary` role remains only the Case's canonical/default administrative classification.**

The implementation should reuse the existing `case_concepts` table rather than add a parallel Topic or Case-Topic model.

---

## 1. Why this design exists

A single clinical Case may legitimately teach the same material through more than one educational lens.

Example:

```text
Case: Vitamin-D-deficiency hypocalcaemia with prolonged QTc

Topics:
- Hypocalcaemia        [default / primary]
- Prolonged QTc        [additional / secondary]
```

The desired learner behaviour is:

```text
Study Hypocalcaemia
-> this Case is eligible
-> Hypocalcaemia reusable Topic questions
   + Case questions
   + selected stimulus questions

Study Prolonged QTc
-> the same Case is eligible
-> Prolonged-QTc reusable Topic questions
   + the same Case questions
   + selected stimulus questions
```

The Case, stem, Assets, stimulus groups, Question Prompts, and Case-specific answers are not duplicated.

---

## 2. Primary versus secondary Topic semantics

The database currently distinguishes `case_concepts.role = primary | secondary`.

Keep that storage distinction, but change its product meaning.

### Primary / default Topic

The primary Topic is the Case's canonical administrative home.

It may be used for:

- the default Topic shown in Admin;
- a canonical classification when no learner study route is available;
- default reporting/grouping where one Topic must be chosen;
- preselection when editing the Case.

### Secondary / additional Topics

Secondary Topics are additional clinically valid study routes.

They should not be treated as weaker or non-learning metadata.

For learner Case eligibility, primary and secondary Topics should be interchangeable.

Product-facing Admin language should prefer something like:

```text
Topics
- Hypocalcaemia        [Default]
- Prolonged QTc
```

rather than emphasizing a strong `Primary Topic` / weak `Secondary Topic` hierarchy.

Changing which attached Topic is marked default should not change whether the Case remains eligible from any other attached Topic.

---

## 3. Selected study Topic controls reusable Topic questions

Do **not** automatically combine reusable questions from every Topic attached to the Case.

The Topic through which the learner entered the Case should supply the reusable Topic-question layer for that Review.

Example:

```text
Case Topics:
- Hypocalcaemia [default]
- Prolonged QTc
```

If the learner selected `Hypocalcaemia`, resolve:

```text
Hypocalcaemia Topic questions
+ eligible inherited ancestors for the Hypocalcaemia study route
+ Case questions
+ selected stimulus-group questions
+ selected exact-option questions
```

If the learner selected `Prolonged QTc`, resolve:

```text
Prolonged-QTc Topic questions
+ eligible inherited ancestors for the Prolonged-QTc study route
+ the same Case questions
+ selected stimulus-group questions
+ selected exact-option questions
```

The Case's default Topic should not automatically inject its Topic questions when the learner entered through a different attached Topic.

The existing more-specific contextual precedence remains:

```text
selected stimulus option
> stimulus group
> Case
> selected study Topic
> nearest eligible ancestor of selected study Topic
> more distant eligible ancestor
```

Deduplication remains by `question_prompt_id`.

---

## 4. Case-Topic validity invariant

A Topic may be attached to a Case as a learner study route only when **every valid random configuration of that Case remains a legitimate example of the Topic**.

Authoring rule:

> **A learner entering through an attached Topic must never receive a valid stimulus selection that contradicts or fails to demonstrate that Topic.**

### Safe example

```text
Case: Hypercalcaemia
Topics:
- Hypercalcaemia
- Shortened QTc

ECG alternatives:
- ECG A: shortened QTc
- ECG B: shortened QTc + Osborn waves
- ECG C: shortened QTc + another incidental feature
```

`Shortened QTc` is a valid Case Topic because every ECG alternative supports it.

`Osborn waves` is **not** a valid Case Topic if only ECG B shows Osborn waves. It remains an exact-image/option-specific teaching point.

### Unsafe example

```text
Case: Hypocalcaemia
Topics:
- Hypocalcaemia
- Prolonged QTc

ECG alternatives:
- ECG A: prolonged QTc
- ECG B: prolonged QTc
- ECG C: normal QTc
```

This Case must not be a `Prolonged QTc` study route while ECG C remains a valid selectable option.

That is the boundary where a future Asset/Stimulus-to-Topic model may become justified.

---

## 5. Clinical examples

### Hypocalcaemia + prolonged QTc

```text
Case: Post-thyroidectomy hypocalcaemia
Topics:
- Hypocalcaemia [default]
- Prolonged QTc

ECG group:
- all options demonstrate prolonged QTc
```

Works cleanly from either Topic.

### Drug-induced prolonged QTc

```text
Case: Drug-induced QT prolongation
Topics:
- Drug-induced long QT [default]
- Prolonged QTc
```

The same Prolonged-QTc reusable questions can be reused without copying the Case.

### Congenital long-QT syndrome

```text
Case: Congenital long-QT syndrome
Topics:
- Congenital LQTS [default]
- Prolonged QTc
```

Again, either Topic may lead to the same Case.

### Hyperkalaemia ECG with multiple findings

If every ECG option has peaked T waves but only some have QRS widening:

```text
Valid Case Topic:
- Peaked T waves

Not a valid Case Topic:
- QRS widening
```

QRS widening remains an exact-option-specific relationship unless all selectable options demonstrate it.

### Anterior STEMI with differing tracings

If all alternative ECGs support anterior STEMI but only some show RBBB:

```text
Case Topic:
- Anterior STEMI

Exact-option refinement:
- RBBB
```

### Multiple myeloma / hypercalcaemia with ECG + X-ray

A Case may have:

```text
Topics:
- Multiple myeloma [default]
- Hypercalcaemia
- Shortened QTc
- Lytic bone lesions

ECG group:
- every option demonstrates shortened QTc

X-ray group:
- every option demonstrates the relevant lytic-lesion finding
```

All four Topics can be valid study routes because each valid Review configuration still supports them.

If only some ECG or X-ray options support a finding, that finding must not be a Case-level study route.

---

## 6. Pure ECG learning

A pure ECG Topic still works with the existing Topic -> Case -> stimulus model.

Example:

```text
Topic: Prolonged QTc

Cases may include:
- post-thyroidectomy hypocalcaemia
- vitamin D deficiency
- drug-induced QT prolongation
- congenital LQTS
```

Each Case can retain another default Topic while also being attached to `Prolonged QTc`.

Therefore:

```text
Study Hypocalcaemia
-> encounter the hypocalcaemia Cases

Study Prolonged QTc
-> encounter the same relevant Cases across several causes
```

No duplicate Cases or Assets are required.

---

## 7. Review provenance

The current `reviews.primary_concept_id` records the Case's canonical primary Concept.

Once non-primary Topics become real learner entry routes, a Review should also preserve the Topic the learner actually selected.

Preferred additive field for implementation review:

```text
reviews.study_concept_id
```

Meaning:

```text
primary_concept_id
= canonical/default Topic of the selected Case at Review creation

study_concept_id
= Topic route selected by the learner that made this Case eligible
```

Example:

```text
primary_concept_id = Hypocalcaemia
study_concept_id   = Prolonged QTc
```

This distinction is important for later progress reporting and historical interpretation.

Do not create a migration until the implementation PR is reviewed.

---

## 8. Learner selection changes

Current behaviour uses only primary Case Concept links.

The intended future behaviour is:

1. learner selects a Topic;
2. find active selected Topic + active descendants as today;
3. find active Cases with **any active `case_concepts` relationship** to those Topics, regardless of primary/secondary role;
4. select a Case using existing repeat-avoidance behaviour;
5. preserve the learner-selected study Topic separately from the Case's default Topic;
6. select/freeze stimulus alternatives as today;
7. resolve reusable Topic questions from the selected study Topic rather than automatically from the Case default Topic;
8. add Case/group/option questions and apply existing precedence/coverage/count rules;
9. snapshot the Review.

The exact descendant semantics should remain consistent with the existing Concept hierarchy unless implementation testing reveals an ambiguity.

---

## 9. Admin authoring UX

The simplest Case editor should expose:

```text
Topics

[ Hypocalcaemia ]  Default
[ Prolonged QTc ]

[ + Add Topic ]
```

The administrator should be able to:

- search existing Topics;
- attach an additional Topic;
- remove an additional Topic;
- choose which attached Topic is the default;
- see a concise warning/rule that every attached Topic should remain valid for every possible stimulus selection.

Suggested helper text:

> Add a Topic when this Case is a valid example of that Topic regardless of which alternative images are selected. Image-only findings that vary between alternatives should remain image-specific questions.

Do not add Asset-level Topic editing in this milestone.

---

## 10. Anki / progressive enrichment

Anki import remains simple.

Recommended progression:

```text
import ordinary Topic + Case + questions + images
-> attach additional Case Topics later when reuse becomes obvious
-> group interchangeable stimuli later
-> add exact-image questions for findings that differ
```

Imported content does not need multiple Topic metadata up front.

A Case may initially have only its default Topic and gain additional study routes later without duplication.

---

## 11. Topic versus Deck / Collection

Additional Case Topics are for clinically meaningful educational classifications such as:

```text
Hypocalcaemia
Prolonged QTc
Anterior STEMI
Lytic bone lesions
```

Do not use Case Topics for curriculum collections such as:

```text
Family Medicine ECGs
Cardiology Revision
Final Exam Revision
My Difficult Cases
```

Those remain a separate future Collection/Deck concern.

No Collection/Deck entity is required for this milestone.

---

## 12. Deferred escalation: Asset/Stimulus -> Topic

Do not implement `asset_concepts` now.

Reconsider an Asset- or Stimulus-level Topic relationship only if real content repeatedly requires behaviour like:

> The Case should be available under Topic X only when a particular stimulus option showing X is selected.

That is intentionally beyond this intermediate design.

Do not add now:

- `asset_concepts`;
- `stimulus_option_concepts`;
- Asset-owned Question tables;
- finding ontologies;
- per-Case flags enabling/disabling Asset findings;
- automatic AI classification;
- a duplicate Topic table.

---

## 13. Recommended implementation sequence

### PR 1 — Multi-Topic learner routing + provenance

- make all attached Case Topics valid learner routes;
- retain one default/primary Topic internally;
- resolve reusable Topic questions from the selected study route;
- preserve `study_concept_id` in Review provenance if the reviewed migration shape is accepted;
- cover primary and secondary entry routes with tests;
- preserve existing repeat avoidance, stimulus selection, question precedence, snapshots, and ordinary single-Topic Cases.

### PR 2 — Admin multi-Topic authoring

- expose attached Topics in the Case editor;
- add/remove additional Topics;
- change the default Topic safely;
- show the Case-Topic validity authoring guidance;
- keep the existing Topics dashboard and Topic terminology.

### PR 3 — Pilot-content validation / polish only if needed

Use representative ECG and mixed-modality Cases to verify:

- alternate study routes;
- all-stimulus validity;
- Topic-question focus;
- Admin usability;
- Review provenance/reporting.

Only then reconsider Asset/Stimulus-to-Topic relationships.

---

## 14. Final decision

Implement next:

```text
multiple attached Topics -> same Case
all attached Topics are learner entry routes
one attached Topic remains default/canonical
selected study Topic supplies reusable Topic questions
Case/group/exact-option questions remain shared
Review preserves selected study route
```

Document for later:

```text
Collection / Deck
Asset/Stimulus -> Topic if real content requires stimulus-dependent study routing
```

Deliberately do not build yet:

```text
asset_concepts
stimulus_option_concepts
finding ontology
question-contribution flags
mandatory multi-Topic import metadata
```

This keeps the product understandable to clinician authors while gaining substantial cross-topic reuse with the schema relationships that already exist.
