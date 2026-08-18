# Flash-Cards — V1 Data Model

_Last updated: 18 August 2026_

This document records the implemented V1 application data model. The schema uses Drizzle with SQLite/D1 and version-controlled migrations. `0008_tag_shared_questions.sql` is the landed Tagging Stage B schema foundation; the Stage B behavior/authoring implementation is schema-free and uses that migration as-is.

## 1. Core design rules

1. Domain objects use application-generated text IDs.
2. Better Auth owns authentication/session tables separately from the learning domain.
3. Foreign keys and unique constraints are used wherever practical.
4. Learning content is normally archived/deactivated rather than destructively deleted.
5. R2 object keys, not public image URLs, are stored for teaching Assets.
6. Reviews snapshot what the learner actually saw.
7. `question_prompts` contains reusable wording only; answers live at the context that supplies their medical meaning.
8. Topics/Concepts remain learner-navigation hierarchy; Tags remain flat cross-cutting metadata.
9. Preview ownership is explicit. Production learner content excludes Preview-owned Cases, Prompts and Assets.

## 2. Main authoring hierarchy

```text
Topic/Concept
└── Case
    ├── fixed Assets
    ├── optional Stimulus Groups
    │   └── selected Stimulus Option
    ├── contextual Case questions
    └── Case Tags

Global reusable knowledge
└── Shared Question
    ├── Question Prompt wording
    ├── reusable answer
    ├── exactly one Reuse Scope Tag
    └── zero or more descriptive Tags
```

A Case has exactly one primary/default Topic and may have secondary Study Topics through `case_concepts`. Both may provide learner routes; the selected route is persisted as `reviews.study_concept_id`.

## 3. Question-bearing tables

### `question_prompts`

Reusable learner-facing wording only. It has `id`, `prompt_md`, active state, timestamps, and nullable `preview_session_id` from the Preview workspace migration. Clinical meaning, answers, and clinical Tags do not belong here.

### `concept_questions`

Links one Prompt to one Topic/Concept, stores the Concept-specific `answer_md`, active state, and `inherit_to_descendants`. Direct Concept questions are loaded from the Review's Study Concept; eligible ancestors may supply inheritable questions.

### `case_questions`

Links one Prompt to one exact Case and stores the Case-specific answer. A row may be Case-only content or an override of a more reusable Prompt.

### `stimulus_group_questions`

Stores questions/answers correct for a selected Stimulus Group context.

### `stimulus_option_questions`

Stores questions/answers correct for one exact selected Stimulus Option/image context.

### `shared_questions`

Implemented by `0008_tag_shared_questions.sql`.

| Column | Meaning |
|---|---|
| `id` | Shared Question identity |
| `question_prompt_id` | reusable wording from `question_prompts` |
| `answer_md` | reusable medical/teaching answer |
| `reuse_scope_tag_id` | exactly one Tag controlling Case eligibility |
| `is_active` | active/archive state |
| timestamps | curation timestamps |

There may be at most one active Shared Question per `question_prompt_id`; inactive historical rows may coexist. `shared_questions` has no `preview_session_id`: it is global production-curated content.

Database triggers reject inserting/updating a Shared Question to reference a Preview-owned Prompt.

### `shared_question_tags`

Many-to-many descriptive metadata between Shared Questions and Tags. These Tags describe what a Shared Question teaches/tests and **do not** control learner eligibility.

`reuse_scope_tag_id` is independent and is not automatically copied into `shared_question_tags`.

## 4. Tags

`tags` stores flat canonical Tags. `case_tags` attaches Tags to Cases. `case_question_tags` describes one contextual Case Question. Stage A Case/Question tagging does not imply inheritance.

A `case_tags` row has no relationship-level active/archive column. Current learner semantics therefore require the relationship row to exist and the Tag itself to be active.

## 5. Shared Question learner eligibility

For a selected production Case, a Shared Question is eligible exactly when:

```text
shared_questions.is_active = true
AND its question_prompt is active
AND its question_prompt is production-owned (preview_session_id IS NULL)
AND its reuse_scope_tag is active
AND case_tags contains (selected Case, reuse_scope_tag_id)
```

`shared_question_tags` is not part of this query. Topic/Concept ancestry is not used to infer Tag matches. Multiple/compound reuse-scope expressions are not implemented.

## 6. Resolver precedence and Prompt deduplication

