# Replace Additional Study Topics with Tags

_Status: implementation/decision record for draft PR #90. The behavioral simplification is implemented on the PR branch; no production migration or deployment has been performed._

_Last updated: 25 August 2026_

## Decision

Current Case classification should use:

```text
Case
├── exactly one behaviorally active Primary Topic
└── zero or more Case Tags
```

with learner navigation remaining:

```text
System
├── descendant Topics
└── explicitly exposed Tags
```

The product mental model is:

```text
System = where learners navigate
Topic  = what the Case fundamentally teaches
Tag    = what else the Case demonstrates / how it can be found contextually
```

**Additional Study Topics are retired from current product behavior.**

The existing physical `case_concepts.role = 'secondary'` representation is intentionally retained for compatibility. No forward migration is required for this product change. Existing secondary rows may remain stored, but current Admin, Preview and learner behavior ignores them.

## Why Additional Study Topics originally existed

The original multi-Topic design was documented in PR #17 and implemented through PR #18, with Admin authoring added later.

The motivating pattern was one Case such as:

```text
Case: hypocalcaemia with prolonged QTc

Topics
- Hypocalcaemia   [Primary/default]
- Prolonged QTc   [Additional Study Topic]
```

Additional Study Topics originally solved three jobs:

1. make one stored Case reachable through more than one Topic;
2. avoid duplicating the vignette/images/questions merely for another learner route;
3. let the alternate route change `study_concept_id`, thereby changing the direct reusable Topic-question bank.

The third point is the one semantic capability Tags do not reproduce.

## How the Tag model changed the design

The later Tag architecture added:

```text
Case ↔ Tag
Shared Question Reuse Scope Tag
System ↔ exposed Tag
```

Contextual System navigation can now route learners as:

```text
System → Topic → Case
System → Tag   → Case
System → All   → deduplicated union
```

A Tag can be exposed in one or more Systems without changing the Case's canonical Topic.

That means cross-cutting discovery no longer needs a second Case Topic relationship.

## Deliberate semantic change

The canonical Primary Topic now remains the direct Topic-question context regardless of how the Case is discovered.

Target example:

```text
Case: prolonged QTc caused by hypocalcaemia

Primary Topic
- Prolonged QTc

Case Tags
- Hypocalcaemia
```

Possible learner routes:

```text
Cardiovascular → Prolonged QTc [Topic]
Endocrine      → Hypocalcaemia [Tag]
```

Both routes select the same Case, but both use:

```text
study_concept_id = Prolonged QTc
```

for direct/inherited Topic-question resolution.

Cross-cutting reusable knowledge remains representable through:

- Case Questions;
- Tag-scoped Shared Questions;
- Stimulus Group Questions;
- Case-specific exact-image Questions;
- Reusable Image Questions.

The retired behavior is specifically route-dependent switching between several direct Topic-question banks for the same Case.

## Why no migration is required

The repository already has a stable historical schema:

```text
case_concepts
- case_id
- concept_id
- role = primary | secondary
```

Changing product behavior does not require rebuilding that table or deleting old rows.

The safer, simpler compatibility contract is:

```text
role = primary
→ current canonical Case Topic
→ current learner route
→ current direct Topic-question context

role = secondary
→ legacy compatibility data only
→ hidden from current authoring/read models
→ ignored for current learner routing
→ not created by current mutation/import/clone paths
```

There has not yet been a learner rollout of this project. Therefore there is no learner-facing schema transition that requires converting existing secondary rows before launch.

Existing secondary rows may be cleaned up later if there is a concrete operational reason, but cleanup is not a prerequisite for this feature and must not be guessed from Topic/Tag names.

## Current application behavior on this PR

### Learner routing

`resolveStudyConceptId` and `resolveCaseStudyCandidates` use only the canonical Primary Topic.

Legacy secondary rows do not create Topic routes.

System navigation loads only Primary Topic Case relationships before combining them with contextual Tag routes.

### Admin Case editor

The Case editor exposes:

```text
Primary Topic
Case Tags
```

It no longer exposes:

```text
Additional Study Topics
Add Study Topic
Remove Study Topic
Make secondary Topic primary
```

Legacy secondary rows are not shown.

Primary Topic changes do not create a new secondary relationship for the previous Primary Topic. Unrelated legacy secondary rows remain inert. If the explicitly selected new Primary Topic already exists as a legacy secondary row, that conflicting row is removed as part of the primary change so the canonical relationship can be saved cleanly.

