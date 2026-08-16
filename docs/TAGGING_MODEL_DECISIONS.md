# Tagging Model — Agreed Decisions

_Status: agreed architecture decision record. Ready to guide implementation after PR #24 merges._

_Last updated: 16 August 2026_

This document closes the open architecture questions in `PROPOSED_TAGGING_MODEL.md` after review against the real unpacked ECG Anki deck.

Where `PROPOSED_TAGGING_MODEL.md` describes an item as open, possible, or deliberately undecided, the decisions below are authoritative for the first implementation unless a later decision record explicitly changes them.

## 1. Tags are flat initially

The first implementation will use canonical flat Tags.

Tags do not have parent/child relationships in the first implementation. Topic hierarchy remains separate and continues to provide curated learner study routes.

Example Tags may include:

- `Prolonged QTc`
- `Hypocalcaemia`
- `Post-thyroidectomy`
- `Atrial fibrillation`
- `Wellens syndrome`

A Case may carry any useful combination of Tags without requiring those Tags to sit in a tree.

A future Tag hierarchy may be added only if the real corpus demonstrates a need.

## 2. Tags are manually curated initially

Administrators assign and curate Tags.

The first implementation does not require AI inference, automatic Anki-tag import, or automatic clinical taxonomy generation.

Future tooling may suggest Tags for administrator approval, but automatic suggestions are outside the first implementation.

## 3. Initial Tag attachment scope

The first implementation should support Tags on:

1. Cases; and
2. contextual/shared Question entities where the Tag describes the knowledge tested.

Individual ECG/image Assets do not need Tag relationships in the first implementation.

## 4. Case Tags do not automatically become Question Tags

Case Tags classify the clinical concepts covered by the Case.

Question Tags classify the knowledge tested by that Question.

A Question must not silently inherit all Tags from its parent Case.

Example:

```text
Case Tags:
- Hypocalcaemia
- Prolonged QTc
- Post-thyroidectomy

Question:
What are the causes of hypocalcaemia?

Question Tags:
- Hypocalcaemia
```

The Question is not automatically a `Post-thyroidectomy` Question merely because it appears in that Case.

The Admin UI may suggest Case Tags as convenient choices, but persisting Question Tags must remain an explicit curation action.

## 5. Clinical Tags do not belong directly on question_prompts

`question_prompts` stores reusable wording only.

A prompt such as:

```text
What is the diagnosis?
```

can be used in Cases involving atrial fibrillation, pulmonary embolism, STEMI, electrolyte disorders, and many other contexts.

Clinical meaning and answers therefore belong on contextual Question relationships or on the shared-knowledge Question entity, not on `question_prompts` itself.

## 6. Question Tags and reuse scope are separate

For a reusable/shared knowledge Question, two different properties are required:

```text
Question Tags
= What medical knowledge does this Question teach/test?

Reuse scope
= Which tagged Cases make this Question eligible for reuse?
```

Example:

```text
Question:
What ECG abnormality is associated with severe hypocalcaemia?

Answer:
QT prolongation / prolonged QTc

Question Tags:
- Hypocalcaemia
- Prolonged QTc

Reuse scope:
- Hypocalcaemia
```

The Question teaches the relationship between hypocalcaemia and prolonged QTc, while remaining eligible across Cases whose relevant shared concept is hypocalcaemia.

The descriptive Question Tags must not be interpreted as the reuse matching rule.

## 7. One reuse-scope Tag per shared Question initially

The first implementation should support exactly one reuse-scope Tag for each shared/tag-reusable Question.

This deliberately avoids introducing ANY/ALL/compound Boolean matching before the real corpus demonstrates that it is required.

If later content requires a Question to be reusable only when several Tags occur together, compound reuse rules can be designed as an additive feature.

## 8. Reuse scope creates eligibility, not mandatory display

When a Case matches the reuse-scope Tag of a shared Question, that Question becomes eligible for the Case question pool.

It is not automatically mandatory on every Review.

Existing Case question-selection behaviour remains responsible for choosing the final learner Question set.

This prevents heavily tagged Cases from accumulating an unbounded mandatory list of shared Questions.

## 9. Resolver precedence

When the same Question Prompt is available from several sources, the more contextual answer should win.

