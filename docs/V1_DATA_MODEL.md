# Flash-Cards — V1 Data Model

_Last updated: 5 September 2026_

This document records the implemented V1 application data model through the learner FSRS runtime cutover, contextual System/Topic/Tag navigation, Primary-Topic-only Case behavior, Original/Alternative stimulus changes, merged PR #139 (PR F), the PR G Admin analytics/account-deletion repository implementation, the Multi-System Runtime v2 scope/runtime foundation through migration `0026`, and the learner multi-System `/study` UX implementation. It should agree with the current Drizzle schema modules, committed D1 migrations, and subsystem invariant documents. `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` is the companion authority for the current learner-runtime boundary and explicitly distinguishes repository state from Production deployment state. `MULTI_SYSTEM_RUNTIME_V2_IMPLEMENTATION.md` records the focused Runtime v2 implementation/cutover evidence; `MULTI_SYSTEM_UX_IMPLEMENTATION.md` records the current learner chooser/count/navigation cutover on top of that runtime.

A migration file being committed is not proof that it has been applied to production D1. Merge status, production migration application, Worker deployment, taxonomy/stimulus curation, learner feature enablement, and behavior verification remain separate operational facts.

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
0016_original_stimulus_options.sql
0017_align_reusable_prompt_live_state_guards.sql
0018_topic_deletion_provenance_indexes.sql
0019_learner_fsrs_foundation.sql
0020_learner_fsrs_active_reviews.sql
0021_learner_fsrs_scheduled_completion.sql
0022_learner_fsrs_free_study.sql
0023_learner_fsrs_system_provenance_guard.sql
0024_learner_fsrs_reset_fresh.sql
0025_learner_fsrs_admin_analytics_deletion.sql
0026_multi_system_active_review_scope_v2.sql
```

Important migrations for the current model include:

- `0009` — exact-Asset Reusable Image Questions, explicit stimulus-option opt-ins, reusable-image provenance, and cross-group Prompt protection;
- `0010` — defense in depth when reactivating dormant Reusable Image Questions;
- `0011` — nullable `assets.superseded_by_asset_id` self-FK/index for narrow same-image higher-resolution replacement;
- `0012` — `stimulus_group_options.removed_from_case`, separating archived removal from ordinary `is_active` deactivation;
- `0013` — historical `review_assets(asset_id, review_id)` lookup index. The indexed table is now a legacy migration-history/cutover-sentinel table and is not current Asset lifecycle ownership;
- `0014` — historical `reviews.question_pool_mode` compatibility. `reviews` is now a legacy migration-history/cutover-sentinel table and is not current learner runtime state;
- `0015` — `concepts.kind`, contextual `system_tags`, taxonomy/relationship guards, and the then-current legacy Review route-provenance columns. Those legacy Review columns are retained only as physical migration history;
- `0016` — nullable `stimulus_groups.original_option_id`, conservative production-only Original backfill, and defensive Original-integrity guards;
- `0017` — aligns reusable-question Prompt/live-state database guards with current authoring invariants;
- `0018` — Topic deletion-provenance indexes used by current content safety checks;
- `0019` — learner FSRS foundation: persistent learner preference/profile state, learner×Case FSRS state, encounters, Scheduled events, optimizer evidence, learner aggregates, and learner×System Scheduled aggregates;
- `0020` — normalized temporary active-Review ownership in `active_reviews`, `active_review_questions`, and `active_review_assets`;
- `0021` — Scheduled FSRS completion context and database write-time guards for exactly-once active-Review consumption and durable Scheduled event/state updates;
- `0022` — Free Study completion with short-lived `free_review_completion_receipts` plus write-time active-Review/expiry guards;
- `0023` — defensive deletion/reclassification protection for Systems referenced by durable FSRS System provenance in `scheduled_review_events` or `learner_system_aggregates`;
- `0024` — defensive Scheduled active-Review/profile-boundary guard used by Reset Progress / Fresh FSRS Start serialization. It prevents generation/review-sequence/parameter/scheduler boundary movement while a Scheduled active Review still survives.
- `0025` — durable learner × historical-System × UTC-month Scheduled analytics buckets, transactional maintenance/backfill from still-retained detailed history, System-provenance guards, and durable retry-safe learner account-deletion state/guards with bounded auth/application ownership phases.
- `0026` — replaces the Active Review content/scope guard with the strict canonical Runtime v2 envelope, validates bounded canonical multi-System `runScope`, proves the frozen scalar attribution System is selected and can actually reach the Case through that selected sub-scope, rejects duplicate/contradictory scope shapes, and retains the active/non-Preview Case plus active Primary Topic eligibility baseline.

Migrations `0013`–`0015` remain immutable and valid migration history. Their legacy `reviews`, `review_questions`, and `review_assets` semantics must not be read as current runtime architecture after the FSRS cutover.

`0016` does not claim that every existing family has a known Original. It assigns an Original only to an unambiguous eligible one-option **production** family, leaves ambiguous legacy multi-option production families uncurated with `original_option_id = NULL`, and leaves retained Preview-owned families uncurated. It does not rewrite older legacy Review rows. The migration also prevents creating a group with an arbitrary non-null Original pointer; a family is inserted with `original_option_id = NULL`, then an eligible option is inserted/restored and an explicit validated update assigns the Original.

No new migration is required to retire Additional Study Topics from current product behavior. The current Drizzle authority is split deliberately across `src/lib/server/db/schema.js` for content/domain tables, `src/lib/server/db/fsrs-schema.js` for durable FSRS/progress state, `src/lib/server/db/fsrs-analytics-schema.js` for durable PR G monthly analytics/deletion state, `src/lib/server/db/active-review-schema.js` for unfinished learner Review ownership, and `src/lib/server/db/free-study-schema.js` for Free completion receipts; `drizzle.config.js` registers the current schema modules. `src/lib/server/db/schema.js` intentionally exports no legacy `reviews`, `review_questions`, or `review_assets` tables after cutover. The historical physical `case_concepts.role = primary | secondary` shape remains unchanged, while current application read/write paths treat only `role = 'primary'` as behaviorally active. Migration `0026` changes database guard semantics rather than adding a new Drizzle table/column.

## 2. General design rules

1. Use application-generated text IDs for domain objects.
2. Keep Better Auth tables conceptually separate from learning-domain tables.
3. Use foreign keys, checks, unique indexes, and defensive triggers where practical.
4. Prefer deactivation/archive over destructive deletion for teaching content.
5. Store private R2 object keys, not public/provider media URLs.
6. Freeze what the learner actually sees into the current active Review before progress begins; do not use the retired legacy Review tables for new snapshots.
7. Store answers/clinical meaning on the relationship/object that makes them correct; `question_prompts` stores wording only.
8. Keep Systems, Topics, Tags, stimulus groups, Image Collections, and exact-Asset reuse semantically separate.
9. Keep new content structures additive/backward-compatible where safe; compatibility shapes must not preserve retired product behavior accidentally.
10. Preview ownership is explicit provenance, not a naming convention or UI-only filter.
11. Production teaching-image object keys are immutable; quality replacement creates a new Asset/R2 object.
12. Stable Stimulus Option identity anchors Case-specific exact-image teaching; exact Asset identity anchors reusable exact-image teaching.
13. Asset lifecycle status and derived usage classification are distinct concepts.
14. Learner question-pool eligibility and Case question-count selection are orthogonal concerns: source eligibility is decided before duplicate-Prompt resolution, then existing Automatic/All/Fixed selection is applied.
15. System/Tag learner navigation chooses Case entry context; it does not replace canonical Topic-question resolution.
16. Current learner runtime scope/provenance is split by purpose: the unfinished active Review owns the complete authenticated canonical v2 run scope plus one frozen concrete attribution System for the presented Case, while durable Scheduled completion records compact historical System attribution in Scheduled events/aggregates/monthly buckets.
17. A current learner-presentable Case has exactly one behaviorally active canonical Primary Topic; alternate/cross-cutting classification uses Case Tags rather than Additional Study Topics.
18. A curated stimulus family has an explicit Original pointer; insertion/display order, filename, caption, naming, or learner snapshot/history must never be treated as implicit Original semantics.
19. Reset/Fresh scheduler-boundary changes consume any active Review and clear current learner×Case scheduler state atomically with the boundary change; browser run state is convenience only and old proofs still fail server-side current-profile checks.
20. Long-range Admin System/cohort time series are sourced from durable monthly buckets, never reconstructed from lifetime aggregates or optimizer evidence; mature account deletion uses marker-authoritative access denial and bounded retry-safe auth/application purges.
21. Multi-System selection changes Case eligibility/routing only: FSRS state/parameters remain learner-wide/per-Case rather than per-System, run-size and 50-New limits remain global, and no synthetic `Mixed` System or implicit balanced System quota is created.

## 3. Authentication and Preview ownership

Better Auth owns authentication/session/account tables. Application role concepts include `admin`, `user`, and `preview_admin`.

`preview_sessions` provides durable ownership/lifecycle state for disposable Preview content. Production Cases/Assets/Prompts have `preview_session_id = NULL`; Preview-owned equivalents carry a session ID where supported.

Global Systems, Topics, Tags, Shared Questions, and Reusable Image Questions are production-curated. Preview may read global taxonomy/Tags, but Preview does not own or mutate those global structures.

The retained legacy Preview Admin subsystem is outside issue #105's Original/Alternative authoring feature. Migration `0016` therefore does not backfill Preview stimulus families with an Original merely because a family has one option. Preview families may continue with `original_option_id = NULL`, preserving their existing editing behavior and ownership boundaries.

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
= canonical Case classification and reusable Topic-question scope
```

