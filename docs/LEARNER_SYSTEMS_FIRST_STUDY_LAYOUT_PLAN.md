# Learner Systems-First Study Layout and Custom Selection Plan

_Status: implementation-ready plan for Draft PR #119._

_Last updated: 31 August 2026_

## Goal

Make learner Study a systems-first navigation experience with an explicit multi-select study pool:

```text
Study
→ choose System
→ all eligible Topics + curated Tags start selected
→ optionally uncheck areas to narrow the pool
→ choose question set
→ start Review
```

The selected study pool is the **union (OR)** of every checked Topic and Tag. A Case that matches more than one checked area is included once.

The default state must represent the whole eligible System: every eligible Topic and every curated Tag is checked. The learner narrows the pool by unchecking stronger or irrelevant areas and leaving weaker areas selected.

The Production Admin portal's **Preview learner study** entry must show and exercise this same prospective learner experience even while the ordinary learner rollout flag remains disabled.

This PR now intentionally includes the domain/persistence work required to make multi-route selection durable across Review continuation and Next case. This is no longer presentation-only work.

## Current state confirmed from implementation

### Existing learner entry

`src/routes/study/+page.server.js` currently supports two modes:

- flag on: `listStudySystems()` plus a `startSystem` action;
- flag off: legacy Topic list plus the legacy `start` action.

The System action currently accepts exactly one navigation route:

- `all`;
- one `topic:<id>`;
- one `tag:<id>`.

The action itself checks `SYSTEM_STUDY_NAVIGATION_ENABLED`, so Admin preview needs a separate authorized route boundary rather than a public query-string bypass.

### Existing System candidate semantics

`src/lib/server/learning/system-study-routes.ts` already establishes important behavior that must survive:

- `System → All` is the deduplicated union of native Topic candidates plus curated Tag candidates;
- native Topic provenance wins over Tag provenance when the same Case matches both;
- curated Tags are scoped to a System;
- Topic routes currently support descendant routing.

### Existing Review provenance

`reviews` currently stores:

- the effective Case provenance (`study_system_concept_id`, `route_type`, `study_tag_id`);
- one learner-selected navigation route (`navigation_route_type`, `navigation_route_id`).

Migration `0015_contextual_system_topic_tag_navigation.sql` enforces that single-route shape with D1 triggers.

That is insufficient for the new requirement because the learner's selected set must survive:

- the initial Review;
- Original → Expanded continuation;
- repeated **Next case** operations.

### Existing learner Review

`src/routes/study/[reviewId]` owns the real learner Review UI and lifecycle. System Next-case availability currently depends on the rollout flag. Admin preview therefore needs a narrow Production-Admin exception so an Admin can exercise the prospective flow end-to-end before rollout.

### Admin boundary

`src/routes/admin/+layout.server.js` already provides the Production Admin authorization boundary:

- Preview Worker is rejected;
- authentication is required;
- production `admin` role is required.

This is distinct from the retained Preview Worker / `preview_admin` subsystem.

## Product decisions

### 1. Multi-select uses union semantics

The learner's checked Topics and Tags form one OR-union pool.

Example:

```text
Checked:
- Arrhythmias
- Heart failure
- ECG interpretation

Eligible pool =
Cases in Arrhythmias
OR Cases in Heart failure
OR Cases matching ECG interpretation
```

A Case matching multiple checked areas is still present once.

Do not implement AND/intersection behavior.

### 2. All eligible areas start checked

After choosing a System:

- every eligible Topic starts checked;
- every curated Tag with eligible Cases starts checked;
- Original questions remains the default question set.

Therefore a fresh selection is equivalent to the current `System → All` candidate pool.

The UI should make narrowing easy with group-level controls such as **Select all** / **Clear all** where useful.

At least one Topic or Tag must remain selected before **Start review** can succeed.

### 3. Topic checkboxes represent exact Topic membership internally

This is necessary to make hierarchical deselection behave predictably.

