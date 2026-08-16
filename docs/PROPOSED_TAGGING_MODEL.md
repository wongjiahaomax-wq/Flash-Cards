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

That structure remains useful for authoring and learner navigation, but real medical teaching material frequently crosses conceptual boundaries.

Examples:

- a QTc Case may be caused by hypocalcaemia, hypercalcaemia, or drugs;
- an Anaemia Case may be about thalassaemia, iron deficiency, or chronic disease;
- an ECG-led Case can contain questions about calcium physiology;
- the same broad knowledge area may appear in Cardiology, Endocrinology, Renal Medicine, Pharmacology, or Emergency Medicine material.

Trying to force every cross-link into the Topic hierarchy makes initial ingestion harder and risks creating a large, artificial taxonomy before enough real content exists to justify it.

The proposed approach is therefore:

> Keep Topics as the primary organisational structure, use Case tags for broad cross-linking, and allow Question tags to override the Case classification only when a particular question tests something different.

This should support progressive enrichment: import first according to the source material, then add cross-links as the corpus grows.

---

## 2. Topic = where the material primarily lives

A Topic remains the main curated study/authoring route.

Examples:

```text
Cardiology
└── ECG
    └── QTc

Haematology
└── Anaemia
```

Topics remain relatively stable and hierarchical.

The existing `concepts` / `case_concepts` model should not be weakened into a generic tagging system. In particular, an attached Case Topic currently has learner-routing meaning: it means the Case is a valid study route for that Topic.

Tags should therefore be a separate, weaker relationship.

---

## 3. Case tags = broad cross-links for the presentation

A Case may have one or more tags describing the main cross-cutting idea(s) represented by that presentation.

Example:

```text
Topic: Cardiology → ECG → QTc

Case A: Prolonged QTc due to hypocalcaemia
Case tags:
- Hypocalcaemia
- Calcium

Case B: Shortened QTc due to hypercalcaemia
Case tags:
- Hypercalcaemia
- Calcium

Case C: Drug-induced prolonged QTc
Case tags:
- Drugs
```

This allows the original Topic structure to remain intact while supporting useful intersections such as:

```text
QTc + Hypocalcaemia
QTc + Hypercalcaemia
QTc + Drugs
```

Likewise:

```text
Topic: Haematology → Anaemia
Case: Beta-thalassaemia trait
Case tags:
- Thalassaemia
```

A Case tag does **not** mean that the Case should become an alternate learner Topic route. It only means that the Case is related to that idea for discovery, filtering, curation, or future tag-based study.

---

## 4. Default rule: Case questions inherit the Case tags

Most questions in an imported Case should require no additional semantic work.

If a Case Question has **no explicit Question tag**, its effective tag classification comes from the Case.

Example:

```text
Topic: Cardiology → ECG → QTc
Case: Prolonged QTc due to hypocalcaemia
Case tags: Hypocalcaemia, Calcium
```

Questions:

```text
Q1. What is the diagnosis?
No explicit Question tags.
Effective tags: Hypocalcaemia, Calcium

Q2. What are the causes of hypocalcaemia?
No explicit Question tags.
Effective tags: Hypocalcaemia, Calcium
```

This makes initial ingestion cheap: authors can tag the Case once instead of individually classifying every question.

---

## 5. Question tags = an override when the question tests something different

Some questions inside a Case test a different knowledge area from the Case's broad cross-link.

In that situation the author may explicitly tag the Question usage.

The proposed rule is:

> If a contextual Question usage has one or more explicit Question tags, use those tags instead of the inherited Case tags for semantic/tag-based classification.

Example using the same hypocalcaemia Case:

```text
Q3. Which drugs can cause this ECG abnormality?
Explicit Question tag:
- Prolonged QTc
```

For tag-based classification, Q3 is therefore a **Prolonged QTc** question, not a Hypocalcaemia/Calcium question merely because it appears inside the hypocalcaemia Case.

The distinction is intentional:

```text
Q1 What is the diagnosis?
→ follows the Case
→ Hypocalcaemia / Calcium

Q2 What are the causes of hypocalcaemia?
→ follows the Case
→ Hypocalcaemia / Calcium

Q3 Which drugs can cause this ECG abnormality?
→ explicit override
→ Prolonged QTc
```

This should make future cross-topic retrieval substantially more precise without requiring every question to be manually tagged.

---

## 6. Reusable Question Prompts should not carry global clinical tags

The existing data model separates reusable prompt wording (`question_prompts`) from the contextual relationship that supplies its answer (`case_questions`, `concept_questions`, stimulus-specific question relationships, etc.).

This distinction should be preserved for tagging.

For example, the reusable prompt:

```text
What is the diagnosis?
```

may be used in many different contexts:

```text
Beta-thalassaemia Case
→ answer: Beta-thalassaemia trait
→ follows that Case's tags

Hypocalcaemia Case
→ answer: Hypocalcaemia
→ follows that Case's tags

STEMI Case
→ answer: Anterior STEMI
→ follows that Case's tags
```

It would therefore be incorrect to attach a global `Thalassaemia`, `Hypocalcaemia`, or `STEMI` tag to the reusable prompt itself.

Clinical Question tags should attach to the **contextual Question usage**, not automatically to the underlying reusable wording.

This preserves the existing ability to reuse Question Prompts safely across Cases while allowing each usage to have different semantic classification.

---

## 7. Reusability and tagging are separate properties

The authoring UI should not make “reusable” and “tagged” the same control.

They answer different questions:

```text
Reusable
= Can this Question Prompt wording be used in another context?

Explicit Question tags
= Does this particular Question usage test a different knowledge area from the Case tags?
```

Therefore all combinations should be possible:

- non-reusable/question-specific usage with inherited Case tags;
- non-reusable/question-specific usage with explicit Question tags;
- reusable prompt usage with inherited Case tags;
- reusable prompt usage with explicit Question tags.

---

## 8. Proposed authoring mental model

The common workflow should remain simple.

### Case level

```text
Topic
Cardiology → ECG → QTc

Case
Prolonged QTc due to hypocalcaemia

Tags
[ Hypocalcaemia ] [ Calcium ] [+ Add tag]
```

### Question level

By default:

```text
What is the diagnosis?
Tags: follows Case
```

Only when needed:

```text
Which drugs can cause this ECG abnormality?
Question classification: override Case tags
[ Prolonged QTc ]
```

The UI should make the inherited state obvious while avoiding mandatory per-question classification.

Possible product wording for review:

```text
Tags
○ Follow Case tags
● Use Question tags
   [ Prolonged QTc ]
```

The exact control and wording are not decided by this proposal.

---

## 9. Progressive ingestion strategy

This tagging model is intended to support a topic-first migration of existing Anki material.

Recommended sequence:

1. Import material using its existing broad Topic/deck organisation.
2. Preserve each source note/slide as a Case where appropriate.
3. Import questions primarily as Case Questions unless there is a clear reason to promote them to a reusable Topic relationship.
4. Add a small number of Case tags describing the broad cross-link represented by the Case.
5. Leave most Question usages untagged so they inherit the Case tags.
6. Add explicit Question tags only when a Question clearly tests a different knowledge area from the Case.
7. As the corpus grows, use tags to discover clusters across original Topics and decide which material merits stronger reusable Topic relationships or new study experiences.

This avoids requiring a complete medical ontology before the first large import.

---

## 10. Desired future behaviour

The model should eventually support discovery such as:

```text
Study Topic: QTc
Filter/tag: Hypocalcaemia
```

or:

```text
Find questions classified as Prolonged QTc
```

or:

```text
Find all Calcium-related material across Cardiology, Endocrinology, Renal Medicine, etc.
```

The system should distinguish whether a Question matched because:

- it explicitly carries the requested Question tag; or
- it inherits the requested Case tag.

This provenance will be useful for administrator review and debugging.

---

## 11. Possible schema direction — deliberately not final

If implemented, a minimal starting point could include a first-class tag table and Case relationships:

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

Question tagging requires more care because the current system has several contextual Question relationship types:

- `case_questions`;
- `concept_questions`;
- `stimulus_group_questions`;
- `stimulus_option_questions`.

The proposal does **not** yet choose between:

1. separate tag join tables for each contextual Question relationship; or
2. a future unified Question-usage abstraction that can own tags consistently.

The implementation should not add clinical tags directly to `question_prompts` as the primary mechanism, because a reusable prompt can have different clinical meanings in different contexts.

For the near-term Anki migration, Case-level inheritance plus explicit Case-Question overrides is the main behaviour to optimise.

---

## 12. Relationship to existing multi-Topic routing

This proposal should remain separate from existing Case↔Topic learner routing.

The intended semantics are:

```text
Case Topic relationship
= This Case is a valid learner study route for this Topic.

Case tag
= This Case is broadly related to this idea.

Question tag
= This contextual Question usage should be classified under this idea instead of inheriting the Case tags.
```

Do not repurpose `case_concepts.role = secondary` as a generic tag mechanism. Secondary Topic relationships currently participate in learner routing and Review provenance and therefore have stronger semantics than tags.

---

## 13. Explicitly deferred questions for reviewer feedback

This document is intended for architecture review before implementation. The reviewer should specifically assess:

1. **Override semantics:** Is `explicit Question tags replace inherited Case tags` the right rule, or should any circumstances support additive inheritance?
2. **Question-usage identity:** Should tags attach directly to the existing contextual relationship rows, or is a unified Question-usage abstraction justified?
3. **Concept/Topic questions:** If reusable Topic Questions later participate in tag study, should they default to their owning Topic, require explicit tags, or use another rule?
4. **Tag hierarchy:** Should tags initially remain flat, or is parent/child structure required? The current preference is to keep tags flat until real content demonstrates a need.
5. **Synonyms/normalisation:** How should `QTc`, `Prolonged QTc`, `long QT`, `hypocalcaemia`, etc. be normalised without creating duplicate tags?
6. **Study semantics:** Should tags initially be admin/search/filter metadata only, with tag-based learner study added later after enough content exists?
7. **Historical provenance:** If Case or Question tags change later, do Reviews need tag snapshots for analytics, or can tag classification remain current metadata until a real analytics requirement appears?
8. **Importer scope:** Should Import Package v1 remain unchanged initially, with tags authored after import, or should a future additive package version support reviewed Case/Question tags?

---

## 14. Current recommendation

Do not block the current resumable-import work or first large content imports on this proposal.

The recommended direction is:

```text
NOW
Topic-first import
→ Cases
→ questions/images
→ basic Case tags when obvious

THEN
Manual curation
→ explicit Question tags only where needed

LATER
Cross-topic/tag retrieval and study
→ discover reusable clusters
→ promote genuinely reusable knowledge structures based on real corpus behaviour
```

The goal is to let the knowledge graph emerge from the imported corpus while preserving a simple authoring workflow and the existing Topic/Case/stimulus architecture.