The agreed first ordering is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> eligible ancestor Topic
```

This preserves the existing principle that exact stimulus and Case context override more generic reusable knowledge.

The implementation PR for shared/tag-reusable Questions must add regression coverage for this precedence and for deduplication by Question Prompt.

## 10. Tags are not learner navigation in the first implementation

Tags initially support:

- Admin curation;
- search and filtering;
- cross-cutting content retrieval; and
- shared Question reuse.

The first implementation does not need a learner-facing `Study by Tag` route or Tag filter.

Learner Tag-based study can be considered later when the corpus has enough well-curated Tags to make the behaviour reliable.

## 11. Review rows do not snapshot Tags initially

Tags are initially mutable curation metadata.

Reviews should continue to snapshot the actual Case, Study Topic, Questions, answers, and stimuli shown to the learner.

Tag provenance should be added only if Tags later drive historically meaningful mastery analytics, scheduling, learner reports, or audit requirements.

## 12. Import Package v1 remains unchanged

The current reviewed Import Package v1 does not need Tag fields.

Initial ingestion remains:

```text
Topic/deck
→ Case
→ questions
→ images/stimuli
```

Administrators can add Tags during or after curation in the application.

A future additive package version may carry already-reviewed Tags, but importing partially structured content must not depend on having a completed clinical Tag taxonomy.

## 13. No Tag alias/synonym system initially

The first implementation uses one manually curated canonical name per Tag.

Examples such as:

```text
Prolonged QTc
QT prolongation
Long QT
```

should be normalised by administrator curation rather than represented as separate aliases in the first schema.

A future alias/synonym layer may map alternative spellings or terminology to one canonical Tag if search and corpus size make that worthwhile.

## 14. Cases remain presentation/vignette units

Cases are not merged merely because they share the same Tags or diagnosis.

Several complete-heart-block Cases, for example, may legitimately remain distinct because their vignettes, causes, ECGs, questions, or educational emphasis differ.

The identity rule remains:

```text
Case
= one coherent clinical presentation/vignette
```

Tags describe overlapping clinical concepts; they do not define Case identity.

## 15. Staged implementation

The architecture should be implemented in two stages rather than one large behavioural PR.

### Stage A — Tag foundation and curation

Implement:

- `tags`;
- Case↔Tag relationships;
- Question-tag relationships at the appropriate contextual Question level;
- Admin Tag management;
- adding/removing Tags from Cases and Questions;
- searching/filtering Cases and Questions by Tag.

Stage A should not change learner Question resolution.

This allows the content corpus to be curated and tagged safely before tag-based reuse affects Reviews.

For Stage A, Question tagging should be added only to contextual Question relationship types that the Admin product can safely author and retrieve without changing learner resolution. If supporting every current contextual relationship (`case_questions`, `concept_questions`, `stimulus_group_questions`, and `stimulus_option_questions`) would make Stage A unnecessarily broad, implementation may begin with Case Questions and extend the same relationship pattern additively. Shared Question tags belong to Stage B because `shared_questions` does not exist until then.

### Stage B — tag-scoped shared Questions

Implement:

- the shared/tag-reusable Question entity;
- one reuse-scope Tag per shared Question;
- descriptive Question Tags on shared Questions;
- Case eligibility from reuse-scope Tags;
- learner resolver integration;
- the agreed resolver precedence;
- interaction with Automatic / All / Fixed selection;
- Review Question snapshot/provenance regression coverage.

This stage changes learner-visible Question eligibility and therefore should be reviewed separately from metadata/Admin tooling.

## 16. Shared Question storage direction

The agreed logical model is a dedicated shared-knowledge Question relationship rather than attaching answers or clinical meaning directly to `question_prompts`.

A suitable first schema direction is:

```text
shared_questions
- id
- question_prompt_id
- answer_md
- reuse_scope_tag_id
- is_active
- created_at
- updated_at

shared_question_tags
- shared_question_id
- tag_id
```

This is the intended semantic shape for the implementation PR. Exact table and column names may follow repository conventions, but the separation must remain:

```text
question_prompts
= reusable wording

shared_questions
= reusable medical meaning + answer

shared_question_tags
= what the Question tests

reuse_scope_tag_id
= which tagged Cases make it eligible
```

## 17. ECG Anki corpus validation

The unpacked ECG Anki deck was reviewed as a real-world stress test before closing this architecture.

The deck contains 66 notes. Every note has one front-side ECG image, and the dominant source structure is:

```text
clinical vignette
→ ECG
→ several subquestions
→ answers
```

This maps naturally to the existing application model:

```text
Topic
└── Case
    ├── vignette
    ├── fixed ECG Asset
    └── Case Questions
```

Typical source questions include:

- describe/comment on the ECG;
- give the diagnosis;
- causes/risk factors;
- investigations;
- management/treatment;
- clinical signs/symptoms;
- diagnostic criteria or additional teaching points.

The corpus does not require a redesign of the existing Case, stimulus, or contextual Question schema.

For initial ingestion:

- one Anki note may generally become one Case;
- the front ECG may be a fixed Case Asset;
- explicit subquestions may initially become Case Questions;
- genuinely repeated medical knowledge can be promoted to shared/tag-reusable Questions later;
- repeated diagnoses do not require Cases to be merged;
- exact image-dependent Questions may remain Case Questions while a Case has only one fixed ECG, and can be moved to stimulus-option scope if that Case later gains alternative ECGs.

The deck therefore supports the progressive-enrichment approach rather than requiring a complete ontology before import.

Two answer-side images were observed in the source material. This is not sufficient evidence to add answer-image schema in the tagging work; clinically important answer-side content can be transcribed/reviewed during import, with answer-side Asset support reconsidered if future decks demonstrate a recurring need.

## 18. What remains deliberately deferred

The following are not requirements for the first tagging implementation:

- Tag hierarchy;
- automatic/AI Tag assignment;
- Tagging individual Assets;
- automatic inheritance of Case Tags onto Questions;
- Tags on `question_prompts`;
- multiple or compound reuse-scope rules;
- learner-facing Study-by-Tag;
- Review Tag snapshots;
- Tag aliases/synonyms;
- Tag fields in Import Package v1;
- answer-side image relationships.

These should be revisited only when real content or learner behaviour provides a concrete requirement.

## 19. Final architecture summary

The agreed model is:

```text
TOPIC
= curated learner study route / organisational tree

CASE
= one coherent clinical vignette/presentation

CASE TAGS
= clinically meaningful concepts covered by the Case

CONTEXTUAL QUESTION TAGS
= knowledge tested by that contextual Question

QUESTION PROMPT
= reusable wording only

SHARED QUESTION
= reusable prompt + medical answer

SHARED QUESTION TAGS
= what that reusable knowledge Question teaches/tests

SHARED QUESTION REUSE SCOPE
= one Case Tag that makes the Question eligible
```

The implementation principle remains:

> Attach knowledge at the broadest scope where its answer and educational meaning remain reliably correct, while keeping more specific stimulus and Case context authoritative when scopes overlap.
