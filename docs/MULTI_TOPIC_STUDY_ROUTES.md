# Flash-Cards — Multi-Topic Case Study Routes

_Last updated: 18 August 2026_

## Status

**Implemented and part of the current production baseline.** Learner multi-Topic routing and Review provenance landed through PR #18, and production Admin multi-Topic Case authoring is also implemented.

This remains the preferred model before introducing any Asset-to-Topic relationship.

The key rule is:

> **A Case may belong to multiple existing Topics, and every attached active Study Topic may be a valid learner entry route. The `primary` role is the Case's canonical/default administrative classification, not the only learner route.**

The implementation reuses `case_concepts`; there is no parallel Topic table or Case-Topic model.

## 1. Why this exists

A single coherent Case can teach the same presentation through several valid educational lenses.

Example:

```text
Case: Post-thyroidectomy hypocalcaemia with prolonged QTc

Topics
- Hypocalcaemia   [Default]
- Prolonged QTc   [Additional Study Topic]
```

Duplicating the entire Case merely to make it reachable through both Topics would duplicate the vignette, images, Case questions, and maintenance burden.

Multi-Topic routing stores the Case once while preserving route-specific reusable Topic questions.

## 2. Data model

`case_concepts` links a Case to one or more Topics/Concepts:

```text
case_id
concept_id
role = primary | secondary
```

Current invariant for a learner-presentable active Case:

- exactly one active `primary` relationship;
- zero or more `secondary` relationships;
- the primary is the canonical/default administrative Topic;
- active primary and secondary relationships may both be learner Study routes.

Product UI should describe this as:

```text
Primary/default Topic
Additional Study Topics
```

rather than implying secondary Topics are weak metadata tags.

## 3. Learner routing

When a learner selects a Topic, eligible Cases include Cases attached through valid active primary or secondary Study Topic relationships, subject to the normal Topic/subtree selection rules implemented by the Study flow.

The same Case must not appear twice in one eligibility set merely because several relevant relationships resolve to it.

When a Review is created, two Topic identities are persisted:

```text
primary_concept_id
= canonical/default Topic of the selected Case at Review creation

study_concept_id
= actual attached Topic route used for this Review
```

This distinction preserves both administrative classification and learner-route provenance.

## 4. Route-specific reusable Topic questions

The learner resolver uses the actual `study_concept_id` as the direct reusable Topic-question context.

Example:

```text
Study Hypocalcaemia
→ same Case may appear
→ direct Hypocalcaemia Topic questions
  + Case/stimulus questions

Study Prolonged QTc
→ same Case may appear
→ direct Prolonged-QTc Topic questions
  + the same Case/stimulus questions
```

The resolver does **not** mix reusable question banks from every attached Case Topic.

Current broader precedence also includes tag-shared knowledge:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

## 5. Primary/default Topic changes

Changing which attached Topic is primary/default must preserve valid alternate routes.

Current Admin behavior supports:

- selecting one active primary/default Topic;
- adding active Additional Study Topics;
- removing secondary relationships;
- promoting a secondary Topic to primary;
- demoting the previous primary to secondary rather than silently deleting it;
- retaining unrelated secondary relationships;
- showing inactive historical Topic relationships for safe orientation/editing.

A primary cannot simply be removed without establishing another valid active primary.

## 6. Study-Topic validity rule

A Topic should be attached as a learner Study route only when **every valid random configuration of the Case remains a legitimate example of that Topic**.

Example:

```text
Case: Hypercalcaemia

Alternative ECGs
A — shortened QTc
B — shortened QTc + Osborn waves
C — shortened QTc
```

Safe Case Study Topics:

```text
Hypercalcaemia
Short QTc
```

Unsafe Case Study Topic if only option B demonstrates it:

```text
Osborn waves
```

That image-only finding should remain an exact-option question/teaching point.

This rule is why the current product does not need stimulus-option → Topic learner routing.

## 7. Topic hierarchy remains separate from Tags

Multi-Topic routing is learner navigation/curriculum structure.

Tags are flat cross-cutting metadata and Shared Question reuse scope.

```text
Study Topic relationship
= learner may enter the Case through this Topic

Case Tag
= Case contains/covers this cross-cutting clinical concept
```

A Case may have both a Study Topic and a same-named Tag when both semantics are useful, but one does not imply the other.

## 8. Interaction with stimulus groups

Alternative stimulus selection is independent of which attached Topic is the administrative default.

The valid Study Topic route is resolved for the Review; then fixed/alternative stimuli and questions are resolved using the normal Case behavior.

The Study-Topic validity rule must be checked against all active alternative configurations. If a Case's alternatives diverge so much that one attached Topic is only valid for some options, split/refine the Case or consider a future stimulus-level routing feature only if real learner requirements justify it.

## 9. Review history and migration

Migration `0003_multi_topic_study_routing.sql` added `reviews.study_concept_id` and conservatively backfilled historical Reviews:

```text
study_concept_id = primary_concept_id
```

That preserves pre-migration meaning because historical Reviews used primary-Topic routing.

New Reviews record the actual Study Topic route used.

## 10. Production taxonomy example

The agreed current taxonomy pattern includes:

```text
Electrolyte Disorders
├── Hypercalcaemia
└── Hypocalcaemia

Cardiology
└── ECG Findings
    ├── Short QTc
    └── Prolonged QTc
```

Example Case routes:

```text
Hypercalcaemia Case
- primary/default: Hypercalcaemia
- Additional Study Topic: Short QTc

Hypocalcaemia Case
- primary/default: Hypocalcaemia
- Additional Study Topic: Prolonged QTc
```

The `AGREED_PRODUCTION_TAXONOMY_OPERATOR.md` runbook records the fixed-purpose production taxonomy operation used for the agreed data change. It is not a generic free-form taxonomy mutation API.

## 11. Admin authoring contract

The Case editor must make Topic roles understandable without exposing unnecessary database terminology.

Preferred presentation:

```text
Topics
- Hypocalcaemia   [Default]
- Prolonged QTc
```

Helper guidance should remind authors:

> Add an Additional Study Topic only when the Case is a valid example of that Topic regardless of which valid alternative stimuli are selected.

## 12. Schema decision

Do not add:

- a parallel `topics` table;
- a generic `case_topics` table separate from `case_concepts`;
- Asset → Topic relationships merely for metadata;
- stimulus-option → Topic relationships merely because an incidental finding exists on one image.

Reconsider stimulus-level learner routing only when real content demonstrates a Case that genuinely must remain one presentation while some valid alternatives are legitimate routes for a Topic and others are not.

Until then, `case_concepts` plus contextual stimulus questions remains the simpler and safer model.
