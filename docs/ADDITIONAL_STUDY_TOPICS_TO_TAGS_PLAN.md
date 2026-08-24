# Replace Additional Study Topics with Tags

_Status: draft product/domain decision for implementation in this same PR. No runtime behavior is changed by this initial documentation commit._

_Last updated: 24 August 2026_

## Decision under review

We are considering simplifying the Case taxonomy model from:

```text
Case
├── one Primary/default Topic
├── zero or more Additional Study Topics
└── zero or more Tags
```

to:

```text
Case
├── exactly one Primary Topic
└── zero or more Tags
```

with learner navigation remaining:

```text
System
├── descendant Topics
└── explicitly exposed Tags
```

The working product direction for this draft PR is:

> **Use the single Primary Topic to define what a Case fundamentally teaches. Use Tags for cross-cutting concepts and alternate learner discovery/routing. Remove Additional Study Topics if the implementation audit confirms that no required learner behavior remains unique to them.**

This is intentionally being developed in one draft PR so the design record, migration/audit findings, implementation, tests, and final documentation can evolve together.

---

## 1. Why Additional Study Topics originally existed

The original multi-Topic design was documented in PR #17 on 15 August 2026 and implemented through PR #18, with Admin authoring added in PR #21.

The motivating example was a single Case such as:

```text
Case: Vitamin-D-deficiency hypocalcaemia with prolonged QTc

Topics
- Hypocalcaemia   [Primary/default]
- Prolonged QTc   [Additional Study Topic]
```

The original design was solving three problems:

1. **Cross-topic learner discovery** — the same Case should be reachable when studying either Hypocalcaemia or Prolonged QTc.
2. **Avoiding Case duplication** — the vignette, images, Case questions, and maintenance burden should not be duplicated merely to support another study route.
3. **Route-specific reusable Topic questions** — when the learner entered through Hypocalcaemia, the Review could use Hypocalcaemia Topic questions; when entering through Prolonged QTc, it could instead use Prolonged-QTc Topic questions.

This led to two Review Topic identities:

```text
primary_concept_id
= canonical/default Topic of the selected Case

study_concept_id
= attached Topic route actually used for reusable Topic-question resolution
```

The important historical point is that this design predated learner-routable contextual Tags.

---

## 2. How Tags changed the design space

PR #24 introduced the Tag architecture after multi-Topic routing already existed.

At that stage:

- Topics were the learner study hierarchy/routes;
- Case Tags described cross-cutting concepts covered by a Case;
- Tag-scoped Shared Questions were planned for reusable knowledge;
- learner Study-by-Tag was explicitly deferred.

Therefore Additional Study Topics still had a clear routing role at that time.

Subsequent Tagging work implemented Case Tags and tag-scoped Shared Questions. PR #88 then added contextual System/Topic/Tag learner navigation, including:

```text
System → Topic → Case
System → Tag   → Case
System → All   → deduplicated union
```

A Tag can now be exposed in one or more Systems without becoming part of the Topic hierarchy and without changing the Case's canonical Primary Topic.

This means Tags now cover most of the original reasons for Additional Study Topics.

---

## 3. Original purpose versus current Tag capability

| Original need | Additional Study Topic | Current Tags |
| --- | --- | --- |
| Make one Case reachable through another clinical concept | Yes | Yes |
| Make one Case reachable from another System | Indirectly through Topic hierarchy | Yes, directly through System↔Tag exposure |
| Avoid duplicating the Case/stem/images/questions | Yes | Yes |
| Represent a cross-cutting clinical association | Possible but heavy | Yes; this is the natural fit |
| Reuse the same concept across several Systems | Requires Topic hierarchy choices | Yes; one Tag may be exposed by several Systems |
| Make tag-scoped reusable Shared Questions eligible | No | Yes, through Case Tags |
| Change the direct reusable Topic-question bank according to the learner's alternate route | Yes | **No** |

The final row is the only major learner capability that current Tags do not reproduce.

---

## 4. The remaining semantic difference

Today an Additional Study Topic can change `study_concept_id` for the Review.

Example:

```text
Case
Primary Topic: Hypocalcaemia
Additional Study Topic: Prolonged QTc
```

Entered through Hypocalcaemia:

```text
study_concept_id = Hypocalcaemia
→ direct Hypocalcaemia Topic questions
```

Entered through Prolonged QTc:

```text
study_concept_id = Prolonged QTc
→ direct Prolonged-QTc Topic questions
```

By contrast, contextual Tag routing deliberately keeps the Case's canonical Primary Topic as the Topic-question context.

