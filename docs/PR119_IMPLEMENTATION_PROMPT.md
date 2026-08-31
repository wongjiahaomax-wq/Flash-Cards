# PR #119 — ChatGPT Chat Sol implementation prompt

You are the implementation agent for the EXISTING Draft PR:

`wongjiahaomax-wq/Flash-Cards`

PR:

`#119 — learner systems-first Study UX with custom multi-select`

This is a continuation of the existing PR.

Do not create a new PR.
Do not create a new feature branch.
Do not restart from `main`.
Do not merge the PR.
Do not mark the PR Ready for Review.
Keep PR #119 Draft at handoff.
Do not deploy anything.
Do not mutate Production D1 or R2.
Do not enable the production learner System-navigation feature flag.

Your task is to implement the complete PR #119 contract, including the intentionally expanded Option-B scope: learners choose a System, all eligible Topics and curated Tags start checked, they may uncheck areas to focus on weaker content, and the resulting study pool is the deduplicated OR-union of the remaining selections.

This is now a UI + domain + persistence task. A new migration is expected.

## First: inspect actual current state

Do not assume this prompt is fresher than the repository.

Before editing:

1. Inspect PR #119:
   - current head SHA;
   - current head branch;
   - intended base;
   - complete diff against base;
   - Draft state;
   - current CI/check state.
2. Continue the existing PR #119 branch exactly as it exists.
3. Confirm current `main` and whether the PR base has moved.
4. Read repository guidance:
   - `AGENTS.md`;
   - `docs/DOCUMENTATION_INDEX.md`;
   - `docs/AGENT_TASK_MAP.md`;
   - `docs/ENGINEERING_ARCHITECTURE_GUIDELINES.md`;
   - `src/routes/admin/AGENTS.md`;
   - `src/lib/server/db/AGENTS.md`;
   - any nearer scoped `AGENTS.md` for files you touch.
5. Read the durable PR product/architecture contract in full:
   - `docs/LEARNER_SYSTEMS_FIRST_STUDY_LAYOUT_PLAN.md`.
6. Inspect directly relevant current implementation/tests. At minimum inspect:
   - `src/routes/study/+page.server.js`;
   - `src/routes/study/+page.svelte`;
   - `src/routes/study/[reviewId]/+page.server.js`;
   - `src/routes/study/[reviewId]/+page.svelte`;
   - `src/routes/admin/+layout.server.js`;
   - `src/routes/admin/+page.svelte`;
   - `src/lib/server/preview-auth.js`;
   - `src/lib/server/db/schema.js`;
   - latest migrations and migration contract tests;
   - `drizzle/0015_contextual_system_topic_tag_navigation.sql`;
   - `src/lib/server/db/study-navigation.ts`;
   - `src/lib/server/learning/system-study-routes.ts`;
   - `src/lib/server/learning/system-review-navigation.ts`;
   - current `startSystemReview(...)`, `continueReviewWithExpandedLearning(...)`, and Review creation/read paths in `src/lib/server/db/learning.js`;
   - `test/contextual-system-topic-tag-navigation.test.js`;
   - `test/system-review-navigation.test.js`;
   - any directly relevant migration/Admin/auth/UI tests found by repository search.

If implementation has moved, follow current executable behavior and the durable plan's invariants. Do not force stale filenames merely because they appear here.

## Goal

Implement this learner flow:

```text
Study
→ choose System
→ all eligible Topics + curated Tags checked by default
→ optionally uncheck areas to narrow study
→ choose Original / Expanded
→ Start review
```

Checked study areas are combined with **OR/union semantics**.

A Case matching multiple checked areas appears once.

The same selected set must persist across:

- the initial Review;
- Original → Expanded continuation;
- Next case.

Also implement the Production Admin **Preview learner study** path so an authenticated Production Admin can use this exact prospective learner flow end-to-end before the ordinary learner rollout flag is enabled.

