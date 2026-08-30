# Learner Systems-First Study Layout Plan

_Status: proposed implementation plan for Draft PR._

_Last updated: 31 August 2026_

## Goal

Make the learner Study entry experience reflect the existing contextual navigation model:

```text
Study
→ choose System
→ choose All / Topic / curated Tag
→ choose question set
→ start Review
```

The learner should not be confronted with a long flat list of Topics as the primary information architecture once System navigation is ready for rollout.

This is a learner UX/layout change. It must not redefine the taxonomy model, Case classification, question eligibility, Review provenance, or production content.

## Current state

The repository already implements System-aware learner navigation behind the existing `SYSTEM_STUDY_NAVIGATION_ENABLED` rollout flag.

When the flag is enabled, `/study` receives `systems` from `listStudySystems()` and supports the existing `startSystem` action with these routes:

- `all`;
- `topic:<topicId>`;
- `tag:<tagId>`.

When the flag is absent or not exactly `true`, `/study` intentionally falls back to the older flat Topic list.

The current System-enabled presentation is functionally complete but visually dense: every System card immediately exposes its route choices, question-pool controls, and Start button. As the number of Systems/Topics/Tags grows, this makes the landing page behave more like a configuration form than a learner navigation page.

## Product model to preserve

The existing contextual navigation contract remains authoritative:

- **System** is the top-level learner navigation grouping.
- **Topic** is the canonical Case classification and direct Topic-question scope.
- **Tag** is cross-cutting metadata that may be curated as a learner route within one or more Systems.
- A Case still has one canonical Primary Topic plus zero or more Case Tags.
- Selecting a Tag route does not reclassify the Case or substitute another Study Topic.
- `System → All` remains the deduplicated union of native descendant Topic routes plus curated Tag routes, with native Topic provenance taking precedence for duplicate Cases.
- Existing Review provenance and Next-case behavior remain unchanged.

## Proposed learner experience

### Stage 1 — choose a System

`/study` should initially present compact System choices rather than the full nested configuration for every System.

Each System choice should show only the information useful for choosing a System:

- System name;
- eligible Case count;
- a clear affordance to open/select that System.

The first viewport should answer one question:

> **What System do I want to study?**

Do not show every Topic, Tag, question-pool choice, and Start button for every System simultaneously.

### Stage 2 — configure the selected System route

After a System is selected, progressively disclose that System's study options while de-emphasising the other Systems.

Present the route choices in this order:

1. **All cases** — the primary/default option for the selected System;
2. **Topics** — native descendant Topic routes;
3. **Curated Tags** — explicitly labelled as Tags and visually secondary to Topics.

Keep Topic and Tag semantics distinguishable. A learner should not infer that a curated Tag is a canonical Topic merely because both can be selected as study routes.

For nested Topics, retain the existing breadcrumb/context where it helps disambiguate the hierarchy.

### Stage 3 — choose question set

Show the existing question-pool choice only after the learner has selected/opened a System:

- **Original questions** — default;
- **Expanded Learning**.

This control configures the selected Review; it should not dominate the landing page.

### Stage 4 — start Review

Use the existing `startSystem` action and existing Review creation path.

The learner should have one obvious primary action for the currently selected System/route:

```text
Start review →
```

Validation errors should remain attached to the selected System configuration rather than surfacing against unrelated System cards.

## Preferred implementation shape

Keep the first implementation deliberately presentation-focused.

Preferred approach:

1. retain `/study` as the entry route;
2. retain the existing server load and `startSystem` action;
3. render System cards as a compact first-stage chooser;
4. use progressive disclosure so only the selected System exposes route/question controls;
5. preserve all existing server-side validation and route membership checks;
6. preserve the current feature-flag fallback while the rollout decision remains separate.

Avoid introducing a new learner route or duplicating System-routing logic unless implementation evidence shows that URL-addressable System selection is necessary for usability/accessibility.

## Layout direction

### Desktop

- compact System-card grid at the top level;
- after selection, a focused configuration panel for the selected System;
- clear section headings for All, Topics, and Tags;
- avoid repeating the full question-set form for every System simultaneously.

### Mobile

- single-column System choices;
- selected System configuration should read naturally top-to-bottom;
- controls and Start button should remain comfortably tappable;
- long Topic/Tag names and breadcrumbs must wrap without horizontal overflow.

## Empty and edge states

- Systems with zero eligible Cases remain excluded by the existing navigation builder.
- If a System has no eligible Topics, omit the Topics section.
- If a System has no eligible curated Tags, omit the Tags section.
- `All cases` remains available for any System returned to the learner because returned Systems already have at least one eligible Case.
- Preserve the existing database-not-configured state.
- Preserve the current Preview-only Admin learner-access restriction.

## Rollout boundary

This layout work must not silently turn a feature rollout into an incidental CSS change.

The current production configuration does not declare `SYSTEM_STUDY_NAVIGATION_ENABLED=true`, and the existing product contract intentionally treats enabling that flag as the Phase B learner rollout step after taxonomy curation/reachability has been reviewed.

Therefore:

- implement and review the systems-first layout under the existing enabled code path;
- keep the fallback available during implementation/review;
- decide explicitly, after UX/taxonomy validation, whether this PR should also enable production System navigation or whether rollout should be a separate narrow change;
- do not mutate production D1/R2 as part of this PR.

## Expected implementation surface

Likely primary files:

```text
src/routes/study/+page.svelte
```

Potential focused tests/contracts if existing UI assertions need adaptation:

```text
test/contextual-system-topic-tag-navigation.test.js
```

Server/domain files should change only if a concrete UX requirement cannot be satisfied from the existing `listStudySystems()` data shape and `startSystem` action.

No schema or migration change is expected.

## Acceptance criteria

1. With System navigation enabled, the initial learner Study view presents Systems as the primary choices.
2. Topic/Tag/question-set controls are progressively disclosed for the selected System rather than repeated in full for every System on initial load.
3. `All cases` remains the default route for a selected System.
4. Topics and curated Tags remain semantically and visually distinguishable.
5. Existing System-route eligibility, Case deduplication, question-pool behavior, Review provenance, and Next-case behavior are unchanged.
6. Validation errors remain associated with the selected System configuration.
7. The layout remains usable on narrow/mobile viewports without horizontal overflow.
8. The disabled-feature fallback continues to show the existing Topic flow until the rollout decision is explicitly changed.
9. No application-domain, schema, migration, production-content, or deployment change is introduced merely to accomplish the layout work.

## Validation plan

During implementation:

- use Vite/HMR for presentation iteration where available;
- exercise at least a System with several Topics, a System with curated Tags, and a System with both;
- verify Original and Expanded Learning starts still submit the intended route;
- verify form-error state remains on the selected System;
- verify narrow/mobile layout and long labels/breadcrumbs;
- run focused contextual System navigation tests if UI/source contracts are touched;
- use `npm run agent:checks` to determine repository-required validation;
- run the repository's normal validation contract before implementation handoff when local execution is available, otherwise rely on and report GitHub CI evidence accurately.

## Explicitly out of scope

- changing the System/Topic/Tag domain model;
- adding Additional Study Topics;
- changing Case classification;
- changing question eligibility/provenance semantics;
- changing Review/Next-case behavior;
- schema or migration work;
- production D1/R2 mutation;
- unrelated Admin taxonomy UX;
- deploying the Worker;
- silently enabling the production feature flag before the rollout decision is reviewed.