The current single Topic route is descendant-inclusive. If custom selection reused that exact route semantic for every checkbox, unchecking a child Topic while its parent stayed checked would not actually remove the child Cases.

For the new custom selection model:

- persisted Topic selections are **exact canonical Topic IDs**;
- a Case matches a selected Topic when its effective/canonical Study Topic is that selected Topic;
- the UI may still present Topics hierarchically;
- a parent checkbox may act as a tree control that toggles that Topic plus its descendant Topic checkboxes;
- individual descendants can then be unchecked independently;
- parent checked/indeterminate state should reflect the selected subtree using standard accessible tree-checkbox behavior.

This does **not** change Case classification. Topic remains the canonical Case classification.

The existing single-route descendant Topic behavior remains for historical/legacy single-route Reviews and existing compatibility paths.

### 4. Curated Tags remain cross-cutting

Tags remain separate from Topics visually and semantically.

A checked Tag may include a Case whose canonical Topic is not among the currently checked Topics. That is intentional union behavior.

Learner-facing copy should make this understandable without exposing implementation jargon, for example:

> Curated Tags can add relevant cases across Topics.

If a learner unchecks a Topic but leaves a Tag that also matches one of its Cases, that Case may still appear because another selected area still includes it.

### 5. Deterministic provenance for a selected Case

The selected route set and the effective provenance of the chosen Case are different concepts.

For candidate deduplication/provenance:

1. a selected exact Topic match takes precedence over Tag matches;
2. if more than one selected Tag matches a Case and no selected Topic matches it, choose Tag provenance deterministically using the System's canonical curated-Tag ordering, not request checkbox order;
3. effective `studyConceptId`, `routeType`, `studyTagId`, question scope, and Review snapshot semantics otherwise remain unchanged.

When every eligible Topic and curated Tag is selected, the candidate set and effective provenance must be equivalent to existing `System → All` behavior.

### 6. The selected set is snapshotted for the Review chain

Starting a new custom System study creates an immutable internal study-selection snapshot.

That same snapshot is reused for:

- the first Review;
- Original → Expanded continuation;
- subsequent Next-case Reviews in the chain.

This prevents Next case from silently broadening back to `All` or forgetting which areas the learner excluded.

The selection snapshot is **not** a saved learner preset or cross-session preference in this PR. Returning to `/study` and starting a new System begins again with all eligible areas checked.

If taxonomy/curation changes after the chain begins:

- new Topics/Tags are not silently added to the existing snapshot;
- new Cases inside still-selected valid areas may remain eligible;
- if a stored selected area becomes invalid/unavailable, fail safely and direct the learner to choose a fresh Study selection rather than silently mutating the stored selection.

## Target learner UX

### Stage 1 — choose a System

Initial `/study` System mode shows compact System choices only.

Each System card should show:

- System name;
- total eligible unique Case count;
- clear select/open affordance.

Do not initially render every Topic, Tag, question-set control, and Start button for every System.

### Stage 2 — configure the selected System

After selection, focus the page on one System and provide an obvious **Change System** control.

Suggested information hierarchy:

```text
← Change System

Cardiovascular
42 cases available

Choose what to include

Topics                         Select all / Clear all
☑ Arrhythmias
☑ Heart failure
☑ Ischaemic heart disease

Curated Tags                   Select all / Clear all
☑ ECG interpretation
☑ Chest pain

Question set
● Original questions
○ Expanded Learning

[ Start review → ]
```

Topics should use normal checkbox semantics, with hierarchy/breadcrumbs where useful. Curated Tags should have a distinct visual treatment or label.

When all current study areas are selected, the UI may say **All available study areas selected**. After narrowing, it may say **Custom selection**.

Do not display a misleading sum of per-route Case counts because overlaps are deduplicated. If a live exact unique Case count can be supplied cheaply without broad data exposure or a chatty request loop, it is useful; otherwise show the System total when everything is selected and the number of selected study areas after narrowing.