Taxonomy invariants include:

- Systems are top-level (`parent_id IS NULL`);
- a non-null parent must exist and be active;
- the hierarchy must be acyclic;
- active children block parent deactivation until moved/deactivated;
- Topics may temporarily remain top-level while curation is incomplete;
- a Topic with Case/Topic-question usage cannot be reclassified as a System without first resolving those usages;
- a System with durable FSRS history in `scheduled_review_events`, `learner_system_aggregates`, or `learner_system_monthly_buckets` cannot be reclassified or deleted; centralized application checks plus migrations `0023`/`0025` database triggers enforce this provenance boundary.

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

Physical compatibility shape:

```text
case_id
concept_id
role primary | secondary
created_at
PRIMARY KEY (case_id, concept_id)
```

Current product semantics are:

```text
role = primary
→ the Case's canonical Topic
→ current Topic learner route
→ current direct Topic-question context

role = secondary
→ legacy compatibility data only
→ may remain physically stored
→ hidden from current authoring/taxonomy reads
→ ignored for new learner routing
→ not created by current Admin/Preview/import/clone paths
```

A learner-presentable current Case therefore requires exactly one valid Primary Topic for current behavior, even though an older stored row with `role = secondary` may coexist physically.

`case_concepts.concept_id` may reference Topics only, never Systems. This is enforced in application mutation paths and by `0015` database guards. No additional schema migration is required merely to retire secondary behavior.