Example target model:

```text
Case
Primary Topic: Prolonged QTc
Tags:
- Hypocalcaemia
```

The learner may enter through:

```text
Cardiovascular → Prolonged QTc [Topic]
Endocrine      → Hypocalcaemia [Tag]
```

but the Case remains fundamentally a Prolonged-QTc Case and direct Topic-question resolution remains based on its Primary Topic.

The removal decision therefore intentionally asks:

> **Do we still want the same Case to swap direct Topic-question banks depending on which alternate route the learner used?**

The working product answer for this PR is **probably no**. Cross-cutting reusable knowledge can already be represented through Case questions, Tag-scoped Shared Questions, stimulus-group questions, exact-image questions, and Reusable Image Questions.

If the implementation audit finds real content that depends materially on route-specific direct Topic-question switching, stop and document that evidence before removing the feature.

---

## 5. Proposed target mental model

### System

A top-level learner-navigation grouping.

Examples:

```text
Cardiovascular
Endocrine
Dermatology
```

A System may expose descendant Topics and selected Tags.

### Topic

The single canonical educational home of a Case.

A Case has exactly one Primary Topic.

The Primary Topic answers:

> **What does this Case fundamentally teach?**

It remains the direct Topic-question context for the Case.

### Tag

A flat cross-cutting clinical concept represented by the Case.

Tags answer:

> **What other clinically meaningful concepts does this Case demonstrate or relate to?**

Tags may support:

- learner discovery inside explicitly configured Systems;
- cross-System Case routing;
- Admin search/curation;
- Tag-scoped Shared Question eligibility;
- future Tag-based product features without changing canonical Topic ownership.

### Example

```text
Case: prolonged QTc caused by hypocalcaemia

Primary Topic
- Prolonged QTc

Tags
- Hypocalcaemia
- Electrolyte disturbance
```

Possible learner routes:

```text
Cardiovascular → Prolonged QTc [Topic]
Endocrine      → Hypocalcaemia [Tag]
```

Both routes select the same Case. The Case's canonical Topic does not change according to the door used to find it.

---

## 6. Why this may be simpler and safer

Without Additional Study Topics, an author no longer has to distinguish among:

```text
Primary Topic
Additional Study Topic
Case Tag
System-exposed Tag
```

for two relationships that increasingly overlap in learner discoverability.

The simpler Case-local model becomes:

```text
Primary Topic = canonical teaching identity
Tags          = cross-cutting concepts / alternate discovery
```

This reduces:

- authoring ambiguity;
- duplicate learner-route concepts;
- overlap/deduplication complexity between native secondary Topic routes and Tag routes;
- route-specific Topic provenance states that exist only because a Case can have several attached Topics;
- the chance that an author uses an Additional Study Topic merely because they want the Case to appear elsewhere.

It also aligns the taxonomy with the current System layer: Systems organise canonical Topics while contextual Tags provide cross-System reach.

---

## 7. Required implementation audit before destructive changes

Do **not** remove or transform existing secondary Case↔Topic relationships by inference.

Before any destructive migration, inspect the current repository behavior and, where authorized and safely available, the actual production data.

The audit must answer:

1. How many active and historical `case_concepts.role = 'secondary'` relationships exist?
2. Which Cases and Topics do they connect?
3. For each secondary Topic, does an appropriate Case Tag already exist?
4. If a corresponding Tag does not exist, what explicit reviewed Tag should replace the relationship?
5. Are any secondary Study Topics currently supplying direct Topic questions that would disappear from the Review pool after conversion?
6. Are any production Cases reachable only because of a secondary Topic and not through an appropriate Tag/System exposure?
7. Do Preview-owned Cases currently use secondary Topic relationships, and what should their safe Tag equivalent be?
8. Do import, clone, copy, taxonomy coverage, Admin reporting, or Preview workflows assume multiple Case Topics?
9. Are there historical Reviews whose `study_concept_id` differs from `primary_concept_id`? Those historical rows must remain valid and interpretable.
10. Does any code rely on `case_concepts.role = 'secondary'` for behavior other than Additional Study Topics?

### No name-based migration

Do not write migration logic such as:

```text
secondary Topic name == Tag name
```

and assume that is semantically correct.

Topic and Tag names may differ intentionally, for example:

```text
Topic: Prolonged QTc
Tag: QT prolongation
```

Any production conversion must use an **explicit reviewed mapping** based on stable IDs or another deterministic reviewed plan.