### Stage 3 — question set

Show only after a System is selected:

- **Original questions** — default;
- **Expanded Learning**.

### Stage 4 — start Review

One obvious primary CTA:

```text
Start review →
```

Disable or reject Start when zero study areas are selected.

Failed submissions must restore:

- selected System;
- the exact checked Topic/Tag set;
- question set;
- local validation/domain error.

Do not throw the learner back to the System grid after an ordinary form error.

## Responsive and accessibility requirements

- System cards may use a compact desktop grid;
- selected-System configuration should be single-column or otherwise easy to scan;
- long names/breadcrumbs wrap without horizontal overflow;
- checkbox rows are large touch targets;
- group controls are keyboard accessible;
- parent Topic tree checkboxes expose proper checked/indeterminate state;
- do not implement hierarchy only through visual indentation;
- the interaction must remain understandable with native labels and form controls.

Avoid modals and nested independently scrolling configuration panels.

## Production Admin learner preview

Add a dedicated route under the existing Production Admin tree, preferably:

```text
/admin/study-preview
```

Required behavior:

1. Admin dashboard **Preview learner study** points there, not to `/study`.
2. The route loads System navigation regardless of `SYSTEM_STUDY_NAVIGATION_ENABLED`.
3. It uses the same shared systems-first chooser component as flag-on learner `/study`.
4. It uses the same multi-select parsing/validation/start workflow as learner `/study`.
5. Successful start redirects into the actual `/study/[reviewId]` Review UI.
6. Production Admin may use selection-based System **Next case** while the learner flag is off.
7. Ordinary learner flag-off behavior remains unchanged.
8. Preview Worker / Preview-only Admin remains blocked from learner Study.
9. No query parameter or public `/study` path grants the Admin-preview bypass.
10. A flag-off Admin System Review has a sensible **Back to Admin learner preview** path.

A small **Admin learner preview** indicator is acceptable, but do not duplicate the learner Review UI.

## Persistence design

A real schema change is now expected.

### New immutable study-selection snapshot

Prefer an explicit normalized model rather than encoding the checkbox set into one overloaded `navigation_route_id` string or pretending a custom selection is `navigation_route_type='all'`.

Suggested shape:

```text
study_selections
- id
- user_id
- system_concept_id
- created_at

study_selection_routes
- study_selection_id
- route_type       ('topic' | 'tag')
- route_id
- primary key (study_selection_id, route_type, route_id)

reviews
- add nullable study_selection_id
```

Names may be refined if current schema conventions suggest a clearer equivalent, but preserve the model:

- one immutable selection snapshot belongs to one user and one System;
- it contains many exact Topic/Tag selections;
- multiple Reviews in the same chain may reference the same snapshot;
- historical single-route Reviews remain valid and require no backfill.

The polymorphic `route_id` may follow the precedent of existing `navigation_route_id`; application validation remains responsible for System membership. Add database checks/triggers for structural invariants where practical.

### Review provenance compatibility

Migration 0015 currently requires a System Review to have one non-null `navigation_route_type`.

The new migration must update that database-level contract so a System Review has exactly one navigation-selection representation:

- **legacy single-route provenance**: existing `navigation_route_type` / `navigation_route_id`, with `study_selection_id IS NULL`;
- **new multi-select provenance**: `study_selection_id IS NOT NULL`, with legacy navigation route columns null.

Do not weaken effective Case provenance checks (`route_type`, `study_tag_id`, System validity).

The new D1 trigger(s) should also ensure a referenced study selection belongs to the same user/System as the Review.

Do not rewrite migration 0015. Add a new migration, expected to be `0017_...sql` if the migration sequence is still unchanged when coding starts.

### Atomicity

Do not leave orphan study-selection snapshots when Review creation fails.

The first selection snapshot, its selected route rows, the Review, review questions, and review assets should be committed within the same business operation/transactional batch after candidate/question selection has succeeded.

