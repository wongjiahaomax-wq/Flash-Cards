# Stage A Tag Foundation

_Status: merged and implemented. Stage A remains the metadata/Admin foundation beneath the subsequently deployed Tagging Stage B Shared Question behavior._

_Last updated: 18 August 2026_

## Purpose

Stage A introduced administrator-curated cross-cutting clinical metadata without changing learner Study eligibility or Question resolution by itself.

The semantic boundary remains:

```text
Topic / Concept
= learner study route and curriculum organisation

Tag
= flat, cross-cutting clinical metadata for curation/discovery/filtering
```

Stage B later reused Case Tags as the exact eligibility boundary for Shared Questions; that does not change the Stage A ownership model documented here.

## Data model

Migration:

```text
drizzle/0005_tag_foundation.sql
```

Stage A tables:

### `tags`

Stores canonical administrator-curated Tag names, normalized uniqueness, active/inactive state, and timestamps.

### `case_tags`

Many-to-many Case ↔ Tag relationship.

The relationship row has no separate `is_active` flag. Current Stage B eligibility semantics therefore treat a Case Tag as current when the relationship row exists and the referenced Tag is active.

### `case_question_tags`

Many-to-many contextual `case_questions` ↔ Tag relationship.

## Why contextual Question Tags attach to `case_questions`

`question_prompts` stores reusable wording only.

A Prompt such as:

```text
What is the diagnosis?
```

has no intrinsic clinical meaning. The clinical meaning comes from the contextual Question relationship and its answer.

Stage A therefore attaches Question Tags to `case_questions`, not to `question_prompts`.

Stage B adds descriptive Tags to the dedicated reusable `shared_questions` entity. This is an additive extension, not a reason to move Tags onto Prompt rows.

## Case Tags do not automatically propagate to Questions

Example:

```text
Case Tags
- Hypocalcaemia
- Prolonged QTc
- Post-thyroidectomy

Contextual Question
What are the causes of hypocalcaemia?

Question Tags
- Hypocalcaemia
```

The Question does not silently inherit all Case Tags.

Admin UI may make nearby Case Tags convenient to select, but persistence remains an explicit curation action.

## Admin behavior

Production `/admin/tags` supports the current Tag management workflow, including:

- canonical Tag creation;
- rename/edit behavior under the current uniqueness rules;
- active/inactive state management;
- Tag usage inspection;
- Case Tag assignment/removal from Case authoring;
- contextual Case Question Tag assignment/removal;
- Case/Question filtering or search integrations where implemented.

With Stage B deployed, Tags Admin usage details also distinguish Shared Question usages such as:

- **Reuse Scope** usage;
- **Descriptive** usage.

Those Stage B usage types do not change the original Stage A Case/Case-Question relationships.

## Stage A learner boundary

Stage A itself added no learner-facing Question eligibility or resolver precedence change.

That separation was deliberate: metadata could be created/curated before being allowed to influence learner Reviews.

Tagging Stage B subsequently adds one reviewed learner behavior:

```text
selected Case has active Case Tag X
AND active Shared Question has Reuse Scope Tag X
→ Shared Question becomes eligible for the normal question pool
```

See `TAGGING_STAGE_B_BEHAVIOR.md` for that deployed contract.

## Topic hierarchy remains separate

Tags remain flat in current V1.

Do not infer:

- Topic parent/child relationships from Tag names;
- Tag parent/child relationships from Topics;
- learner Study routes from Tags;
- Case Tag inheritance into Questions.

Topics and Tags may share similar clinical labels while serving different purposes.

## Preview boundary

Normal production Admin/learner read models must exclude disposable Preview-owned Case/Question content where applicable.

Stage A Tag definitions themselves are global production curation data. Preview mutation authority remains controlled by the Preview workspace contract; shared production objects must not become editable merely because Preview uses the same D1 database.

Stage B Shared Questions remain global production-only mutable content.

## Current extensions beyond Stage A

Since Stage A landed, the tagging model has been extended by migration `0008_tag_shared_questions.sql` and deployed Stage B behavior:

```text
shared_questions
- reusable Prompt
- reusable answer/meaning
- exactly one Reuse Scope Tag

shared_question_tags
- zero or more descriptive Tags
```

Do not reinterpret the original Stage A `case_question_tags` as Shared Question metadata. Each relationship retains its own context.

## Deferred

Still deferred unless real content justifies them:

- Tag hierarchy;
- aliases/synonyms;
- automatic/AI Tag inference;
- Asset Tags;
- automatic Case Tag → Question Tag inheritance;
- learner Study-by-Tag;
- Review Tag snapshots;
- compound/multiple Shared Question reuse scopes;
- Import Package v1 Tag fields.

## Validation principle

Tag-management changes should preserve canonical uniqueness, relationship integrity, production/Preview isolation, and the existing learner resolver behavior unless the PR explicitly changes the Stage B contract and updates its documentation/tests.