Changing a Case's Primary Topic replaces its canonical current relationship rather than demoting the old Topic to secondary. Unrelated historical secondary rows can remain inert; if the chosen new Primary Topic is itself already stored as a legacy secondary row, that one conflicting row is resolved as part of the explicit Primary Topic change.

`question_selection_mode` answers **how many questions** are selected from an already eligible pool. It is not overloaded to represent Original versus Expanded source eligibility.

## 5. Image organisation and Assets

### `image_collections`

Global Admin Image Library organisation only. Collections have no learner-routing, Tag, Case, question, or completion-history semantics.

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

Usage is computed from current/retained relationships rather than stored as an Asset flag:

```text
Current
→ active Asset in an active production Case as fixed image
  OR active Asset on active, non-removed option in active group.

Historical only
→ no Current use, but a retained production relationship,
  an unfinished active_review_assets reference, a Reusable Image Question,
  or a supersession relationship still requires the Asset/R2 object.

Unused
→ neither Current use nor any retained current/provenance dependency.
```

The `Historical only` label is a lifecycle classification; an `active_review_assets` dependency represents **unfinished current learner ownership**, not completed historical Review persistence. Legacy `review_assets` rows do not participate in the current lifecycle model and must be zero at the cutover gate. Preview-session relationships do not affect production lifecycle classification.

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

## 7. Alternative Sets, Original selection, and option archive state

### `stimulus_groups`

```text
id
case_id
name
display_order
selection_count
specific_question_mode none | minimum | all
minimum_specific_questions
original_option_id nullable -> stimulus_group_options.id (same family, eligible when curated)
is_active
created_at
updated_at
```

`original_option_id` is the explicit canonical principal stimulus for a curated family. It is nullable because legacy ambiguous production families and retained Preview families may remain uncurated.

For an active curated production family:

```text
Core / Original content mode
→ select original_option_id

Expanded Learning content mode
→ select an eligible active, non-removed, non-Original Alternative when one exists
→ otherwise fall back to original_option_id
```

For a legacy family with `original_option_id = NULL`, selection preserves the pre-0016 random eligible-option behavior. The application must not infer an Original from option insertion order, display order, filename, caption, name, or older learner history.

A new group is created with `original_option_id = NULL`. The option must exist and be eligible before an explicit validated update may assign it as Original. Source-aware authoring may perform these steps atomically when the semantics are unambiguous. In particular, **Start Alternative Set** from an ordinary Case image A means A is the explicit source/principal image, so the domain operation creates the family, preserves A's Asset/caption relationship as the new option, assigns that exact option as Original, and only then removes the ordinary `case_assets` relationship. Generic sequential option insertion remains order-agnostic and never promotes “first inserted” by convention.

Changing a mistaken Original is pointer reassignment, not identity replacement:

```text
Original A
→ add B to the same family
→ Make Original on B
→ B becomes Original; A becomes an ordinary Alternative
→ A may then remain, be deactivated, be removed from the Case, or move to Always shown/supporting
```

Destructive/moving operations against the current Original must fail at the application/domain layer with an actionable validation error before the write. Database triggers remain defense in depth. This includes deactivation, Remove from Case, moving to another family, and Alternative → Always shown/supporting conversion.

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

Current learner selection considers active, non-removed options backed by active Assets in active groups. Stimulus Option ID is stable exact Case/stimulus-context identity.

`is_active` and `removed_from_case` are deliberately different:

- `is_active = false` deactivates the option while retaining it in normal authoring/history;
- `removed_from_case = true` archives the Case relationship out of current authoring/selection while preserving the row for restrictive foreign keys, question relationships, restoration, and content provenance.

