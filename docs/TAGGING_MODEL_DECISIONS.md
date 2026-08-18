# Tagging Model — Agreed Decisions

_Status: agreed architecture. Stage A, Stage B schema foundation, and Stage B learner behavior/Admin authoring are implemented._

_Last updated: 18 August 2026_

This document closes the open architecture questions in `PROPOSED_TAGGING_MODEL.md` after review against the real unpacked ECG Anki deck.

Where `PROPOSED_TAGGING_MODEL.md` describes an item as open, possible, or deliberately undecided, the decisions below are authoritative for the first implementation unless a later decision record explicitly changes them.

## 1. Tags are flat initially

The first implementation uses canonical flat Tags. Tags do not have parent/child relationships. Topic hierarchy remains separate and continues to provide curated learner study routes.

Example Tags may include `Prolonged QTc`, `Hypocalcaemia`, `Post-thyroidectomy`, `Atrial fibrillation`, and `Wellens syndrome`. A future Tag hierarchy may be added only if the real corpus demonstrates a need.

## 2. Tags are manually curated initially

Administrators assign and curate Tags. The first implementation does not require AI inference, automatic Anki-tag import, or automatic clinical taxonomy generation.

## 3. Initial Tag attachment scope

Tags are supported on Cases and contextual/shared Question entities where the Tag describes the knowledge tested. Individual ECG/image Assets do not need Tag relationships in the first implementation.

## 4. Case Tags do not automatically become Question Tags

Case Tags classify the clinical concepts covered by the Case. Question Tags classify the knowledge tested by that Question. A Question must not silently inherit all Tags from its parent Case.

The Admin UI may suggest Case Tags as convenient choices, but persisting Question Tags remains an explicit curation action.

## 5. Clinical Tags do not belong directly on question_prompts

`question_prompts` stores reusable wording only. Clinical meaning and answers belong on contextual Question relationships or on `shared_questions`.

## 6. Question Tags and reuse scope are separate

For reusable/shared knowledge Questions:

```text
Shared Question descriptive Tags
= What medical knowledge does this Question teach/test?

Reuse Scope Tag
= Which tagged Cases make this Question eligible for reuse?
```

Descriptive Tags must never be interpreted as the reuse matching rule. The Reuse Scope Tag is not automatically inserted into `shared_question_tags`.

## 7. One reuse-scope Tag per Shared Question initially

Exactly one `reuse_scope_tag_id` is required for each Shared Question. ANY/ALL/compound Boolean matching remains deferred.

## 8. Reuse scope creates eligibility, not mandatory display

When a Case has an active Tag matching an active Shared Question's `reuse_scope_tag_id`, the Shared Question becomes eligible for the Case question pool. It is not automatically mandatory on every Review.

The implemented eligibility rule is:

```text
shared_questions.is_active = true
AND question_prompts.is_active = true
AND question_prompts.preview_session_id IS NULL
AND tags.is_active = true
AND case_tags contains (selected production Case, reuse_scope_tag_id)
```

`case_tags` has no relationship-level archive flag in Stage A, so current relationship semantics are the presence of the row plus an active Tag. `shared_question_tags` is not queried for eligibility. Topic/Concept ancestry is not used to infer Tag eligibility.

## 9. Resolver precedence

