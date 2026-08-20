# Flash-Cards — V1 Data Model

_Last updated: 20 August 2026_

This document records the current implemented V1 application data model. It complements `V1_SPEC.md` and should agree with current Drizzle schema modules plus committed D1 migrations.

## 1. Migration ledger

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
```

`0009` is additive except for the conservative SQLite rebuild of `review_questions` required to extend its source-type CHECK and add nullable reusable-image provenance. Existing Review IDs, Prompt/answer snapshots and previous provenance fields are copied unchanged.

`0010` adds defense-in-depth validation when an archived Reusable Image Question is reactivated.

`0011` adds the narrow nullable self-FK `assets.superseded_by_asset_id` plus an index. It does not add an Asset-family/version table and does not mutate historical Review rows.

## 2. General design rules

1. Use application-generated text IDs for domain objects.
2. Keep Better Auth tables conceptually separate from learning-domain tables.
3. Use foreign keys, checks, unique indexes and defensive triggers where practical.
4. Prefer deactivation/archive over destructive deletion for teaching content.
5. Store private R2 object keys, not public/provider media URLs.
6. Snapshot what the learner actually saw when a Review begins.
7. Store answer/clinical meaning on the relationship/object that makes it correct, never on reusable Prompt wording.
8. Keep Topics, Tags, stimulus groups, Image Collections and exact-Asset reuse semantically separate.
9. Keep new content structures additive/backward-compatible; ordinary Cases do not require alternatives, Tags, Shared Questions, Collections or Reusable Image Questions.
10. Preview ownership is explicit provenance, not a naming convention or UI-only filter.
11. Production teaching-image object keys are immutable; higher-resolution replacement creates a new Asset/R2 object rather than overwriting one.

## 3. Authentication and Preview ownership

Better Auth owns authentication/session/account tables. Current application role concepts include `admin`, `user`, and `preview_admin`.

`preview_sessions` provides durable ownership/lifecycle state for disposable Preview Admin content. Production Cases/Assets/Prompts have `preview_session_id = NULL`; Preview-owned equivalents carry a session ID where supported.

Global Shared Questions and Reusable Image Questions are production-curated objects. Preview-owned Prompts or Assets may not back them.

Higher-resolution Asset replacement is also production-only. Preview-owned Assets cannot be source Assets for the operation, and production replacement does not silently rewrite Preview-owned Case/stimulus relationships.

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
preview_session_id
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

Every learner-presentable active production Case has one primary/default Topic and may have Additional Study Topics. One attached Study Topic is resolved per Review and supplies direct Topic questions for that Review.

## 5. Image organisation and Assets

### `image_collections`

Global Admin Image Library organisation only. Collections have no learner-routing, Tag, Case, question or Review semantics.

### `assets`

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

`storage_key` is immutable production object identity. A null Collection is presented as Unsorted.

`superseded_by_asset_id` has one narrow meaning:

```text
Asset A was superseded by Asset B
```

For a successful same-image quality upgrade:

```text
A.is_active = false
A.superseded_by_asset_id = B.id
B.is_active = true
```

A later replacement may naturally create A → B → C by replacing B. An already-superseded A is not directly replaceable/reactivatable.

This is not an Asset-family abstraction. There is no `image_identity`, generic version table or automatic similarity/deduplication system.

## 6. Higher-resolution replacement invariant

Use the replacement operation only for:

```text
same underlying image + better quality/resolution
```

A different ECG/X-ray/photograph/diagram showing the same condition remains a new independent Asset.

Replacement creates a new immutable R2 object and a new Asset row. Appropriate semantic metadata is copied from A to B, while the uploaded file supplies the new storage key/MIME/original filename. Old R2 bytes remain untouched and retained for historical Reviews.

Current production semantic changes are executed together after preflight:

```text
new Asset B
+ cloned Asset Questions for B
+ production case_assets A → B
+ production stimulus_group_options A → B, same option IDs
+ production reusable opt-ins old AQ → cloned BQ
+ old Asset A inactive/superseded
```

R2/D1 are not a shared transaction. A D1 failure deletes only the newly uploaded R2 object; A and all original relationships remain unchanged. A successful operation keeps both R2 objects.

## 7. Case image relationships

### `case_assets` — fixed images

```text
case_id
asset_id
display_order
caption_md
created_at
```

Fixed active production Assets are shown in every applicable Review. `caption_md` is Case-specific relationship metadata.

Higher-resolution replacement updates current production `asset_id` A → B in place and preserves Case ID, order and caption.

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
created_at
```

Current learner behavior selects exactly one active option per active group and freezes it at Review creation. Option ID is stable and is the exact stimulus-context identity.

A fixed image may be transparently converted to a one-option group when an image-specific question relationship requires an option. Asset identity and caption are preserved.

Higher-resolution replacement changes the production option's `asset_id` A → B **without recreating the option**. Stable option identity preserves group membership, caption/order/active state and attached exact-option questions.

## 8. `question_prompts`

Reusable learner-facing wording only:

```text
id
prompt_md
preview_session_id
is_active
created_at
updated_at
```

No answer belongs on this table.