Subsequent Next/Expanded Reviews should reuse the existing immutable selection snapshot rather than duplicating or mutating it.

## Domain/read-model changes

### Selection route model

Introduce a focused type such as:

```ts
type SystemStudySelectionRoute =
  | { routeType: 'topic'; routeId: string }
  | { routeType: 'tag'; routeId: string };
```

Normalize submitted routes before use:

- trim IDs;
- reject malformed types;
- deduplicate duplicates;
- validate every selected route belongs to the selected System;
- require at least one route;
- canonicalize ordering so request order cannot affect provenance.

### Exact Topic candidate resolution

Add a selection-specific candidate resolver rather than changing the historical single Topic route semantics in place.

For selection mode:

- Topic route IDs mean exact Study Topic membership;
- Tag route IDs use existing curated Tag matching;
- union candidates by Case ID;
- selected Topic candidate wins over selected Tag candidate;
- selected Tag tie-breaking follows canonical System Tag order.

Add a high-value equivalence test:

> selecting every eligible exact Topic plus every curated Tag produces the same Case IDs and effective provenance as the existing `System → All` resolver.

### Navigation read model for the UI

`listStudySystems()` should expose enough hierarchy information for an accessible Topic tree. Add `parentId` or an equivalent focused field if the existing breadcrumb model is not sufficient.

Do not expose broad Case records merely to calculate client-side counts.

### Start workflow

Retain one shared flag-independent route/action workflow used by learner Study and Admin preview.

Prefer a focused TypeScript module under `src/lib/server/learning/`, for example:

```text
start-system-study.ts
```

It should:

- read repeated submitted route values with `FormData.getAll(...)`;
- parse `topic:<id>` / `tag:<id>` values;
- validate question-pool mode;
- invoke the canonical selection Review operation;
- map known domain failures into a stable form payload containing `message`, `systemId`, selected routes, and `questionPoolMode`.

It must not decide Admin authorization or the learner feature flag.

### Review continuation

Add focused selection-aware Review operations/helpers so:

- Original → Expanded preserves `studySelectionId`;
- Next case reloads the immutable selected routes and uses their union pool;
- ordinary flag-off learner System Next remains unavailable;
- flag-off Production Admin preview can use Next;
- legacy single-route Reviews continue through the existing compatibility path.

Do not silently convert historical single-route Reviews into new selection snapshots.

## Shared UI architecture

Create one focused component, preferably:

```text
src/lib/components/study/SystemStudyChooser.svelte
```

Responsibilities:

- compact System chooser;
- selected-System progressive disclosure;
- default-all Topic/Tag checkbox state;
- hierarchical Topic checkbox behavior;
- curated Tag checkbox group;
- Select all / Clear all interactions;
- question-set controls;
- failed-form restoration;
- submission of repeated selected route values.

It must remain agnostic about Admin authorization, feature flags, database access, and Review creation.

Use it from:

- flag-on `/study`;
- `/admin/study-preview`.

Keep the legacy flag-off Topic UI in `/study` until explicit rollout approval.

## Expected implementation surface

Likely files include:

```text
drizzle/0017_<system-study-selection>.sql
src/lib/server/db/schema.js
src/lib/server/db/study-navigation.ts
src/lib/server/learning/system-study-routes.ts
src/lib/server/learning/start-system-study.ts
src/lib/server/db/learning.js
src/lib/components/study/SystemStudyChooser.svelte
src/routes/study/+page.server.js
src/routes/study/+page.svelte
src/routes/study/[reviewId]/+page.server.js
src/routes/study/[reviewId]/+page.svelte
src/routes/admin/+page.svelte
src/routes/admin/study-preview/+page.server.js
src/routes/admin/study-preview/+page.svelte
```

Also update migration fixture lists and directly relevant tests that instantiate the canonical schema.

Exact module extraction may differ after inspecting current code, but do not duplicate selection/candidate/provenance logic merely to fit this list.

## Implementation checkpoints