Re-adding the same Asset to its original group can restore that archived relationship when there is no current group conflict and retained teaching remains valid.

Removing an option does not delete the Asset, R2 object, exact-option questions, or Reusable Image Questions. An already-frozen active Review remains governed by its `active_review_questions` / `active_review_assets` snapshot until it is completed, discarded, replaced, or expired.

Higher-resolution replacement changes a current production option's `asset_id` A → B without changing the option ID or the family's `original_option_id` pointer when that option is Original.

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

When a currently fixed image needs an exact-image question or reusable-image opt-in, authoring may atomically convert it to a one-option active Stimulus Group while preserving Asset/caption/effective learner visibility. Where the conversion workflow is explicitly source-aware and unambiguous, it may assign that preserved option as Original; generic option insertion itself still never infers Original from sequence.

`source_type = asset` is a reusable source and is eligible only for Expanded Learning. Case-specific exact-image questions remain `stimulus_option` and therefore belong to Original/Core.

## 11. Cross-Stimulus-Group Prompt invariant

One Prompt must not independently become stimulus-specific in two active, independently selectable groups in the same Case.

The invariant spans:

```text
stimulus_group_questions
stimulus_option_questions
stimulus_option_asset_questions -> asset_questions.question_prompt_id
```

Application preflight plus D1 triggers defend the invariant. `0010` and `0017` extend/align protection for current reusable-question live-state transitions.

## 12. Tags, System Tag exposure, and Shared Questions

Tagging Stage A uses:

```text
tags
case_tags
case_question_tags
```

Tags remain a flat canonical vocabulary.

Case Tags also carry the Case-level alternate/cross-cutting classification role that should not change canonical Topic ownership.

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

## 13. Question resolver precedence and content mode

Duplicate-Prompt precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for selected option
> stimulus group
> Case
> exact canonical Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate set is deduplicated by `question_prompt_id` before Automatic/All/Fixed selection.

Logical question-pool eligibility applies **before** that resolver precedence:

```text
Original/Core
→ case
→ stimulus_group
→ stimulus_option

Expanded Learning
→ case
→ stimulus_group
→ stimulus_option
→ concept
→ ancestor_concept
→ tag_shared
→ asset
```

The active learner runtime persists this choice as `active_reviews.content_mode = original | expanded`. `original` corresponds to the Original/Core source set above. The persistent global `learner_preferences.expanded_learning` preference selects the default content mode for new active Reviews; it is not stored in the retired legacy `reviews.question_pool_mode` column for current work.

Stimulus-family selection is also mode-aware as described in section 7: a curated family uses its explicit Original for Original/Core and substitutes an eligible non-Original Alternative for Expanded Learning when possible. The selected content is frozen into `active_review_questions` and `active_review_assets` before progress begins.

System/Tag routing happens before this question pipeline. Topic and Tag reachability still resolve the selected Case's canonical Primary Topic for direct Topic-question context; a Tag may make Tag-scoped Shared Questions eligible, but it does not substitute an alternate direct Topic bank. Current active Reviews persist the selected v2 run scope and one concrete System attribution rather than the retired `reviews.study_concept_id`, `route_type`, and navigation-provenance columns.

Older physical `reviews` rows may contain pre-cutover `study_concept_id` and route-provenance fields because migrations are immutable history. Those rows are not a supported current reader/writer path and must be zero for Production cutover.

## 14. Import jobs

`import_jobs` stores authoritative resumable Import Package v1 execution state.

Import Package v1 retains the `secondaryTopicIds` field for package-shape compatibility, but current reviewed imports require it to be empty. Non-empty arrays are rejected before planning/writes. Resumable staging and staged execution-plan reads also reject snapshots that could recreate a secondary Case↔Topic relationship.

Reviewed source-derived questions continue to become Case Questions, which is exactly the ownership used for Original/Core eligibility.

Tags, Reusable Image Questions, option archival, Asset supersession, learner content mode, System navigation, and Original/Alternative curation remain later authoring/learner layers unless explicitly included by their own reviewed import contract. Reviewed imports must not guess an Original from filenames, order, captions, or image similarity.

## 15. Legacy Review tables — physical migration history and cutover sentinels only

The physical tables:

```text
reviews
review_questions
review_assets
```

are **not** the current learner Review model.

They remain in D1 migration history because historical migrations are immutable and because the Production cutover preflight uses their row counts as fail-closed zero-data sentinels. Current application Drizzle schema exports no legacy Review tables, current `/study` routes do not create/read/complete them, and authenticated learner Review media does not read `review_assets`.

The cutover assumption is therefore:

```text
reviews          = 0 rows
review_questions = 0 rows
review_assets    = 0 rows
```

A non-zero or unreadable count blocks the Production cutover. It is not a compatibility mode and must not be bypassed by deleting learner data inside the gate.

