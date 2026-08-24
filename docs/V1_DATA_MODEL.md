# Flash-Cards — V1 Data Model

_Last updated: 24 August 2026_

This document records the implemented V1 application data model represented by the repository after the contextual System/Topic/Tag navigation change. It should agree with the current Drizzle schema, committed D1 migrations, and subsystem invariant documents.

A migration file being committed is not proof that it has been applied to production D1. Merge status, production migration application, Worker deployment, taxonomy curation, learner feature enablement, and behavior verification remain separate operational facts.

## 1. Migration ledger and deployment boundary

The repository migration sequence contains:

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
0014_review_question_pool_mode.sql
0015_contextual_system_topic_tag_navigation.sql
```

Relevant later migrations:

- `0009` — exact-Asset Reusable Image Questions, explicit stimulus-option opt-ins, reusable-image Review provenance, and cross-group Prompt protection;
- `0010` — defense in depth when reactivating dormant Reusable Image Questions;
- `0011` — nullable `assets.superseded_by_asset_id` self-FK/index for narrow same-image higher-resolution replacement;
- `0012` — `stimulus_group_options.removed_from_case`, separating archived removal from ordinary `is_active` deactivation;
- `0013` — `review_assets(asset_id, review_id)` index for Asset-leading historical Review existence/count lookups used by Image Library lifecycle classification;
- `0014` — non-null `reviews.question_pool_mode`, defaulting historical Reviews to `expanded`, matching the pre-feature full resolver behavior without rebuilding snapshots;
- `0015` — `concepts.kind`, contextual `system_tags`, taxonomy/relationship guards, effective Review System/Tag provenance, and learner-selected System navigation provenance.

`0015` defaults all existing Concepts to `kind = 'topic'` and all historical Reviews to `route_type = 'topic'` with null System/Tag and selected-navigation provenance. It does not rewrite `review_questions` or `review_assets` snapshots.

`src/lib/server/db/schema.js` is the authoritative post-0015 Drizzle model loaded by `drizzle.config.js`. Narrow pre-0015 Topic-only rollout compatibility uses `pre-0015-compat-schema.ts`, which is intentionally excluded from Drizzle generation/check configuration; `contextual-schema.ts` aliases the canonical tables instead of defining a second physical schema.

## 2. General design rules

1. Use application-generated text IDs for domain objects.
2. Keep Better Auth tables conceptually separate from learning-domain tables.
3. Use foreign keys, checks, unique indexes, and defensive triggers where practical.
4. Prefer deactivation/archive over destructive deletion for teaching content.
5. Store private R2 object keys, not public/provider media URLs.
6. Snapshot what the learner actually saw when a Review begins.
7. Store answers/clinical meaning on the relationship/object that makes them correct; `question_prompts` stores wording only.
8. Keep Systems, Topics, Tags, stimulus groups, Image Collections, and exact-Asset reuse semantically separate.
9. Keep new content structures additive/backward-compatible.
10. Preview ownership is explicit provenance, not a naming convention or UI-only filter.
11. Production teaching-image object keys are immutable; quality replacement creates a new Asset/R2 object.
12. Stable Stimulus Option identity anchors Case-specific exact-image teaching; exact Asset identity anchors reusable exact-image teaching.
13. Asset lifecycle status and derived usage classification are distinct concepts.
14. Learner question-pool eligibility and Case question-count selection are orthogonal concerns: source eligibility is decided before duplicate-Prompt resolution, then existing Automatic/All/Fixed selection is applied.
15. System/Tag learner navigation chooses Case entry context; it does not replace Topic-question resolution.
16. A Review distinguishes the learner-selected System route from the effective Topic/Tag provenance that actually selected its Case.

## 3. Authentication and Preview ownership

Better Auth owns authentication/session/account tables. Application role concepts include `admin`, `user`, and `preview_admin`.

`preview_sessions` provides durable ownership/lifecycle state for disposable Preview content. Production Cases/Assets/Prompts have `preview_session_id = NULL`; Preview-owned equivalents carry a session ID where supported.

Global Systems, Topics, Tags, Shared Questions, and Reusable Image Questions are production-curated. Preview may read global taxonomy/Tags, but Preview does not own or mutate those global structures.

Higher-resolution replacement is production-only. Preview-owned Assets cannot be source Assets, and a production Asset referenced by a live Preview workspace temporarily blocks replacement rather than causing Preview relationships to be rewritten.

## 4. Systems, Topics, and Cases

### `concepts` — Systems and Topics

```text
id
name
slug UNIQUE
kind system | topic
parent_id nullable self-FK
description_md
is_active
created_at
updated_at
```

`kind` has distinct semantics:

```text
system
= top-level learner-navigation grouping

