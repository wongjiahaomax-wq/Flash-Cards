# Flash-Cards — V1 Data Model

_Last updated: 15 August 2026_

This document records the implemented V1 application data model. It complements `V1_SPEC.md`.

The schema is implemented with Drizzle using the SQLite/D1 dialect and version-controlled migrations.

Migration `0002_optional_stimulus_groups.sql` adds the reviewed optional-stimulus extension. Draft PR #18 adds `0003_multi_topic_study_routing.sql`, which adds Review Study-Concept provenance without changing `case_concepts` or the stimulus-group schema.

## 1. Design rules

1. Use application-generated text IDs (UUID/ULID-style identifiers) rather than D1 auto-increment IDs for domain objects.
2. Keep Better Auth's authentication tables separate from learning-domain tables.
3. Use foreign keys and unique constraints wherever practical.
4. Prefer deactivation (`is_active`) to destructive deletion for learning content.
5. Store R2 object keys, not public/provider URLs, in learning records.
6. Snapshot what the learner actually saw when a review begins.
7. Keep answer text on the relationship that supplies its context, not on the reusable prompt itself.
8. V1 application code enforces rules that are awkward to express portably across SQLite and PostgreSQL.
9. New content structures should be additive and backward-compatible where practical; ordinary Cases must not require stimulus-group or secondary-Topic metadata.

## 2. Authentication tables

Better Auth owns its required authentication/session tables.

The Better Auth Admin plugin supplies the V1 `admin` and `user` roles and administrator user-management operations.

Domain tables should reference the Better Auth user ID as text rather than duplicating credentials or sessions.

## 3. Domain tables

### `concepts`

Represents the medical taxonomy. The Admin product calls these **Topics**.

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
| `question_selection_mode` | `automatic`, `all`, or `fixed` |
| `question_count` | Optional positive count used by `fixed` mode |
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

V1 invariant and learner meaning after PR #18:

- every learner-presentable active Case has exactly one `primary` Concept;
- zero or more `secondary` Concepts are allowed;
- `primary` means canonical/default administrative classification;
- both primary and secondary relationships may make a Case learner-eligible;
- exactly one attached **Study Concept** is resolved for each Review route and supplies the reusable Concept Questions for that Review.

Changing the default Topic must not silently erase other attached Case Topic routes. Full Admin multi-Topic add/remove authoring remains a separate follow-up milestone.

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

### `stimulus_groups` and `stimulus_group_options`

Implemented by `0002_optional_stimulus_groups.sql`.

A Case may have zero or more independent active stimulus groups. V1 selects exactly one active option per active group and freezes that selection into Review provenance.

Ordinary Cases with only fixed `case_assets` continue to work unchanged.

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

Direct reusable Concept questions for a Review are loaded from its **Study Concept**, not automatically from the Case's canonical/default primary Concept.

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

### `stimulus_group_questions` and `stimulus_option_questions`

These implemented contextual tables reuse `question_prompts` while storing group-level or exact-option answers on the relationship where that answer is correct.

### `reviews`

Represents one learner attempt at one selected Case.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `user_id` | Better Auth user ID |
| `case_id` | FK to `cases.id` |
| `primary_concept_id` | Canonical/default primary Concept of the selected Case at Review creation |
| `study_concept_id` | Attached Case Concept used as the reusable Topic-question route for this Review |
| `case_title_snapshot` | Title as presented/identified at attempt time |
| `vignette_snapshot_md` | Vignette at attempt time |
| `status` | `started` or `completed` |
| `rating` | null, `again`, or `good` |
| `started_at` | Timestamp |
| `revealed_at` | Nullable timestamp |
| `completed_at` | Nullable timestamp |

Rules:

- `primary_concept_id` and `study_concept_id` are non-null FKs to `concepts.id` using `ON DELETE RESTRICT`;
- rating is null until completion;
- `again`/`good` completes the Review;
- abandoned `started` reviews remain distinguishable from completed study.

Migration `0003_multi_topic_study_routing.sql` backfills existing Reviews with:

```text
study_concept_id = primary_concept_id
```

This preserves historical meaning because every pre-migration Review used primary-Concept routing. The migration conservatively rebuilds `reviews` to enforce the final constraint while retaining existing Review snapshots and indexes, and adds a Study-Concept completion index for later progress queries.

### `review_questions`

Snapshots the exact questions and answers selected for one Review.

| Column | Purpose |
|---|---|
| `id` | Text primary key |
| `review_id` | FK to `reviews.id` |
| `question_prompt_id` | Original prompt ID |
| `source_type` | `case`, `concept`, `ancestor_concept`, `stimulus_group`, or `stimulus_option` |
| `source_concept_id` | Nullable Concept that supplied answer |
| `source_stimulus_group_id` | Nullable group provenance |
| `source_stimulus_option_id` | Nullable exact-option provenance |
| `display_order` | Order shown in this attempt |
| `prompt_snapshot_md` | Exact prompt text shown |
| `answer_snapshot_md` | Exact resolved answer shown after reveal |

Unique constraints:

```text
(review_id, display_order)
(review_id, question_prompt_id)
```