Migrations `0013`, `0014`, and the Review-related portions of `0015` document the architecture that existed before the FSRS runtime cutover. Keep them as historical evidence; do not use their Review provenance/media columns as current runtime semantics.

## 16. Active Reviews — current unfinished learner ownership

`active_reviews`, `active_review_questions`, and `active_review_assets` are the current normalized temporary learner Review snapshot.

### `active_reviews`

Conceptually:

```text
id
user_id
case_id
system_id
study_mode scheduled | free
content_mode original | expanded
queue_class nullable due | new | repeat
run_id
scope_fingerprint
scope_json
generation nullable
review_sequence_epoch nullable
parameter_revision nullable
scheduler_revision nullable
scheduler_library_version nullable
expected_state_revision nullable
expected_due_at nullable
run_started_at nullable
case_title_snapshot
vignette_snapshot_md
snapshot_version
started_at
revealed_at nullable
expires_at
```

There is one active Review per learner. Scheduled active Reviews carry the authenticated FSRS/run/captured-state boundary; Free active Reviews deliberately carry no scheduler-state boundary. Resume discovery returns only an unexpired learner-owned row, and database-time expiry remains authoritative for create/replace/completion serialization.

Under Runtime v2, `scope_json` is a strict attribution envelope rather than a loose route bag:

```js
{
  version: 2,
  systemId: '<frozen concrete attribution System>',
  runScope: {
    systems: [
      { systemId: 'system-a', mode: 'all' },
      {
        systemId: 'system-b',
        mode: 'routes',
        routes: [
          { routeType: 'topic', routeId: 'topic-b' },
          { routeType: 'tag', routeId: 'curated-tag-b' }
        ]
      }
    ]
  }
}
```

The top-level `systemId` must equal scalar `active_reviews.system_id`. Migration `0026` validates canonical shape/order/bounds and proves that this System is selected in `runScope` and that the Case is reachable through that exact selected System sub-scope. The active/non-Preview Case plus active Primary Topic baseline applies to Topic, curated-Tag, and whole-System `all` reachability. Duplicate/ambiguous Systems, duplicate routes, contradictory `all` shapes, forged attribution, and unselected/wrong routes fail closed.

Reset Progress and Fresh FSRS Start are explicit active-Review invalidators. Their supported mutation transaction deletes the learner's active Review before clearing current Case scheduler state and, where applicable, changing the profile generation/review-sequence/parameter boundary. Migration `0024` prevents a Scheduled profile-boundary update from committing while a Scheduled active Review still survives. Conversely, the existing active-Review creation guard rejects an old Scheduled run after Reset/Fresh has already moved the current profile boundary.

### `active_review_questions`

Conceptually:

```text
id
active_review_id
question_prompt_id
source_type
source_concept_id nullable
source_stimulus_group_id nullable
source_stimulus_option_id nullable
source_asset_question_id nullable
source_shared_question_id nullable
display_order
prompt_snapshot_md
answer_snapshot_md
```

These rows freeze the exact selected Prompt/answer content and source provenance for the unfinished Review. They cascade when the active Review is consumed/removed.

### `active_review_assets`

Conceptually:

```text
id
active_review_id
asset_id
display_order
storage_key_snapshot
caption_snapshot_md
alt_text_snapshot
source_stimulus_group_id nullable
source_stimulus_option_id nullable
```

These rows freeze learner media ordering/storage metadata and keep a restrictive live Asset reference while the unfinished Review exists. `storage_key_snapshot` is the current frozen media authority for authenticated Review media; section 19 owns the serving/lifecycle semantics.

An active Review is temporary execution ownership, not durable completion history. Scheduled and Free completion consume it and write their own narrowly scoped durable/receipt state described below.

## 17. Scheduled FSRS completion, profile boundaries, retention, and durable state

Scheduled completion is owned by the FSRS Scheduled completion service, not by a mutable `reviews.status/rating` row.

One successful Scheduled completion atomically advances/records the current owners:

```text
scheduled_review_events
+ learner_optimizer_evidence
+ learner_case_fsrs
+ learner_case_encounters
+ learner_aggregates
+ learner_system_aggregates
+ consume the exact active Review
```

`learner_fsrs_profiles` is the learner-wide FSRS boundary/parameter owner. It carries the current `generation`, `review_sequence_epoch`, `parameter_revision`, scheduler revision/library version, canonical serialized parameter object, detailed-history retention policy, and optimizer/cleanup metadata. An authentic browser run token never freezes this profile forever: Scheduled open/completion paths compare the run/Review boundary against the current profile and fail stale work closed.

`learner_case_fsrs` is the current per-learner×Case scheduling state: Due time, FSRS card state, generation/review-sequence/parameter/scheduler boundaries, and monotonic `state_revision`.

`scheduled_review_events` is the compact durable Scheduled completion event. It stores the committed rating, Case/System/content mode, scheduler/generation/sequence boundary, resulting state revision and next Due time, plus only the run context needed for idempotent replay/proof. The completed active Review ID is the event ID, so this durable event is also the Scheduled completion idempotency receipt.