## Non-negotiable product semantics

### Union, not intersection

For selected areas A, B and C:

```text
eligible = A OR B OR C
```

Never implement AND/intersection semantics.

### Default = everything currently eligible in the System

On fresh System selection:

- all eligible Topics are checked;
- all eligible curated Tags are checked;
- Original questions is selected.

This fresh all-selected state must produce the same Case IDs and effective Case provenance as the current `System → All` resolver.

### Topic selections are exact for custom-selection persistence

This is a critical semantic distinction.

The historical single Topic navigation route is descendant-inclusive. Do NOT simply treat each custom-selection checkbox as that same descendant-inclusive route, because then a checked parent would invisibly re-include an unchecked child.

For the new multi-select model:

- a stored Topic selection is an exact canonical Topic ID;
- Cases match that Topic selection by exact effective/canonical Study Topic;
- UI hierarchy may let a parent checkbox toggle its whole subtree;
- child Topics must remain independently deselectable;
- parent checked/indeterminate state must behave like an accessible tree selection.

Keep existing legacy single-route Topic semantics intact for historical Reviews/compatibility paths.

### Tags remain cross-cutting

A selected curated Tag can include Cases whose canonical Topic is not selected.

That is intentional union behavior.

Topics and Tags must remain visibly/semantically distinct. Learner copy can say, succinctly, that curated Tags may add relevant Cases across Topics.

### Deterministic candidate provenance

The learner-selected set is separate from the effective provenance of the Case that was picked.

When the same Case matches more than one selected area:

1. selected exact Topic provenance wins over selected Tag provenance;
2. if only multiple selected Tags match, use canonical System curated-Tag ordering for deterministic provenance;
3. request checkbox order must not alter Case provenance.

Do not change question/asset snapshot semantics, Case classification, primary Topic, Tag assignment, or question eligibility.

## Study-selection persistence contract

The selected set must be durable through the Review chain. Do not encode it as a comma-separated string, JSON blob in an unrelated field, or pretend a custom selection is `navigation_route_type='all'`.

Prefer the normalized model described in the plan, conceptually:

```text
study_selections
- id
- user_id
- system_concept_id
- created_at

study_selection_routes
- study_selection_id
- route_type ('topic' | 'tag')
- route_id
- PK (study_selection_id, route_type, route_id)

reviews
- nullable study_selection_id
```

Exact names may change only if current schema conventions strongly justify an equivalent clearer model.

Properties:

- one selection snapshot belongs to one user + one System;
- it is immutable after creation;
- first Review, Expanded continuation and Next-case Reviews may all reference the same snapshot;
- starting a fresh Study from `/study` creates a new selection snapshot;
- this PR does not create named/saved learner presets or persistent UI preferences across fresh Study sessions.

### Legacy compatibility

Historical System Reviews already use:

- `navigation_route_type`;
- `navigation_route_id`.

Preserve them.

Do not backfill historical Reviews merely to fit the new model.

The new database invariant should allow exactly one System-navigation provenance representation:

- legacy single-route navigation columns, with no selection snapshot; OR
- new `study_selection_id`, with legacy selected-navigation columns null.

Effective Case provenance columns remain authoritative and must still be validated.

### Migration requirement

Do not rewrite migration `0015` or any historical migration.

Add a new migration at the next actual migration number. At prompt-writing time the current sequence ends at 0016, so this is expected to be `0017_...sql`, but verify before editing.

Migration work must:

- add the selection tables/columns;
- preserve all existing Reviews;
- update/recreate the existing Review provenance triggers as necessary;
- enforce same-user/same-System consistency between Review and referenced selection;
- retain existing effective route/tag/System provenance validation;
- preserve current canonical-schema-only runtime expectations.

Inspect migration tests and fixture migration arrays; update every directly relevant canonical-schema fixture.

### Atomicity

Do not leave orphan selection snapshots if Review creation fails.

