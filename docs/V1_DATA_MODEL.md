# Flash-Cards — V1 Data Model

_Last updated: 24 August 2026_

This document records the implemented V1 application data model on repository `main`. It should agree with the current Drizzle schema, committed D1 migrations, and subsystem invariant documents.

## 1. Migration ledger and deployment boundary

Current `main` contains:

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
0009_reusable_image_questions.sql
0010_reusable_image_reactivation_guard.sql
0011_asset_supersession.sql
0012_archive_stimulus_options.sql
0013_review_assets_asset_lookup.sql
```

A migration file being committed on `main` is not proof that it has been applied to production D1. Production migration application, Worker deployment, and behavior verification remain separate operational facts.

Relevant later migrations:

- `0009` — exact-Asset Reusable Image Questions, explicit stimulus-option opt-ins, reusable-image Review provenance, and cross-group Prompt protection;
- `0010` — defense in depth when reactivating dormant Reusable Image Questions;
- `0011` — nullable `assets.superseded_by_asset_id` self-FK/index for narrow same-image higher-resolution replacement;
- `0012` — `stimulus_group_options.removed_from_case`, separating archived removal from ordinary `is_active` deactivation;
- `0013` — `review_assets(asset_id, review_id)` index for Asset-leading historical Review existence/count lookups used by Image Library lifecycle classification. It changes access-path performance, not domain semantics.

## 2. General design rules

1. Use application-generated text IDs for domain objects.
2. Keep Better Auth tables conceptually separate from learning-domain tables.
3. Use foreign keys, checks, unique indexes, and defensive triggers where practical.
4. Prefer deactivation/archive over destructive deletion for teaching content.
5. Store private R2 object keys, not public/provider media URLs.
6. Snapshot what the learner actually saw when a Review begins.
7. Store answers/clinical meaning on the relationship/object that makes them correct; `question_prompts` stores wording only.
8. Keep Topics, Tags, stimulus groups, Image Collections, and exact-Asset reuse semantically separate.
9. Keep new content structures additive/backward-compatible.
10. Preview ownership is explicit provenance, not a naming convention or UI-only filter.
11. Production teaching-image object keys are immutable; quality replacement creates a new Asset/R2 object.
12. Stable Stimulus Option identity anchors Case-specific exact-image teaching; exact Asset identity anchors reusable exact-image teaching.
13. Asset lifecycle status and derived usage classification are distinct concepts.

## 3. Authentication and Preview ownership

Better Auth owns authentication/session/account tables. Application role concepts include `admin`, `user`, and `preview_admin`.

`preview_sessions` provides durable ownership/lifecycle state for disposable Preview content. Production Cases/Assets/Prompts have `preview_session_id = NULL`; Preview-owned equivalents carry a session ID where supported.

Global Shared Questions and Reusable Image Questions are production-curated. Preview-owned Prompts or Assets may not back them. D1 triggers provide defense in depth.

Higher-resolution replacement is production-only. Preview-owned Assets cannot be source Assets, and a production Asset referenced by a live Preview workspace temporarily blocks replacement rather than causing Preview relationships to be rewritten.

## 4. Topics and Cases

### `concepts` — Topics

```text
id
name
slug UNIQUE
parent_id nullable self-FK
description_md
is_active
created_at
updated_at
```

### `cases`

```text
id
title
vignette_md
question_selection_mode automatic | all | fixed
question_count nullable; required/positive for fixed
preview_session_id nullable
is_active
created_at
updated_at
```

### `case_concepts`

```text
case_id
concept_id
role primary | secondary
created_at
PRIMARY KEY (case_id, concept_id)
```

Every learner-presentable active production Case has one primary/default Topic and may have Additional Study Topics. The actual Study Topic route is resolved per Review.

## 5. Image organisation and Assets

### `image_collections`

Global Admin Image Library organisation only. Collections have no learner-routing, Tag, Case, question, or Review semantics.

### `assets`

Conceptually:

```text
id
type
storage_key UNIQUE
mime_type
original_filename
alt_text
source_label
source_url
licence
image_collection_id nullable
preview_session_id nullable
superseded_by_asset_id nullable FK -> assets.id
is_active
created_at
updated_at
```

`storage_key` is immutable object identity. `superseded_by_asset_id` means only:

```text
Asset A was superseded by Asset B
```

For a successful same-image quality upgrade:

```text
A.is_active = false
A.superseded_by_asset_id = B.id
B.is_active = true
```

A later upgrade may produce A → B → C. This is not a generic Asset-family/version abstraction.

### Derived Image Library usage state

Usage is computed from current/historical relationships rather than stored as an Asset flag:

```text
Current
→ active Asset in an active production Case as fixed image
  OR active Asset on active, non-removed option in active group.