Human-readable `scheduled_review_events` follow `learner_fsrs_profiles.detailed_history_retention`: 24 months by default, with 36-month, 60-month, and indefinite policies representable in the current schema. Learner-facing history reads apply the retention cutoff even before physical cleanup. Bounded opportunistic cleanup removes only expired detailed Scheduled events; it does not delete current-generation optimizer sequence evidence, encounter state, or aggregates merely because display history expired.

`learner_optimizer_evidence` stores the compact retained rating sequence used by future optimizer work. `learner_case_encounters` stores the first Scheduled completion marker. `learner_aggregates` and `learner_system_aggregates` maintain lifetime Scheduled counters.

Reset Progress and Fresh FSRS Start are deliberately distinct profile-boundary operations:

```text
Reset Progress
→ delete active Review + current learner_case_fsrs state atomically
→ preserve current generation, parameter_revision and parameters_json
→ increment review_sequence_epoch for an initialized learner
→ preserve retained Scheduled history, encounters, aggregates and current-generation optimizer evidence
→ never-initialized Reset does not create an FSRS profile

Fresh FSRS Start
→ delete active Review + current learner_case_fsrs state atomically
→ restore canonical default parameters (90% desired retention)
→ increment generation + review_sequence_epoch + parameter_revision for an initialized learner
→ clear optimizer metadata without executing an optimizer
→ preserve the learner's detailed-history retention override, retained history, encounters and aggregates
→ prune optimizer-only evidence from generations made permanently ineligible by the new generation
→ never-initialized Fresh creates the ordinary initial generation/epoch/revision 1 profile
```

A successful completion consumes the temporary active Review exactly once. Same-payload/lost-response retries reconcile from the durable Scheduled event rather than recreating or reading legacy Review rows.

## 18. Free Study completion and receipt ownership

Free Study deliberately does not perform an FSRS transition and does not create Again/Hard/Good/Easy rating history.

One successful Free completion atomically owns:

```text
free_review_completion_receipts
+ learner_case_encounters
+ learner_aggregates
+ consume the exact active Free Review
```

`learner_case_encounters` is the durable learner×Case Free outcome owner (`free_first_seen_at`, `free_last_seen_at`, `free_times_studied`). `learner_aggregates.free_completed` is the durable learner-wide Free count.

`free_review_completion_receipts` is a **short-lived** unique retry receipt, not durable learner history or optimizer evidence. It stores the active Review/receipt ID, learner, Case, completion time, resulting Free-study count, and expiry; the current default TTL is seven days. Duplicate/concurrent/lost-response completion may replay only an unexpired receipt.

Free completion does **not** write `learner_fsrs_profiles`, `learner_case_fsrs`, `scheduled_review_events`, `learner_optimizer_evidence`, or `learner_system_aggregates`.

## 19. Authenticated Review media and Asset/R2 lifecycle

For current unfinished learner Reviews, authenticated Review media ownership is:

```text
active_reviews
  └── active_review_assets
        ├── asset_id                  [restrictive live Asset ownership]
        └── storage_key_snapshot      [frozen R2 media authority]
```

The authenticated Review-media route verifies learner ownership and an unexpired active Review, resolves the requested owner-scoped `active_review_assets` row, and serves its `storage_key_snapshot`. It does not use legacy `review_assets`, and it does not need to load the complete active Review snapshot for each object request. The frozen key remains authoritative for that unfinished Review even if current authored Asset state later changes.

`active_review_assets.asset_id` is the current active-Review Asset/R2 deletion guard. An Asset/R2 object required by an unfinished active Review cannot be permanently deleted while that restrictive reference exists. Completion, Discard, expiry cleanup, or replacement removes/cascades the temporary active-Review rows; after that, ordinary content/provenance/supersession dependencies determine whether the Asset/R2 object remains retainable.

There is no current durable completed-Review media snapshot in legacy `review_assets`. Historical migration `0013_review_assets_asset_lookup.sql` remains migration archaeology only after cutover and does not own current Image Library lifecycle checks.

## 20. Higher-resolution replacement invariant

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

A group whose Original is that preserved option continues to point to the same Stimulus Option ID. Higher-resolution replacement therefore changes Asset identity for the better-quality copy but does not change the family Original pointer or contextual option/question identity. A genuinely different image is not a quality replacement; add it as a separate Alternative and use Make Original if it should become canonical.

An already-frozen active Review is not rewritten: its `active_review_assets.storage_key_snapshot` continues to name the media it was given, and its restrictive Asset reference keeps that object safe for the unfinished Review. Old Asset Questions and superseded R2 bytes remain where current content/provenance/supersession dependencies require them. Legacy Review tables are not part of this current replacement contract.

R2 and D1 are not a shared transaction: the new object is uploaded first; if the D1 semantic batch fails, the new object alone is cleaned up. A conditional claim makes concurrent/double source replacement fail closed.

