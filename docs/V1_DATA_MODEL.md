# Flash-Cards — V1 Data Model

_Last updated: 18 August 2026_

This document records the **current implemented V1 application data model**. It complements `V1_SPEC.md` and should agree with current Drizzle schema modules plus committed D1 migrations.

## 1. Migration ledger

Current learning-domain/auth-support migrations are:

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

Important current state:

- optional stimulus groups are implemented;
- multi-Topic learner routing/Admin authoring is implemented;
- reviewed/resumable imports are implemented;
- Tagging Stage A is implemented;
- Preview Admin ownership/session schema is implemented;
- Image Collections are implemented;
- Tagging Stage B Shared Question schema and behavior are implemented/deployed.

PR #43 behavior is schema-free on top of already-applied `0008_tag_shared_questions.sql`.

## 2. General design rules

1. Use application-generated text IDs for domain objects rather than relying on D1 auto-increment IDs.
2. Keep Better Auth tables conceptually separate from learning-domain tables.
3. Use foreign keys, checks, and unique indexes wherever practical.
4. Prefer deactivation/archive over destructive deletion for learning content.
5. Store private R2 object keys, not public/provider image URLs, in domain data.
6. Snapshot what the learner actually saw when a Review begins.
7. Store answer/clinical meaning on the contextual relationship that makes it correct, not on reusable Prompt wording.
8. Keep Topics, Tags, stimulus groups, and Image Collections semantically separate.
9. Make new content structures additive/backward-compatible where practical; ordinary Cases do not require alternatives, multiple Study Topics, Tags, Shared Questions, or Collections.
10. Preview ownership is explicit data provenance, not a naming convention or UI-only filter.

## 3. Authentication/roles

Better Auth owns authentication/session/account tables.

Current application role concepts include:

```text
admin
user
preview_admin
```

The owner may hold `admin,preview_admin` while production/Preview Workers use separate Better Auth secrets/sessions.

Learning-domain operational rows may store Better Auth user IDs as text without duplicating credential/session data.

## 4. `preview_sessions`

Added by `0006_preview_admin_workspace.sql`.

Purpose: durable ownership/lifecycle state for disposable Preview Admin workspaces.

Key fields:

```text
id
user_id
status
expires_at
last_error
created_at
updated_at
```

Current status values:

```text
active
cleanup_required
cleaned
```

A partial uniqueness rule allows at most one live (`active`/`cleanup_required`) Preview Session per user.

Preview-owned domain rows reference this ID where applicable.

## 5. `concepts` — Topics

The Admin/product calls `concepts` **Topics**.

Key fields:

```text
id
name
slug                 UNIQUE
parent_id             nullable self-FK, ON DELETE RESTRICT
description_md
is_active
created_at
updated_at
```

Rules:

- a Topic cannot be its own parent;
- application logic prevents hierarchy cycles;
- inactive Topics are excluded from new learner routing/attachments;
- Topic hierarchy is learner/curriculum organisation, not Tag hierarchy.

## 6. `cases`

A Case is one coherent clinical presentation/study unit.

Key fields:

```text
id
title
vignette_md
question_selection_mode   automatic | all | fixed
question_count            nullable; required/positive for fixed
preview_session_id        nullable FK to preview_sessions
is_active
created_at
updated_at
```

`title` is Admin/internal and may contain the diagnosis. Learner UI must not expose it when doing so gives away the answer.

`preview_session_id = NULL` identifies normal production content; non-null indicates Preview-owned Case content.

## 7. `case_concepts` — Case Study Topics

Links a Case to one or more Topics.

```text
case_id
concept_id
role        primary | secondary
created_at
PRIMARY KEY (case_id, concept_id)
```

Current learner/Admin meaning:

- every learner-presentable active production Case has exactly one primary/default Topic;
- zero or more secondary relationships are Additional Study Topics;
- both primary and secondary active relationships may be learner entry routes;
- one attached Study Topic is resolved/persisted per Review;
- the Study Topic supplies direct reusable Topic questions for that Review;
- all attached Topic question banks are never automatically mixed together.

