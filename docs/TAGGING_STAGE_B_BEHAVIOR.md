# Tagging Stage B — Shared Question behavior and Admin authoring

_Status: merged in PR #43 and deployed to production. The required `0008_tag_shared_questions.sql` schema foundation was applied before the behavior rollout; PR #43 itself was schema-free._

_Last updated: 18 August 2026_

This document records the deployed Tagging Stage B behavior layered on the already-landed `0008_tag_shared_questions.sql` schema foundation.

## Authoritative model

```text
question_prompts
= reusable wording only

shared_questions
= reusable medical answer/meaning
  + exactly one Reuse Scope Tag
  + active/archive state

shared_question_tags
= zero or more descriptive Tags only
```

The Reuse Scope Tag and descriptive Tags are independent. The application does not automatically insert `reuse_scope_tag_id` into `shared_question_tags`.

Tags remain flat metadata. Topics/Concepts remain the learner-navigation hierarchy.

## Production Admin workflow

Production Admin routes include:

```text
/admin/shared-questions
/admin/shared-questions/[sharedQuestionId]
```

Administrators can list, create, edit, archive, and reactivate Shared Questions.

Creation can:

- reuse an existing active production Question Prompt; or
- create new production Prompt wording.

The reusable answer is stored on `shared_questions`.

Every Shared Question has exactly one active **Reuse Scope Tag**. The UI explains that this Tag controls Case eligibility.

Zero or more **Descriptive Tags** may be curated independently. The UI explains that they are metadata and do not affect learner eligibility.

When an existing Shared Question contains inactive descriptive Tag assignments, unrelated edits preserve/display those historical assignments; administrators can explicitly remove them. New descriptive Tag additions still require valid active Tags.

Shared Questions are global production-curated content. They are not Preview-session-owned.

Preview-owned Prompts are rejected by application validation and by D1 trigger defense in `0008_tag_shared_questions.sql`.

The existing Questions detail/editor includes Shared Question Prompt usages in global-wording blast-radius/stale-usage protection.

The Tags Admin usage view distinguishes Shared Question **Reuse Scope** usage from **Descriptive** usage so the two semantics are not collapsed.

## Learner eligibility

For a selected production Case, a Shared Question is eligible exactly when:

```text
shared_questions.is_active = true
AND question_prompts.is_active = true
AND question_prompts.preview_session_id IS NULL
AND the Tag referenced by reuse_scope_tag_id is active
AND case_tags contains (selected Case ID, reuse_scope_tag_id)
```

Stage A `case_tags` has no relationship-level `is_active`. A current Case-Tag relationship therefore means the row exists and the referenced Tag is active.

`shared_question_tags` is not queried for eligibility.

Topic/Concept ancestry does not infer a Tag match.

There are no multiple Reuse Scope Tags or compound AND/OR expressions in current V1.

## Resolver precedence and deduplication

Eligible Shared Questions enter the existing learner question resolver rather than a parallel generation system.

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

The final candidate set is deduplicated by `question_prompt_id`.

Higher-priority contextual sources therefore win over a lower-priority Shared Question using the same Prompt.

## Question-count modes

Tag-shared Questions become ordinary members of the final deduplicated eligible pool before question selection.

- **Automatic** preserves existing target/cap and stimulus-specific coverage semantics.
- **All** returns every deduplicated eligible question.
- **Fixed** respects the configured requested count; adding eligible Shared Questions cannot increase the selected count past that value.

Existing stimulus-specific coverage validation remains unchanged.

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

Those remain mutable curation metadata. Historical Review wording, answer, and source-object identity remain stable even if Tag assignments or eligibility relationships later change.

Existing historical Review rows remain valid with `source_shared_question_id = NULL`.

## Preview boundary

Shared Questions have no `preview_session_id` and remain global production-curated objects.

Current Preview Admin does not gain Shared Question mutation authority.

The learner resolver also requires production-owned Prompts before considering a tag-shared candidate, so Preview-owned Prompt content cannot leak into normal learner Reviews.

## Validation and regression coverage

Stage B coverage includes:

- matching Case Tag eligibility;
- nonmatching Case exclusion;
- descriptive Tags not causing eligibility;
- inactive Shared Question exclusion;
- inactive Prompt exclusion;
- inactive Reuse Scope Tag semantics;
- Prompt-ID deduplication and precedence;
- multiple matching Shared Questions;
- Automatic / All / Fixed behavior;
- Fixed count not exceeded;
- `tag_shared` Review provenance;
- stable Review snapshots after Tag curation changes;
- archive/reactivation;
- Preview-owned Prompt rejection;
- Prompt-edit usage/blast-radius integration;
- inactive descriptive Tag preservation/removal;
- Tag Admin reuse-scope versus descriptive usage details;
- existing non-Shared learner behavior remaining intact.

PR #43 completed final CI with **240/240 tests passing** before merge.

## Deployment record

The rollout sequence is important:

1. migration `0008_tag_shared_questions.sql` landed and was applied to production D1;
2. PR #43 implemented Stage B behavior/Admin authoring without another migration;
3. PR #43 merged;
4. the Worker behavior was deployed to production;
5. PR #49 refreshed project status and recorded Stage B as complete/deployed.

There is no pending Stage B migration. Do not create a new migration merely to reproduce the PR #43 rollout sequence.

Migration state and Worker deployment state must continue to be treated as separate explicitly verified operations.

## Deferred

Current Stage B deliberately does not add:

- multiple Reuse Scope Tags;
- ANY/ALL or compound Tag expressions;
- Tag hierarchy;
- Tag aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic Tag inference;
- Asset Tags;
- Import Package v1 Tag fields;
- Preview editing of global Shared Questions.
