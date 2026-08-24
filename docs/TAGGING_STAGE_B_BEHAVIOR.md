# Tagging Stage B — Shared Question behavior and Admin authoring

_Status: merged in PR #43 and deployed to production. The required `0008_tag_shared_questions.sql` schema foundation was applied before that rollout. Later contextual System→Tag navigation and Primary-Topic-only Case behavior extend how Case Tags are used without changing Stage B Shared Question eligibility._

_Last updated: 25 August 2026_

This document records the deployed Tagging Stage B behavior layered on the already-landed `0008_tag_shared_questions.sql` schema foundation, plus the later integration points that affect how current agents should interpret Tags.

## Authoritative Shared Question model

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

Tags remain flat metadata. Topic hierarchy remains separate. Current Case behavior has one canonical Primary Topic, while a Case may carry multiple Tags for cross-cutting concepts.

A later System layer can explicitly expose a Tag as contextual learner navigation. That System↔Tag exposure is separate from Stage B reuse eligibility.

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

Zero or more **Descriptive Tags** may be curated independently. They are metadata and do not affect learner eligibility.

When an existing Shared Question contains inactive descriptive Tag assignments, unrelated edits preserve/display those historical assignments; administrators can explicitly remove them. New descriptive Tag additions still require valid active Tags.

Shared Questions are global production-curated content. They are not Preview-session-owned.

Preview-owned Prompts are rejected by application validation and by D1 trigger defense in `0008_tag_shared_questions.sql`.

The Questions detail/editor includes Shared Question Prompt usages in global-wording blast-radius/stale-usage protection.

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

Topic ancestry does not infer a Tag match.

System↔Tag exposure also does **not** infer Shared Question eligibility. It only controls whether that Tag is offered as a learner navigation choice within a System. The selected Case must still explicitly carry the Reuse Scope Tag for the Shared Question to be eligible.

There are no multiple Reuse Scope Tags or compound AND/OR expressions in current V1.

## Current navigation interaction

The original Stage B rollout did not make Tags learner navigation. That historical limitation was later superseded by contextual System/Topic/Tag navigation.

Current navigation semantics are:

```text
System → Tag
→ selects Cases carrying that explicitly exposed Tag
→ keeps each selected Case's canonical Primary Topic as study_concept_id
```

This means a Tag can now serve two independent roles:

```text
System↔Tag exposure
= contextual Case discovery

Case Tag matching a Shared Question Reuse Scope Tag
= reusable Question eligibility
```

Neither role implies the other.

## Resolver precedence and deduplication

Eligible Shared Questions enter the existing learner question resolver rather than a parallel generation system.

Current duplicate Prompt precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for selected option
> stimulus group question
> Case question
> exact canonical Study Topic question
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate set is deduplicated by `question_prompt_id`.

Higher-priority contextual sources therefore win over a lower-priority Shared Question using the same Prompt.

A contextual Tag route does not substitute another direct Topic-question bank; the Case's canonical Primary Topic remains the Topic resolver input.

## Question-count and pool modes

Tag-shared Questions become ordinary members of the final deduplicated eligible pool before Case question-count selection.

- **Automatic** preserves existing target/cap and stimulus-specific coverage semantics.
- **All** returns every deduplicated eligible question.
- **Fixed** respects the configured requested count; adding eligible Shared Questions cannot increase the selected count past that value.

Existing stimulus-specific coverage validation remains unchanged.

With learner-selectable Original/Expanded pools, `tag_shared` is a reusable source and therefore belongs to Expanded Learning, while ordinary Case/stimulus questions remain Original/Core according to the current question-pool contract.

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

Contextual System navigation separately records Review-level effective System/Tag route provenance when a Tag route selected the Case. That does not change the Stage B per-question provenance contract above.

Existing historical Review rows remain valid with `source_shared_question_id = NULL`.

## Preview boundary

Shared Questions have no `preview_session_id` and remain global production-curated objects.

Current Preview Admin does not gain Shared Question mutation authority.

The learner resolver also requires production-owned Prompts before considering a tag-shared candidate, so Preview-owned Prompt content cannot leak into normal learner Reviews.

Preview Case clones may preserve Case Tags as read-only classification context, but that does not grant Preview authority to mutate global Tags, Shared Questions, or System↔Tag exposure.

## Validation and regression coverage

Stage B and its current integration should protect:

- matching Case Tag eligibility;
- nonmatching Case exclusion;
- descriptive Tags not causing eligibility;
- System↔Tag exposure not causing Shared Question eligibility by itself;
- inactive Shared Question exclusion;
- inactive Prompt exclusion;
- inactive Reuse Scope Tag semantics;
- Prompt-ID deduplication and precedence;
- multiple matching Shared Questions;
- Automatic / All / Fixed behavior;
- Original/Expanded source-family behavior where applicable;
- `tag_shared` Review provenance;
- stable Review snapshots after Tag curation changes;
- archive/reactivation;
- Preview-owned Prompt rejection;
- Prompt-edit usage/blast-radius integration;
- inactive descriptive Tag preservation/removal;
- Tag Admin reuse-scope versus descriptive usage details;
- contextual Tag navigation keeping canonical Primary Topic question context.

PR #43 completed final CI with **240/240 tests passing** before its merge. That figure is historical evidence for the Stage B PR, not the current repository test count.

## Deployment record

The Stage B rollout sequence is important:

1. migration `0008_tag_shared_questions.sql` landed and was applied to production D1;
2. PR #43 implemented Stage B behavior/Admin authoring without another migration;
3. PR #43 merged;
4. the Worker behavior was deployed to production;
5. PR #49 refreshed project status and recorded Stage B as complete/deployed.

There is no pending Stage B migration. Do not create a new migration merely to reproduce the PR #43 rollout sequence.

Later contextual System/Tag navigation has its own schema/rollout contract in `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md`. Retiring Additional Study Topics from current Case behavior does not require another migration; the historical `secondary` Case Topic role may remain as inert compatibility storage.

Migration state and Worker deployment state must continue to be treated as separate explicitly verified operations.

## Deferred

Current V1 deliberately does not add:

- multiple Reuse Scope Tags;
- ANY/ALL or compound Tag expressions;
- Tag hierarchy;
- Tag aliases/synonyms;
- global/unscoped learner Study-by-Tag outside the contextual System model;
- Review snapshots of mutable Case/Question Tag relationships;
- automatic Tag inference;
- Asset Tags;
- Import Package v1 Tag fields;
- Preview editing of global Shared Questions.
