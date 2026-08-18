# Proposed Topic, Case, and Question Tagging Model

_Status: **historical/superseded proposal**. The open design questions in this file were resolved by `TAGGING_MODEL_DECISIONS.md`. Tagging Stage A and Stage B are now implemented; Stage B is deployed in production._

_Last updated: 18 August 2026_

This document is retained only to preserve the design path that led to the current tagging architecture. Do not use it as a pending implementation plan.

For current requirements use:

- `TAGGING_MODEL_DECISIONS.md` — authoritative architecture decisions;
- `TAGGING_STAGE_B_BEHAVIOR.md` — deployed Shared Question learner/Admin behavior;
- `STAGE_A_TAG_FOUNDATION.md` — implemented Stage A foundation;
- `V1_DATA_MODEL.md` — current schema/relationship semantics;
- `CURRENT_PRODUCT_ROADMAP.md` — current next product work.

## Historical design conclusion

The proposal converged on retaining the existing teaching model:

```text
Topic
└── Case
    ├── fixed / alternative stimuli
    └── contextual questions
```

and adding cross-cutting reusable metadata/knowledge:

```text
TOPIC
= curated learner study route / hierarchy

CASE
= one coherent clinical presentation

CASE TAGS
= clinically meaningful concepts covered by the Case

CONTEXTUAL QUESTION TAGS
= knowledge tested by that contextual Question

QUESTION PROMPT
= reusable wording only

SHARED QUESTION
= reusable medical answer/meaning

SHARED QUESTION DESCRIPTIVE TAGS
= what that reusable knowledge teaches/tests

SHARED QUESTION REUSE SCOPE
= one Case Tag that makes the Question eligible
```

The governing principle became:

> Attach knowledge at the broadest scope where its answer and educational meaning remain reliably correct, while keeping more specific stimulus and Case context authoritative when scopes overlap.

## Resolved decisions

The first/current implementation uses:

- flat canonical Tags;
- manual administrator curation;
- Tags on Cases and contextual/shared Question entities, not on `question_prompts`;
- no Asset Tags;
- no automatic Case Tag → Question Tag inheritance;
- exactly one Reuse Scope Tag per Shared Question;
- independent descriptive Shared Question Tags;
- Reuse Scope match creates eligibility, not mandatory display;
- no learner Study-by-Tag;
- no Review Tag snapshots;
- no compound Tag expressions;
- no Tag hierarchy or alias layer;
- no Tag fields in Import Package v1.

Current duplicate-Prompt precedence is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

## Implemented staging outcome

### Stage A — complete

Migration `0005_tag_foundation.sql` and associated Admin behavior implemented:

- `tags`;
- Case ↔ Tag relationships;
- contextual Case Question ↔ Tag relationships;
- Admin Tag management and curation/filtering.

Stage A did not alter learner Question resolution by itself.

### Stage B — complete/deployed

Migration `0008_tag_shared_questions.sql` added the Shared Question schema/provenance foundation and was applied to production D1.

PR #43 then implemented/deployed:

- Shared Question Admin authoring/archive/reactivation;
- one Reuse Scope Tag plus independent descriptive Tags;
- exact active Case Tag matching for learner eligibility;
- resolver integration and Prompt-ID deduplication;
- Automatic/All/Fixed integration;
- `tag_shared` Review provenance;
- global Prompt usage/blast-radius integration;
- production/Preview ownership protections.

There is no pending “Stage B implementation” represented by this proposal.

## ECG corpus validation

The 66-note unpacked ECG Anki deck was the real-world stress test used to close the architecture decisions.

Its dominant structure:

```text
clinical vignette
→ ECG
→ several subquestions
→ answers
```

maps naturally to:

```text
Topic
└── Case
    ├── vignette
    ├── fixed ECG Asset
    └── contextual Case Questions
```

The corpus supported progressive enrichment rather than requiring a full ontology before import.

That initial migration is now complete in production:

```text
13 Batch 01 imports
+ 51 Batch 02 imports
+ 2 pre-existing mapped calcium Cases
= 66 / 66 source notes represented
```

Current ECG work is Tag/Shared Question/Study Topic/stimulus curation, not completion of this old proposal.

## Historical alternatives deliberately not adopted in current V1

The proposal considered or left open several richer possibilities. They remain deferred unless real content later justifies them:

- multi-Tag ANY/ALL reuse scopes;
- Tag hierarchy;
- learner Study-by-Tag;
- Review Tag provenance snapshots;
- Tag aliases/synonyms;
- automatic/AI Tag assignment;
- Asset Tags;
- Tag fields in importer package format;
- answer-side image relationships as part of tagging.

Any future revival of one of these ideas requires a new explicit decision/implementation record rather than treating this historical proposal as an active requirement.
