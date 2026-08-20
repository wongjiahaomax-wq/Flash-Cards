# Tagging Model — Agreed Decisions

_Status: authoritative current Tag/Shared Question architecture. Tagging Stage A and Stage B are merged; the Stage B learner/Admin baseline is explicitly recorded as deployed. Current `main` also contains Reusable Image Questions, which are a separate reuse mechanism and do not change Tag semantics._

_Last updated: 20 August 2026_

This document records the agreed Topic/Case/Question Tag architecture after validation against the real ECG corpus. `PROPOSED_TAGGING_MODEL.md` is historical exploration; this file is authoritative for Tag semantics unless a later decision record explicitly changes them.

## 1. Tags are flat and manually curated

The current model uses canonical flat Tags.

Tags do not have parent/child relationships. Topic hierarchy remains separate and supplies curated learner study routes.

Administrators curate Tags explicitly. Current V1 does not require AI inference, automatic Anki Tag ingestion, or automatic taxonomy generation.

## 2. Tags, Topics, and exact-Asset reuse are different

```text
Topic
= learner study route / hierarchy

Tag
= cross-cutting clinical metadata

Reusable Image Question
= canonical Prompt/answer intrinsically true of one exact Asset,
  eligible only through explicit stimulus opt-in
```

A Case may belong to several Study Topics and carry several Tags. An Asset may have Reusable Image Questions without having any Tag relationship. Similar clinical wording across these mechanisms does not make them interchangeable.

## 3. Current Tag attachment scope

Current implemented Tag relationships include:

- Case ↔ Tag (`case_tags`);
- contextual Case Question ↔ Tag (`case_question_tags`);
- Shared Question ↔ descriptive Tags (`shared_question_tags`);
- exactly one Shared Question Reuse Scope Tag (`shared_questions.reuse_scope_tag_id`).

Tags are not stored directly on `question_prompts`, and image Assets do not currently have Tag relationships.

`asset_questions` does **not** represent Asset Tags. It represents reusable exact-Asset teaching content.

## 4. Case Tags do not automatically become Question Tags

Case Tags describe concepts covered by the Case. Question Tags describe knowledge tested by that contextual/shared Question.

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

Likewise, attaching an Asset to a tagged Case does not tag the Asset or its Reusable Image Questions.

## 5. Clinical meaning does not belong on `question_prompts`

`question_prompts` stores reusable wording only.

```text
What is the diagnosis?
```

can occur across unrelated contexts. The answer/clinical meaning belongs to the object or relationship that makes it correct, including:

```text
concept_questions
case_questions
stimulus_group_questions
stimulus_option_questions
asset_questions
shared_questions
```

The Prompt row is never the answer owner.

## 6. Shared Question descriptive Tags and reuse scope are separate

A Shared Question has two independent Tag concepts:

```text
Descriptive Tags
= what knowledge the Question teaches/tests

Reuse Scope Tag
= which tagged Cases make the Question eligible
```

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

This deliberately avoids compound ANY/ALL logic before the curated corpus demonstrates a need.

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

Reusable Image Question eligibility is independent:

```text
selected active stimulus option
+ matching active asset_questions row
+ active production Question Prompt
+ explicit stimulus_option_asset_questions opt-in
```

A Case Tag never creates Reusable Image Question eligibility, and Asset identity never creates Shared Question Tag eligibility.

## 9. Resolver precedence

When the same Question Prompt is available from several sources, the more contextual answer wins:

```text
Case-specific exact stimulus option question
> explicitly reused Asset Question for selected option
> stimulus group question
> Case question
> exact Study Topic question
> Tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate set is deduplicated by `question_prompt_id`.

This means Tag-shared knowledge remains broader than selected-stimulus exact-Asset knowledge. A matching Tag does not override a more specific Case/image answer.

## 10. Question-count interaction

Eligible Shared Questions and explicitly opted-in Reusable Image Questions join the normal final deduplicated pool before selection.

- **Automatic** preserves target/cap and stimulus-specific coverage semantics.
- **All** includes every deduplicated eligible question.
- **Fixed** respects the configured count; reusable sources do not increase the Review beyond it.

Reusable Image Questions carry selected stimulus context and can count toward group-specific coverage; Tag-shared Questions do not become stimulus-specific merely because the Case has an image.

## 11. Tags are not learner navigation in current V1

Tags currently support:

- Admin curation;
- search/filtering/retrieval;
- Shared Question reuse.

Learner Study-by-Tag remains deferred. Topics remain the learner-navigation hierarchy.

Reusable Image Questions likewise do not create learner navigation routes.

## 12. Reviews snapshot content/provenance, not Tag relationships

Tags are mutable curation metadata.

For a selected Shared Question, `review_questions` stores:

```text
source_type = 'tag_shared'
source_shared_question_id = <shared_questions.id>
prompt_snapshot_md = exact Prompt shown
answer_snapshot_md = exact reusable answer shown
```

For a selected Reusable Image Question, provenance is separate:

```text
source_type = 'asset'
source_asset_question_id = <asset_questions.id>
source_stimulus_group_id = selected group
source_stimulus_option_id = selected option
```

Reviews do not snapshot Reuse Scope Tag IDs, descriptive Shared Question Tag IDs, or Case Tag IDs.

Historical Review wording/answer/source identity therefore remains stable even if later Tag curation changes Shared Question eligibility or an Asset is later superseded.

## 13. Import Package v1 remains unchanged

Tags are not required by current reviewed Import Package v1.

Initial ingestion remains:

```text
Topic/deck
→ Case
→ questions
→ images/stimuli
```

Tags, Shared Questions, and Reusable Image Questions are progressive curation after or alongside import. A future package version may carry reviewed Tag data only if that becomes useful.

## 14. No Tag alias/synonym system yet

Current V1 uses one manually curated canonical name per Tag.

Variants such as `Prolonged QTc`, `QT prolongation`, and `Long QT` should be normalized by curation rather than represented as aliases in the current schema.

## 15. Cases remain presentation units

Tags do not define Case identity.

Several Cases may share the same diagnosis/Tags while having different vignettes, images, causes, or teaching emphasis.

```text
Case = one coherent clinical presentation/vignette
```

Reusable Image Questions also do not define Case identity. Reusing one Asset across Cases preserves separate Case context and requires independent opt-in to the Asset's canonical questions.

## 16. Implemented Stage A

Migration `0005_tag_foundation.sql` and associated Admin behavior implement:

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

The `0008` foundation is explicitly recorded as applied to production D1 before Stage B behavior was deployed.

## 18. Reusable Image Questions do not modify the Tag model

Migrations `0009_reusable_image_questions.sql` and `0010_reusable_image_reactivation_guard.sql` add exact-Asset reusable knowledge and its invariants. They do not add:

- Asset Tags;
- Tag eligibility for Asset Questions;
- Tag inheritance from Case to Asset;
- a second Shared Question reuse-scope mechanism.

The two reuse systems are intentionally orthogonal:

```text
Shared Question
→ Case Tag eligibility

Reusable Image Question
→ exact Asset identity + explicit selected-stimulus opt-in
```

The cross-Stimulus-Group Prompt invariant includes reusable-image opt-ins, but that is a stimulus ambiguity rule, not a Tag rule.

## 19. Implemented/deployed Stage B behavior

PR #43 is merged and explicitly recorded as deployed in production.

The deployed behavior includes:

- `/admin/shared-questions` list/create/edit/archive/reactivate;
- reuse of an existing active production Question Prompt or creation of new production Prompt wording;
- exactly one active Reuse Scope Tag;
- independent zero-or-more descriptive Tags;
- exact active Case-Tag eligibility;
- resolver integration using the precedence above;
- final Prompt-ID deduplication;
- normal Automatic/All/Fixed interaction;
- `tag_shared` Review provenance and snapshots;
- Shared Question usages included in Question Prompt global-edit blast-radius/stale-usage protection;
- preservation/display of existing inactive descriptive Tag assignments during unrelated edits, with explicit removal supported;
- Tag Admin usage details distinguishing Shared Question Reuse Scope versus Descriptive usage.

PR #43 added no migration; its schema dependency was the already-applied `0008_tag_shared_questions.sql`.

See `TAGGING_STAGE_B_BEHAVIOR.md` for the exact operational behavior contract.

## 20. ECG corpus validation and current outcome

The original ECG source contains 66 notes, each with a front-side ECG reference and a dominant structure of vignette → ECG → subquestions → answers.

This corpus validated the progressive model:

```text
Topic
└── Case
    ├── vignette
    ├── ECG Asset
    └── contextual Case Questions
```

Repeated diagnoses do not require merged Cases. Repeated medical knowledge may be promoted to Shared Questions after review; image-intrinsic knowledge may be promoted separately to Reusable Image Questions when exact Asset identity is the correct reuse key.

The initial ECG migration is explicitly recorded as complete in production:

```text
13 Batch 01 imports
+ 51 Batch 02 imports
+ 2 pre-existing mapped calcium Cases
= 66 / 66 source notes represented
```

The next tagging work is real corpus curation, not architecture completion.

## 21. Deferred

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
- automatic Tag derivation from Reusable Image Questions or Asset metadata.

## 22. Architecture summary

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

REUSABLE IMAGE QUESTION
= canonical answer/meaning intrinsic to one exact Asset;
  eligibility requires explicit selected-stimulus opt-in, not a Tag
```

The design principle remains:

> **Attach knowledge at the broadest scope where its answer and educational meaning remain reliably correct, while keeping more specific selected-stimulus and Case context authoritative when scopes overlap.**