For a first selection-based Review, candidate resolution/question selection must succeed before committing the selection snapshot and Review writes. Commit the selection, selection routes, Review, Review questions and Review assets within one coherent transactional/batch business operation.

Next/Expanded Reviews reuse the existing immutable snapshot.

## Candidate resolution implementation

Add a focused selection resolver rather than changing historical single-route behavior in place.

A useful conceptual type is:

```ts
type SystemStudySelectionRoute =
  | { routeType: 'topic'; routeId: string }
  | { routeType: 'tag'; routeId: string };
```

Normalize submitted routes:

- trim IDs;
- reject malformed values;
- deduplicate duplicates;
- require at least one selection;
- validate every selected Topic belongs to the System;
- validate every selected Tag is curated for the System;
- canonicalize ordering independently of request order.

Selection candidate resolver:

- exact selected Topic IDs → exact canonical Topic matches;
- selected Tags → existing curated Tag matching;
- OR-union by Case ID;
- Topic match takes precedence;
- selected Tag tie-break is canonical/deterministic.

Add a high-value equivalence test proving:

> all eligible exact Topics + all eligible curated Tags selected == existing System All Case IDs and effective provenance.

Also explicitly prove:

> a child Topic can be deselected while its parent remains partially selected, and the parent does not re-include the child through descendant routing.

## Review-chain behavior

### First Review

Create the selection snapshot and first Review together.

Preserve existing:

- last-completed-case avoidance;
- question-pool validation;
- Case selection behavior;
- Review questions/assets snapshots;
- effective Topic/Tag provenance.

### Original → Expanded

Expanded continuation must retain the same `studySelectionId`.

It must remain the same Case and preserve existing continuation behavior.

### Next case

For a selection-based Review:

- load the immutable selection routes;
- revalidate them against current System navigation state;
- resolve the same OR-union pool;
- choose the next Case using existing selection/last-case behavior;
- create the next Review referencing the same `studySelectionId`.

Do not silently add new Topics/Tags that were created after the selection snapshot.

Do not silently drop a selected route that has become invalid. Fail safely with a useful message directing the learner back to Study to choose again.

Legacy Reviews must keep the existing single-route Next path.

## Shared server action workflow

Learner Study and Admin preview must not duplicate FormData parsing/validation/start logic.

Extract the smallest focused flag-independent workflow, preferably TypeScript under `src/lib/server/learning/`, for example:

```text
src/lib/server/learning/start-system-study.ts
```

It should:

- parse `systemId`;
- use `FormData.getAll(...)` for repeated selected route values;
- parse `topic:<id>` and `tag:<id>`;
- parse/validate question pool mode;
- invoke the canonical selection Review start operation;
- return/map stable known failures with enough form state to restore the UI.

Suggested failure payload includes:

- `message`;
- `systemId`;
- selected route values/IDs;
- `questionPoolMode`.

The shared workflow must NOT:

- authorize Admin users;
- inspect `SYSTEM_STUDY_NAVIGATION_ENABLED`;
- know whether it was called from learner or Admin UI.

Route boundaries own authorization/rollout.

## Learner rollout boundary

Ordinary `/study` must continue to honor `SYSTEM_STUDY_NAVIGATION_ENABLED`.

When flag is off:

- `/study` remains the legacy Topic flow;
- System selection start remains unavailable to ordinary learner entry;
- ordinary learner System Next behavior remains gated.

Do not enable the flag in Wrangler/config/production as part of this implementation.

Do not add `/study?preview=true` or any equivalent public bypass.

## Shared systems-first UI

Create one focused chooser component, preferably:

```text
src/lib/components/study/SystemStudyChooser.svelte
```

Use it from:

- flag-on `/study`;
- `/admin/study-preview`.

Do not maintain two copies.

### Initial System screen

Show compact System choices only:

- System name;
- total eligible unique Case count;
- obvious open/select affordance.

Do not render all Topic/Tag/question controls for every System simultaneously.