Historical only
→ no Current use, but retained production relationship, Review snapshot,
  Reusable Image Question, or supersession relationship still requires provenance.

Unused
→ neither Current use nor retained historical/provenance dependency.
```

Preview-session relationships do not affect production lifecycle classification.

## 6. Fixed Case images

### `case_assets`

```text
case_id
asset_id
display_order
caption_md
created_at
```

The relationship carries Case-specific order/caption; global Asset metadata remains on `assets`.

Higher-resolution replacement updates current production `asset_id` A → B in place while preserving Case/order/caption.

## 7. Alternative Sets and option archive state

### `stimulus_groups`

```text
id
case_id
name
display_order
selection_count
specific_question_mode none | minimum | all
minimum_specific_questions
is_active
created_at
updated_at
```

### `stimulus_group_options`

```text
id
stimulus_group_id
asset_id
display_order
caption_md
is_active
removed_from_case
created_at
```

Current learner selection considers active, non-removed options in active groups. Stimulus Option ID is stable exact Case/stimulus-context identity.

`is_active` and `removed_from_case` are deliberately different:

- `is_active = false` deactivates the option while retaining it in normal authoring/history;
- `removed_from_case = true` archives the Case relationship out of current authoring/selection while preserving the row for restrictive foreign keys, question relationships, restoration, and Review provenance.

Re-adding the same Asset to its original group can restore that archived relationship when there is no current group conflict and retained teaching remains valid.

Removing an option does not delete the Asset, R2 object, exact-option questions, Reusable Image Questions, or Review rows.

Higher-resolution replacement changes a current production option's `asset_id` A → B without changing the option ID.

## 8. Question Prompt

### `question_prompts`

```text
id
prompt_md
preview_session_id nullable
is_active
created_at
updated_at
```

Prompt wording is reusable; answers live on the relationship/object supplying the correct context.

## 9. Contextual Question relationships

### `concept_questions`

Topic-scoped reusable knowledge with `answer_md` and optional descendant inheritance.

### `case_questions`

Whole-Case questions/answers.

### `stimulus_group_questions`

Set-wide questions/answers valid across one Alternative Set.

### `stimulus_option_questions`

Case-specific exact-option questions/answers. Reusing the same Asset elsewhere does not carry these relationships.

An existing whole-Case question can be explicitly moved to one exact stimulus while reusing Prompt identity and preserving answer where valid. This is a relationship-scope mutation, not Prompt recreation.

## 10. Reusable Image Questions

### `asset_questions`

Canonical knowledge intrinsically true of one exact global Asset:

```text
id
asset_id FK -> assets
question_prompt_id FK -> question_prompts
answer_md
is_active
created_at
updated_at
UNIQUE (asset_id, question_prompt_id)
```

Rules:

- canonical answer lives here, not on `question_prompts`;
- normal backing Asset/Prompt must be production-owned;
- one Asset+Prompt pair has one canonical relationship;
- archive/deactivate is preferred to destructive deletion;
- merely using the Asset in another Case creates no learner eligibility;
- reactivation must not recreate an invalid cross-group Prompt configuration.

### `stimulus_option_asset_questions`

Explicit exact-stimulus reuse decision:

```text
stimulus_group_option_id FK -> stimulus_group_options
asset_question_id FK -> asset_questions
created_at
PRIMARY KEY (stimulus_group_option_id, asset_question_id)
```

The option Asset and Asset Question Asset must match. Removing one opt-in changes only that exact usage.

When a currently fixed image needs an exact-image question or reusable-image opt-in, authoring may atomically convert it to a one-option active Stimulus Group while preserving Asset/caption/effective learner visibility.

## 11. Cross-Stimulus-Group Prompt invariant

One Prompt must not independently become stimulus-specific in two active, independently selectable groups in the same Case.

The invariant spans:

```text
stimulus_group_questions
stimulus_option_questions
stimulus_option_asset_questions -> asset_questions.question_prompt_id
```

Application preflight plus D1 triggers defend the invariant. `0010` extends protection to Asset Question reactivation.

## 12. Tags and Shared Questions

Tagging Stage A uses:

```text
tags
case_tags
case_question_tags
```

`shared_questions` stores reusable answer/meaning plus exactly one `reuse_scope_tag_id`. `shared_question_tags` stores descriptive metadata only.

Shared Question eligibility requires an active Shared Question/Prompt/Reuse Scope Tag and explicit matching Case Tag. Descriptive Tags and Topic ancestry do not infer eligibility.

## 13. Question resolver precedence

Current-main duplicate-Prompt precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for selected option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate set is deduplicated by `question_prompt_id` before Automatic/All/Fixed selection.

## 14. Import jobs

`import_jobs` stores authoritative resumable Import Package v1 execution state. The reviewed Import Package contract remains intentionally independent from Tags, Reusable Image Questions, option archival, and Asset supersession; those can be later production-Admin enrichment.

## 15. Reviews

A `reviews` row represents one learner attempt at one resolved Case/Study Topic. It preserves canonical primary Topic and actual Study Topic provenance plus Case title/vignette snapshots and completion/rating state.

## 16. Review Questions

Current conceptual fields include:

```text
id
review_id
question_prompt_id
source_type
source_concept_id
source_stimulus_group_id
source_stimulus_option_id
source_asset_question_id
source_shared_question_id
display_order
prompt_snapshot_md
answer_snapshot_md
```

Current source types include:

```text
case
concept
ancestor_concept
stimulus_group
asset
stimulus_option
tag_shared
```

For Reusable Image Questions:

```text
source_type = asset
source_asset_question_id = canonical asset_questions.id
source_stimulus_group_id = selected group
source_stimulus_option_id = selected option
```

For Shared Questions:

```text
source_type = tag_shared
source_shared_question_id = shared_questions.id
```

Uniqueness preserves one Prompt per Review and deterministic display order. Snapshot wording/answers are immutable historical truth even if current canonical content later changes.

## 17. Review Assets

Conceptually:

```text
id
review_id
asset_id
display_order
storage_key_snapshot
caption_snapshot_md
alt_text_snapshot
source_stimulus_group_id
source_stimulus_option_id
```

`storage_key_snapshot` is authoritative historical media identity.

The authenticated Review-owned media route verifies learner ownership and serves only the snapshotted R2 key, even when the referenced Asset is now inactive/superseded. It uses owner-specific revalidation semantics rather than the ordinary active-Asset route's long-lived current-media cache behavior.

`0013_review_assets_asset_lookup.sql` adds:

```text
review_assets_asset_review_idx (asset_id, review_id)
```

This supports Asset-leading historical usage existence/count queries used by Image Library lifecycle views. It does not change Review ownership or snapshot semantics.

## 18. Higher-resolution replacement invariant

Use replacement only for:

```text
same underlying image + better quality/resolution
```

Successful current-production semantic changes are committed together after preflight:

```text
new Asset B
+ cloned Asset Questions for B
+ production case_assets A → B
+ production stimulus_group_options A → B, same option IDs
+ production reusable opt-ins old AQ → cloned BQ
+ old Asset A inactive/superseded
```

Old Asset Questions and old R2 bytes remain for historical provenance. Existing Review rows are never rewritten.

R2 and D1 are not a shared transaction: the new object is uploaded first; if the D1 semantic batch fails, the new object alone is cleaned up. A conditional claim makes concurrent/double source replacement fail closed.

## 19. Preview workspace implementation boundary

Schema ownership remains the same regardless of internal code refactors. Current backend implementation keeps the public API at:

```text
src/lib/server/db/preview-workspace.js
```

Focused internal modules currently own Session lifecycle, ownership/security, Case lifecycle/cloning, and fixed-image operations. These are implementation responsibility boundaries, not new database ownership models.

The complete Case clone transaction remains cohesive in `preview-workspace/case.js`, including clone-time child graph copying. Alternative Set/question/cleanup extraction remains staged future refactoring.

## 20. Relationship overview

```text
preview_sessions
  ├── cases.preview_session_id
  ├── assets.preview_session_id
  └── question_prompts.preview_session_id