topic
= Case classification and reusable Topic-question scope
```

Taxonomy invariants include:

- Systems are top-level (`parent_id IS NULL`);
- a non-null parent must exist and be active;
- the hierarchy must be acyclic;
- active children block parent deactivation until moved/deactivated;
- Topics may temporarily remain top-level while curation is incomplete;
- a Topic with Case/Topic-question usage cannot be reclassified as a System without first resolving those usages.

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

`case_concepts.concept_id` may reference Topics only, never Systems. This is enforced in application mutation paths and by `0015` database triggers.

`question_selection_mode` answers **how many questions** are selected from an already eligible pool. It is not overloaded to represent Original versus Expanded source eligibility.

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

`concept_questions.concept_id` may reference Topics only, never Systems. System navigation does not create System-level reusable-question inheritance.

### `case_questions`

Whole-Case questions/answers.

### `stimulus_group_questions`

Set-wide questions/answers valid across one Alternative Set.

### `stimulus_option_questions`

Case-specific exact-option questions/answers. Reusing the same Asset elsewhere does not carry these relationships.

An existing whole-Case question can be explicitly moved to one exact stimulus while reusing Prompt identity and preserving answer where valid. This is a relationship-scope mutation, not Prompt recreation.

Current learner question-pool ownership is:

```text
case_questions            -> source_type case            -> Original/Core
stimulus_group_questions  -> source_type stimulus_group  -> Original/Core
stimulus_option_questions -> source_type stimulus_option -> Original/Core
```

They are classified by current ownership, not by historical import provenance.

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

`source_type = asset` is a reusable source and is eligible only for Expanded Learning. Case-specific exact-image questions remain `stimulus_option` and therefore belong to Original/Core.

## 11. Cross-Stimulus-Group Prompt invariant

One Prompt must not independently become stimulus-specific in two active, independently selectable groups in the same Case.

The invariant spans:

```text
stimulus_group_questions
stimulus_option_questions
stimulus_option_asset_questions -> asset_questions.question_prompt_id
```

Application preflight plus D1 triggers defend the invariant. `0010` extends protection to Asset Question reactivation.

## 12. Tags, System Tag exposure, and Shared Questions

Tagging Stage A uses:

```text
tags
case_tags
case_question_tags
```

Tags remain a flat canonical vocabulary.

### `system_tags`

`0015` adds contextual learner-navigation exposure:

```text
system_concept_id FK -> concepts.id
tag_id FK -> tags.id
display_order
created_at
PRIMARY KEY (system_concept_id, tag_id)
UNIQUE (system_concept_id, display_order)
```

`system_tags` means:

```text
this existing Tag is exposed as a learner choice inside this System
```

It does **not** make Tags hierarchical or owned by one System. The same Tag may be exposed in several Systems.

New relationships require an active `concepts.kind = 'system'` row and active Tag. System↔Tag curation is separate from Case Tags and Shared Question Tag semantics.

### Shared Questions

`shared_questions` stores reusable answer/meaning plus exactly one `reuse_scope_tag_id`. `shared_question_tags` stores descriptive metadata only.

Shared Question eligibility requires an active Shared Question/Prompt/Reuse Scope Tag and explicit matching Case Tag. Descriptive Tags, System exposure, and Topic ancestry do not infer eligibility.

Eligible Shared Questions use `source_type = tag_shared` and are Expanded-only reusable sources. Their underlying eligibility rule is unchanged by System navigation.

## 13. Question resolver precedence and pool mode

Duplicate-Prompt precedence is:

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

`QuestionPoolMode` applies source eligibility **before** that resolver precedence:

```text
core / Original
→ case
→ stimulus_group
→ stimulus_option

expanded / Expanded Learning
→ case
→ stimulus_group
→ stimulus_option
→ concept
→ ancestor_concept
→ tag_shared
→ asset
```

The mode is applied to resolver inputs, not already-resolved output. Expanded remains the regression baseline for pre-feature learner question-pool behavior.

System/Tag routing happens before this question pipeline. Topic routes pass the resolved actual Study Topic. Tag routes pass the selected Case's canonical Primary Topic. This prevents contextual Tag navigation from silently altering Topic-question inheritance.

## 14. Import jobs

`import_jobs` stores authoritative resumable Import Package v1 execution state. The reviewed Import Package contract remains intentionally independent from Tags, Reusable Image Questions, option archival, Asset supersession, learner question-pool mode, and System navigation; those can be later Admin/learner behavior layered on the same imported Case Questions.

Reviewed source-derived questions continue to become Case Questions, which is exactly the ownership used for Original/Core eligibility.

## 15. Reviews

A `reviews` row represents one learner attempt at one resolved Case and question pool. It preserves canonical primary Topic, actual Topic context, optional System/Tag effective provenance, learner-selected System navigation provenance, Case title/vignette snapshots, and completion/rating state.

Relevant conceptual fields include:

```text
id
user_id
case_id
primary_concept_id
study_concept_id
study_system_concept_id nullable
route_type topic | tag
study_tag_id nullable
navigation_route_type nullable all | topic | tag
navigation_route_id nullable
case_title_snapshot
vignette_snapshot_md
question_pool_mode core | expanded
status
rating
started_at
revealed_at
completed_at
```

`question_pool_mode` records which source family was eligible when the immutable Review snapshot was created. It is per Review start and is not a persistent learner preference.

Historical compatibility is:

```text
pre-0014 Review
→ question_pool_mode = expanded