### Selected-System screen

Focus on one System with an obvious **Change System** control.

Preferred hierarchy:

```text
Cardiovascular
42 cases available

Choose what to include

Topics                     Select all / Clear all
☑ Arrhythmias
☑ Heart failure
☑ Ischaemic heart disease

Curated Tags                Select all / Clear all
☑ ECG interpretation
☑ Chest pain

Question set
● Original questions
○ Expanded Learning

[ Start review → ]
```

Fresh System selection:

- all eligible Topic checkboxes checked;
- all eligible curated Tag checkboxes checked;
- Original checked.

Switching to a different System resets to that System's fresh defaults unless restoring a failed submission for that System.

### Topic hierarchy

Use the current breadcrumb/hierarchy data and add a focused `parentId`-style read-model field if needed.

Parent Topic checkbox behavior:

- clicking a parent toggles that Topic plus descendants;
- partial descendant selection produces indeterminate parent state;
- individual child deselection remains possible;
- submitted exact Topic IDs represent the resulting atomic selections, not a descendant-inclusive parent route token.

Keep this accessible with native checkbox semantics and programmatic indeterminate state.

### Tags

Tags are a separate section with distinct labeling/styling.

They remain flat unless current product data provides a real Tag hierarchy (do not invent one).

### Zero selection

If the learner clears everything:

- Start should be disabled where practical;
- server must independently reject zero selected routes.

Client validation is not a security/domain substitute.

### Selection summary/count

Do not sum route-local Case counts and present that as a unique pool count because overlaps exist.

When all routes are selected, showing the System's known all-case count is correct.

After narrowing, an exact live unique count is optional only if it can be implemented cheaply without exposing broad Case data or adding a chatty request loop. Otherwise show a truthful selected-area summary such as `3 study areas selected`.

### Form failure restoration

After a failed start:

- reopen the submitted System;
- restore the exact checked Topic/Tag set;
- restore Original/Expanded selection;
- show the error only in that selected System configuration.

### Responsive/accessibility

- compact desktop System grid is acceptable;
- selected configuration should scan naturally top-to-bottom;
- mobile should be single-column or equivalent;
- long labels/breadcrumbs wrap;
- no horizontal overflow;
- checkbox rows remain large touch targets;
- group controls are keyboard accessible;
- do not use a modal for the main selection flow.

## Production Admin learner preview

Add a dedicated route inside the existing Production Admin authorization tree:

```text
/admin/study-preview
```

Expected behavior:

- Admin dashboard shortcut points there;
- load `listStudySystems(...)` regardless of learner rollout flag;
- reuse the shared chooser;
- reuse the shared selection-start workflow;
- successful starts redirect to the real `/study/[reviewId]` Review UI;
- no copied Admin Review page;
- small `Admin learner preview` framing / `Back to Admin` is fine.

The inherited `/admin/+layout.server.js` authorization boundary remains primary.

Preserve:

- Production Admin role requirement;
- Preview Worker rejection;
- Preview-only Admin learner Study restriction;
- Production/Preview data ownership boundaries.

Do not broaden `preview_admin` authority.

## Admin preview and Next case while flag is off

An Admin-started selection-based System Review must be testable end-to-end before learner rollout.

In `/study/[reviewId]`:

- ordinary learner flag-off System Next stays unavailable;
- authenticated Production Admin may use System Next while flag is off;
- use canonical `isProductionAdmin(...)`;
- the same effective permission predicate must drive both UI availability and the `next` action;
- flag-off Admin preview Review should link back to `/admin/study-preview` rather than the legacy Topic landing page.

Existing Preview Worker / Preview-only Admin learner access guards execute before this exception can matter.

## Expected implementation surface

Likely changes include:

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

This list is guidance, not permission for blind edits. Use current ownership boundaries and avoid unrelated cleanup.

## Implementation sequence

### Checkpoint A — pure selection semantics

