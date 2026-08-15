# Flash-Cards — Multi-Topic Case Study Routes

_Last updated: 15 August 2026_

## Status

**Learner multi-Topic routing and Review provenance are implemented in draft PR #18. Admin multi-Topic Case authoring remains a separate follow-up milestone.**

This design remains the preferred intermediate model before introducing any Asset-to-Topic relationship.

The key decision is:

> **A Case may belong to multiple existing Topics/Concepts, and every attached Topic may be a valid learner entry route. The existing `primary` role remains only the Case's canonical/default administrative classification.**

The implementation reuses the existing `case_concepts` table rather than adding a parallel Topic or Case-Topic model.

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

The learner behaviour is:

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

The database distinguishes `case_concepts.role = primary | secondary`.

Keep that storage distinction, but use the following product meaning.

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

For learner Case eligibility, primary and secondary Topics are interchangeable.

Product-facing Admin language should prefer something like:

```text
Topics
- Hypocalcaemia        [Default]
- Prolonged QTc
```

rather than emphasizing a strong `Primary Topic` / weak `Secondary Topic` hierarchy.

Changing which attached Topic is marked default should not change whether the Case remains eligible from any other attached Topic. PR #18 hardens the existing default-Topic update path so it preserves attached Topic relationships; the full multi-Topic editor is still separate.

---

## 3. Selected study Topic controls reusable Topic questions

Do **not** automatically combine reusable questions from every Topic attached to the Case.

The Topic route resolved for the selected Case supplies the reusable Topic-question layer for that Review.

Example:

```text
Case Topics:
- Hypocalcaemia [default]
- Prolonged QTc
```

If the learner studies through `Hypocalcaemia`, resolve:

```text
Hypocalcaemia Topic questions
+ eligible inherited ancestors for the Hypocalcaemia study route
+ Case questions
+ selected stimulus-group questions
+ selected exact-option questions
```

If the learner studies through `Prolonged QTc`, resolve:

```text
Prolonged-QTc Topic questions
+ eligible inherited ancestors for the Prolonged-QTc study route
+ the same Case questions
+ selected stimulus-group questions
+ selected exact-option questions
```

The Case's default Topic does not automatically inject its Topic questions when the learner entered through a different attached Topic.

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

`reviews.primary_concept_id` records the Case's canonical primary Concept at Review creation.

PR #18 adds:

```text
reviews.study_concept_id
```

Meaning:

```text
primary_concept_id
= canonical/default Topic of the selected Case at Review creation

study_concept_id
= attached Case Topic used as the reusable Topic-question route for this Review
```

Example:

```text
primary_concept_id = Hypocalcaemia
study_concept_id   = Prolonged QTc
```

`study_concept_id` is non-null, references `concepts.id`, and uses `ON DELETE RESTRICT`.

Migration `0003_multi_topic_study_routing.sql` safely backfills historical Reviews as:

```text
study_concept_id = primary_concept_id
```

because all historical Reviews used primary-Concept routing. Existing Review Question and Review Asset snapshots are preserved.

---

## 8. Learner selection changes

Implemented learner behaviour in PR #18:

1. learner selects a Topic;
2. include that active selected Topic + active descendants as before;
3. find active Cases with **any `case_concepts` relationship** to those Topics, regardless of primary/secondary role;
4. deduplicate by Case ID before random selection so multiple matching links do not increase selection weight;
5. resolve one Study Concept for each Case candidate deterministically:
   1. exact Case link to the explicitly selected Topic;
   2. otherwise the Case primary/default Concept if it lies in the selected subtree;
   3. otherwise the most-specific/deepest matching secondary Concept in the subtree;
   4. stable Concept-ID tie-break;
6. select a Case using the existing repeat-avoidance behaviour;
7. select/freeze stimulus alternatives as before;
8. resolve reusable Topic questions from the Study Concept rather than automatically from the Case default Topic;
9. add Case/group/option questions and apply existing precedence/coverage/count rules;
10. snapshot the Review with both primary/default and Study Concept provenance.

The descendant semantics remain consistent with the existing active Concept hierarchy.

The `/study` selector uses the same relationship logic and counts unique Cases rather than relationship rows.

---

## 9. Admin authoring UX

The full multi-Topic Case editor remains the next separate milestone. The intended surface is:

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

PR #18 does **not** build this UI. It only makes the minimum correctness change needed so the existing default-Topic update path does not discard unrelated secondary relationships and can promote an already-attached secondary Topic safely.

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

## 13. Implementation sequence

### PR #18 — Multi-Topic learner routing + provenance

Status: **implemented in draft; pending review/merge**

- all attached Case Topics are valid learner routes;
- one default/primary Topic remains canonical internally;
- reusable Topic questions resolve from one deterministic Study Concept;
- `study_concept_id` is preserved in Review provenance;
- primary and secondary entry routes are regression-tested;
- existing repeat avoidance, stimulus selection, question precedence, snapshots, and ordinary single-Topic Cases are preserved.

### Next PR — Admin multi-Topic authoring

- expose attached Topics in the Case editor;
- add/remove additional Topics;
- change the default Topic safely;
- show the Case-Topic validity authoring guidance;
- keep the existing Topics dashboard and Topic terminology.

### Later — Pilot-content validation / polish only if needed

Use representative ECG and mixed-modality Cases to verify:

- alternate study routes;
- all-stimulus validity;
- Topic-question focus;
- Admin usability;
- Review provenance/reporting.

Only then reconsider Asset/Stimulus-to-Topic relationships.

---

## 14. Final decision

Implemented in PR #18:

```text
multiple attached Topics -> same Case
all valid attached Topics are learner entry routes
one attached Topic remains default/canonical
one deterministic Study Topic supplies reusable Topic questions
Case/group/exact-option questions remain shared
Review preserves both canonical/default and Study Topic provenance
```

Next separate milestone:

```text
Admin multi-Topic add/remove/default authoring
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
