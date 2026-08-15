# Flash-Cards — V1 Data Model

_Last updated: 15 August 2026_

This document records the implemented V1 application data model. It complements `V1_SPEC.md`.

The schema is implemented with Drizzle using the SQLite/D1 dialect and version-controlled migrations.

The currently deployed schema remains the baseline described below. Migration `0002_optional_stimulus_groups.sql` adds the reviewed, additive optional-stimulus extension without rewriting ordinary Cases or `case_assets`.

## 1. Design rules

1. Use application-generated text IDs (UUID/ULID-style identifiers) rather than D1 auto-increment IDs for domain objects.
2. Keep Better Auth's authentication tables separate from learning-domain tables.
3. Use foreign keys and unique constraints wherever practical.
4. Prefer deactivation (`is_active`) to destructive deletion for learning content.
5. Store R2 object keys, not public/provider URLs, in learning records.
6. Snapshot what the learner actually saw when a review begins.
7. Keep answer text on the relationship that supplies its context, not on the reusable prompt itself.
8. V1 application code enforces rules that are awkward to express portably across SQLite and PostgreSQL.
9. New content structures should be additive and backward-compatible where practical; ordinary Cases must not require stimulus-group metadata.

## 2. Authentication tables

Better Auth owns its required authentication/session tables.

The Better Auth Admin plugin supplies the V1 `admin` and `user` roles and administrator user-management operations.

Domain tables should reference the Better Auth user ID as text rather than duplicating credentials or sessions.

## 3. Domain tables

### `concepts`

Represents the medical taxonomy.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `name` | Display name |
| `slug` | Stable human-readable identifier, unique |
| `description_md` | Optional teaching/admin description |
| `parent_id` | Optional self-reference to `concepts.id` |
| `is_active` | Soft-deactivation flag |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |

Rules:

- a Concept cannot be its own parent;
- application validation must prevent cycles;
- inactive Concepts are excluded from learner selection.

### `cases`

Represents the coherent study unit shown to the learner.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `title` | Internal/admin-facing Case title |
| `vignette_md` | Optional learner-facing context |
| `is_active` | Soft-deactivation flag |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |

Concept membership is kept in `case_concepts` rather than stored directly here.

### `case_concepts`

Links a Case to one or more Concepts.

| Column | Purpose |
|---|---|
| `case_id` | FK to `cases.id` |
| `concept_id` | FK to `concepts.id` |
| `role` | `primary` or `secondary` |
| `created_at` | Timestamp |

Primary key/unique constraint:

```text
(case_id, concept_id)
```

V1 invariant:

- every active Case must have exactly one `primary` Concept before it can be presented to learners;
- zero or more `secondary` Concepts are allowed;
- only the primary Concept contributes reusable Concept Questions automatically.

The exactly-one-primary rule may be enforced in application logic if a portable database constraint would add unnecessary complexity.

### `assets`

Stores reusable stimulus metadata.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `type` | V1 value: `image`; retained as generic field |
| `storage_key` | R2 object key |
| `mime_type` | e.g. `image/jpeg`, `image/png` |
| `original_filename` | Optional original upload name |
| `alt_text` | Accessibility text |
| `source_label` | Optional source/attribution text |
| `source_url` | Optional source URL/reference |
| `licence` | Optional licence text |
| `is_active` | Soft-deactivation flag |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |

V1 should treat an uploaded object as immutable. Replacing an image should normally create a new Asset/object key and update the Case link rather than overwriting bytes behind an old key.

### `case_assets`

Links Assets into Cases and controls presentation.

| Column | Purpose |
|---|---|
| `case_id` | FK to `cases.id` |
| `asset_id` | FK to `assets.id` |
| `display_order` | Integer ordering within Case |
| `caption_md` | Optional Case-specific caption |
| `created_at` | Timestamp |

Unique constraints:

```text
(case_id, asset_id)
(case_id, display_order)
```