Implement/test first:

- route normalization;
- exact Topic candidate matching;
- curated Tag candidate matching;
- union deduplication;
- Topic-over-Tag precedence;
- deterministic Tag precedence;
- all-selected equivalence to current System All;
- parent/child independent deselection semantics.

Do not move to persistence if these semantics are ambiguous or failing.

### Checkpoint B — schema + immutable selection snapshots

- add new migration;
- update schema;
- update provenance triggers without weakening old invariants;
- add selection persistence/read helpers;
- add migration/DB integrity tests;
- preserve historical rows unchanged.

### Checkpoint C — Review creation/continuation

- selection-based first Review;
- atomic selection + Review write;
- Expanded reuses selection;
- Next reuses selection;
- legacy single-route Reviews unchanged.

### Checkpoint D — shared request workflow

- repeated FormData selections;
- stable validation/error state;
- learner flag gate remains outside helper;
- Admin route can reuse helper without flag gate.

### Checkpoint E — shared UI

- compact System chooser;
- selected-System screen;
- default-all checkboxes;
- hierarchical Topic behavior;
- Tag section;
- question set;
- failed-form restoration;
- mobile/accessibility.

### Checkpoint F — Admin preview

- add dedicated Admin route;
- update shortcut;
- reuse same component/workflow;
- real Review page;
- Admin-only flag-off Next/return behavior.

### Checkpoint G — integrated validation

Exercise and validate the complete matrix before handoff.

## Required test evidence

Prefer behavioral/domain tests over source assertions for logic.

At minimum protect:

1. OR-union selection;
2. Case deduplication;
3. exact Topic semantics;
4. child deselection under a partially selected parent;
5. Topic precedence over Tag;
6. deterministic Tag precedence;
7. cross-System Topic rejection;
8. non-curated Tag rejection;
9. empty selection rejection;
10. duplicate form selections dedupe safely;
11. all-selected == current System All IDs + effective provenance;
12. first Review persists immutable selection;
13. Review/selection user and System mismatch rejected by DB/domain contract;
14. effective Review provenance unchanged;
15. Expanded preserves selection ID;
16. Next preserves selection ID/routes;
17. invalidated stored route fails safely rather than silently changing selection;
18. historical all/Topic/Tag Reviews remain readable/continuable;
19. migration preserves existing Review rows/snapshots;
20. flag-off learner `/study` remains legacy Topic flow;
21. flag-off learner cannot use System selection start;
22. flag-on learner gets systems-first multi-select UI;
23. flag-off Production Admin preview gets the same multi-select UI;
24. non-Admin cannot access Admin preview;
25. Preview Worker / Preview-only Admin stays blocked;
26. flag-off ordinary learner System Next blocked;
27. flag-off Production Admin System Next allowed;
28. learner/Admin preview share one chooser presentation owner;
29. learner/Admin start share one flag-independent workflow owner;
30. failed action restores exact checkbox/question state.

A small source-level test is acceptable for shared-component wiring or dashboard href if it is the strongest cheap owner. Do not replace stronger domain behavior tests with brittle source scanning.

## Manual UX matrix

When browser/runtime capability exists, test at least:

### Learner flag on

- open Study;
- choose a System with nested Topics and curated Tags;
- confirm all Topics/Tags checked;
- uncheck one child Topic while parent remains partially selected;
- confirm child remains unchecked;
- uncheck several stronger Topics leaving weaker ones;
- leave one cross-cutting Tag selected and understand it may re-add Cases;
- Clear all → Start unavailable;
- select one Topic only → start Original;
- mixed Topic + Tag → start Expanded;
- force/encounter a validation failure and confirm exact state restoration;
- complete Review and use Next;
- confirm selection remains the same.

### Learner flag off

- `/study` still shows legacy Topic flow;
- no public bypass to multi-select.

### Production Admin flag off