## 21. Preview workspace implementation boundary

Schema ownership remains the same regardless of internal code refactors. Current backend implementation keeps the public API at:

```text
src/lib/server/db/preview-workspace.js
```

Focused internal modules own Session lifecycle, ownership/security, Case lifecycle/cloning, and fixed-image operations. These are implementation responsibility boundaries, not new database ownership models.

The complete Case clone transaction remains cohesive in `preview-workspace/case.js`, including clone-time child graph copying. It copies only the canonical Primary Topic plus Case Tags; legacy secondary Topic rows are intentionally not recreated. Alternative Set/question/cleanup extraction remains staged future refactoring.

Preview may replace its canonical Topic. Deprecated secondary-Topic Preview helpers fail closed. Existing secondary rows in an older disposable Preview workspace remain compatibility data rather than active authoring relationships. Preview does not gain System, hierarchy, Tag, System↔Tag, or Original/Alternative global mutation authority. Migration `0016` deliberately leaves retained Preview stimulus families uncurated so existing Preview editing is not blocked by production Original integrity semantics. Production/Preview ownership rules otherwise remain unchanged.

Production Admin Study Preview remains outside learner persistence: it may resolve the current learner content surface, but it must not create learner preferences, FSRS state, active Reviews, completion events/receipts, or legacy Review rows. The loopback `/fsrs-preview` surface is a separate local regression/reference runtime and is not another persisted Review model.

## 22. Relationship overview

```text
preview_sessions
  ├── cases.preview_session_id
  ├── assets.preview_session_id
  └── question_prompts.preview_session_id

concepts
  ├── parent_id ── concepts
  ├── case_concepts ── cases          [Topic only; Primary is current behavior]
  ├── concept_questions               [Topic only]
  └── system_tags ── tags             [System only]

cases
  ├── case_assets ── assets
  ├── stimulus_groups
  │   ├── original_option_id ── stimulus_group_options [nullable; same family]
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

active_reviews
  ├── case_id ── cases
  ├── system_id ── concepts [one concrete attribution System]
  ├── scope_json             [strict v2 attribution envelope + complete runScope]
  ├── active_review_questions
  └── active_review_assets ── assets

learner_fsrs_profiles
  ├── generation / review_sequence_epoch / parameter_revision
  ├── scheduler revision / parameters_json
  └── detailed_history_retention / optimizer-cleanup metadata

Scheduled completion / current scheduling
  ├── learner_case_fsrs
  ├── scheduled_review_events ── system_id
  ├── learner_optimizer_evidence
  ├── learner_case_encounters
  ├── learner_aggregates
  ├── learner_system_aggregates ── system_id
  └── learner_system_monthly_buckets ── system_id

Free completion
  ├── free_review_completion_receipts [short-lived]
  ├── learner_case_encounters
  └── learner_aggregates

legacy physical sentinels only
  ├── reviews
  ├── review_questions
  └── review_assets
```

## 23. System/multi-System study-route and durable provenance semantics

For each selected System sub-scope, learner content reachability remains derived rather than stored on Cases:

```text
System → Topic
→ descendant Topic route using canonical Primary Case Topic resolution

System → Tag
→ Cases with the selected exposed Case Tag
→ canonical Primary Topic remains the question-resolution Study Topic

System → All
→ union of native descendant Topic routes and curated Tag routes
→ deduplicated by Case within the sub-scope
→ native canonical Topic provenance wins when both routes match
```

Runtime v2 combines one or more such System sub-scopes in one canonical authenticated `runScope`:

```js
{
  systems: [
    { systemId: 'cardiovascular', mode: 'all' },
    {
      systemId: 'endocrine',
      mode: 'routes',
      routes: [
        { routeType: 'topic', routeId: 'diabetes' },
        { routeType: 'tag', routeId: 'adrenal' }
      ]
    }
  ]
}
```

The combined candidate pool is globally deduplicated by Case. Contributor information is retained long enough to choose one concrete historical System deterministically: prefer a selected native Primary-Topic System contribution, otherwise use stable contributing System-ID order. Checkbox/input order is not attribution authority. The chosen System is frozen on the Active Review; there is no synthetic `Mixed` System.

A Tag can be exposed by more than one System. The current `/study` chooser may select one or more Systems; selecting a whole System expresses compact v2 `mode: "all"`, while a selected narrowed System submits only its explicit exact-Topic/curated-Tag routes. Structural Topics with zero exact Cases remain hierarchy controls rather than submitted exact routes. Whole-System and unselected Systems do not materialize Topic/Tag route fields in the learner form request. The server remains authoritative for normalization, candidate union/deduplication, and deterministic attribution; single-System Study remains a valid special case of the same v2 runtime. While work is unfinished, `active_reviews.system_id` plus strict v2 `scope_json` / `scope_fingerprint` and the Scheduled proof fields own the exact active scope/attribution boundary; the retired legacy `reviews.route_type`, `study_*`, and `navigation_route_*` fields are not current runtime provenance.