If a safe mapping cannot be established, leave the affected relationship unchanged and stop the destructive portion rather than guessing.

---

## 8. Data migration principles

The eventual implementation in this draft PR should prefer a forward migration and explicit domain changes rather than editing historical migrations.

Expected principles:

1. Preserve exactly one canonical Topic per active Case.
2. Convert intended alternate concepts to Case Tags only through an explicit reviewed mapping.
3. Ensure required System↔Tag exposures exist when learner reachability depended on the old secondary route.
4. Remove secondary Case↔Topic relationships only after their intended learner reachability is represented safely.
5. Preserve historical Review rows and snapshots. Do not rewrite historical `primary_concept_id`, `study_concept_id`, selected navigation provenance, question snapshots, or Asset snapshots merely to match the new authoring model.
6. Historical Reviews whose `study_concept_id` points to a formerly-secondary Topic remain valid historical provenance.
7. Do not use production mutation merely as test setup. Production data conversion must use the repository's reviewed migration/release/operator safety model.
8. Keep Preview/production ownership boundaries explicit.

Whether the physical `case_concepts.role` column is removed in this same PR or retained temporarily as a compatibility shape should be decided after inspecting the blast radius. Product behavior must not continue offering or creating secondary relationships after this change.

If retaining the column temporarily materially reduces migration risk, the code should still enforce the new invariant that new/active Case authoring has exactly one Case Topic relationship. Any compatibility residue must be documented rather than left as an accidental second model.

---

## 9. Expected learner behavior after removal

### Topic route

A Case is reachable through its one canonical Topic (including existing System/Topic descendant navigation semantics).

Direct reusable Topic questions resolve from that canonical Topic and its eligible ancestors.

### Tag route

A Case is reachable when it has the selected Tag and that Tag is exposed in the selected System.

Tag routing does not replace the Case's canonical Topic-question context.

Eligible Tag-scoped Shared Questions continue to be based on Case Tags according to their existing eligibility rules.

### System → All

System → All remains the deduplicated union of native Topic routes and exposed Tag routes.

With secondary Topic routes removed, a Case's native Topic provenance is simpler: there is only one Case Topic relationship.

### Original / Expanded Learning

The learner-selectable Original/Expanded behavior is orthogonal to this change and must remain intact.

The question pool may change only where an old secondary Topic route previously substituted a different direct Topic-question bank. That semantic removal must be explicit and covered by tests.

---

## 10. Expected Admin behavior after removal

The Case editor should no longer expose:

```text
Additional Study Topics
Add Study Topic
Make primary from secondary
Remove secondary Topic
```

Instead it should make the two Case-local classification actions clear:

```text
Primary Topic
Case Tags
```

Because Tags now carry more of the alternate-routing role, Case Tag add/remove authoring should be convenient from the Case editor rather than requiring the administrator to leave the Case and use only the global Tags page.

Global hierarchy remains on Systems & Topics. System↔Tag exposure remains on the relevant System detail surface.

Do not make the Case editor responsible for global System↔Tag exposure.

---

## 11. Expected schema/domain direction

Target invariant:

> **Every learner-presentable active Case has exactly one canonical Topic and zero or more Case Tags. There is no active Additional Study Topic authoring or learner routing behavior.**

The implementation agent must inspect the current schema and determine the safest exact representation.

Possible end states include:

### Preferred if the blast radius is reasonable

Simplify the Case↔Topic storage model so it represents one Topic relationship per Case and no longer has a meaningful `primary | secondary` role.

### Acceptable staged compatibility if required for safety

Retain the existing physical table/column temporarily but:

- migrate/remove active secondary relationships through explicit mapping;
- reject new secondary relationships;
- remove secondary behavior from learner/Admin/Preview code;
- clearly document the compatibility residue and a later schema-cleanup condition.

Do not choose a large table rebuild solely for aesthetic purity if the safer behavior-level removal is materially lower risk.

---

## 12. Code and behavior areas the implementation must inspect

Do not assume this list is exhaustive; inspect current `main`/current PR head.

Likely affected areas include:

- Case↔Topic schema and migrations;
- learner Case candidate resolution;
- `study_concept_id` selection/provenance;
- System Topic/Tag route resolution and `All` precedence;
- Case editor Topic UI and server actions;
- Case Tag authoring UX;
- Preview Case clone/edit behavior;
- Admin Topic coverage/direct Case counts;
- import/resumable import Case Topic handling;
- taxonomy read models;
- production/Preview Case copy helpers;
- tests for multi-Topic learner routing;
- tests for System/Tag navigation;
- documentation that currently describes Additional Study Topics as current behavior.

