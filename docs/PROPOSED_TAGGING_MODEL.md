# Proposed Topic, Case, and Question Tagging Model

_Status: architecture proposal for review only — no implementation or migration is proposed by this document._

_Last updated: 16 August 2026_

## 1. Why revisit the content model

The current Flash-Cards model is deliberately structured around:

```text
Topic
└── Case
    ├── stimulus / alternative stimulus
    └── questions
```

That structure remains useful, but real medical teaching material repeatedly crosses conceptual boundaries.

Examples:

- several different clinical vignettes can all demonstrate prolonged QTc caused by hypocalcaemia;
- iron-deficiency anaemia may be presented through heavy menstrual bleeding, gastrointestinal blood loss, dietary deficiency, pregnancy, or other contexts;
- an ECG-led Case may contain questions about calcium physiology;
- the same reusable medical knowledge may be relevant to Cases authored under different Topics;
- the same Case can legitimately cover several concepts without all of those concepts needing to become learner study routes.

Trying to encode every clinically meaningful relationship into the Topic hierarchy makes initial ingestion harder and risks constructing a rigid taxonomy before enough real content exists to justify it.

The refined proposal is therefore:

> Keep Topics as curated learner routes and organisational structure. Keep Cases as individual vignettes. Use Case tags to describe the concepts covered by each Case. Use Question tags to describe the knowledge tested by each Question. For reusable Questions, keep reuse scope separate from descriptive Question tags.

This is intended to support progressive enrichment: import and author Cases first, then add increasingly useful cross-links as the corpus grows.

---

## 2. Core mental model

The proposed product model is:

```text
TOPIC
= Where can a learner intentionally study this material?

CASE
= What particular clinical vignette/presentation is being shown?

CASE TAGS
= What clinically meaningful concepts are covered by this Case?

QUESTION TAGS
= What clinically meaningful knowledge does this Question test?

QUESTION REUSE SCOPE
= Across which tagged Cases may this shared Question be eligible for reuse?

CASE-SPECIFIC QUESTION
= A Question whose answer/relevance depends on this exact vignette.

STIMULUS-SPECIFIC QUESTION
= A Question whose answer/relevance depends on this exact ECG/image/stimulus.
```

These are related but intentionally distinct properties.

---

## 3. Topic = curated organisation and learner study route

A Topic remains the product-facing name for the existing Concept model.

Topics can still be broad or clinically specific when that is useful to learners. Existing multi-Topic Case routing remains valid and should not be weakened.

For example, the current system may intentionally support a Case as a learner route from both:

```text
Hypocalcaemia
Prolonged QTc
```

because `case_concepts` has stronger learner-routing semantics.

Tags are not a replacement for that behaviour.

The distinction is:

```text
Case ↔ Topic relationship
= This Case is deliberately valid as a learner study route for this Topic.

Case tag
= This Case contains/covers this clinically meaningful concept.
```

A useful tag may later justify creating or attaching a Topic study route, but that promotion should be an explicit administrator decision rather than an automatic consequence of tagging.

This allows early imports to remain relatively source-oriented while a richer teaching taxonomy emerges from real content.

---

## 4. Case = one particular vignette or presentation

A Case remains one coherent clinical presentation.

Two Cases may share exactly the same broad diagnosis and many of the same tags while still being separate Cases because the stem, cause, age group, context, investigation pattern, or educational emphasis differs.

For example:

```text
Case A
Post-thyroidectomy hypocalcaemia with prolonged QTc

Case tags:
- Prolonged QTc
- Hypocalcaemia
- Post-thyroidectomy
- Hypoparathyroidism   (if clinically appropriate)
```

and:

```text
Case B
Vitamin-D-deficiency hypocalcaemia with prolonged QTc

Case tags:
- Prolonged QTc
- Hypocalcaemia
- Vitamin D deficiency
```

Both Cases cover `Prolonged QTc + Hypocalcaemia`.