This table is essential because admins can edit prompts/answers later without changing what an old Review means.

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
| `source_stimulus_group_id` | Nullable selected group provenance |
| `source_stimulus_option_id` | Nullable selected option provenance |

Unique constraints:

```text
(review_id, display_order)
(review_id, asset_id)
```

The immutable-object-key rule means historical Review Assets remain reproducible even after a Case is edited. Selected stimulus options are frozen at Review creation and do not rerandomize on refresh.

## 4. Relationship overview

Current implemented relationships:

```text
concepts
  └── concepts.parent_id

cases
  ├── case_concepts ── concepts
  ├── case_assets ──── assets
  ├── case_questions ─ question_prompts
  └── stimulus_groups
       ├── stimulus_group_options ── assets
       │    └── stimulus_option_questions ── question_prompts
       └── stimulus_group_questions ── question_prompts

concepts
  └── concept_questions ─ question_prompts

Better Auth user
  └── reviews ── cases
        ├── primary_concept_id ── concepts
        ├── study_concept_id ─── concepts
        ├── review_questions
        └── review_assets
```

No second Case↔Topic table is required for multi-Topic learner routing.

## 5. Resolved-question algorithm

### Current implemented algorithm

For a selected Case and its resolved Study Concept:

#### Step A — identify canonical and Study Concepts

Read the Case's single `case_concepts.role = primary` link as the canonical/default Concept and use the learner route resolver to supply one attached Study Concept.

Study-Concept precedence is:

1. exact Case link to the Topic explicitly selected by the learner;
2. otherwise the Case primary/default Concept if it lies in the selected subtree;
3. otherwise the deepest matching secondary Concept in that subtree;
4. stable Concept-ID tie-break.

#### Step B — select/freeze stimulus options

Load fixed Case Assets and select exactly one active option from each active Stimulus Group. Those selections are frozen into Review Asset provenance.

#### Step C — collect candidate Prompt/answer pairs

Collect:

1. active `case_questions` for the Case;
2. active `concept_questions` for the **Study Concept**;
3. active `concept_questions` on each Study-Concept ancestor where `inherit_to_descendants = true`;
4. active contextual questions for selected stimulus groups;
5. active contextual questions for exact selected options.

Do not automatically collect questions from the Case's other attached Concepts.

#### Step D — deduplicate by Question Prompt

For duplicate prompt IDs, precedence is:

```text
selected stimulus option
  > stimulus group
  > Case
  > Study Concept
  > closest eligible ancestor Concept
  > more distant eligible ancestor Concept
```

#### Step E — question selection and snapshot

Apply the existing Automatic / All / Fixed Case selection mode plus per-group stimulus-specific coverage requirements.

Before serving the Review page, persist:

- `reviews` row with both primary/default and Study Concept provenance;
- all selected `review_questions` rows;
- all fixed and selected `review_assets` rows.

The learner page renders the snapshots rather than recalculating the Case on every request.

This prevents a mid-review admin edit from changing the attempt and prevents stimulus rerandomization on refresh.

## 6. Case-selection algorithm

Given a learner-selected active Concept:

1. find that Concept and its active descendants;
2. find active Cases with **any** `case_concepts` relationship in that set, regardless of primary/secondary role;
3. deduplicate by Case ID before random selection so several matching Topic links do not increase a Case's weight;
4. resolve one deterministic Study Concept per Case candidate using the precedence in section 5;
5. if more than one eligible Case exists, exclude the learner's most recently completed Case from the candidate set when possible;
6. randomly select one Case;
7. select/freeze stimulus alternatives, resolve questions, and snapshot the Review;
8. return the new Review ID.

The `/study` Topic selector uses the same any-relationship subtree rule and counts unique Cases rather than relationship rows.

V1 selection uses history only to avoid an immediate repeat. It does not calculate due dates or spaced-repetition intervals.

## 7. Basic progress queries

V1 admin reporting can be derived from completed `reviews`.

Useful queries include:

- completed review count by learner;
- `again` versus `good` count by learner;
- results by canonical/default `primary_concept_id`;
- results by educational route `study_concept_id`;
- most recently reviewed Cases;
- Cases with repeated `again` ratings.

No separate `learner_progress` table is required for V1. Add one only when a real scheduling/mastery model needs persisted derived state.

Stimulus-option provenance may later support additional analytics, but analytics requirements must not drive the content model beyond what is needed to preserve historical Review meaning.

## 8. Deferred schema objects

Do not add these until required by real behaviour:

- `asset_concepts`;
- `stimulus_option_concepts`;
- Asset-owned Question tables;
- finding ontologies;
- Deck/Collection entities;
- scheduling/due-state tables;
- per-question learner mastery;
- structured marking points;
- question difficulty/weighting;
- curricula/cohorts;
- institutional tenancy;
- Anki import provenance tables;
- arbitrary structured laboratory stimuli;
- answer alternatives/automated marking structures.

The next multi-Topic milestone is Admin authoring for multiple attached Case Topics. Asset/Stimulus→Topic routing remains deliberately deferred unless representative content proves that Case-level Topic validity is insufficient.
