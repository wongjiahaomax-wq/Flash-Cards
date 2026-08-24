# Flash-Cards — Multi-Topic Case Study Routes

_Last updated: 24 August 2026_

## Status

**Implemented and part of the verified production baseline.** Learner multi-Topic routing and Review provenance landed through PR #18, and production Admin multi-Topic Case authoring is implemented. Current `main` additionally includes Case-editor Topic management/inline Topic creation from PR #54; merge status and deployment status remain separate facts.

The contextual System/Topic/Tag navigation feature extends learner entry routing around this established model without replacing it. See `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md` for the System hierarchy, contextual Tag exposure, Phase A/Phase B rollout, and additive Review route provenance.

The key rule is:

> **A Case may belong to multiple existing Topics, and every attached active Study Topic may be a valid learner entry route. The `primary` role is the Case's canonical/default administrative classification, not the only learner route.**

The implementation reuses `case_concepts`; there is no parallel Topic table or Case-Topic model.

## 1. Why this exists

A single coherent Case can teach the same presentation through several valid educational lenses.

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

With contextual System navigation, `case_concepts` may reference only `concepts.kind = 'topic'`. Systems group Topics for navigation but are never Case relationships.

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

A later System navigation layer additionally records effective System/Tag provenance and the learner-selected System route. Those fields do not change the meaning of `primary_concept_id` or `study_concept_id`. In particular, a learner-selected parent Topic can resolve a Case through a more specific descendant `study_concept_id` while retaining the parent Topic separately for “Next case” navigation.

## 4. Route-specific reusable Topic questions and selected-stimulus knowledge

The learner resolver uses the actual `study_concept_id` as the direct reusable Topic-question context.

```text
Study Hypocalcaemia
→ same Case may appear
→ direct Hypocalcaemia Topic questions
  + Case/stimulus questions
  + explicitly opted-in Reusable Image Questions for selected stimuli

Study Prolonged QTc
→ same Case may appear
→ direct Prolonged-QTc Topic questions
  + the same Case/stimulus questions
  + explicitly opted-in Reusable Image Questions for selected stimuli
```

The resolver does **not** mix direct reusable Topic-question banks from every attached Case Topic.

Reusable Image Questions are independent of Study Topic identity. Their eligibility comes from the selected stimulus option plus an explicit `stimulus_option_asset_questions` opt-in, not from `case_concepts`.

Current duplicate-Prompt precedence is:

```text
Case-specific exact stimulus option question
> explicitly reused Asset Question for selected option
> stimulus group question
> Case question
> exact Study Topic question
> Tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate set is deduplicated by `question_prompt_id` before Automatic/All/Fixed selection.

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

Current `main` also allows an administrator to create a new Topic from the Case editor and immediately attach it as either the new primary/default Topic or an Additional Study Topic. This is an authoring convenience over the same `concepts` + `case_concepts` model; it does not create a second Topic system.

A primary cannot simply be removed without establishing another valid active primary.

## 6. Study-Topic validity rule

A Topic should be attached as a learner Study route only when **every valid random configuration of the Case remains a legitimate example of that Topic**.

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

That image-only finding should remain stimulus-specific teaching: a Case-specific exact-image question, a Reusable Image Question if intrinsically true of the exact Asset, or other selected-stimulus context where appropriate.

The existence of a Reusable Image Question on one option does not make its finding a valid Case-level Study Topic. Study-route validity is still evaluated across all valid Case stimulus configurations.

This is why the current product does not need stimulus-option → Topic learner routing.

## 7. Topic hierarchy remains separate from Tags and exact-Asset reuse

Multi-Topic routing is learner navigation/curriculum structure.

Tags are flat cross-cutting metadata and Shared Question reuse scope.

Reusable Image Questions are canonical exact-Asset teaching content with explicit per-stimulus opt-in.

```text
Study Topic relationship
= learner may enter the Case through this Topic

Case Tag
= Case contains/covers this cross-cutting clinical concept