A multi-image Case is simply one Case with several ordered `case_assets` rows.

All active ungrouped Case Assets remain fixed stimuli and are snapshotted into every Review. Active Stimulus Groups add one selected option per group after those fixed assets.

### `question_prompts`

Stores reusable wording only.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `prompt_md` | Learner-facing question text |
| `is_active` | Soft-deactivation flag |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |

No default/correct answer belongs on this table because the same wording can be correct in several contexts with different answers.

### `concept_questions`

Makes a Question Prompt valid for a Concept and supplies the Concept-specific answer.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `concept_id` | FK to `concepts.id` |
| `question_prompt_id` | FK to `question_prompts.id` |
| `answer_md` | Correct/teaching answer in this Concept context |
| `inherit_to_descendants` | Whether descendants may use this question |
| `is_active` | Soft-deactivation flag |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |

Unique constraint:

```text
(concept_id, question_prompt_id)
```

This relationship is necessary because prompts such as `What is the diagnosis?` or `Which artery is involved?` can share wording but have different answers at different Concepts.

### `case_questions`

Makes a Question Prompt valid for one exact Case and supplies its Case-specific answer.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `case_id` | FK to `cases.id` |
| `question_prompt_id` | FK to `question_prompts.id` |
| `answer_md` | Correct/teaching answer for this Case |
| `is_active` | Soft-deactivation flag |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |

Unique constraint:

```text
(case_id, question_prompt_id)
```

A `case_questions` row can represent either:

- a question that exists only for this Case; or
- a Case-level override of a prompt also available through the Concept hierarchy.

The same table handles both situations.

### `reviews`

Represents one learner attempt at one selected Case.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `user_id` | Better Auth user ID |
| `case_id` | FK to `cases.id` |
| `primary_concept_id` | Concept that drove selection at attempt time |
| `case_title_snapshot` | Title as presented/identified at attempt time |
| `vignette_snapshot_md` | Vignette at attempt time |
| `status` | `started` or `completed` |
| `rating` | null, `again`, or `good` |
| `started_at` | Timestamp |
| `revealed_at` | Nullable timestamp |
| `completed_at` | Nullable timestamp |

Rules:

- rating is null until completion;
- `again`/`good` completes the Review;
- abandoned `started` reviews remain distinguishable from completed study.

### `review_questions`

Snapshots the exact questions and answers selected for one Review.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `review_id` | FK to `reviews.id` |
| `question_prompt_id` | Original prompt ID |
| `source_type` | `case`, `concept`, or `ancestor_concept` |
| `source_concept_id` | Nullable Concept that supplied answer |
| `display_order` | Order shown in this attempt |
| `prompt_snapshot_md` | Exact prompt text shown |
| `answer_snapshot_md` | Exact resolved answer shown after reveal |

Unique constraints:

```text
(review_id, display_order)
(review_id, question_prompt_id)
```

This table is essential because admins can edit prompts/answers later without changing what an old Review means.

`review_questions.source_type` supports `stimulus_group` and `stimulus_option`, with nullable group/option provenance columns. Existing rows retain their original source types.

### `review_assets`

Snapshots which Assets were shown in a Review.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `review_id` | FK to `reviews.id` |
| `asset_id` | Original Asset ID |
| `display_order` | Order shown |
| `storage_key_snapshot` | Exact R2 object key used |
| `caption_snapshot_md` | Caption shown at attempt time |
| `alt_text_snapshot` | Alt text shown/available at attempt time |

Unique constraints:

```text
(review_id, display_order)
(review_id, asset_id)
```

The immutable-object-key rule means historical Review Assets remain reproducible even after a Case is edited.

When stimulus groups are implemented, `review_assets` should continue storing the exact selected Asset snapshot and should additionally retain enough stimulus group/option provenance to identify which alternative produced the snapshot.

## 4. Relationship overview

Current implemented relationships:

```text
concepts
  └── concepts.parent_id

cases
  ├── case_concepts ── concepts
  ├── case_assets ──── assets
  └── case_questions ─ question_prompts

concepts
  └── concept_questions ─ question_prompts

Better Auth user
  └── reviews ── cases
        ├── review_questions
        └── review_assets
```

Planned optional extension:

```text
cases
  └── stimulus_groups
       ├── stimulus_group_options ── assets
       └── stimulus_group_questions ── question_prompts

stimulus_group_options
  └── stimulus_option_questions ── question_prompts
```

The exact migration shape remains subject to implementation review; see `STIMULUS_GROUPS_DESIGN.md`.

## 5. Resolved-question algorithm

### Current implemented algorithm

For a selected Case:

#### Step A — identify primary Concept

Read the Case's single `case_concepts.role = primary` link.

#### Step B — collect candidate Prompt/answer pairs

Collect:

1. active `case_questions` for the Case;
2. active `concept_questions` for the primary Concept;
3. active `concept_questions` on each ancestor where `inherit_to_descendants = true`.

Do not automatically collect questions from secondary Concepts.

#### Step C — deduplicate by Question Prompt

For duplicate prompt IDs, precedence is:

```text
case_questions
  > concept_questions on primary Concept
  > closest eligible ancestor concept_questions
  > more distant eligible ancestor concept_questions
```

#### Step D — random selection

Shuffle the resolved candidates and select up to the configured maximum, targeting 3 questions.

#### Step E — snapshot

Before serving the Review page, persist:

- `reviews` row;
- all selected `review_questions` rows;
- all active ordered `review_assets` rows.

The learner page renders the snapshots rather than recalculating the Case on every request.

This prevents a mid-review admin edit from changing the attempt.

### Planned stimulus-aware extension

After stimulus groups are implemented, Review creation should select the active stimulus options **before** final question resolution.

Planned precedence becomes:

```text
selected stimulus option
  > selected option's stimulus group
  > Case
  > primary Concept
  > closest eligible ancestor Concept
  > more distant eligible ancestor Concept
```

Question-count and per-group specific-question coverage should be configurable rather than permanently hard-coded to exactly one policy.

See `STIMULUS_GROUPS_DESIGN.md` for the full planned algorithm.

## 6. Case-selection algorithm

Given a learner-selected Concept:

1. find that Concept and its active descendants;
2. find active Cases whose **primary** Concept is in that set;
3. if more than one eligible Case exists, exclude the learner's most recently completed Case from the candidate set when possible;
4. randomly select one Case;
5. resolve/snapshot its questions and Assets;
6. return the new Review ID.

V1 selection uses history only to avoid an immediate repeat. It does not calculate due dates or spaced-repetition intervals.

When stimulus groups are implemented, step 5 expands to select and freeze stimulus alternatives before resolving the final question set.

## 7. Basic progress queries

V1 admin reporting can be derived from completed `reviews`.

Useful queries include:

- completed review count by learner;
- `again` versus `good` count by learner;
- results by `primary_concept_id`;
- most recently reviewed Cases;
- Cases with repeated `again` ratings.

No separate `learner_progress` table is required for V1. Add one only when a real scheduling/mastery model needs persisted derived state.

Stimulus-option provenance may later support additional analytics, but analytics requirements must not drive the first stimulus-group migration beyond what is needed to preserve historical Review meaning.

## 8. Deferred schema objects

Do not add these until required by real behaviour:

- scheduling/due-state tables;
- per-question learner mastery;
- structured marking points;
- question difficulty/weighting;
- curricula/cohorts;
- institutional tenancy;
- Anki import provenance tables;
- arbitrary structured laboratory stimuli;
- answer alternatives/automated marking structures.

Alternative stimulus groups are no longer merely hypothetical deferred work: pilot modelling has identified a concrete need. Their implementation should remain additive and focused, as defined in `STIMULUS_GROUPS_DESIGN.md`.