pre-0015 Review
→ route_type = topic
→ study_system_concept_id = NULL
→ study_tag_id = NULL
→ navigation_route_type = NULL
→ navigation_route_id = NULL
```

because the older learner path resolved the full reusable pool through Topic routing. Additive defaults/nulls provide this meaning without rewriting `review_questions` or `review_assets`.

Effective route-provenance rules are:

```text
topic effective route
→ study_tag_id MUST be NULL
→ study_system_concept_id may be NULL for legacy Topic navigation
  or contain the System used by System navigation

tag effective route
→ study_system_concept_id required
→ study_tag_id required
→ study_concept_id remains the selected Case's canonical Primary Topic
```

Selected navigation provenance is deliberately separate:

```text
System → All
→ navigation_route_type = all
→ navigation_route_id = NULL
→ effective route_type may be topic or tag for the selected Case

System → Topic
→ navigation_route_type = topic
→ navigation_route_id = the Topic the learner selected
→ study_concept_id may resolve to a more specific descendant Topic

System → Tag
→ navigation_route_type = tag
→ navigation_route_id = study_tag_id
```

Original → Expanded continuation preserves both selected and effective provenance. “Next case” reconstructs the selected navigation route, so `All` remains `All` and a parent Topic selection does not narrow to the first Case's descendant Study Topic.

Question-pool mode is orthogonal to `cases.question_selection_mode`:

```text
question_pool_mode
= which source inputs are eligible

question_selection_mode
= how many questions are selected from the resolved pool
```

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

Review-level question-pool and System/Tag route provenance do not rewrite this per-question provenance.

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

A same-Case Original → Expanded continuation creates a new immutable Review using normal current stimulus selection; fixed/one-option stimuli naturally remain stable while a multi-option group may choose a different active option.

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

Focused internal modules own Session lifecycle, ownership/security, Case lifecycle/cloning, and fixed-image operations. These are implementation responsibility boundaries, not new database ownership models.

The complete Case clone transaction remains cohesive in `preview-workspace/case.js`, including clone-time child graph copying. Alternative Set/question/cleanup extraction remains staged future refactoring.

Preview Case Topic mutations accept Topics only. Preview does not gain System, hierarchy, or System↔Tag global mutation authority. Production/Preview ownership rules otherwise remain unchanged.

## 20. Relationship overview

```text
preview_sessions
  ├── cases.preview_session_id
  ├── assets.preview_session_id
  └── question_prompts.preview_session_id

concepts
  ├── parent_id ── concepts
  ├── case_concepts ── cases          [Topic only]
  ├── concept_questions               [Topic only]
  └── system_tags ── tags             [System only]

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
  ├── primary_concept_id ── concepts [Topic]
  ├── study_concept_id ── concepts   [Topic]
  ├── study_system_concept_id ── concepts [nullable System]
  ├── study_tag_id ── tags [nullable]
  ├── navigation_route_type / navigation_route_id [selected System route]
  ├── review_questions
  └── review_assets
```

## 21. System study-route semantics

For a chosen System, learner routes are derived rather than stored on Cases:

```text
System → Topic
→ descendant Topic route using existing multi-Topic Case resolution

System → Tag
→ Cases with the selected exposed Case Tag
→ canonical Primary Topic remains the question-resolution Study Topic

System → All
→ union of native descendant Topic routes and curated Tag routes
→ deduplicated by Case
→ native Topic provenance wins when both routes match
```

A Tag can be exposed by more than one System. Each Review records both the actual effective System/Topic/Tag context used for that Case and, for System navigation, the learner-selected `All`/Topic/Tag route needed to continue navigation correctly.

The learner System surface is rollout-gated by `SYSTEM_STUDY_NAVIGATION_ENABLED=true`. Absence of that exact value retains the existing Topic learner navigation and blocks “Next case” from selecting another System-routed Case even when an older System Review remains open. Existing Reviews remain readable/completable; same-Case Original → Expanded continuation may finish the current Case without selecting another System Case.

See `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md` for the operational Phase A/Phase B contract.

## 22. Non-goals encoded by the current model

The current schema intentionally does **not** imply:

- Tag hierarchy or single-System Tag ownership;
- System-level reusable Topic-question inheritance;
- automatic Case Tag → Question Tag inheritance;
- automatic System Tag exposure from Case Tags;
- automatic reusable-image opt-in;
- generic Asset families/version tables;
- automatic visual similarity/deduplication;
- physical deletion merely because an Asset is classified Unused;
- Preview ownership of global Systems, Topics, Tags, Shared Questions, or Reusable Image Questions;
- arbitrary different-image substitution through supersession;
- Import Package support for every later authoring enrichment;
- an `original_question` flag or frozen import-era question set;
- a learner-level persistent Core/Expanded preference;
- automatic Core/Expanded switching based on Case completion history;
- stimulus-option → Topic learner routing merely because one image has an incidental finding.

Add schema only when a concrete product/content requirement justifies it.
