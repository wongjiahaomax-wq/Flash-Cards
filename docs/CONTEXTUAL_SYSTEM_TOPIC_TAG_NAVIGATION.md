# Contextual System / Topic / Tag Navigation

_Status: implemented by the contextual System/Topic/Tag navigation feature branch. Deployment, production migration application, taxonomy curation, and learner rollout remain separate operational steps._

## Purpose

The study taxonomy now distinguishes three different concepts that must not be conflated:

- **System** — a top-level learner-navigation grouping such as Cardiovascular.
- **Topic** — the existing Case classification and reusable Topic-question scope. Cases attach to Topics as Primary or Additional Study Topic relationships.
- **Tag** — flat cross-cutting metadata. A Tag may classify Cases, Case Questions, or Shared Questions. A System may additionally choose to **expose** selected Tags as learner navigation choices without changing the underlying Tag semantics.

The feature is designed so the existing Topic and question-resolution model remains authoritative. System and Tag choices route learners to Cases; they do not create a second question taxonomy.

## Core invariants

### Systems and Topics

`concepts.kind` is either `system` or `topic`.

- Systems are always top-level (`parent_id IS NULL`).
- Topics may be top-level while taxonomy curation is incomplete, or may sit under a System/Topic hierarchy.
- Parent references must exist and be active.
- Parent changes must not create a cycle.
- A concept with active children cannot be deactivated until those children are moved or deactivated.
- Cases may attach only to Topics, never Systems.
- reusable `concept_questions` may attach only to Topics, never Systems.
- A Topic with Case or Topic-question usage cannot simply be reclassified as a System.

These rules are checked in the taxonomy domain before writes and are also protected by migration-level SQLite/D1 constraints/triggers where practical.

### System ↔ Tag exposure

`system_tags` is contextual navigation metadata:

```text
System → exposed Tag
```

It does **not** mean:

```text
Tag belongs to exactly one System
```

The same Tag may be exposed in several Systems. For example, `QT prolongation` can be learner-visible in both Cardiovascular and another clinically appropriate System without duplicating or moving the Tag.

Only active Systems and active Tags may form new System↔Tag exposure relationships. Ordering is explicit per System.

### Case Topic relationships remain unchanged

A Case still has:

- exactly one canonical **Primary Topic** for normal authoring semantics; and
- zero or more **Additional Study Topics** when the same Case is genuinely valid through another Topic route.

The System hierarchy does not replace these Case relationships. Admin Topic coverage therefore distinguishes:

- direct Case attachments to one exact Topic, including both Primary and Additional Study Topic relationships; and
- deduplicated descendant Study Case eligibility.

## Learner routing

When System navigation is enabled, the learner first chooses a System and can then study:

1. **All** — every Case reachable through the System's native descendant Topics or curated Tags, deduplicated by Case;
2. a descendant **Topic** — existing multi-Topic Case routing applies;
3. an exposed **Tag** — Cases carrying that Tag are eligible in that System.

### Topic route

A Topic route uses the existing `resolveCaseStudyCandidates` behavior.

If a Case is canonically `Hypocalcaemia` but has `Prolonged QTc` as an Additional Study Topic, studying:

```text
Cardiovascular → Prolonged QTc
```

may select that Case with:

```text
primaryConceptId = Hypocalcaemia
studyConceptId   = Prolonged QTc
routeType        = topic
```

Existing Topic-question inheritance therefore uses the actual Study Topic, exactly as before.

### Tag route

A Tag route is contextual navigation, not a replacement Study Topic.

For the same Case studied through:

```text
Cardiovascular → QT prolongation [Tag]
```

Review routing records:

```text
primaryConceptId      = Hypocalcaemia
studyConceptId        = Hypocalcaemia
studySystemConceptId  = Cardiovascular
routeType             = tag
studyTagId            = QT prolongation
```

The canonical Primary Topic remains the Topic input to the existing question resolver. Existing Case Tags can still make Shared Questions eligible according to the established Tagging Stage B rules.

### All route precedence

A Case can match several routes in one System. `All` deduplicates by Case.

When the same Case is reachable both through a native Topic relationship and through a curated Tag, **native Topic provenance wins**. This preserves the more specific existing Study Topic route instead of silently replacing it with Tag provenance.

