# Tagging Stage B — Shared Question behavior and Admin authoring

_Status: implemented on PR #43 for review._

_Last updated: 18 August 2026_

This document records the behavior layered on the already-landed `0008_tag_shared_questions.sql` schema foundation. Stage B behavior introduces no new migration.

## Authoritative model

```text
question_prompts
= reusable wording only

shared_questions
= reusable medical answer/meaning + exactly one Reuse Scope Tag + active/archive state

shared_question_tags
= zero or more descriptive Tags only
```

The Reuse Scope Tag and descriptive Tags are independent. The application never automatically inserts `reuse_scope_tag_id` into `shared_question_tags`.

Tags remain flat metadata. Topics/Concepts remain the learner-navigation hierarchy.

## Admin workflow

Production Admin adds:

```text
/admin/shared-questions
/admin/shared-questions/[sharedQuestionId]
```

Administrators can list, create, edit, archive and reactivate Shared Questions. Creation can reuse an existing active production Question Prompt or create new production Prompt wording. The reusable answer is stored on `shared_questions`.

Every Shared Question selects exactly one active **Reuse Scope Tag**. The UI explicitly explains that this Tag controls Case eligibility.

Zero or more **Descriptive Tags** may be selected independently. The UI explicitly explains that these are metadata and do not affect learner eligibility.

Shared Questions are global production-curated content. They are not owned by Preview sessions. Preview-owned Prompts are rejected by application validation and by the D1 triggers in migration `0008`.

The existing Questions detail/editor includes Shared Question Prompt usages in its blast-radius and stale-usage guard so a globally reused Prompt cannot be edited while silently ignoring Stage B usage.

## Learner eligibility

For a selected production Case, a Shared Question is eligible exactly when:

```text
shared_questions.is_active = true
AND question_prompts.is_active = true
AND question_prompts.preview_session_id IS NULL
AND tags.is_active = true for shared_questions.reuse_scope_tag_id
AND case_tags contains (selected Case ID, shared_questions.reuse_scope_tag_id)
```

Stage A `case_tags` has no relationship-level `is_active` field. Therefore the current relationship is the existence of the `case_tags` row together with an active Tag.

`shared_question_tags` is not queried for eligibility. Topic/Concept ancestry does not infer a Tag match. There are no multiple scopes or AND/OR expressions in this PR.

## Resolver precedence and deduplication

Eligible Shared Questions enter the existing learner question resolver. They do not use a parallel generation system.

Duplicate Prompt precedence is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Concept
> tag-shared Question
> nearest inheritable ancestor Concept
> more distant inheritable ancestors
```

The final candidate set is deduplicated by `question_prompt_id`. A higher-priority context-specific source wins over a lower-priority source using the same Prompt. Existing stimulus-specific behavior remains authoritative.

## Question-count modes

Tag-shared Questions become ordinary members of the final deduplicated eligible pool before question selection.

- **Automatic** preserves the existing target/cap and stimulus-specific coverage semantics.
- **All** returns every deduplicated eligible question.
- **Fixed** respects the configured requested count; adding Shared Questions cannot increase the selected count past that value.

Existing stimulus-group specific-question coverage validation remains unchanged.

## Review provenance

When a Shared Question is selected into a Review, `review_questions` stores:

```text
prompt_snapshot_md = exact Prompt wording shown
answer_snapshot_md = Shared Question answer shown
source_type = 'tag_shared'
source_shared_question_id = selected shared_questions.id
```

The Review does not snapshot:

- Reuse Scope Tag ID;
- descriptive Shared Question Tag IDs;
- Case Tag IDs.

Those remain mutable curation metadata. Historical Review wording, answer and source-object identity therefore remain stable even if Tags or eligibility relationships later change.

Existing historical Review rows remain valid with `source_shared_question_id = NULL`.

## Automated coverage

Focused Stage B coverage includes:

- matching Case Tag eligibility;
- nonmatching Case exclusion;
- descriptive Tags not causing eligibility;
- inactive Shared Question exclusion;
- inactive Prompt exclusion;
- inactive attached Tag semantics;
- Prompt-ID deduplication and precedence;
- multiple matching Shared Questions;
- Automatic / All / Fixed behavior;
- Fixed count not exceeded;
- `tag_shared` Review provenance;
- stable Review snapshots after Tag curation changes;
- archive/reactivation;
- Preview-owned Prompt rejection;
- existing non-Shared learner tests remaining intact.

## Deferred

Stage B deliberately does not add:

- multiple Reuse Scope Tags;
- ANY/ALL or compound Tag expressions;
- Tag hierarchy;
- Tag aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic Tag inference;
- Asset Tags;
- Import Package v1 Tag fields.

## Operational boundary

This behavior/authoring PR is schema-free. It must not apply a production D1 migration and must not deploy a Worker. Preview deployment, if later desired for human inspection, remains a separate manual operator action after review.