They remain separate Cases because they are different clinical vignettes and can support different Case-specific questions.

This is a desired feature, not duplication to eliminate.

---

## 5. Case titles should identify the vignette

As more Cases share overlapping tags, descriptive administrator-facing Case names become important.

Prefer names such as:

```text
Post-thyroidectomy hypocalcaemia with prolonged QTc
Vitamin-D-deficiency hypocalcaemia with prolonged QTc
```

If age or population is educationally important, it may also be reflected in the Case title or stem:

```text
Older adult — post-thyroidectomy hypocalcaemia with prolonged QTc
Young adult — vitamin D deficiency with hypocalcaemia and prolonged QTc
```

Do not automatically turn every demographic property into a tag.

A tag should normally represent a clinically meaningful concept with likely retrieval, curation, or teaching value. Examples such as `Vitamin D deficiency`, `Post-thyroidectomy`, `Heavy menstrual bleeding`, or `Haemorrhoids` are more useful than indiscriminately accumulating generic demographic tags.

---

## 6. Case tags describe what the Case covers

A Case may have several tags. No single tag needs to be privileged as the default.

Example:

```text
Case:
Post-thyroidectomy hypocalcaemia with prolonged QTc

Tags:
- Prolonged QTc
- Hypocalcaemia
- Post-thyroidectomy
```

The tags should allow cross-cutting retrieval such as:

```text
Find all Cases tagged Hypocalcaemia
Find all Cases tagged Prolonged QTc
Find Cases tagged Prolonged QTc + Hypocalcaemia
Find Cases tagged Hypocalcaemia + Vitamin D deficiency
```

Many Cases may intentionally share the same tag combination.

Tags therefore act more like facets in a clinical knowledge graph than nodes in a rigid tree.

---

## 7. Anaemia example: several Cases can share the same core tags

The same model applies outside ECG material.

Example:

```text
Case A
Iron-deficiency anaemia secondary to heavy menstrual bleeding

Case tags:
- Anaemia
- Iron deficiency
- Heavy menstrual bleeding
```

```text
Case B
Iron-deficiency anaemia secondary to rectal bleeding from haemorrhoids

Case tags:
- Anaemia
- Iron deficiency
- Rectal bleeding
- Haemorrhoids
```

Both Cases share:

```text
Anaemia
Iron deficiency
```

but remain distinct because their presentations and causes differ.

This makes it possible to build many clinically varied Cases around the same underlying knowledge without copying all of the reusable medical questions into every Case.

---

## 8. Question tags describe what the Question tests

Question tags have a different meaning from Case tags.

They answer:

> What medical knowledge is this particular Question testing or teaching?

Example:

```text
Question:
What ECG abnormality is associated with severe hypocalcaemia?

Question tags:
- Hypocalcaemia
- Prolonged QTc
```

Both tags are valid because the Question tests the relationship between those concepts.

Another example:

```text
Question:
What are the causes of hypocalcaemia?

Question tags:
- Hypocalcaemia
```

Question tags are therefore useful for future retrieval such as:

```text
Find all Questions tagged Hypocalcaemia
Find all Questions tagged Prolonged QTc
Find all Questions tagged Calcium disorders
```

A Case tag and a Question tag can use the same canonical Tag entity while retaining different relationship semantics.

---

## 9. Case tags should not automatically become Question tags

The earlier version of this proposal suggested that a Case Question without explicit tags could inherit all Case tags.

The refined recommendation is **not** to treat every Case tag as an automatic Question classification.

Consider:

```text
Case tags:
- Prolonged QTc
- Hypocalcaemia
- Post-thyroidectomy
```

A Question such as:

```text
What are the causes of hypocalcaemia?
```

does not automatically become a `Post-thyroidectomy` Question merely because it appears in that Case.

Likewise a Case-specific Question about the operation does not automatically test every other concept carried by the Case.

Therefore:

- Case tags classify the Case;
- Question tags classify the Question;
- ordinary imported Questions may initially remain untagged;
- the Admin UI may suggest relevant Case tags when tagging a Question, but should not silently persist all of them as Question tags.

This avoids semantic pollution as Cases accumulate several useful cross-links.

---

## 10. Three Question scopes

The proposed authoring model has three main Question scopes.

### 10.1 Tag-reusable / shared knowledge Question

Use this when the Question and answer remain valid across many Cases sharing an appropriate reuse scope.

Example:

```text
What are the causes of hypocalcaemia?
```

This can reasonably be reused across different hypocalcaemia Cases.

### 10.2 Case-specific Question

Use this when the answer or relevance depends on the exact vignette.

Example in a post-thyroidectomy Case:

```text
What is the most likely cause of the hypocalcaemia in this patient?
→ post-operative hypoparathyroidism
```

The same prompt wording may appear in another Case with a different contextual answer, but the relationship remains Case-specific.

### 10.3 Stimulus-specific Question

Use this when relevance or answer depends on the exact selected ECG/image/stimulus.

Example:

```text
What additional conduction abnormality is visible on this ECG?
```

This should remain attached to the exact stimulus option when different alternative ECGs show different findings.

The existing stimulus-specific model already supports this distinction conceptually.

---

## 11. Authoring rule: attach a Question at the broadest safe scope

A useful general rule remains:

> Attach a Question at the broadest scope where its answer and educational meaning remain reliably correct.

Examples:

| Question | Preferred scope |
|---|---|
| What are the causes of hypocalcaemia? | Shared/reusable; scope `Hypocalcaemia` |
| What ECG abnormality is associated with severe hypocalcaemia? | Shared/reusable; scope `Hypocalcaemia` |
| How is iron deficiency treated? | Shared/reusable; scope `Iron deficiency` |
| What is the most likely cause in this patient? | Case-specific |
| Why does this patient have iron deficiency? | Case-specific |
| What additional feature is visible on this exact ECG? | Stimulus-specific |

This minimises duplication while preserving contextual correctness.

---

## 12. Question tags and Question reuse scope are separate

This is the most important refinement to the earlier proposal.

A reusable Question needs two different pieces of semantic information:

```text
Question tags
= What knowledge does this Question cover?

Reuse scope
= Which tagged Cases make this Question eligible for reuse?
```

They are often related, but they are not always identical.

Key example:

```text
Question:
What ECG abnormality is associated with severe hypocalcaemia?

Answer:
QT prolongation / prolonged QTc

Question tags:
- Hypocalcaemia
- Prolonged QTc

Reuse scope:
- Hypocalcaemia
```

The Question genuinely teaches both `Hypocalcaemia` and `Prolonged QTc`.

However, it may be useful in **any Hypocalcaemia Case**, including a Case that is not itself tagged `Prolonged QTc`.

Therefore the full Question tag set must not be interpreted as an AND condition for reuse.

The Question tags describe content. The reuse scope describes eligibility.

---

## 13. Reuse scope means eligibility, not guaranteed display

A shared Question matching a Case's reuse scope should normally become **eligible** for that Case's question pool.

It does not necessarily mean every eligible shared Question must be shown every time.

For example:

```text
Case tags:
- Hypocalcaemia
- Vitamin D deficiency

Eligible shared Questions may include:
- What are the causes of hypocalcaemia?
- What ECG abnormality is associated with severe hypocalcaemia?
- How is severe symptomatic hypocalcaemia treated?
- What are the causes of vitamin D deficiency?
- How is vitamin D deficiency investigated?
```

The existing Case question-selection mode can still determine whether all, a fixed number, or an automatically selected subset are shown.

This distinction prevents tag-based reuse from causing every heavily tagged Case to become excessively long.

---

## 14. Worked hypocalcaemia example

Consider two Cases.

### Case A