Historical Review provenance support must remain unless a separately reviewed migration proves it can be simplified without losing historical meaning.

---

## 13. Acceptance criteria for this PR

Before this draft PR is considered ready to merge:

### Product semantics

- A Case has one canonical Primary Topic for current authoring/learner behavior.
- Additional Study Topics can no longer be created or used as learner routes.
- Cross-cutting/alternate discovery is represented by Case Tags plus System↔Tag exposure.
- Tag routes keep canonical Primary Topic question resolution.
- Existing Tag-scoped Shared Question behavior remains unchanged.
- Original/Expanded Learning remains unchanged except for the deliberate removal of alternate direct Topic-bank switching.

### Existing data

- Existing secondary relationships are explicitly audited.
- Any production conversion uses an explicit reviewed Topic→Tag mapping; no semantic name inference.
- No Case silently loses intended learner reachability.
- Historical Reviews remain readable and retain their original provenance/snapshots.
- Preview/production data ownership remains safe.

### Admin UX

- Additional Study Topic authoring is removed.
- Primary Topic authoring remains clear.
- Case Tags are authorable conveniently from the Case editor, unless inspection demonstrates a strong reason to keep the existing global-only mutation surface.
- Global System hierarchy and System↔Tag exposure remain separate global operations.

### Tests

Focused regression coverage should prove at minimum:

- one canonical Topic per Case;
- secondary relationship creation is impossible after migration/change;
- Topic routes still resolve canonical Topic questions correctly;
- cross-System Tag routes still find Cases;
- System → All deduplicates Topic+Tag reachability;
- Tag-shared Question eligibility still uses Case Tags;
- historical Review provenance remains valid;
- Preview ownership/isolation is preserved;
- Original/Expanded continuation remains correct;
- import/clone paths cannot silently recreate secondary relationships.

### Documentation

Update current behavior documents in the same PR, especially:

- `MULTI_TOPIC_STUDY_ROUTES.md` — convert to a historical/superseded decision record or rewrite it to explain removal/history;
- `CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md`;
- `V1_DATA_MODEL.md`;
- `AUTHORING_MODEL.md`;
- `CURRENT_DESIGN.md` where relevant;
- `DOCUMENTATION_INDEX.md`;
- `AGENT_TASK_MAP.md` if coding-agent routing references multi-Topic behavior;
- roadmap/handover only when status wording is materially changed by the implementation.

Do not call the change deployed merely because it is merged.

---

## 14. Explicitly preserved concepts

Removing Additional Study Topics does **not** mean removing:

- Topic hierarchy;
- parent/descendant Topic navigation;
- System → Topic learner routes;
- System → Tag learner routes;
- System → All;
- Case Tags;
- Case Question Tags;
- Shared Question Reuse Scope Tags;
- descriptive Shared Question Tags;
- direct Topic Questions;
- inherited ancestor Topic Questions;
- exact-image questions;
- Reusable Image Questions;
- Review snapshots/provenance;
- Original/Expanded Learning modes.

The intended simplification is specifically:

```text
many Case Topics
→ one canonical Case Topic

alternate clinical reachability
→ Tags
```

---

## 15. Explicitly out of scope

Do not use this PR to:

- redesign the Tag hierarchy (Tags remain flat);
- add Tag aliases/synonyms;
- add compound Shared Question reuse-scope logic;
- redesign Topic inheritance generally;
- redesign System hierarchy;
- redesign question precedence unrelated to removing the secondary Study Topic layer;
- add Asset Tags;
- add stimulus-option → Topic routing;
- rewrite historical Reviews;
- perform unrelated Case editor refactors;
- perform unrelated TypeScript conversion;
- deploy or mutate production outside the repository's reviewed operational workflow.

---

## 16. Decision checkpoint

The implementation audit is allowed to overturn the working hypothesis.

Stop and report before destructive implementation if evidence shows that real current content materially relies on:

```text
same Case
+ alternate Study Topic
+ route-specific direct Topic-question bank
```

and that the same educational behavior cannot be represented acceptably by:

```text
one Primary Topic
+ Case Tags
+ Tag-scoped Shared Questions
+ Case/stimulus/exact-image reusable knowledge
```

Otherwise proceed with the simplification in this same draft PR.

The intended end-state is a taxonomy that is easier for a clinician author to reason about:

```text
System = where learners navigate
Topic  = what the Case fundamentally teaches
Tag    = what else the Case demonstrates / how it can be found contextually
```
