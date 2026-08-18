# Tagging Model — Agreed Decisions

_Status: authoritative current architecture. Tagging Stage A and Stage B are merged; Stage B learner behavior and Shared Question Admin authoring are deployed in production._

_Last updated: 18 August 2026_

This document records the agreed Topic/Case/Question Tag architecture after validation against the real ECG Anki corpus. `PROPOSED_TAGGING_MODEL.md` is historical exploration; this file is authoritative unless a later decision record explicitly changes it.

## 1. Tags are flat and manually curated

The current model uses canonical flat Tags.

Tags do not have parent/child relationships. Topic hierarchy remains separate and supplies curated learner study routes.

Administrators curate Tags explicitly. Current V1 does not require AI inference, automatic Anki Tag ingestion, or automatic taxonomy generation.

## 2. Tags and Topics are different

```text
Topic
= learner study route / hierarchy

Tag
= cross-cutting clinical metadata
```

A Case may belong to several Study Topics and also carry several Tags. Similar names across those lists do not make the relationships interchangeable.

## 3. Current Tag attachment scope

Current implemented Tag relationships include:

- Case ↔ Tag (`case_tags`);
- contextual Case Question ↔ Tag (`case_question_tags`);
- Shared Question ↔ descriptive Tags (`shared_question_tags`);
- exactly one Shared Question Reuse Scope Tag (`shared_questions.reuse_scope_tag_id`).

Tags are not stored directly on `question_prompts`, and image Assets do not currently have Tag relationships.

## 4. Case Tags do not automatically become Question Tags

Case Tags describe concepts covered by the Case. Question Tags describe knowledge tested by that contextual/shared Question.

Example:

```text
Case Tags
- Hypocalcaemia
- Prolonged QTc
- Post-thyroidectomy

Question
What are the causes of hypocalcaemia?

Question Tags
- Hypocalcaemia
```

The Question does not silently inherit all Case Tags.

## 5. Clinical meaning does not belong on `question_prompts`

`question_prompts` stores reusable wording only.

```text
What is the diagnosis?
```

can occur across many unrelated conditions. The answer/clinical meaning belongs to contextual Question relationships or to `shared_questions`, not to the Prompt row.

## 6. Shared Question descriptive Tags and reuse scope are separate

A Shared Question has two independent Tag concepts:

```text
Descriptive Tags
= what knowledge the Question teaches/tests

Reuse Scope Tag
= which tagged Cases make the Question eligible
```

Example:

```text
Shared Question
Prompt: What ECG abnormality is associated with severe hypocalcaemia?
Answer: QT prolongation / prolonged QTc

Reuse Scope Tag
- Hypocalcaemia

Descriptive Tags
- Hypocalcaemia
- Prolonged QTc
```

The Reuse Scope Tag is not automatically inserted into `shared_question_tags`.

## 7. Exactly one Reuse Scope Tag in current V1

Every active Shared Question has exactly one non-null Reuse Scope Tag.

This deliberately avoids compound ANY/ALL logic before the real curated corpus demonstrates a need.

Multiple/compound scopes may be added later as an additive feature if required.

## 8. Reuse scope creates eligibility, not mandatory display

Matching a Reuse Scope Tag makes a Shared Question eligible for the normal question pool. It does not force the Question into every Review.

Current exact eligibility for a selected production Case is:

```text
shared_questions.is_active = true
AND question_prompts.is_active = true
AND question_prompts.preview_session_id IS NULL
AND the Reuse Scope Tag is active
AND case_tags contains (selected Case, Reuse Scope Tag)
```

`case_tags` has no relationship-level archive flag; the relationship exists when the row exists and the referenced Tag is active.

`shared_question_tags` does not participate in eligibility. Topic/Concept ancestry does not infer Tag matches.

## 9. Resolver precedence

When the same Question Prompt is available from several sources, the more contextual answer wins:

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

## 10. Question-count interaction

Eligible Shared Questions join the normal final deduplicated pool before selection.

- **Automatic** preserves existing target/cap and stimulus-specific coverage semantics.
- **All** includes every deduplicated eligible question.
- **Fixed** respects the configured count; Shared Questions do not increase the Review beyond it.

## 11. Tags are not learner navigation in current V1

Tags currently support:

- Admin curation;
- search/filtering/retrieval;
- Shared Question reuse.

Learner Study-by-Tag remains deferred. Topics remain the learner-navigation hierarchy.

## 12. Reviews snapshot content/provenance, not Tag relationships

Tags are mutable curation metadata.

For a selected Shared Question, `review_questions` stores:

```text
source_type = 'tag_shared'
source_shared_question_id = <shared_questions.id>
prompt_snapshot_md = exact Prompt shown
answer_snapshot_md = exact reusable answer shown
```

Reviews do not snapshot:

- Reuse Scope Tag ID;
- descriptive Shared Question Tag IDs;
- Case Tag IDs.

Historical Review wording/answer/source identity therefore remains stable even if curation later changes eligibility Tags.