- dashboard **Preview learner study** opens `/admin/study-preview`;
- same chooser appears;
- start targeted multi-select Review;
- real learner Review UI appears;
- reveal/rate/Expanded/Next work where applicable;
- back navigation returns to Admin learner preview.

### Responsive

- narrow viewport;
- long Topic names;
- long breadcrumbs;
- many checkboxes;
- no horizontal overflow;
- controls remain usable by keyboard/touch.

## Validation workflow

If you have a usable local checkout and command execution, start with:

```sh
npm run agent:doctor
```

Use focused tests after Checkpoint A and B rather than waiting for broad CI.

Because schema changes are in scope, run the current repository migration/schema checks required by `agent:checks`.

During implementation:

```sh
npm run agent:checks
```

Run the required/recommended focused/specialized checks it reports.

Use:

```sh
npm run validate:fast
```

at coherent checkpoints, not after every visual edit.

Use Vite/HMR for presentation iteration where available.

Before final handoff, when local execution is available:

```sh
npm run validate:full
```

Do not claim a command passed unless you actually ran it.

If operating remotely through GitHub without usable local execution:

- make coherent changes rather than speculative push/CI loops;
- inspect the complete PR diff before handoff;
- inspect GitHub CI/check evidence;
- distinguish GitHub CI from locally executed validation;
- state explicitly which checks could not be run.

## Acceptance criteria

Do not hand off as complete unless these hold or you report a concrete blocker:

1. System-enabled Study starts with compact System choices.
2. Selecting a System reveals Topic + curated Tag checkboxes.
3. Every eligible Topic and curated Tag is checked by default.
4. Learners can uncheck areas to focus on weaker content.
5. Pool semantics are OR-union with deduplication.
6. Topic hierarchy allows true independent child exclusion.
7. Tags remain distinct and cross-cutting.
8. Zero selections cannot start.
9. Original is the fresh question-set default.
10. All-selected candidate IDs/provenance equal current System All.
11. Exact selected set persists through Expanded and Next.
12. Historical single-route Reviews remain correct.
13. Effective Case/question/asset provenance and snapshots are unchanged.
14. Failed starts restore exact selection state.
15. Mobile/narrow UI does not horizontally overflow.
16. Flag-off ordinary learner Study stays legacy Topic flow.
17. Flag-off Production Admin gets the same prospective multi-select UI under `/admin/study-preview`.
18. Learner/Admin share one chooser and one selection-start workflow owner.
19. Admin preview cannot be forced by non-Admin/public query state.
20. Flag-off Admin can exercise selection-based Next while ordinary learner cannot.
21. Preview Worker / Preview-only Admin restrictions remain unchanged.
22. New migration is additive and historical migration files remain untouched.
23. No Production D1/R2 mutation occurred.
24. No deployment occurred.
25. Production learner System navigation flag remains unchanged.

## Explicitly out of scope

Do not add:

- AND/intersection semantics;
- saved named study presets;
- persistence of checkbox preferences across fresh Study sessions;
- automatic weak-Topic analytics/recommendations;
- taxonomy reclassification;
- new Tag assignment semantics;
- unrelated Admin taxonomy UX;
- unrelated refactors;
- Preview Worker redesign/decommissioning;
- production rollout/deployment.

## Handoff

When implementation is complete:

1. keep PR #119 Draft;
2. report final head SHA;
3. summarize the implemented architecture and UX;
4. list migration/schema changes explicitly;
5. list focused tests actually run and results;
6. list `agent:checks`, `validate:fast`, `validate:full`, or other repository validation actually run and results;
7. separately report GitHub CI/check evidence;
8. report any validation that could not be executed and why;
9. review and summarize the complete PR diff for scope/invariant fit;
10. identify remaining user-testing items, especially hierarchy ergonomics, Tag cross-inclusion clarity, and mobile layout;
11. stop.

Do not merge, mark Ready for Review, enable the learner rollout flag, deploy, or begin unrelated follow-up work.