Reusable Image Question
= exact selected Asset may contribute this canonical Prompt/answer after explicit opt-in
```

These mechanisms may describe overlapping clinical ideas but do not imply one another.

Contextual System navigation adds one further relationship:

```text
System → exposed Tag
= this existing flat Tag is offered as a learner route inside this System
```

This does not move the Tag into a hierarchy, and the same Tag may be exposed by several Systems.

## 8. Interaction with stimulus groups

Alternative stimulus selection is independent of which attached Topic is the administrative default.

The Study Topic route is resolved for the Review; then fixed/alternative stimuli and questions are resolved using normal Case behavior.

The Study-Topic validity rule must be checked against all active alternative configurations. If alternatives diverge so much that one attached Topic is only valid for some options, split/refine the Case or consider a future stimulus-level routing feature only if real learner requirements justify it.

Transparent fixed-image conversion for exact-image question scope does not change Topic routing. A one-option group created to support image-specific teaching remains learner-equivalent to the previous fixed image and keeps the same Case Topic relationships.

Higher-resolution replacement likewise does not alter `case_concepts` or Review Study Topic semantics.

## 9. Review history and migration

Migration `0003_multi_topic_study_routing.sql` added `reviews.study_concept_id` and conservatively backfilled historical Reviews:

```text
study_concept_id = primary_concept_id
```

That preserves pre-migration meaning because historical Reviews used primary-Topic routing.

New Reviews record the actual Study Topic route used.

Later question/image features do not rewrite these Topic snapshots. Reusable-image provenance lives on `review_questions`; historical media identity lives on `review_assets.storage_key_snapshot`.

Contextual System navigation adds separate, nullable effective System/Tag provenance plus nullable learner-selected System-route provenance. Historical Reviews remain Topic-routed by default and their snapshots are not rebuilt. Original → Expanded preserves both provenance layers. “Next case” uses the selected navigation layer, not a descendant/effective route inferred from the first Case.

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

Under contextual System navigation, a top-level System can own the Cardiology/ECG Topic hierarchy while a curated Tag such as `QT prolongation` can also be exposed in that System. The same Case may therefore be reachable by both its Additional Study Topic and the Tag; System → All deduplicates it and prefers native Topic provenance.

The `AGREED_PRODUCTION_TAXONOMY_OPERATOR.md` runbook records the fixed-purpose production taxonomy operation used for the agreed data change. It is not a generic free-form taxonomy mutation API.

## 11. Admin authoring contract

The Case editor must make Topic roles understandable without exposing unnecessary database terminology.

Preferred presentation:

```text
Topics
- Hypocalcaemia   [Default]
- Prolonged QTc
```

Authors may select an existing active Topic or create a new Topic inline, but every mutation still resolves to the same canonical `concepts` / `case_concepts` relationships.

Helper guidance should remind authors:

> Add an Additional Study Topic only when the Case is a valid example of that Topic regardless of which valid alternative stimuli are selected.

Global System/Topic hierarchy changes and System↔Tag exposure belong on the Admin Systems & Topics surfaces, not in a Case-local editor. Preview Admin may change only Preview Case Topic relationships; it does not gain global taxonomy mutation authority.

## 12. Schema decision

Do not add:

- a parallel `topics` table;
- a generic `case_topics` table separate from `case_concepts`;
- Asset → Topic relationships merely for metadata;
- stimulus-option → Topic relationships merely because an incidental finding exists on one image.

Reconsider stimulus-level learner routing only when real content demonstrates a Case that genuinely must remain one presentation while some valid alternatives are legitimate routes for a Topic and others are not.

Until then, `case_concepts` plus contextual stimulus questions, exact-Asset reusable questions, Tags/Shared Questions, and the existing learner resolver remain the simpler and safer model.

## 13. Contextual System route interaction

The learner System layer deliberately routes **into** the model documented above.

### System → Topic

The selected descendant Topic is resolved through the normal multi-Topic Case algorithm. A cross-topic Case therefore keeps its canonical Primary Topic while `study_concept_id` records the actual attached Topic used for question resolution. The learner-selected Topic is retained separately so a parent-Topic selection remains that parent route across “Next case”.

### System → Tag

A curated Tag can select a Case regardless of which System contains its Primary Topic. The Tag is navigation context only, so the Case enters the existing question resolver with its canonical Primary Topic as `study_concept_id`.

This prevents Tag navigation from silently changing Topic-question inheritance.

### System → All

The union of native descendant Topic routes and curated Tag routes is deduplicated by Case. If a Case is reachable through both, native Topic provenance wins because it carries the more specific established Study Topic context.

The Review still records `navigation_route_type = all`, separately from that winning effective `route_type`, so “Next case” remains in the full System → All union.

Full route provenance and rollout behavior are defined in `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md`.
