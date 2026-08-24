# Flash-Cards — Multi-Topic Case Study Routes

_Last updated: 25 August 2026_

## Status

**Historical / superseded design record.**

Migration `0003_multi_topic_study_routing.sql` and the associated learner/Admin work introduced Additional Study Topics. PR #90 retires that product behavior in favor of one canonical Case Topic plus Tags.

Keep this document because it explains legacy `case_concepts.role = 'secondary'` rows and historical Review provenance. Do **not** use it as current authoring or learner-routing guidance.

Current behavior is documented in `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md` and `ADDITIONAL_STUDY_TOPICS_TO_TAGS_PLAN.md`.

## 1. Historical behavior

The former model allowed one stored Case to attach to several Study Topics:

```text
Case
├── one Primary/default Topic
└── zero or more Additional Study Topics
```

Every attached active Topic could be a learner entry route. When a learner entered through an Additional Study Topic, that route became the Review's `study_concept_id` and therefore selected that Topic's direct reusable Topic-question bank.

The canonical administrative Topic was stored separately as `primary_concept_id`.

This solved three original problems:

1. cross-topic discovery without duplicating a Case;
2. preservation of one vignette/image/question corpus;
3. route-specific direct reusable Topic questions.

## 2. Why the model was retired

Contextual System/Topic/Tag navigation later made Tags learner-routable inside explicitly curated Systems:

```text
System → Topic → Case
System → Tag   → Case
System → All   → deduplicated union
```

A Case Tag can now provide the alternate/cross-System discovery role without changing the Case's canonical Topic.

Tags also participate in the existing Tag-scoped Shared Question model. The only material capability that Additional Study Topics still uniquely provided was switching the direct reusable Topic-question bank according to the alternate route.

PR #90 intentionally removes that switching behavior. Current Reviews always use the Case's canonical Primary Topic as the direct Topic-question context; a Tag route supplies navigation/eligibility context rather than a substitute Study Topic.

## 3. Current Case classification model

For current authoring and learner behavior:

```text
Case
├── exactly one canonical Primary Topic
└── zero or more Case Tags
```

Use these meanings:

```text
Primary Topic
= what this Case fundamentally teaches
= direct reusable Topic-question context

Case Tag
= cross-cutting concept demonstrated by the Case
= possible contextual learner route when a System explicitly exposes the Tag
= possible Shared Question reuse-scope eligibility
```

Systems remain global learner-navigation groupings. A Case never attaches directly to a System.

## 4. Current learner routing

### Topic route

A Topic route can select a Case only through its canonical Primary Topic, subject to the normal Topic hierarchy/descendant rules.

For a current Review:

```text
primary_concept_id = canonical Case Topic
study_concept_id   = canonical Case Topic
route_type         = topic
```

### Tag route

A Tag route can select a Case when:

```text
Case has Tag
AND selected System exposes that Tag
```

The Tag does not replace the direct Topic-question context:

```text
primary_concept_id = canonical Case Topic
study_concept_id   = canonical Case Topic
route_type         = tag
study_tag_id       = selected Tag
```

### System → All

`All` remains the deduplicated union of native Topic reachability and exposed Tag reachability. When the same Case is reachable both ways in the same System, native canonical Topic provenance takes precedence for that Case while the Review separately retains `navigation_route_type = all` for route continuity.

## 5. Question resolution after removal

Direct Topic questions are resolved from the canonical Primary Topic and eligible ancestors.

Cross-cutting reusable knowledge can be represented through the existing contextual models:

- Case Questions;
- Tag-scoped Shared Questions;
- Stimulus Group Questions;
- exact Stimulus Option Questions;
- explicitly opted-in Reusable Image Questions.

Reusable Image Questions remain selected-stimulus knowledge and are independent of Case Topic identity.

The current duplicate-Prompt precedence remains defined by the learner resolver; removing Additional Study Topics does not introduce a second question taxonomy.

## 6. Current Admin authoring

The Case editor exposes:

```text
Primary Topic
Case Tags
```

It no longer offers:

```text
Additional Study Topics
Add Study Topic
Remove secondary Topic
Promote secondary Topic while retaining the old primary as secondary
```

Changing Primary Topic replaces the Case's current canonical relationship. It does not preserve the previous Topic as an alternate learner route.

Global System/Topic hierarchy and System↔Tag exposure remain global Admin operations rather than Case-local operations.

## 7. Preview behavior

Preview cloning copies:

- the canonical Primary Topic;
- Case Tags;
- the normal Preview-owned Case/question/stimulus relationships.

Legacy secondary Topic relationships are deliberately not recreated. Preview shares global production Topics and Tags read-only and does not gain global System, Tag, or System↔Tag mutation authority.

Deprecated secondary-Topic mutation helpers remain only as fail-closed compatibility adapters while callers/tests are transitioned; they do not create or remove current secondary relationships.

## 8. Import behavior

Import Package v1 retains the `secondaryTopicIds` field for package-shape compatibility, but current reviewed imports require it to be empty.

A package containing a non-empty `secondaryTopicIds` array is rejected before planning/writes. Resumable staging and staged execution-plan reads also reject legacy snapshots that could recreate secondary Case↔Topic relationships.

Use Tags through the reviewed Tag workflow rather than encoding alternate Case classification as secondary Topics.

## 9. Database compatibility and migration 0016

The physical `case_concepts.role` shape is temporarily retained because rebuilding the historical relationship model is not required to remove product behavior safely.

`0016_primary_case_topics_only.sql` is intentionally a release gate:

1. it refuses to apply while any legacy secondary/multiple Case↔Topic relationships remain;
2. after the data is clean, it installs database guards preventing new non-primary or multiple current Case Topic relationships.

This migration does **not** guess Topic→Tag mappings and does not rewrite Reviews.

Production conversion requires an explicit reviewed stable-ID mapping plus reachability verification before `0016` is applied.

## 10. Historical Reviews remain historical truth

Do not rewrite historical Reviews merely because current authoring has changed.

A historical Review may legitimately contain:

```text
primary_concept_id != study_concept_id
```

when it was created through the old Additional Study Topic route. That remains valid provenance describing what question context the learner actually received at the time.

Review Prompt/answer/media snapshots and later System/Tag navigation provenance remain immutable historical records.

## 11. Legacy production examples

Historical production examples included relationships such as:

```text
Hypercalcaemia → Short QTc
Hypocalcaemia  → Prolonged QTc
```

Those examples are useful for migration auditing but are **not** authorization to convert by matching names. A reviewed conversion must identify the exact Case, Topic, Tag, and required System↔Tag exposure by stable IDs.

If a safe mapping cannot be established, stop the production conversion rather than guessing.

## 12. Why migration/history references still mention “secondary”

The repository intentionally retains references to secondary Topics in:

- historical migrations;
- historical Review provenance tests;
- migration guards/audits;
- deprecated fail-closed compatibility helpers;
- this historical decision record.

Those references do not mean Additional Study Topics remain a current product feature.

The current mental model is:

```text
System = where learners navigate
Topic  = what the Case fundamentally teaches
Tag    = what else the Case demonstrates / how it may be found contextually
```