The exactly-one-primary invariant is primarily enforced through application behavior/validation where portable SQL constraints would be unnecessarily complex.

## 8. `image_collections`

Added by `0007_image_collections.sql`.

Purpose: global **Admin Image Library organisation only**.

Key fields:

```text
id
name       UNIQUE
created_at
updated_at
```

Collections have no learner-routing, Tag, Case, question, or Review semantics.

## 9. `assets`

Reusable teaching-media metadata.

Current fields include:

```text
id
type                    current learner value: image
storage_key              UNIQUE immutable R2 object key
mime_type
original_filename        nullable Admin-facing image name/search label
alt_text
source_label
source_url
licence
image_collection_id      nullable FK -> image_collections, ON DELETE SET NULL
preview_session_id       nullable FK -> preview_sessions, ON DELETE RESTRICT
is_active
created_at
updated_at
```

Despite the historical column name, `original_filename` is the current human-facing Admin image name and can be changed without changing `storage_key`.

A null `image_collection_id` is presented as **Unsorted**.

Production object identity is immutable: replacing bytes should normally create a new Asset/object rather than overwrite an old key used by historical Reviews.

Preview uploads have non-null Preview ownership and use the session-specific Preview R2 prefix.

## 10. `case_assets` — fixed Case images

Links reusable Assets into one Case as fixed stimuli.

```text
case_id
asset_id
display_order
caption_md
created_at
```

Uniqueness:

```text
(case_id, asset_id)
(case_id, display_order)
```

All active fixed Assets are shown/snapshotted in every applicable Review.

`caption_md` is Case-specific relationship metadata; it does not belong on the global Asset.

## 11. `stimulus_groups`

Added by `0002_optional_stimulus_groups.sql`.

A Case may have zero or more independent alternative sets.

Current fields include:

```text
id
case_id
name
display_order
selection_count             positive; current V1 behavior selects exactly 1
specific_question_mode      none | minimum | all
minimum_specific_questions  nullable positive value
is_active
created_at
updated_at
```

Current learner behavior chooses exactly one active option per active group and freezes it at Review creation.

The coverage fields allow author-configured guarantees for stimulus-specific questions.

## 12. `stimulus_group_options`

One reusable Asset as an option inside one alternative group.

```text
id
stimulus_group_id
asset_id
display_order
caption_md
is_active
created_at
```

Important identity rule: `id` is stable and exact-option questions reference it directly.

Image Management V2 can therefore re-parent an existing option between valid active groups **within the same Case** while preserving option ID, caption, active state, Asset, and exact-option questions.

## 13. `question_prompts`

Reusable learner-facing wording only.

```text
id
prompt_md
preview_session_id   nullable FK -> preview_sessions
is_active
created_at
updated_at
```

No universal answer or clinical Tags belong on this table.

Example:

```text
What is the diagnosis?
```

can legitimately be reused in unrelated Cases with different answers.

Production Shared Questions cannot use Preview-owned Prompts.

## 14. Contextual Question tables

All contextual Question tables reuse `question_prompts` while storing the answer on the relationship where it remains correct.

### `concept_questions`

```text
id
concept_id
question_prompt_id
answer_md
inherit_to_descendants
is_active
created_at
updated_at
UNIQUE (concept_id, question_prompt_id)
```

Direct reusable Topic questions are loaded from the Review's **Study Topic**, not automatically from the Case's canonical primary/default Topic.

Eligible ancestor questions require `inherit_to_descendants = true`.

### `case_questions`

```text
id
case_id
question_prompt_id
answer_md
is_active
created_at
updated_at
UNIQUE (case_id, question_prompt_id)
```

Represents exact Case questions/overrides.

### `stimulus_group_questions`

Stores questions/answers valid for every option in one alternative set.

### `stimulus_option_questions`

Stores exact selected-option questions/answers.

These contextual tables prevent a global Asset from owning Case-specific teaching meaning.

## 15. Tagging Stage A tables

Migration `0005_tag_foundation.sql` adds flat canonical clinical metadata.

### `tags`

Canonical manually curated Tag definition with normalized uniqueness and active state.

### `case_tags`

Many-to-many Case ↔ Tag relationship.