### Admin taxonomy reads

System/Topic coverage, direct Case counts and Topic detail views count/show only Primary Case Topic relationships. Stored legacy secondary rows do not inflate current Admin coverage.

### Case Tags

Production Case Tags can be added/removed directly from the Case editor.

Global Tag curation and System↔Tag exposure remain separate global operations.

### Preview

Preview cloning copies:

- the canonical Primary Topic;
- Case Tags;
- the normal Preview-owned Case content graph.

It does not recreate legacy secondary Topic rows.

Preview secondary-topic mutation APIs remain compatibility exports but fail closed. Existing Preview secondary rows, if any, remain inert and do not prevent ordinary Primary Topic replacement.

### Import Package v1

The historical `secondaryTopicIds` key remains syntactically recognized for Package v1 compatibility, but it must be empty.

```text
secondaryTopicIds: []
→ valid historical shape

secondaryTopicIds: [ ... ]
→ rejected
```

Reviewed and resumable import boundaries both fail closed on non-empty secondary relationships, including legacy staged execution plans.

Package v1 is not broadened to import Tags as part of this change.

## Stored compatibility versus active behavior

Retaining `role = secondary` in the schema does **not** mean Additional Study Topics remain a supported product feature.

The distinction is intentional:

```text
physical historical representation
≠ current product behavior
```

This avoids an unnecessary schema migration while keeping the application model simpler for authors and future learners.

## Historical Reviews

Review provenance fields such as:

```text
primary_concept_id
study_concept_id
```

remain readable as stored historical data. This PR does not rewrite Review rows or immutable question/media snapshots.

Because the application has not yet been rolled out to learners, no production learner migration is required for this behavior change.

## What must be curated before learner launch

The absence of a data migration does not mean learner taxonomy curation can be skipped.

Before enabling learner System navigation, verify that clinically useful alternate discovery is represented explicitly through:

```text
Case Tags
+ System ↔ Tag exposure
```

For example, if an existing calcium Case previously had a QTc secondary Topic for authoring experiments, decide clinically whether a QT-related Tag should be attached/exposed. That is ordinary content curation, not an automatic Topic→Tag migration.

Do not infer such curation from matching names. The author should choose the appropriate Tag explicitly.

## Invariants

Current behavior should preserve all of the following:

- exactly one behaviorally active Primary Topic per learner-presentable Case;
- Systems remain learner-navigation groupings;
- Topics remain the canonical Case classification/direct Topic-question scope;
- Tags remain flat cross-cutting metadata and contextual learner routes when exposed by a System;
- System → Topic, System → Tag and System → All remain supported;
- System → All deduplicates Cases reached through Topic and Tag paths;
- Tag routing keeps the canonical Primary Topic as `study_concept_id`;
- Tag-scoped Shared Question eligibility remains based on explicit Case Tags;
- Original / Expanded Learning remains orthogonal;
- production/Preview ownership boundaries remain unchanged;
- historical Review snapshots are not rewritten;
- current code does not create new secondary Topic relationships.

## Validation expectations

Regression coverage should prove:

- the canonical Primary Topic remains the only learner Topic route;
- stored legacy secondary rows do not create learner eligibility;
- Admin secondary mutation helpers fail closed;
- legacy secondary rows are hidden from current Case/Topic read models;
- Primary Topic replacement works even when unrelated legacy secondary rows exist;
- selecting a Topic already stored as a legacy secondary resolves the conflicting row safely;
- System→Tag discovery uses the canonical Primary Topic for question context;
- System→All deduplicates Topic+Tag reachability;
- Preview clone copies Primary Topic + Case Tags but not secondary rows;
- import paths reject non-empty `secondaryTopicIds`;
- historical Review data remains readable.

## Out of scope

Do not use this change to add:

- a Tag hierarchy or aliases;
- compound Shared Question reuse scopes;
- System-level reusable Topic questions;
- Asset Tags;
- stimulus-option → Topic learner routing;
- automatic Topic→Tag inference;
- a schema cleanup solely to remove the historical `secondary` enum value;
- production data deletion for aesthetic consistency;
- unrelated Case-editor or TypeScript refactors.

## Final mental model

```text
System
= where learners navigate

Primary Topic
= what the Case fundamentally teaches
= canonical direct Topic-question context

Case Tag
= what else the Case demonstrates
= alternate contextual learner discovery when exposed by a System

secondary case_concepts row
= legacy stored compatibility only
= not a current product feature
```
