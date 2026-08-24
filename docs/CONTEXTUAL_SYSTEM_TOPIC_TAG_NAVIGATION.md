# Contextual System / Topic / Tag Navigation

_Status: current product/domain model on this draft branch. Deployment, taxonomy curation, and learner rollout remain separate operational steps. PR #90 does not add a database migration._

_Last updated: 25 August 2026_

## Purpose

The study taxonomy distinguishes three concepts:

- **System** — a top-level learner-navigation grouping such as Cardiovascular.
- **Topic** — the canonical Case classification and reusable direct Topic-question scope.
- **Tag** — flat cross-cutting metadata that may classify Cases/questions and may be explicitly exposed by one or more Systems as learner navigation choices.

The current Case-local classification rule is:

> **One canonical Primary Topic plus zero or more Case Tags.**

Additional Study Topics are retired from current product behavior. Historical `role = secondary` rows may remain physically stored under the existing schema but are hidden/ignored by current application paths.

## Core invariants

### Systems and Topics

`concepts.kind` is either `system` or `topic`.

- Systems are top-level (`parent_id IS NULL`).
- Topics may sit under a System/Topic hierarchy.
- Parent references must exist and be active.
- Parent changes must not create cycles.
- Cases may attach only to Topics, never Systems.
- Current learner-presentable Cases require exactly one behaviorally active canonical Primary Topic.
- reusable `concept_questions` may attach only to Topics, never Systems.

These rules are checked in domain code and existing SQLite/D1 guards where practical.

### Case classification

For current authoring and learner behavior:

```text
Case
├── exactly one Primary Topic
└── zero or more Case Tags
```

The Primary Topic answers:

> What does this Case fundamentally teach?

It remains the direct Topic-question context regardless of how the learner discovered the Case.

Case Tags answer:

> What other clinically meaningful concepts does this Case demonstrate or relate to?

They support cross-cutting classification, contextual learner discovery, and existing Tag-scoped Shared Question eligibility.

Legacy `case_concepts.role = 'secondary'` rows are compatibility data only. Current read models do not present them as Case classification, learner routing does not use them, and current Admin/Preview/import paths do not create them.

### System ↔ Tag exposure

`system_tags` is contextual learner-navigation metadata:

```text
System → exposed Tag
```

It does **not** mean a Tag belongs to exactly one System. The same Tag may be exposed by several Systems.

Only active Systems and active Tags may form new exposure relationships. Ordering is explicit per System.

## Learner routing

When System navigation is enabled, the learner chooses a System and may study:

1. **All** — every Case reachable through the System's native descendant Topics or curated Tags, deduplicated by Case;
2. a descendant **Topic** — Cases canonically classified under that Topic/subtree;
3. an exposed **Tag** — Cases carrying that Tag in that System.

### Topic route

A Topic route resolves Cases through canonical Primary Topic relationships only.

Example:

```text
Case: prolonged QTc caused by hypocalcaemia
Primary Topic: Prolonged QTc
Tags: Hypocalcaemia
```

Studying:

```text
Cardiovascular → Prolonged QTc
```

may create a Review with:

```text
primaryConceptId     = Prolonged QTc
studyConceptId       = Prolonged QTc
studySystemConceptId = Cardiovascular
routeType            = topic
studyTagId           = null
```

A selected parent Topic may still resolve a Case through a more specific descendant canonical Topic. The selected parent route is retained separately as navigation provenance so “Next case” stays in the learner-selected route.

### Tag route

A Tag route is contextual discovery, not a substitute Study Topic.

For the same Case, if Endocrine exposes the `Hypocalcaemia` Tag:

```text
Endocrine → Hypocalcaemia [Tag]
```

may create:

```text
primaryConceptId     = Prolonged QTc
studyConceptId       = Prolonged QTc
studySystemConceptId = Endocrine
routeType            = tag
studyTagId           = Hypocalcaemia
```

The canonical Primary Topic therefore remains the input to direct reusable Topic-question resolution. Existing Case Tags may independently make Tag-scoped Shared Questions eligible according to the established Tagging rules.

### All route precedence

A Case can match several routes in one System. `All` deduplicates by Case.

When a Case is reachable both through its native canonical Topic and through a curated Tag in the same System, native Topic provenance wins for that Case.

The effective winning provenance is distinct from the learner-selected `All` route. A Review started from `System → All` records `navigation_route_type = all`, so “Next case” resolves the full `All` union again.

## Review provenance

Migration `0015_contextual_system_topic_tag_navigation.sql` stores two layers of routing provenance.

**Effective Case/question provenance:**

- `primary_concept_id` — canonical Case Topic at Review creation;
- `study_concept_id` — actual direct Topic-question context;
- `study_system_concept_id` — nullable System used to enter the Review;
- `route_type` — `topic` or `tag`;
- `study_tag_id` — nullable Tag when effective provenance is Tag-based.

**Learner-selected navigation provenance:**

- `navigation_route_type` — nullable `all`, `topic`, or `tag`;
- `navigation_route_id` — selected Topic/Tag ID, or null for `all`.

For current Reviews, `study_concept_id` remains the canonical Primary Topic even when the Case is reached through a Tag.

