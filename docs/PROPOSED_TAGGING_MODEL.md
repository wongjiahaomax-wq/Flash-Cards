# Proposed Topic, Case, and Question Tagging Model

_Status: superseded as an open proposal by [`TAGGING_MODEL_DECISIONS.md`](TAGGING_MODEL_DECISIONS.md). The decision record is authoritative for implementation._

_Last updated: 16 August 2026_

This document preserves the design exploration that led to the agreed tagging architecture. The previously open questions in this proposal have now been resolved after review against the real unpacked ECG Anki corpus.

For implementation requirements, use:

- [`TAGGING_MODEL_DECISIONS.md`](TAGGING_MODEL_DECISIONS.md) — agreed decisions, staged implementation, resolver semantics, and ECG corpus validation;
- [`V1_DATA_MODEL.md`](V1_DATA_MODEL.md) — currently implemented application data model;
- [`CONTENT_IMPORT_PACKAGES.md`](CONTENT_IMPORT_PACKAGES.md) — current reviewed Import Package v1 boundary.

## Design conclusion

The agreed architecture keeps the existing core model:

```text
Topic
└── Case
    ├── stimulus / alternative stimulus
    └── contextual questions
```

and adds progressive semantic enrichment:

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

The implementation principle is:

> Attach knowledge at the broadest scope where its answer and educational meaning remain reliably correct, while keeping more specific stimulus and Case context authoritative when scopes overlap.

## Resolved implementation direction

The first implementation uses flat, manually curated canonical Tags. Tags initially attach to Cases and the appropriate contextual/shared Question entities, not directly to `question_prompts` and not to individual image Assets.

Case Tags do not automatically become Question Tags. Question Tags describe what the Question tests. Reuse scope is separate from descriptive Question Tags.

A shared Question initially has exactly one reuse-scope Tag. Matching that Tag makes the Question eligible for the Case question pool; it does not make the Question mandatory.

When the same Question Prompt is available at several scopes, the agreed precedence is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> eligible ancestor Topic
```

Tags initially support Admin curation, filtering, retrieval, and shared-question reuse. Learner-facing Study-by-Tag, Review Tag snapshots, Tag hierarchy, alias/synonym infrastructure, AI Tag assignment, compound reuse rules, and Tag fields in Import Package v1 are deferred.

## Staged implementation

### Stage A — Tag foundation and curation

Implement Tags, Case↔Tag relationships, contextual Question tagging, Admin Tag management, adding/removing Tags, and Case/Question filtering by Tag.

Stage A must not change learner Question resolution.

### Stage B — tag-scoped shared Questions

Implement the shared/tag-reusable Question entity, one reuse-scope Tag per shared Question, descriptive shared-Question Tags, Case eligibility from Tags, learner resolver integration, precedence, selection interaction, and Review snapshot/provenance regression coverage.

This behavioural stage is deliberately separate from the metadata/Admin stage.

## ECG corpus validation

The unpacked ECG Anki deck was reviewed as a real-world stress test. It contains 66 notes, each with one front-side ECG image. The dominant structure is:

```text
clinical vignette
→ ECG
→ several subquestions
→ answers
```

This maps naturally to one Case with a vignette, fixed ECG Asset, and contextual Case Questions. Repeated diagnoses may remain separate Cases because the vignette, ECG, questions, or educational emphasis differs. Reusable knowledge can be promoted later as the corpus is curated.

The deck therefore does not require redesigning the current Case, stimulus, or contextual Question model. Two answer-side images were observed, which is not enough evidence to add answer-image schema as part of the tagging work.

## Import boundary

Import Package v1 remains unchanged. Initial Anki ingestion can continue as:

```text
Topic/deck
→ Case
→ questions
→ images/stimuli
```

Administrators can add Tags later. A future additive import-package version may carry already-reviewed Tags if that becomes useful.

## Historical note

Earlier revisions of this document explored open alternatives including multi-Tag reuse semantics, Tag hierarchy, learner Study-by-Tag, Review Tag provenance, synonym handling, and importer Tag support. Those alternatives are intentionally not reproduced as active requirements here; their resolutions are recorded in [`TAGGING_MODEL_DECISIONS.md`](TAGGING_MODEL_DECISIONS.md).