The same Prompt can therefore be reused by Topic, Case, group, exact option, Shared Question or Reusable Image Question contexts with different answers where semantics permit.

## 9. Contextual Question tables

### `concept_questions`

Topic-scoped reusable knowledge with `answer_md` and optional inheritance to descendants.

### `case_questions`

Exact Case questions/overrides with relationship-specific `answer_md`.

### `stimulus_group_questions`

Questions/answers valid for every option in one alternative set.

### `stimulus_option_questions`

Case-specific exact-option questions/answers. These remain contextual even when the same Asset is reused elsewhere.

Existing `stimulus_option_questions` are not migrated or automatically inferred as reusable image knowledge.

Because higher-resolution replacement preserves `stimulus_group_options.id`, these exact-image Case questions remain unchanged when the option's current Asset changes from A to B.

## 10. `asset_questions` — Reusable Image Questions

Added by `0009_reusable_image_questions.sql`.

A Reusable Image Question is canonical knowledge intrinsically true of one exact global Asset.

```text
id
asset_id                FK -> assets
question_prompt_id      FK -> question_prompts
answer_md
is_active
created_at
updated_at
UNIQUE (asset_id, question_prompt_id)
```

Important rules:

- the answer lives here, not on `question_prompts`;
- the Asset and Prompt must be production-owned for normal reusable authoring;
- archive/deactivate is preferred over destructive deletion;
- one Asset+Prompt pair has one canonical answer relationship;
- attaching/reusing the Asset elsewhere does not create learner eligibility by itself.

Database triggers reject Preview-owned Assets or Prompts as reusable-image backing content.

### Replacement behavior

Existing Asset Questions are never mutated from old Asset A to new Asset B. Doing so would make historical `review_questions.source_asset_question_id` provenance lie about the Asset identity that relationship originally represented.

Instead every A Asset Question is cloned to B with:

- a new Asset Question ID;
- the same `question_prompt_id`;
- the same canonical `answer_md`;
- the same active/inactive state.

Old Asset Questions remain attached to A. Prompts are reused, not duplicated.

## 11. `stimulus_option_asset_questions` — explicit reuse opt-in

Added by `0009`.

```text
stimulus_group_option_id   FK -> stimulus_group_options
asset_question_id          FK -> asset_questions
created_at
PRIMARY KEY (stimulus_group_option_id, asset_question_id)
```

This row means:

> this exact Case/stimulus usage deliberately opts into this canonical Asset Question.

No row means no reuse, even when the option uses the same Asset.

Application validation and D1 triggers require:

```text
stimulus_group_options.asset_id
=
asset_questions.asset_id
```

This prevents an Asset Question being attached to an option displaying a different image.

Removing one row removes reuse from only that stimulus. It does not archive/deactivate the global Asset Question or affect another opt-in.

During replacement the preserved production option is first moved to B, then its current opt-ins are updated to the corresponding cloned B Asset Questions. This ordering keeps the database Asset-identity trigger valid. Preview-owned opt-ins are not rewritten.

## 12. Tags and Shared Questions

Tagging Stage A remains based on `tags`, `case_tags`, and `case_question_tags`.

`shared_questions` remains reusable knowledge eligible through exactly one active Case Reuse Scope Tag and stores its answer outside `question_prompts`.

`shared_question_tags` remains descriptive metadata independent from eligibility.

Reusable Image Questions are distinct from Shared Questions: their reuse key is exact Asset identity plus explicit stimulus opt-in, not a Case Tag.

## 13. `import_jobs`

Resumable Import Package v1 operational state remains unchanged.

Reusable Image Questions and higher-resolution supersession do not extend `flashcards-import-v1`. Reviewed imports may reconstruct ordinary Cases/images/questions first and enrich/replace media later through production Admin authoring.

## 14. `reviews`

One learner attempt at one resolved Case/Study Topic. Review rows preserve canonical primary Topic and actual Study Topic route plus Case title/vignette snapshots and status/rating timestamps.

## 15. `review_questions`

`0009` adds exact reusable-image provenance while preserving immutable Prompt/answer snapshots.

Current fields include:

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

Current source types:

```text
case
concept
ancestor_concept
stimulus_group
asset
stimulus_option
tag_shared
```

For a reusable image question:

```text
source_type = asset
source_asset_question_id = canonical asset_questions.id
source_stimulus_group_id = selected group
source_stimulus_option_id = selected option
```

Uniqueness remains:

```text
(review_id, display_order)
(review_id, question_prompt_id)
```

Therefore one Review cannot contain two copies of the same Prompt ID.

Editing or replacing current canonical content later does not change an existing Review because `prompt_snapshot_md` and `answer_snapshot_md` were frozen when the Review started. Replacement also does not rewrite `source_asset_question_id`; an old Review keeps the old A Asset Question ID while future Reviews resolve B's cloned question.

## 16. `review_assets`

Snapshots exact fixed/selected media shown in a Review:

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

`storage_key_snapshot` is the authoritative historical media identity.

Current Study rendering uses an authenticated Review-specific image endpoint which:

- verifies the Review belongs to the requesting learner;
- verifies the requested Review Asset belongs to that Review;
- reads the R2 key only from `review_assets.storage_key_snapshot`;
- serves the historical object even when the referenced Asset is inactive/superseded;
- does not accept arbitrary R2 keys;
- uses `Cache-Control: private, max-age=0, must-revalidate` so a browser must re-run the authenticated Review ownership check before reusing an owner-specific response, while retaining ETag-based `304 Not Modified` support.

The normal active-Asset endpoint remains separate and continues to reject inactive Assets. Its existing long-lived private immutable cache policy is not used for owner-specific Review URLs.

Therefore changing current relationships from A to B does not alter an already-started Review or require reactivating A.

## 17. Relationship overview

```text
preview_sessions
  ├── cases.preview_session_id
  ├── assets.preview_session_id
  └── question_prompts.preview_session_id

assets
  └── assets.superseded_by_asset_id -> assets.id (nullable narrow lineage)

concepts
  └── concepts.parent_id

cases
  ├── case_concepts ── concepts
  ├── case_assets ──── assets
  ├── case_questions ─ question_prompts
  ├── case_tags ────── tags
  └── stimulus_groups
       ├── stimulus_group_questions ── question_prompts
       └── stimulus_group_options ── assets
            ├── stimulus_option_questions ── question_prompts
            └── stimulus_option_asset_questions
                 └── asset_questions
                      ├── assets
                      └── question_prompts

question_prompts
  └── shared_questions
       ├── reuse_scope_tag_id ── tags
       └── shared_question_tags ── tags

reviews
  ├── review_questions
  │    ├── source_asset_question_id ── asset_questions (nullable)
  │    └── source_shared_question_id ── shared_questions (nullable)
  └── review_assets
       └── storage_key_snapshot -> immutable historical R2 key value
```

## 18. Learner question resolution

For a selected active production Case and resolved Study Topic:

1. resolve/freeze fixed assets and exactly one active option from each active stimulus group;
2. load active production Prompts;
3. load only reusable Asset Questions whose explicit opt-in belongs to a **selected** option;
4. require the Asset Question's Asset identity to match that selected option;
5. collect the other existing contextual/reusable sources;
6. deduplicate by `question_prompt_id` with precedence;
7. apply Automatic/All/Fixed plus group coverage;
8. snapshot Review questions/assets before rendering.

Precedence is:

```text
Case-specific exact stimulus option
> explicitly reused Asset Question for selected option
> stimulus group
> Case
> exact Study Topic
> Tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

Reusable Image Questions carry the selected `stimulusGroupId`/`stimulusOptionId`, so they are stimulus-specific for coverage purposes.

The same Prompt cannot be configured ambiguously across independently selectable groups in one Case. Within one selected group, narrower precedence may override a broader source safely.

Higher-resolution replacement does not alter resolver precedence. It only changes the current Asset/reusable-question identities behind preserved authoring relationships for future Reviews.

## 19. Fixed-image conversion invariant

No parallel fixed-image reusable-question table exists.

When a fixed Case Asset is explicitly opted into a Reusable Image Question, the semantic mutation performs preflight validation and atomically creates:

```text
one-option stimulus group
+ stimulus option using the same Asset/caption
+ stimulus_option_asset_questions opt-in
- old fixed case_assets relationship
```

With one active option and `selection_count = 1`, learner-visible image behavior remains equivalent.

## 20. Prompt shared-edit protection

Question Prompt wording remains globally reusable wording. Questions Library usage/blast-radius calculations include active Reusable Image Question usages as well as existing contextual and Shared Question usages.

Prompt stale/shared-edit protections must not be bypassed when a Prompt participates in `asset_questions`.

## 21. Production / Preview defense

Normal learner construction excludes Preview-owned Cases/Prompts/Assets.

Reusable Image Questions are production-global in this implementation. Preview Admin does not receive reusable-image mutation authority, and migration triggers reject Preview-owned backing Assets/Prompts.

Higher-resolution replacement likewise rejects Preview-owned source Assets and filters relationship movement by production Case ownership. Preview Admin has no equivalent production replacement action.

## 22. Progress queries

Completed Reviews continue to provide the existing V1 progress derivations. No new learner-progress table is introduced by this feature.

## 23. Deliberately deferred schema/features

Do not add without concrete behavior requirements:

- `asset_concepts` or `stimulus_option_concepts`;
- Asset Tags;
- `image_identity`, Asset families or generic version-history tables beyond the narrow `superseded_by_asset_id` lineage;
- automatic visual similarity/identity detection;
- arbitrary different-image replacement or bulk replacement;
- Tag hierarchy/alias tables;
- compound Shared Question reuse expressions;
- learner Study-by-Tag structures;
- Review Tag snapshot tables;
- finding ontologies;
- curriculum Deck/Course entities distinct from current Topics/Collections;
- scheduling/due-state tables;
- per-question learner mastery;
- structured marking points;
- curricula/cohorts/institutional tenancy;
- arbitrary structured laboratory stimulus schema;
- answer alternatives/automated marking structures.

The model should continue to grow from real authoring/learner evidence rather than theoretical normalization alone.