Durable FSRS System attribution is registered centrally in:

```text
scheduled_review_events.system_id
learner_system_aggregates.system_id
learner_system_monthly_buckets.system_id
```

Application deletion/reclassification checks must consult this durable registry. Migrations `0023` and `0025` provide database defense in depth so retained durable System attribution blocks destructive System reclassification/deletion. New durable System-attribution tables must join the same centralized provenance authority rather than inventing independent deletion rules.

Free Study completion does not write `learner_system_aggregates`, `learner_system_monthly_buckets`, or a durable System event. Its unfinished System ownership exists only on the active Review until that Review is consumed.

See `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md` for content reachability semantics, `MULTI_SYSTEM_RUNTIME_V2_IMPLEMENTATION.md` for the v2 runtime/cutover evidence, `MULTI_SYSTEM_UX_IMPLEMENTATION.md` for the current learner chooser/count/navigation cutover, and `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md` for the current learner-runtime boundary.

## 24. Non-goals encoded by the current model

The current schema intentionally does **not** imply:

- Additional Study Topic authoring or current learner routing merely because `role = secondary` remains physically valid;
- a required cleanup migration for historical secondary rows;
- Tag hierarchy or single-System Tag ownership;
- System-level reusable Topic-question inheritance;
- automatic Case Tag → Question Tag inheritance;
- automatic System Tag exposure from Case Tags;
- automatic reusable-image opt-in;
- automatic Original inference from option insertion/display order, filename, caption, name, or learner history;
- mandatory Original assignment for retained Preview families;
- generic Asset families/version tables;
- automatic visual similarity/deduplication;
- physical deletion merely because an Asset is classified Unused;
- Preview ownership of global Systems, Topics, Tags, Shared Questions, or Reusable Image Questions;
- arbitrary different-image substitution through supersession;
- an Import Package secondary-Topic creation path;
- an `original_question` flag or frozen import-era question set;
- a persisted D1 Scheduled/Free run queue or ordinary Study-session row; run continuation state remains browser-local and server-validated;
- a durable completed-Review question/asset snapshot after the temporary active Review is consumed;
- Free Study FSRS transitions, FSRS ratings, optimizer evidence, or learner×System Scheduled aggregates;
- per-System FSRS state, parameters, optimizer ownership, run-size counters, or 50-New counters merely because one run may select several Systems;
- equal/balanced per-System sampling or quotas;
- a synthetic `Mixed` System identity for mixed runs;
- long-lived Production v1/v2 descriptor/proof compatibility after a successful fenced exact-zero v2 cutover;
- automatic optimizer execution/parameter replacement merely because optimizer evidence and parameter revisions exist;
- PR G Admin/cohort/monthly analytics or account-deletion semantics merely because learner aggregates exist;
- any supported runtime fallback that writes/reads/completes `reviews`, `review_questions`, or `review_assets`;
- stimulus-option → Topic learner routing merely because one image has an incidental finding.

Add schema only when a concrete product/content requirement justifies it.


## PR G — durable Admin analytics and mature learner account deletion

Migration `0025_learner_fsrs_admin_analytics_deletion.sql` adds `learner_system_monthly_buckets`, keyed by `(user_id, system_id, month_start)`. `month_start` is the UTC calendar-month boundary; each row retains compact Scheduled completion and Again/Hard/Good/Easy counts plus first/last completion timestamps for the historical System captured at study time. The migration backfills only still-retained `scheduled_review_events`, and an `AFTER INSERT` trigger maintains future buckets transactionally. Detailed-history expiry does not decrement or delete these buckets. Long-range Admin System/cohort trends use the monthly table directly and must not reconstruct expired time axes from `learner_system_aggregates` or `learner_optimizer_evidence`.

`learner_account_deletions` is the durable mature-account deletion state. Its first phases are `auth_sessions`, `auth_verifications`, and `auth_accounts`, followed by the learner FSRS/runtime ownership classes. Starting deletion atomically creates/resumes the marker and bans the learner; `src/hooks.server.js` treats that marker as immediate access denial even while pre-existing Better Auth rows remain. Database guards prevent new session/account ownership after the marker, and each auth/application collection is purged in retry-safe chunks of at most 1,000 rows. The final residual scan includes sessions, linked accounts, verification ownership, and all learner FSRS/runtime classes. The user-delete guard prevents an identity-root delete while any staged row remains; Better Auth Admin `removeUser` is called only after those collection deletes are guaranteed to be zero-row operations and only the one user identity root remains.

The monthly analytics table and deletion-state table are learner-owned state, are account-deletable, and are explicitly forbidden from Production-to-local content replica import. `learner_system_monthly_buckets` is also part of centralized historical System provenance, so retained monthly attribution blocks destructive System reclassification/deletion even after detailed events expire.