```text
Title:
Post-thyroidectomy hypocalcaemia with prolonged QTc

Tags:
- Hypocalcaemia
- Prolonged QTc
- Post-thyroidectomy
```

### Case B

```text
Title:
Vitamin-D-deficiency hypocalcaemia with prolonged QTc

Tags:
- Hypocalcaemia
- Prolonged QTc
- Vitamin D deficiency
```

Both Cases may draw from shared knowledge such as:

```text
Shared Question:
What are the causes of hypocalcaemia?

Question tags:
- Hypocalcaemia

Reuse scope:
- Hypocalcaemia
```

and:

```text
Shared Question:
What ECG abnormality is associated with severe hypocalcaemia?

Question tags:
- Hypocalcaemia
- Prolonged QTc

Reuse scope:
- Hypocalcaemia
```

But their Case-specific questions differ.

Case A:

```text
What is the most likely cause of hypocalcaemia in this patient?
→ post-operative hypoparathyroidism
```

Case B:

```text
What is the most likely cause of hypocalcaemia in this patient?
→ vitamin D deficiency
```

This is exactly the intended separation between reusable knowledge and vignette-specific reasoning.

---

## 15. Worked iron-deficiency example

### Case A

```text
Title:
Iron-deficiency anaemia secondary to heavy menstrual bleeding

Tags:
- Anaemia
- Iron deficiency
- Heavy menstrual bleeding
```

### Case B

```text
Title:
Iron-deficiency anaemia secondary to rectal bleeding from haemorrhoids

Tags:
- Anaemia
- Iron deficiency
- Rectal bleeding
- Haemorrhoids
```

Shared Questions may include:

```text
What are the causes of iron deficiency?
What blood-film findings are expected in iron deficiency?
How is iron deficiency investigated?
How is iron deficiency treated?
```

with reuse scope:

```text
Iron deficiency
```

The Cases may then add vignette-specific questions about the actual source of blood loss, risk factors, or next investigation in that patient.

This lets varied clinical stems test the same core knowledge while retaining presentation-specific reasoning.

---

## 16. Reusable wording remains separate from reusable medical meaning

The existing model correctly separates `question_prompts` from contextual answers.

That distinction should remain.

For example, the wording:

```text
What is the most likely cause in this patient?
```

may be reused as a prompt across many Cases while the answer differs.

Therefore a reusable `question_prompt` should not automatically receive global clinical tags merely because one usage has a particular meaning.

The refined model distinguishes:

```text
Prompt reuse
= Can this wording be used again?

Shared knowledge reuse
= Does this prompt + answer represent knowledge that is valid across a Case-tag scope?

Question tags
= What does this Question test?
```

These should not be collapsed into a single property.

---

## 17. Relationship to existing Topic Questions

The current `concept_questions` model remains useful.

A Topic Question means:

```text
This reusable Question belongs to this curated learner study route.
```

A future tag-scoped shared Question would mean:

```text
This reusable Question is eligible across Cases carrying this reuse-scope tag,
regardless of which Topic originally contains those Cases.
```

Those are different reuse mechanisms.

For example, a reusable `Hypocalcaemia` Question may eventually be relevant to Cases authored under Cardiology, Endocrinology, Renal Medicine, Emergency Medicine, or another Topic.

The implementation should preserve Topic-based reusable questions while allowing a future tag-scoped layer to cross Topic boundaries.

How duplicate prompts from Topic, tag, Case, and stimulus scopes are resolved should be designed explicitly before implementation.

---

## 18. Proposed authoring workflow

The ordinary Case authoring flow could remain simple.

### Case level

```text
Case title
Post-thyroidectomy hypocalcaemia with prolonged QTc

Topics
[ existing learner-routing Topics ]

Case tags
[ Hypocalcaemia ]
[ Prolonged QTc ]
[ Post-thyroidectomy ]
[ + Add tag ]
```

### Shared/reusable Question