A `case_tags` row has no relationship-level active flag. Stage B eligibility therefore requires the row plus an active referenced Tag.

### `case_question_tags`

Many-to-many contextual Case Question ↔ Tag relationship.

Case Tags do not automatically propagate to Question Tags.

Tags do not replace Topics.

## 16. `shared_questions`

Added by `0008_tag_shared_questions.sql` and activated by deployed Stage B behavior.

A Shared Question is reusable medical answer/meaning linked to reusable Prompt wording.

```text
id
question_prompt_id
answer_md
reuse_scope_tag_id    exactly one non-null FK -> tags
is_active
created_at
updated_at
```

A partial uniqueness rule allows at most one simultaneously active Shared Question per `question_prompt_id` while preserving inactive historical rows.

`shared_questions` deliberately has **no `preview_session_id`**. They are global production-curated knowledge objects.

Current eligibility for selected production Case:

```text
Shared Question active
AND Prompt active
AND Prompt preview_session_id IS NULL
AND Reuse Scope Tag active
AND case_tags contains (Case, Reuse Scope Tag)
```

Topic ancestry and descriptive Tags do not create eligibility.

## 17. `shared_question_tags`

Independent descriptive metadata for Shared Questions.

```text
shared_question_id
tag_id
created_at
PRIMARY KEY (shared_question_id, tag_id)
```

These Tags answer “what does this reusable Question teach/test?”

They are independent from `reuse_scope_tag_id`, which answers “which tagged Cases make it eligible?”

The Reuse Scope Tag is not automatically inserted into descriptive Tags.

## 18. `import_jobs`

Added by `0004_resumable_import_jobs.sql`.

Operational durable state for strict reviewed Import Package v1 execution.

Important fields:

```text
id
package_id
package_sha256
package_storage_key
status
phase
cursor
processed_count
total_count
created_by
created_at
updated_at
completed_at
last_error
lease_token
lease_expires_at
```

Statuses:

```text
validating
ready
importing
complete
failed
cancelled
```

The browser is not authority for execution plan/cursor/IDs; D1 job state plus server-derived staged package data is.

A separate chunk-history table is not currently required because deterministic phase/cursor provides safe resume semantics.

## 19. `reviews`

One learner attempt at one resolved Case/Study Topic.

```text
id
user_id
case_id
primary_concept_id
study_concept_id
case_title_snapshot
vignette_snapshot_md
status          started | completed
rating          null | again | good
started_at
revealed_at
completed_at
```

Meaning:

```text
primary_concept_id
= canonical/default primary Topic of Case at Review creation

study_concept_id
= actual attached Study Topic route used for this Review
```

Migration `0003_multi_topic_study_routing.sql` backfilled historical Reviews with:

```text
study_concept_id = primary_concept_id
```

because pre-migration Reviews used primary-Topic routing.

Review history supports immediate-repeat avoidance and future progress queries but current V1 does not store spaced-repetition due state.

## 20. `review_questions`

Snapshots exact selected questions/answers and source provenance.

Current fields:

```text
id
review_id
question_prompt_id
source_type
source_concept_id
source_stimulus_group_id
source_stimulus_option_id
source_shared_question_id
display_order
prompt_snapshot_md
answer_snapshot_md
```

Current `source_type` values:

```text
case
concept
ancestor_concept
stimulus_group
stimulus_option
tag_shared
```

Uniqueness:

```text
(review_id, display_order)
(review_id, question_prompt_id)
```

`0008` conservatively rebuilt this table to add `tag_shared` and nullable Shared Question provenance while preserving all historical row IDs/snapshots/previous provenance.

For `tag_shared`, the Review snapshots Prompt/answer plus `source_shared_question_id`; it does **not** snapshot Case/Reuse/Descriptive Tag IDs.

## 21. `review_assets`

Snapshots exact fixed/selected media shown in a Review.

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

Uniqueness:

```text
(review_id, display_order)
(review_id, asset_id)
```

The immutable-key rule plus these snapshots preserves historical stimulus identity even if current Case/Collection/option relationships later change.

## 22. Relationship overview