Duplicate Prompt IDs resolve using:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic/Concept
> tag-shared Question
> nearest eligible inheritable ancestor Topic/Concept
> more distant eligible ancestors
```

The final candidate pool is deduplicated by `question_prompt_id`. A more contextual source wins over the same Prompt reached through a lower-priority source. This preserves stimulus-specific behavior and prevents a tag-shared answer from overriding Case/stimulus context.

## 10. Tags are not learner navigation in the first implementation

Tags support Admin curation, search/filtering, cross-cutting content retrieval, and Shared Question reuse. There is no learner-facing Study-by-Tag route in Stage B.

## 11. Review rows do not snapshot Tags initially

Tags remain mutable curation metadata. Reviews snapshot the actual learner-facing Prompt wording and answer. A selected Shared Question is recorded with:

```text
source_type = 'tag_shared'
source_shared_question_id = <shared_questions.id>
```

Reviews do not snapshot `reuse_scope_tag_id`, descriptive Tag IDs, or Case Tag IDs. Historical Review content therefore remains stable when Tag curation changes later.

## 12. Import Package v1 remains unchanged

The reviewed Import Package v1 does not require Tag fields. Administrators can add Tags during or after curation. A future additive package version may carry reviewed Tags.

## 13. No Tag alias/synonym system initially

One manually curated canonical name is used per Tag. Alias/synonym support remains deferred.

## 14. Cases remain presentation/vignette units

Cases are not merged merely because they share the same Tags or diagnosis. Tags describe overlapping clinical concepts; they do not define Case identity.

## 15. Staged implementation

### Stage A — Tag foundation and curation

Status: **landed**.

Implemented flat canonical Tags, Case↔Tag relationships, contextual Case Question↔Tag relationships, Admin curation/filtering, and no learner resolver change.

### Stage B1 — tag-scoped Shared Question schema foundation

Status: **landed in migration `0008_tag_shared_questions.sql` and applied to production D1 before Stage B2 implementation**.

Implemented:

- `shared_questions` with reusable Prompt, answer, exactly one Reuse Scope Tag and active/archive state;
- `shared_question_tags` for zero or more descriptive Tags;
- active Shared Question uniqueness by `question_prompt_id` while archived historical rows may coexist;
- nullable `review_questions.source_shared_question_id`;
- `tag_shared` Review source type;
- database triggers preventing Preview-owned Prompts from becoming Shared Questions.

`shared_questions` is global production-curated knowledge and deliberately has no `preview_session_id`.

### Stage B2 — learner behavior and Shared Question authoring

Status: **implemented on `agent/tagging-stage-b-behavior` for review**.

Implemented:

- `/admin/shared-questions` list/create/archive/reactivate workflow;
- Shared Question detail editing;
- reuse of an existing active production Question Prompt or creation of new production Prompt wording during Shared Question creation;
- exactly one active Reuse Scope Tag selector;
- independent zero-or-more descriptive Tag selection;
- explicit UI copy that descriptive Tags do not control eligibility;
- active Case Tag ↔ `reuse_scope_tag_id` eligibility;
- integration into the existing learner resolver rather than a parallel generator;
- Prompt-ID deduplication using the precedence in section 9;
- normal Automatic / All / Fixed selection over the enlarged deduplicated pool;
- `tag_shared` Review provenance and immutable learner-facing snapshots;
- Questions Library Prompt-edit blast-radius accounting for Shared Question usages;
- Preview Prompt rejection at both application and D1-trigger boundaries.

No migration is introduced by Stage B2. No Worker deployment or production D1 migration is part of this behavior/authoring change.

## 16. Shared Question storage direction

The authoritative separation is:

```text
question_prompts
= reusable wording

shared_questions
= reusable medical meaning + answer

shared_question_tags
= what the Question tests/describes

reuse_scope_tag_id
= which tagged Cases make it eligible
```

The Reuse Scope Tag is not automatically inserted into `shared_question_tags`.

## 17. ECG Anki corpus validation

The unpacked ECG Anki deck was reviewed as a real-world stress test. Its dominant structure remains naturally compatible with Topic → Case → vignette/ECG → contextual questions. Genuinely repeated medical knowledge can be promoted to Shared Questions later without requiring Cases to be merged or initial ingestion to wait for a complete taxonomy.

## 18. What remains deliberately deferred

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

## 19. Final architecture summary

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
= reusable Prompt + medical answer

SHARED QUESTION TAGS
= descriptive metadata for what the reusable Question teaches/tests

SHARED QUESTION REUSE SCOPE
= exactly one Case Tag that makes the Question eligible
```

The implementation principle remains: attach knowledge at the broadest scope where its answer and educational meaning remain reliably correct, while keeping more specific stimulus and Case context authoritative when scopes overlap.