### Checkpoint A — multi-select domain semantics

1. Add pure selection-route normalization/validation primitives.
2. Add exact-Topic + Tag union candidate resolution.
3. Preserve deterministic provenance.
4. Prove all-selected equivalence with existing `System → All`.
5. Prove parent/child exact Topic selection can exclude a child independently.

Stop and fix domain semantics before persistence/UI if these tests are not clear.

### Checkpoint B — persistence and Review-chain provenance

1. Add the new migration and schema representation.
2. Preserve historical single-route Reviews without backfill.
3. Update D1 provenance triggers for mutually exclusive legacy-vs-selection navigation provenance.
4. Add first-start selection snapshot persistence atomically with Review creation.
5. Reuse the same snapshot for Expanded and Next.
6. Add migration/DB-integrity tests.

### Checkpoint C — shared System-start workflow

1. Parse repeated selected routes from FormData.
2. Keep ordinary learner feature-flag guard at `/study` route boundary.
3. Share the same flag-independent selection-start workflow with Admin preview.
4. Preserve stable form-error state.

### Checkpoint D — shared systems-first UI

1. Extract one System chooser component.
2. Implement compact System grid.
3. On System selection, default all eligible Topics and Tags checked.
4. Implement hierarchical Topic checkboxes and group controls.
5. Keep Tags distinct and explain cross-Topic inclusion succinctly.
6. Restore exact selection after action failure.
7. Keep Original as question-set default.
8. Verify mobile/overflow/accessibility behavior.

### Checkpoint E — Production Admin preview

1. Add `/admin/study-preview` under inherited Production Admin auth.
2. Load Systems independent of learner rollout flag.
3. Reuse shared chooser and start workflow.
4. Redirect to real learner Review UI.
5. Repoint Admin dashboard shortcut.

### Checkpoint F — end-to-end Review continuation

1. Preserve selection for Original → Expanded.
2. Preserve selection for Next case.
3. Keep legacy single-route Next behavior intact.
4. Keep ordinary flag-off learner System Next blocked.
5. Allow flag-off Production Admin selection-based System Next.
6. Return Admin preview Review navigation to `/admin/study-preview` where appropriate.

### Checkpoint G — integrated validation

Exercise:

- learner flag off → legacy Topic flow;
- learner flag on → systems-first multi-select flow;
- all selected → current System-All-equivalent pool;
- targeted Topic-only narrowing;
- targeted mixed Topic + Tag union;
- zero-selection validation;
- Original and Expanded starts;
- failed start state restoration;
- Next-case continuity;
- Admin flag-off preview;
- non-Admin / Preview Worker boundaries;
- mobile and long-label layout.

## Focused test requirements

At minimum protect these invariants with behavioral/domain tests where practical:

1. selection union deduplicates Cases;
2. exact Topic selections are independently deselectable even in a parent/child tree;
3. Topic match wins over Tag match for effective provenance;
4. selected Tag tie-breaking is deterministic;
5. every selected route must belong to the chosen System;
6. empty selection is rejected;
7. duplicate submitted route values are harmless/deduplicated;
8. all eligible Topic + Tag selections equal current `System → All` candidate IDs/provenance;
9. first selection Review persists immutable selection routes;
10. effective Review provenance remains correct;
11. Expanded continuation reuses the selection snapshot;
12. Next case reuses the same selection snapshot;
13. historical `all` / one-Topic / one-Tag Reviews remain readable and continuable under their existing semantics;
14. migration preserves existing Review snapshots and rows;
15. database provenance guards reject mismatched Review/selection user or System;
16. ordinary flag-off `/study` cannot start System selection;
17. flag-off Production Admin preview can start the same selection workflow;
18. ordinary flag-off learner selection-based System Next remains blocked;
19. flag-off Production Admin selection-based System Next is available;
20. Preview Worker / Preview-only Admin learner Study restriction remains;
21. learner and Admin preview share one System chooser presentation owner;
22. failed action state restores the selected System, exact checkbox set, and question set.