Stored Reviews created under older development/multi-Topic behavior may have:

```text
primary_concept_id != study_concept_id
```

This PR does not rewrite those rows or immutable Review snapshots. The project has not yet been rolled out to learners, so no learner-facing migration is required to change current routing behavior.

Original → Expanded Learning preserves the existing Review routing provenance. “Next case” reconstructs the learner-selected System route.

## Question resolution

Removing Additional Study Topics does not create a new question taxonomy.

Current direct Topic resolution is based on the canonical Primary Topic and eligible ancestors. Cross-cutting/contextual reusable knowledge continues through:

- Case Questions;
- Tag-scoped Shared Questions;
- Stimulus Group Questions;
- exact Stimulus Option Questions;
- explicitly opted-in Reusable Image Questions.

A Tag route does not import the direct Topic-question bank of some alternate Topic merely because the Tag is clinically related.

## Admin surfaces

### Systems & Topics library

`/admin/topics` manages global taxonomy identity/hierarchy and coverage. Current direct Case counts and Topic detail Case lists use Primary Topic relationships only.

### System detail

A System detail page manages contextual System↔Tag exposure and shows route/coverage information.

### Case editor

The Case editor owns only Case-local classification:

```text
Primary Topic
Case Tags
```

It does not mutate global System hierarchy or System↔Tag exposure.

Changing Primary Topic replaces the canonical current relationship; the old Topic is not retained as an alternate learner route. Stored unrelated legacy secondary rows remain hidden/inert and do not block ordinary Primary Topic changes.

### Tag library

The Tag library shows Tag use/exposure context. System↔Tag mutation remains a System-level operation.

## Preview Admin boundary

Preview shares global production Topics and Tags read-only.

Preview cloning copies:

- exactly one canonical Primary Topic;
- Case Tags;
- the normal Preview-owned Case/question/stimulus relationships.

Legacy secondary Topic relationships are intentionally not recreated. Preview may replace its canonical Topic but cannot create Additional Study Topics and does not gain global taxonomy, Tag, System, or System↔Tag mutation authority.

## Import boundary

Import Package v1 retains `secondaryTopicIds` for package-shape compatibility, but it must be empty for current reviewed imports.

Non-empty secondary Topic declarations are rejected before planning/writes. Resumable staging and staged execution-plan reads also reject snapshots that could recreate secondary relationships.

## No new migration for Additional Study Topic retirement

PR #90 intentionally keeps the historical `case_concepts.role = primary | secondary` schema unchanged.

The compatibility rule is:

```text
primary
→ current behavior

secondary
→ stored legacy data only
```

There is no requirement to delete or convert existing secondary rows before this product change can ship. In particular, do not create an automatic Topic→Tag conversion based on matching labels.

If an author wants alternate learner discovery for a Case, curate the appropriate Case Tag and System↔Tag exposure explicitly. Because learner rollout has not yet occurred, this curation can be reviewed before learners are enabled without a production relationship migration.

A future cleanup of stored secondary rows is optional maintenance work only if there is a concrete reason to do it.

## Phase A / Phase B rollout

The contextual System feature still separates Admin/taxonomy curation from learner exposure.

### Phase A — deploy behavior and curate taxonomy

1. Merge/deploy reviewed application changes through the normal release workflow.
2. Verify the intended Worker SHA and existing required schema, including migration `0015` where applicable.
3. Curate Systems, Topic hierarchy, Case Tags, and System↔Tag exposure.
4. Verify intended Topic/Tag/System Case reachability before learner launch.

PR #90 itself does not add or require a D1 migration.

### Phase B — learner System navigation

Only after taxonomy curation is reviewed should production explicitly enable:

```text
SYSTEM_STUDY_NAVIGATION_ENABLED=true
```

If absent or not exactly `true`, new System-routed Case selection remains disabled according to the existing rollout contract.

## Rollback principles

- Disabling `SYSTEM_STUDY_NAVIGATION_ENABLED` prevents new System-routed Case selection according to the existing feature-flag contract.
- Existing stored Review rows are not rewritten.
- System hierarchy and System↔Tag relationships are additive metadata; disabling learner navigation does not mutate them.
- Do not restore Additional Study Topics as a rollback mechanism.
- PR #90 has no schema migration to reverse.

## Validation expectations

Regression coverage should prove:

- taxonomy cycle/top-level/active-parent validation;
- one canonical current Case Topic is used for learner routing;
- current Admin/Preview/import mutation paths do not create secondary Case↔Topic relationships;
- stored legacy secondary rows do not create learner eligibility or appear in current Case/Topic read models;
- canonical Topic routes resolve canonical Topic questions;
- cross-System Tag routes find Cases without changing `study_concept_id`;
- `All` deduplicates native Topic + Tag reachability;
- learner-selected `All` and parent-Topic continuity across “Next case”;
- Tag-shared eligibility remains based on Case Tags;
- Preview ownership/isolation and primary-only cloning;
- reviewed/resumable imports cannot recreate secondary relationships;
- Original/Expanded behavior remains intact.

For the history behind the retired model, see `MULTI_TOPIC_STUDY_ROUTES.md`.