## 13. Import Package v1 remains unchanged

Tags are not required by current reviewed Import Package v1.

Initial ingestion remains:

```text
Topic/deck
→ Case
→ questions
→ images/stimuli
```

Tags and Shared Questions are progressive curation after or alongside import. A future package version may carry reviewed Tag data only if that becomes useful.

## 14. No Tag alias/synonym system yet

Current V1 uses one manually curated canonical name per Tag.

Variants such as `Prolonged QTc`, `QT prolongation`, and `Long QT` should be normalized by curation rather than represented as aliases in the current schema.

## 15. Cases remain presentation units

Tags do not define Case identity.

Several Cases may share the same diagnosis/Tags while having different vignettes, images, causes, or teaching emphasis.

```text
Case = one coherent clinical presentation/vignette
```

## 16. Implemented Stage A

Migration `0005_tag_foundation.sql` and the associated Admin behavior implement:

- `tags`;
- Case ↔ Tag relationships;
- contextual Case Question ↔ Tag relationships;
- Admin Tag management;
- explicit Case/Question Tag assignment/removal;
- Case/Question filtering and usage inspection.

Stage A itself did not alter learner Question resolution.

## 17. Implemented Stage B schema foundation

Migration `0008_tag_shared_questions.sql` added:

- `shared_questions`;
- exactly one `reuse_scope_tag_id` per Shared Question;
- `shared_question_tags` for zero or more descriptive Tags;
- at most one simultaneously active Shared Question per `question_prompt_id` while inactive history may coexist;
- nullable `review_questions.source_shared_question_id`;
- `tag_shared` as a valid Review Question source type;
- D1 trigger protection against Preview-owned Prompts backing global Shared Questions.

Because SQLite/D1 cannot alter the existing Review source-type CHECK in place, the migration conservatively rebuilt `review_questions` while preserving historical IDs, snapshots, order, and existing provenance.

`shared_questions` deliberately has no `preview_session_id`. They are global production-curated knowledge objects.

The `0008` foundation was applied to production D1 before Stage B behavior was deployed.

## 18. Implemented/deployed Stage B behavior

PR #43 is merged and deployed in production.

The deployed behavior includes:

- `/admin/shared-questions` list/create/edit/archive/reactivate;
- reuse of an existing active production Question Prompt or creation of new production Prompt wording;
- exactly one active Reuse Scope Tag;
- independent zero-or-more descriptive Tags;
- exact active Case-Tag eligibility;
- resolver integration using section 9 precedence;
- final Prompt-ID deduplication;
- normal Automatic/All/Fixed interaction;
- `tag_shared` Review provenance and snapshots;
- Shared Question usages included in Question Prompt global-edit blast-radius/stale-usage protection;
- preservation/display of existing inactive descriptive Tag assignments during unrelated edits, with explicit removal supported;
- Tag Admin usage details distinguishing Shared Question Reuse Scope versus Descriptive usage.

The final PR #43 validation passed 240/240 tests before merge. PR #43 added no migration; its schema dependency was the already-applied `0008_tag_shared_questions.sql`.

See `TAGGING_STAGE_B_BEHAVIOR.md` for the exact operational behavior contract.

## 19. ECG corpus validation and current outcome

The original ECG source contains 66 notes, each with a front-side ECG reference and a dominant structure of vignette → ECG → subquestions → answers.

This corpus validated the progressive model:

```text
Topic
└── Case
    ├── vignette
    ├── fixed ECG Asset
    └── contextual Case Questions
```

Repeated diagnoses do not require merged Cases. Repeated knowledge can be promoted later to Shared Questions after review.

The initial ECG migration is now complete in production:

```text
13 Batch 01 imports
+ 51 Batch 02 imports
+ 2 pre-existing mapped calcium Cases
= 66 / 66 source notes represented
```

The next tagging work is real corpus curation, not architecture completion.

## 20. Deferred

Current V1 deliberately does not include:

- multiple/compound Reuse Scope Tags or ANY/ALL expressions;
- Tag hierarchy;
- Tag aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic/AI Tag inference;
- Asset Tags;
- automatic Case Tag → Question Tag inheritance;
- Tags on `question_prompts`;
- Tag fields in Import Package v1;
- answer-side image relationships as part of the tagging model.

## 21. Architecture summary

```text
TOPIC
= curated learner study route / hierarchy

CASE
= one coherent clinical presentation

CASE TAGS
= cross-cutting clinical concepts covered by the Case

CONTEXTUAL QUESTION TAGS
= knowledge tested by that contextual Question

QUESTION PROMPT
= reusable wording only

SHARED QUESTION
= reusable medical answer/meaning

SHARED QUESTION REUSE SCOPE
= one active Case Tag that creates eligibility

SHARED QUESTION DESCRIPTIVE TAGS
= independent metadata describing what the Question teaches/tests
```

The design principle remains:

> **Attach knowledge at the broadest scope where its answer and educational meaning remain reliably correct, while keeping more specific stimulus and Case context authoritative when scopes overlap.**