A focused source-level assertion is acceptable for presentation reuse or Admin shortcut wiring when it is the strongest cheap owner. Do not replace stronger behavioral coverage with brittle source assertions.

## Validation contract for the coding agent

Read repository guidance first, especially root `AGENTS.md`, `docs/AGENT_TASK_MAP.md`, `src/routes/admin/AGENTS.md`, `src/lib/server/db/AGENTS.md`, and `docs/ENGINEERING_ARCHITECTURE_GUIDELINES.md`.

Because this PR now includes schema work, inspect current schema/migration contracts before editing and create a new migration; never rewrite historical migrations.

When local execution is available:

```sh
npm run agent:doctor
```

During implementation:

- run focused domain/navigation tests after Checkpoint A;
- run focused migration/schema tests after Checkpoint B;
- use Vite/HMR for iterative Svelte/CSS work;
- run `npm run agent:checks` after coherent batches;
- run all specialized checks it identifies;
- use `npm run validate:fast` at useful checkpoints.

Before handoff, when local execution is available:

```sh
npm run validate:full
```

Do not mutate Production D1/R2 for testing. Do not deploy. Do not claim commands ran when they did not.

If working remotely through GitHub only, review the complete diff and report GitHub CI evidence separately from local execution.

Keep PR #119 Draft for independent review.

## Acceptance criteria

1. System-enabled `/study` initially shows compact Systems rather than every nested form.
2. Selecting a System shows Topic and curated Tag checkboxes.
3. Every eligible Topic and curated Tag starts checked.
4. Learners can uncheck areas to narrow study to weaker Topics/Tags.
5. Checked areas are combined by OR-union and duplicate Cases appear once.
6. Topic hierarchy supports independent child deselection; a checked parent must not invisibly re-include an unchecked child through descendant-route semantics.
7. Curated Tags remain visibly distinct and may intentionally re-include Cases across Topics.
8. Zero selections cannot start a Review.
9. Original questions is the default question set.
10. All-selected behavior is candidate/provenance-equivalent to current `System → All`.
11. The chosen selection persists across Original → Expanded and Next case.
12. Historical single-route System Reviews keep existing behavior.
13. Effective Case/Question/Asset Review snapshot and provenance semantics remain unchanged.
14. Failed starts restore the exact System, checked routes, question set, and error.
15. Mobile/narrow layouts do not horizontally overflow.
16. Flag-off ordinary `/study` remains the legacy Topic flow.
17. Flag-off Production Admin `/admin/study-preview` shows the same multi-select learner UI.
18. Learner and Admin preview share one chooser and one selection-start workflow owner.
19. Non-Admins cannot force the preview bypass.
20. Flag-off Production Admin can exercise selection-based System Next case while ordinary learners cannot.
21. Preview Worker / Preview-only Admin restrictions remain unchanged.
22. A new migration implements selection persistence without rewriting migration history.
23. No production data mutation or deployment occurs during implementation/testing.
24. Production learner System navigation is not enabled unless separately and explicitly approved.

## Explicitly out of scope

- AND/intersection selection semantics;
- saved named study presets;
- persisting checkbox preferences across fresh Study sessions;
- learner performance analytics that automatically select weak Topics;
- automatic weak-area recommendations;
- changing canonical Case Topic classification;
- changing Tag assignment/curation semantics;
- changing question eligibility rules;
- changing Review reveal/rating behavior;
- redesigning the separate Preview Worker subsystem;
- production D1/R2 mutation for testing;
- deployment;
- enabling the production learner feature flag.

## ChatGPT Chat Sol handoff

The implementation prompt for this PR is:

```text
docs/PR119_IMPLEMENTATION_PROMPT.md
```

The coding agent must inspect the actual current PR head and repository state before editing, follow this plan as the durable product/architecture contract, implement the work inside the existing Draft PR #119, validate it, and stop before rollout or merge.