concepts
  └── case_concepts ── cases

cases
  ├── case_assets ── assets
  ├── stimulus_groups
  │   ├── stimulus_group_questions ── question_prompts
  │   └── stimulus_group_options ── assets
  │       ├── stimulus_option_questions ── question_prompts
  │       └── stimulus_option_asset_questions ── asset_questions
  ├── case_questions ── question_prompts
  └── case_tags ── tags

assets
  ├── image_collection_id ── image_collections
  ├── superseded_by_asset_id ── assets
  └── asset_questions ── question_prompts

shared_questions
  ├── question_prompt_id ── question_prompts
  ├── reuse_scope_tag_id ── tags
  └── shared_question_tags ── tags

reviews
  ├── review_questions
  └── review_assets
```

## 21. Non-goals encoded by the current model

The current schema intentionally does **not** imply:

- Tag hierarchy or compound Shared Question scopes;
- automatic Case Tag → Question Tag inheritance;
- automatic reusable-image opt-in;
- generic Asset families/version tables;
- automatic visual similarity/deduplication;
- physical deletion merely because an Asset is classified Unused;
- Preview ownership of global Shared/Re\-usable Image Questions;
- arbitrary different-image substitution through supersession;
- Import Package support for every later authoring enrichment.

Add schema only when a concrete product/content requirement justifies it.