## Review provenance

Migration `0015_contextual_system_topic_tag_navigation.sql` adds additive Review navigation provenance:

- `study_system_concept_id` — nullable System used to enter the Review;
- `route_type` — `topic` or `tag`, default `topic` for historical behavior;
- `study_tag_id` — nullable Tag used for a Tag-routed Review.

Historical Reviews are not rewritten. Existing Review snapshots and question/asset provenance remain unchanged.

For a Tag-routed Review, both `study_system_concept_id` and `study_tag_id` are required. Topic-routed Reviews never store a `study_tag_id`.

Original → Expanded Learning continuation preserves the same System/route provenance. “Next case” also remains within the current resolved System route when the Review came from System navigation.

## Admin surfaces

### Systems & Topics library

`/admin/topics` is the global taxonomy management surface. It provides:

- System/Topic identity and status;
- hierarchy breadcrumbs;
- staged parent moves applied atomically after whole-graph validation;
- direct Case attachment counts;
- deduplicated descendant Study Case counts;
- reusable Topic-question counts;
- coverage reporting for unassigned Topics and Cases not reachable from any System.

### System detail

A System detail page provides:

- descendant Topic coverage;
- contextual Tag exposure and per-System order;
- deduplicated `All` Case count;
- Cases matching several Topic/Tag routes, for auditability.

### Case editor

The Case editor remains responsible only for Case-local relationships:

- Primary Topic;
- Additional Study Topics;
- read-only taxonomy breadcrumb/context;
- Case Tags.

It does not mutate global System hierarchy or System↔Tag exposure.

### Tag library

The Tag library shows which Systems expose a Tag, but System↔Tag mutation remains on the relevant System detail surface. This keeps three separate relationships visibly distinct:

- Case ↔ Tag classification;
- Shared Question ↔ Tag reuse/descriptive semantics;
- System ↔ Tag learner-navigation exposure.

## Preview Admin boundary

Preview Admin continues to share global production Topics and Tags read-only.

- Preview Cases may attach/reorder only Topics.
- Systems are not valid Case relationships.
- Preview does not gain global taxonomy, System, or System↔Tag mutation authority.
- Production/Preview Case ownership and Asset rules remain unchanged.

The server mutation guard and the database constraint both reject a System submitted as a Case Topic.

## Phase A / Phase B rollout

This feature intentionally separates schema/Admin curation from learner exposure.

### Phase A — schema and Admin curation

1. Merge and deploy the code with learner System navigation still disabled.
2. Apply migration `0015_contextual_system_topic_tag_navigation.sql` through the normal production migration process.
3. Create Systems and arrange Topics in `/admin/topics`.
4. Curate System↔Tag exposure where clinically useful.
5. Use coverage and overlap reporting to verify that intended Cases are reachable and that multi-route matches are understood.
6. Keep the existing Topic learner Study UI active during this phase.

### Phase B — learner System navigation

Only after Phase A curation is reviewed, explicitly set:

```text
SYSTEM_STUDY_NAVIGATION_ENABLED=true
```

The learner Study page will then expose System → All / Topic / Tag choices.

If the flag is absent or not exactly `true`, the existing Topic-based learner Study surface and legacy start action remain active.

## Rollback principles

- Disabling `SYSTEM_STUDY_NAVIGATION_ENABLED` returns learners to the legacy Topic navigation surface without deleting taxonomy data.
- System hierarchy and System↔Tag relationships are additive metadata; disabling the learner flag does not change Case Topic relationships or question eligibility.
- Do not delete historical Review provenance as a rollback mechanism.
- Do not edit historical migrations. Any schema reversal must be handled as an explicit forward migration after production impact is assessed.

## Validation expectations

The feature requires coverage for:

- cycle/top-level/active-parent graph validation;
- Case/Concept Question Topic-only relationships;
- multi-System Tag exposure;
- Topic versus Tag route semantics;
- `All` deduplication and native Topic precedence;
- Review provenance and historical Review defaults;
- the Hypocalcaemia + Prolonged QTc cross-topic scenario;
- Preview inability to attach Systems to Cases;
- existing question resolver behavior remaining unchanged after route selection.