```text
preview_sessions
  ├── cases.preview_session_id
  ├── assets.preview_session_id
  └── question_prompts.preview_session_id

concepts
  └── concepts.parent_id

cases
  ├── case_concepts ── concepts
  ├── case_assets ──── assets
  ├── case_questions ─ question_prompts
  │    └── case_question_tags ── tags
  ├── case_tags ────── tags
  └── stimulus_groups
       ├── stimulus_group_options ── assets
       │    └── stimulus_option_questions ── question_prompts
       └── stimulus_group_questions ── question_prompts

image_collections
  └── assets.image_collection_id

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

import_jobs
  └── operational Better Auth created_by text ID + private R2 staging
```

## 23. Resolved-question algorithm

For a selected active production Case and resolved Study Topic:

### A. Resolve Topic provenance

Identify the Case's single primary/default Topic and one attached Study Topic from the learner-selected Topic/subtree.

Current Study-Topic precedence for a Case candidate is:

1. exact Case link to the Topic explicitly selected by the learner;
2. otherwise Case primary/default Topic if it lies in the selected subtree;
3. otherwise deepest matching secondary Topic in that subtree;
4. stable Topic-ID tie-break.

### B. Select/freeze stimuli

Load active fixed Case Assets and select exactly one active option from every active stimulus group.

### C. Collect eligible questions

Collect active:

- exact-option contextual questions for selected options;
- selected stimulus-group contextual questions;
- Case questions;
- exact Study Topic questions;
- eligible tag-shared Questions matching active Case Tags;
- eligible inheritable ancestor Topic questions.

Do not load reusable questions from every other attached Study Topic.

### D. Deduplicate by Prompt with precedence

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

Higher-priority context wins for duplicate `question_prompt_id`.

### E. Apply Case selection/coverage and snapshot

Apply:

```text
Automatic | All | Fixed
```

plus configured stimulus-specific coverage to the final deduplicated pool.

Persist `reviews`, `review_questions`, and `review_assets` before rendering learner content so edits/rerandomization cannot change an in-progress Review.

## 24. Case-selection algorithm

Given a learner-selected active Topic:

1. resolve that Topic plus active descendants;
2. find active production Cases with any qualifying primary/secondary `case_concepts` relationship;
3. deduplicate by Case ID so several relationships do not increase weight;
4. resolve one deterministic Study Topic per Case candidate;
5. exclude the learner's most recently completed Case when possible;
6. randomly select one Case;
7. select/freeze stimuli and questions;
8. create durable Review snapshots.

Preview-owned Cases/Prompts/Assets are excluded from normal learner Review construction.

## 25. Preview ownership/database defense

Migration `0006` and later migrations add database/application safeguards around disposable Preview data.

Important current principles:

- Preview content carries explicit ownership;
- production Admin/learner read models exclude disposable Preview content where required;
- Preview-owned Prompts cannot back global Shared Questions;
- Preview media cleanup may delete only verified Preview-owned objects;
- global Shared Questions and Image Collections remain production-curated global objects unless an explicit future contract changes mutation authority.

## 26. Progress queries without a new progress table

Current completed `reviews` can derive useful V1 Admin progress views:

- completed Review count by learner;
- Again versus Good count;
- results by canonical primary Topic;
- results by actual Study Topic;
- recent Cases/Reviews;
- repeated Again signals.

A separate `learner_progress` table is not required until a real scheduling/mastery model needs persisted derived state.

## 27. Deliberately deferred schema

Do not add without concrete behavior requirements:

- `asset_concepts`;
- `stimulus_option_concepts`;
- Asset-owned Question tables;
- Asset Tags;
- Tag hierarchy/alias tables;
- compound Shared Question reuse expressions;
- learner Study-by-Tag structures;
- Review Tag snapshot tables;
- finding ontologies;
- curriculum Deck/Course entities distinct from current Topics and Image Collections;
- scheduling/due-state tables;
- per-question learner mastery;
- structured marking points;
- curricula/cohorts/institutional tenancy;
- arbitrary structured laboratory stimulus schema;
- answer alternatives/automated marking structures.

The current data model should continue to grow from real authoring/learner evidence rather than theoretical normalization alone.