```text
Question
What ECG abnormality is associated with severe hypocalcaemia?

Answer
QT prolongation / prolonged QTc

Question tags
[ Hypocalcaemia ] [ Prolonged QTc ]

Reusable in Cases tagged
[ Hypocalcaemia ]
```

### Case-specific Question

```text
Question
What is the most likely cause of the hypocalcaemia in this patient?

Scope
This Case only

Answer
Post-operative hypoparathyroidism

Question tags (optional/curated)
[ Hypocalcaemia ] [ Post-thyroidectomy ]
```

The exact controls and labels remain product-design questions, but the semantic distinction should be preserved.

---

## 19. Progressive ingestion strategy

This proposal is intended to make large Anki ingestion easier rather than harder.

Recommended sequence:

1. Import material according to its existing broad Topic/deck organisation.
2. Preserve genuinely different clinical presentations as separate Cases.
3. Give Cases descriptive administrator-facing titles.
4. Import existing questions as Case Questions initially when their broader reuse is uncertain.
5. Add a small number of obvious Case tags when practical.
6. Do **not** require every imported Question to be semantically tagged before import can proceed.
7. During curation, identify Questions whose answer remains valid across many tagged Cases.
8. Promote those Questions into the shared/tag-reusable layer with explicit reuse scope.
9. Add Question tags for semantic retrieval and future cross-topic study.
10. Continue to keep vignette-dependent Questions attached directly to the Case and image-dependent Questions attached to the stimulus.

This lets structure emerge from the real corpus instead of requiring a complete ontology up front.

---

## 20. Desired future retrieval behaviour

The model should eventually support administrator queries such as:

```text
Find all Cases tagged Hypocalcaemia
Find all Cases tagged Prolonged QTc + Hypocalcaemia
Find all Cases tagged Iron deficiency + Heavy menstrual bleeding
```

and Question queries such as:

```text
Find all Questions tagged Hypocalcaemia
Find all Questions tagged Prolonged QTc
Find all Questions tagged Iron deficiency
```

and shared-question queries such as:

```text
Show Questions reusable in Hypocalcaemia Cases
Show Questions reusable in Iron-deficiency Cases
```

Those queries are related but should not be treated as identical.

A Question can be tagged `Hypocalcaemia + Prolonged QTc` while its reuse scope is only `Hypocalcaemia`.

---

## 21. Possible schema direction — deliberately not final

A minimal tag foundation could remain:

```text
tags
- id
- name
- slug
- description_md (optional)
- is_active
- created_at
- updated_at

case_tags
- case_id
- tag_id
```

The shared Question layer needs more care because the existing `question_prompts` table stores wording only and answers belong on contextual relationships.

One possible logical shape is:

```text
shared_questions
- id
- question_prompt_id
- answer_md
- is_active
- created_at
- updated_at

shared_question_tags
- shared_question_id
- tag_id

shared_question_reuse_scopes
- shared_question_id
- tag_id
```

Conceptually:

```text
shared_question_tags
= what the Question tests

shared_question_reuse_scopes
= which Case tags make it eligible
```

The exact table names are not proposed as final.

Case-specific Question tags could attach to `case_questions` through a separate join table if/when needed. Equivalent tag relationships for `concept_questions`, `stimulus_group_questions`, and `stimulus_option_questions` should only be added when there is a demonstrated use case.

Avoid storing clinical classification directly on `question_prompts` as the primary mechanism because identical wording can have different meanings and answers in different contexts.

---

## 22. Matching semantics for multiple reuse scopes remain open

The current examples are intentionally simple:

```text
Reusable in Cases tagged:
Hypocalcaemia
```

If a shared Question later has several reuse-scope tags, the implementation must define whether that means:

- ANY matching Case tag is sufficient;
- ALL listed Case tags are required; or
- compound reuse rules need an explicit representation.

Do not infer this behaviour merely from descriptive Question tags.

The current design requirement established by the hypocalcaemia/QTc example is only:

> A Question may carry several descriptive Question tags while being reusable across Cases matching a narrower reuse scope.

That requirement should be preserved regardless of the eventual multiple-scope design.

---

## 23. Tag hierarchy and normalisation

The current preference remains to keep tags flat initially.

Do not build a complete medical ontology before enough real content exists to demonstrate the need.

However, canonicalisation will eventually be necessary to avoid accidental duplicates such as:

```text
Prolonged QTc
QT prolongation
Long QT
```

or spelling variants such as:

```text
Hypocalcaemia
Hypocalcemia
```

A future alias/synonym mechanism may allow several search terms to resolve to one canonical Tag.

The exact canonical spelling policy is not decided by this proposal.

---

## 24. Learner behaviour should follow later

Tags should initially be treated primarily as authoring, search, curation, and reuse metadata.

Do not require the first tagging implementation to expose a new learner-facing `Study by Tag` feature.

Once the corpus contains enough well-curated tags, future learner experiences could include:

```text
Study Topic: ECG
Filter: Hypocalcaemia
```

or cross-Topic study such as:

```text
Study all material related to Iron deficiency
```

Those features should be driven by observed content quality and learner needs rather than assumed in the first schema change.

---

## 25. Review provenance

The current system snapshots Topics, Questions, answers, and selected stimuli into Reviews where historical meaning matters.

Tag provenance does not need to be snapshotted immediately unless tags begin driving learner scheduling, mastery analytics, or historically meaningful reporting.

For the first implementation, current Case/Question tags can remain mutable curation metadata.

Historical tag snapshots should be reconsidered only when a real analytics or audit requirement appears.

---

## 26. Import-package scope

The current import package should not be blocked on this architecture.

Initial Anki ingestion can remain:

```text
Topic/deck
→ Case
→ questions
→ images/stimuli
```

Tags and shared Question reuse can be added through later curation or a future additive import-package version.

If tag support is eventually added to imports, it should remain optional so partially structured source material can still be imported safely.

---

## 27. Explicitly deferred questions for reviewer feedback

Before implementation, reviewer feedback should specifically assess:

1. **Shared Question storage:** Is a dedicated shared/tag-reusable Question relationship the right representation given that `question_prompts` stores wording only?
2. **Reuse matching:** If one shared Question has several reuse scopes, should matching use ANY, ALL, or explicit compound rules?
3. **Resolver precedence:** How should duplicate prompt IDs be resolved when the same prompt is available from stimulus, Case, tag-reusable, Topic, and ancestor-Topic layers?
4. **Question tagging coverage:** Which contextual Question relationships need tags in the first implementation versus later?
5. **Tag hierarchy:** Should tags remain flat initially? Current preference: yes.
6. **Synonyms/normalisation:** How should spelling variants and clinical synonyms resolve to canonical Tags?
7. **Study semantics:** At what point should tags become learner-facing study/filter controls rather than primarily Admin/reuse metadata?
8. **Historical provenance:** When, if ever, should Review rows snapshot tag classification?
9. **Importer scope:** Should the first implementation keep tags outside Import Package v1 and add them only in a future compatible version?

---

## 28. Current recommendation

Do not block current resumable-import work or the first large content imports on this proposal.

The recommended progression is:

```text
NOW
Topic-first import
→ distinct clinical Cases
→ questions/images
→ descriptive Case titles
→ obvious Case tags when practical

THEN
Manual curation
→ Question tags where useful
→ identify genuinely reusable knowledge Questions
→ assign explicit Case-tag reuse scope

LATER
Cross-topic discovery
→ richer tag search/filtering
→ shared-question pools across Topics
→ promote useful clusters into learner study routes when appropriate
→ consider learner tag-based study after content quality is sufficient
```

The goal is a progressively enriched clinical knowledge graph without sacrificing the simple authoring model already established for Topics, Cases, stimuli, and contextual Questions.