The learner uses one resolver and one final eligible pool; Shared Questions do not use a parallel question-generation path.

When the same `question_prompt_id` is reachable from multiple sources, precedence is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Concept
> tag-shared Question
> nearest eligible inheritable ancestor Concept
> more distant eligible ancestors
```

The final pool is deduplicated by `question_prompt_id`. The highest-priority source supplies the learner-facing answer and provenance.

## 7. Question-count modes

Eligible Shared Questions enter the same deduplicated pool as all existing sources.

- **Automatic** preserves the existing target/cap and stimulus-specific coverage semantics.
- **All** includes all deduplicated eligible questions.
- **Fixed** selects at most the requested fixed count; adding Shared Questions does not bypass the count.

Existing stimulus-group minimum/all-specific coverage checks remain authoritative.

## 8. Reviews and immutable provenance

`reviews` records the selected Case, canonical primary Concept, actual Study Concept, Case/vignette snapshots, status and rating.

`review_questions` snapshots the exact Prompt and answer selected into the Review. Its source types include:

```text
case
concept
ancestor_concept
stimulus_group
stimulus_option
tag_shared
```

For a selected Shared Question:

```text
source_type = 'tag_shared'
source_shared_question_id = <shared_questions.id>
prompt_snapshot_md = exact wording shown
answer_snapshot_md = exact reusable answer shown
```

The Review does **not** snapshot `reuse_scope_tag_id`, descriptive Shared Question Tag IDs, or Case Tag IDs. Those are mutable curation metadata. Historical Review meaning stays stable even if Tags or eligibility relationships later change. Existing pre-Stage-B Review rows remain valid with `source_shared_question_id = NULL`.

`review_assets` separately snapshots the exact fixed/selected Assets shown and their presentation/provenance.

## 9. Preview ownership

Preview ownership exists on Cases, Question Prompts and Assets. Production learner resolution excludes Preview-owned records centrally.

Shared Questions are not Preview-owned. Production Admin Shared Question authoring only accepts active production Question Prompts. Migration `0008` provides D1 trigger defense in depth against attaching a Preview Prompt to global Shared Question content.

The Preview Admin workspace does not gain global Shared Question mutation authority from Stage B.

## 10. Admin authoring behavior

Production Admin provides `/admin/shared-questions` plus a detail editor. Administrators can list active and archived Shared Questions, create one using an existing active production Prompt or new Prompt wording, edit the reusable answer, select exactly one active Reuse Scope Tag, attach zero or more independent descriptive Tags, and archive/reactivate when invariants remain valid.

The UI explicitly labels the Reuse Scope Tag as the eligibility control and descriptive Tags as metadata only.

The existing Questions Library includes Shared Question usages in Prompt edit blast-radius/stale-usage protection so globally reused wording cannot be edited while ignoring this new source.

## 11. Relationship overview

```text
concepts
  └── concepts.parent_id

cases
  ├── case_concepts ── concepts
  ├── case_assets ──── assets
  ├── case_questions ─ question_prompts
  ├── case_tags ────── tags
  └── stimulus_groups
       ├── stimulus_group_options ── assets
       │    └── stimulus_option_questions ── question_prompts
       └── stimulus_group_questions ── question_prompts

case_questions
  └── case_question_tags ── tags

concepts
  └── concept_questions ── question_prompts

question_prompts
  └── shared_questions
       ├── reuse_scope_tag_id ── tags
       └── shared_question_tags ── tags

Better Auth user
  └── reviews ── cases
       ├── primary_concept_id ── concepts
       ├── study_concept_id ─── concepts
       ├── review_questions
       │    └── source_shared_question_id ── shared_questions (nullable)
       └── review_assets
```

## 12. Migration history relevant to the current model

```text
0000_dashing_centennial.sql
0001_better_auth.sql
0002_optional_stimulus_groups.sql
0003_multi_topic_study_routing.sql
0004_resumable_import_jobs.sql
0005_tag_foundation.sql
0006_preview_admin_workspace.sql
0007_image_collections.sql
0008_tag_shared_questions.sql
```

Stage B behavior/authoring introduces **no additional migration**.

## 13. Intentionally deferred

- multiple/ANY/ALL reuse scopes;
- Tag hierarchy or aliases;
- learner Study-by-Tag;
- Tag snapshots on Reviews;
- automatic Tag inference;
- Asset Tags;
- Tag fields in Import Package v1.
