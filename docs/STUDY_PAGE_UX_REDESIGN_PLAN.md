# Study Page UX Redesign Plan

_Status: implementation plan for a single Draft PR. Implementation is intentionally split into sequential, reviewable tranches on this same branch/PR. This document does not itself change learner runtime semantics, Production data, migrations, or deployment._

_Date: 6 September 2026._

## 1. Purpose

The learner `/study` surface has accumulated several distinct responsibilities as the learner runtime has matured. Each capability is individually valid, but the combined page is now visually and cognitively dense.

The page currently mixes:

- resuming an active Review;
- resuming an existing browser Study run;
- starting a new Study run;
- multi-System selection;
- optional per-System Topic/curated-Tag narrowing;
- Scheduled vs Free Study selection;
- 5 / 10 / 20 / All run-size selection;
- server-authoritative combined eligible-Case counting;
- Expanded Learning preference management;
- learner FSRS/progress statistics;
- rating distribution and recent history;
- Reset Progress;
- Fresh FSRS Start;
- deletion of learner study data;
- account/status/error actions.

The redesign goal is to make `/study` primarily answer:

> What do you want to study now?

This is an information-architecture and interaction redesign. It must preserve the already-reviewed study runtime contracts unless a separate product/technical plan explicitly changes them.

## 2. Authority and implementation rule

Before implementing any tranche, re-read current `main` and the relevant authority chain, especially:

- `docs/DOCUMENTATION_INDEX.md`;
- `docs/LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md`;
- `docs/LEARNER_FSRS_RUN_SIZE_PRODUCT_AMENDMENT.md`;
- `docs/MULTI_SYSTEM_STUDY_PLAN.md`;
- `docs/MULTI_SYSTEM_RUNTIME_V2_IMPLEMENTATION.md`;
- `docs/MULTI_SYSTEM_UX_IMPLEMENTATION.md`;
- `docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`;
- current `src/routes/study/**`;
- `src/lib/components/LearnerFsrsProgress.svelte`;
- current learner study-run storage/open/completion code;
- current learner Progress, preference, Reset/Fresh and study-data-deletion owners;
- current specialized learner/FSRS/Multi-System regressions and CI.

Current executable code, committed schema/migrations, validators and tests outrank stale historical wording.

## 3. Single-PR tranche model

All coding for this redesign remains in **one Draft PR**.

Do not open one PR per tranche.

Use this workflow:

```text
planning document committed
→ Tranche 1 implementation + focused validation + commit
→ Tranche 2 implementation + focused validation + commit
→ Tranche 3 implementation + focused validation + commit
→ Tranche 4 implementation + focused validation + commit
→ final integrated regression/accessibility review
→ documentation reconciliation
→ mark the same PR Ready for Review
```

Each tranche must leave the branch internally coherent and testable. Do not partially implement a later tranche merely because adjacent code is already open.

The tranche boundaries are coding/review boundaries, not separate releases.

## 4. Product hierarchy

Target learner priority:

```text
1. Continue studying
2. Start a new Study run
3. View progress
4. Change Study settings
5. Manage/reset Study data
```

The common no-active-run path should read approximately as:

```text
Select Systems
→ optionally customize selected Systems
→ choose Scheduled or Free
→ choose 5 / 10 / 20 / All
→ review available Case count
→ Start
```

Secondary analytics, preferences and destructive controls must not compete visually with this path.

## 5. Core UX principles

### 5.1 Primary action first

When an active Review or resumable browser run exists, continuing it is the strongest learner action.

Otherwise the new-run launcher dominates.

### 5.2 Progressive disclosure

Advanced scope configuration appears only when explicitly requested:

```text
Select System
→ whole-System scope by default
→ Customize only when needed
```

### 5.3 Keep runtime sophistication behind simple controls

The backend may require canonical scope descriptors, exact-Topic semantics, deduplication, attribution, signed proofs and Active Review boundaries. Learner copy should not expose those concepts unless they are necessary to make a decision.

### 5.4 Contextual help over permanent explanation

Prefer short state-specific help rather than simultaneously showing detailed descriptions for every possible choice.

### 5.5 Dangerous actions belong in a secondary danger zone

Boundary-changing/destructive actions remain available and safe but must not visually resemble normal Study controls.

### 5.6 Accessibility is part of the redesign

Progressive disclosure must preserve keyboard access, semantic labels, focus behavior, visible state, indeterminate Topic hierarchy behavior and screen-reader usability.

### 5.7 Route ownership should match information ownership

Decluttering must not be purely visual. If detailed information moves to a secondary route, the detailed server query should move with it unless the launcher genuinely needs that data.

## 6. Target `/study` information architecture

A no-active-run desktop target may approximate:

```text
Study

Start a study session

What do you want to study?

☑ Cardiology              128 Cases        Customize
☐ Respiratory              94 Cases
☑ Endocrinology            76 Cases        Customize
☐ Dermatology              63 Cases

Cardiology + Endocrinology
142 unique eligible Cases

Study mode
[ Scheduled ] [ Free ]

Session size
[ 5 ] [ 10 ] [ 20 ] [ All ]

                                  [ Start Study ]

--------------------------------------------------
Progress       24 due · 68% coverage       View ›
Study settings Expanded Learning: Off      Manage ›
```

This is an information-architecture target, not a locked pixel specification.

## 7. Continue-state ownership and acceptance matrix

The redesign must make current ownership/resume behavior explicit rather than allowing visual changes to alter it accidentally.

### 7.1 Acceptance-state matrix

| Server/browser state | Primary surface | New-run launcher | Required behavior |
| --- | --- | --- | --- |
| Active Review exists | Resume Active Review | Hidden/unavailable until the Active Review is resumed or explicitly discarded | Active Review remains authoritative. Do not plan a replacement run behind an unresolved Active Review. Existing discard behavior remains explicit. |
| No Active Review; resumable browser run exists | Continue browser run | Available only as a visually secondary `Start a different run` path | Continuing remains primary. Starting a different run may replace browser-local run state according to existing behavior, but must not invent learner-progress reset/abandonment semantics. |
| No Active Review; no resumable browser run | Start a study session | Primary and available | Normal chooser behavior. |
| Study-data deletion in progress | Continue deletion | Hidden/unavailable | Study stays blocked. Do not load/enable study planning merely because the launcher was visually reorganized. |

Status/error/recovery states must still surface the existing actionable message without changing the underlying ownership rules.

### 7.2 Active Review

Target shape:

```text
Continue studying

Scheduled Study
Answers not yet revealed

[ Resume Review ]
```

Only information useful for the immediate decision should be shown by default.

### 7.3 Resumable browser run

Target shape:

```text
Continue your session

Scheduled Study · 4 of 10 completed

[ Continue ]
```

Retain necessary run state and existing recovery/clear behavior. Stale-run invalidation, Active Review precedence and browser-run ownership must remain unchanged.

## 8. System selector redesign

### 8.1 Compact default rows

Replace large always-prominent System cards with a denser selectable representation.

Example:

```text
☐ Cardiology                         128 Cases
☐ Respiratory                         94 Cases
```

Selected whole-System:

```text
☑ Cardiology                         128 Cases
                                      Customize
```

Selected customized:

```text
☑ Cardiology
   Arrhythmias + ECG                  43 Cases
                                      Edit
```

Exact visual form may be list rows, compact cards or another accessible pattern, but the default learner scan should remain compact.

### 8.2 Canonical System scope state machine

The browser UI must model each System with an explicit **applied scope state**. Hidden checkbox state must never determine submission implicitly.

Required applied states:

```text
UNSELECTED
SELECTED_ALL
SELECTED_ROUTES
```

Submission contract:

```text
UNSELECTED
→ submit nothing for this System

SELECTED_ALL
→ submit exactly canonical whole-System selection
→ { systemId, mode: 'all' }
→ submit no Topic/Tag route inputs for this System

SELECTED_ROUTES
→ submit exactly the applied explicit Topic/curated-Tag routes
→ { systemId, mode: 'routes', routes: [...] }
```

The implementation may use different internal names, but this three-state distinction must remain explicit.

### 8.3 Selection/deselection behavior

Required behavior:

- selecting an unselected System enters `SELECTED_ALL`;
- deselecting a System enters `UNSELECTED` and clears its applied customization for the current launcher state;
- reselecting that System therefore returns to `SELECTED_ALL`, not a hidden stale narrowed scope;
- while `UNSELECTED`, no Topic/Tag values for that System may be submitted;
- while `SELECTED_ALL`, no hidden/stale Topic/Tag values for that System may be submitted.

This deliberately favors predictable canonical state over preserving hidden customization after deselection.

### 8.4 Customization draft vs applied state

Opening `Customize` / `Edit` creates an editable **draft**. The draft must not alter the submitted scope until the learner applies it.

Required behavior:

**Open customization from `SELECTED_ALL`:**

- draft starts in `Whole System` mode;
- Topic/Tag route controls become relevant only if the learner explicitly switches the draft to `Specific Topics / Tags`;
- reopening without applying must not silently convert the System to routes mode.

**Open customization from `SELECTED_ROUTES`:**

- draft is initialized from the currently applied route set;
- reopening shows exactly the applied customization, not stale abandoned edits.

**Cancel / close without Apply:**

- discard all draft edits;
- leave applied System state unchanged;
- leave submitted scope unchanged.

**Apply `Whole System`:**

- commit `SELECTED_ALL`;
- clear/ignore previous applied route selections;
- ensure route controls are non-submitting;
- row summary returns to whole-System presentation.

**Apply `Specific Topics / Tags`:**

- require at least one valid explicit contributing route according to current server/client validation rules;
- commit `SELECTED_ROUTES` with the exact chosen routes;
- row summary reflects the applied narrowed scope.

The server remains authoritative and must still reject invalid or stale routes.

### 8.5 Whole-System vs “Select all” must remain distinct

Do not use a generic `Select all` action that can be confused with canonical whole-System selection.

The customization surface should instead make scope mode explicit:

```text
Scope
(•) Whole System
( ) Specific Topics / Tags
```

When `Specific Topics / Tags` is selected, group actions may be offered with explicit names such as:

```text
Select all Topics
Clear Topics
Select all Tags
Clear Tags
```

Selecting every currently visible Topic/Tag route is still **routes mode**. It must never be rewritten by the browser as canonical `mode: 'all'` merely because every visible route happens to be checked.

Only the explicit `Whole System` choice restores canonical `mode: 'all'`.

### 8.6 Preserve Topic hierarchy semantics

The redesign must preserve current semantics:

- exact-Topic routes only where exact `caseCount > 0`;
- structural zero-exact-Case Topics remain UI controls rather than submitted routes;
- parent toggles affect contributing descendant exact-Topic routes;
- partially selected descendants produce indeterminate parent state;
- hierarchy ordering/breadcrumb depth remains correct;
- curated Tags remain independent routes.

## 9. Study-mode redesign

Present Scheduled vs Free as one concise decision rather than two permanently explanatory blocks.

Target:

```text
Study mode

[ Scheduled ] [ Free ]

Scheduled uses your spaced-repetition queue.  ⓘ
```

When Free is selected, contextual help should describe Free Study instead.

Exact copy can be refined but must not misrepresent current runtime behavior.

## 10. Run-size redesign

Preserve:

```text
5 / 10 / 20 / All
```

with default `10`.

Target:

```text
Session size

[ 5 ] [ 10 ] [ 20 ] [ All ]
```

Detailed repeat-slot semantics do not need permanent primary-page space. They may be available through concise help where useful.

## 11. Combined eligible Case count

Preserve the server-authoritative count path and canonical union/deduplication semantics.

Do not calculate the combined count by summing per-System counts.

Default presentation should be concise:

```text
142 unique Cases available
```

State examples:

```text
Calculating…
No Cases match this selection.
Unable to calculate available Cases. Try again.
```

The count remains informational; the planner/server resolver remains authoritative.

## 12. Start CTA

The form should culminate in one obvious action.

Example:

```text
[ Start 10-Case session ]
```

or:

```text
[ Start Study ]
```

The CTA must be disabled or safely rejected for invalid/empty scope according to existing server-side rules. Client state must not become an authorization or validity authority.

## 13. Progress presentation and data-loading ownership

The primary `/study` page should show only enough progress information to orient the learner.

Target summary:

```text
Your progress

24 Due now        68% SRS coverage

[ View progress ]
```

Detailed information can move to `/study/progress`, including:

- Due / Not due;
- coverage;
- Scheduled activity;
- Free Study activity;
- rating distribution;
- per-System statistics;
- recent Scheduled history;
- detailed-history retention information.

### 13.1 Loading requirement

If detailed Progress is moved to `/study/progress`, the main `/study` loader must not continue eagerly fetching the complete detailed Progress/history payload merely to render the compact summary.

Current Progress calculations/semantics remain authoritative, but route ownership should become:

```text
/study
→ load only launcher-required Progress summary data
→ e.g. Due now + SRS coverage if those remain in the compact summary

/study/progress
→ load the full detailed learner Progress/history model
```

If the current `getLearnerFsrsProgress(...)` query computes/fetches substantially more than the launcher needs, introduce/reuse a focused summary query rather than calling the full query and discarding most of its result.

Do not duplicate calculation semantics. Shared lower-level calculation helpers are preferable if needed.

## 14. Study settings and loading ownership

Expanded Learning is a persistent preference, not normally a per-run decision.

The main Study page should reduce it to a compact status/manage affordance:

```text
Study settings
Expanded Learning: Off                 Manage ›
```

A secondary `/study/settings` surface may own the full preference control.

The launcher may load the minimal preference value required to display this summary, but it should not eagerly load unrelated detailed settings simply because the previous combined page did so.

Preserve the existing rule that the preference is applied when the next Scheduled/Free Active Review is frozen.

## 15. Manage Study data / danger zone and loading ownership

Reset Progress, Fresh FSRS Start and deletion of learner study data should be visually separated from ordinary Study initiation.

Preferred hierarchy:

```text
Study settings
→ Manage study data
→ Danger zone
```

A route such as `/study/settings/data` is acceptable if it simplifies the main surface and preserves server actions/safety.

The redesign must not weaken:

- confirmation requirements;
- generation/review-sequence boundary changes;
- stale browser-run invalidation;
- active-Review invalidation/deletion behavior;
- staged deletion behavior;
- deletion-in-progress blocking behavior;
- final empty-state verification.

Deletion status needed to enforce the Study fence remains launcher-critical and must still be loaded before presenting study actions. Detailed Reset/Fresh/history information does not need to be eagerly loaded on `/study` merely because destructive actions used to live there.

## 16. Frozen runtime contracts

Unless separately reviewed, this PR must preserve all of the following:

- multi-System runs;
- whole-System `mode: 'all'` semantics;
- explicit Topic/curated-Tag routes for narrowed Systems;
- exact-Topic hierarchy behavior;
- structural parent behavior;
- canonical server-side scope validation;
- global candidate union/deduplication;
- deterministic concrete System attribution;
- server-authoritative eligible Case counting;
- Scheduled FSRS ordering/state semantics;
- Free Study non-Scheduled-state semantics;
- 5 / 10 / 20 / All distinct-Case targets;
- default run size 10;
- Scheduled short-term repeat semantics;
- descriptor/proof versions and signed run boundaries;
- Active Review v2 attribution/scope guards;
- browser-run ownership and stale-run invalidation;
- plan → first Review immediate opening;
- completion → next Review continuous navigation;
- cross-System next-open behavior;
- Reset/Fresh concurrency safety;
- staged learner study-data deletion safety;
- deletion-in-progress Study fence;
- server authority over all submitted scope/routes.

UI-state invariant:

> Only the explicit applied System state may determine submitted scope. Hidden, cancelled, stale, or disabled Topic/Tag controls must never leak into the request.

No schema migration is expected for this UX redesign. If implementation discovers that a migration or runtime-contract change is required, stop that part of the tranche and amend/re-review the plan rather than silently expanding scope.

## 17. Implementation tranches — all within this PR

### Tranche 1 — Page hierarchy, resume-first ownership and declutter

Goal: establish the new information hierarchy without changing multi-System selector semantics yet.

Implement:

- encode the acceptance-state matrix in the learner surface;
- make Active Review/current browser run the dominant applicable continue state;
- hide the new-run launcher during Active Review and deletion-in-progress states;
- keep `Start a different run` secondary when only a resumable browser run exists;
- simplify the page header/intro where possible;
- establish a clearly bounded `Start a study session` area;
- reduce Expanded Learning on the primary page to compact settings/status presentation;
- reduce learner Progress on the primary page to a compact summary/entry point;
- move or progressively hide study-data management so it no longer competes with normal Study initiation;
- remove learner-visible backend implementation jargon where not necessary.

Validation:

- Active Review remains resumable/discardable under current rules;
- no replacement run is planned behind an unresolved Active Review;
- browser run remains resumable/clearable under current rules;
- a different run remains possible only through the intended secondary path when no Active Review exists;
- deletion-in-progress still blocks Study and exposes only deletion continuation/recovery behavior;
- Expanded Learning preference still persists/applies correctly;
- Reset/Fresh/delete actions remain reachable and protected;
- existing runtime tests continue to pass.

Commit this tranche separately before proceeding.

### Tranche 2 — Compact Systems and explicit customization state machine

Goal: make whole-System selection visually simple while preserving all current scope semantics.

Implement:

- compact System selection rows/cards;
- explicit `UNSELECTED` / `SELECTED_ALL` / `SELECTED_ROUTES` applied-state behavior;
- whole-System as the default on selection/reselection;
- `Customize` / `Edit` only for selected Systems;
- customization draft state separate from applied state;
- deterministic Cancel / Apply / deselect / reselect / reopen behavior from section 8;
- explicit `Whole System` vs `Specific Topics / Tags` choice;
- no ambiguous generic `Select all` control;
- scoped `Select all Topics` / `Select all Tags` actions if useful;
- hide Topic/Tag hierarchy until explicit specific-route customization is requested;
- concise applied customized-scope summary on the System row;
- checked/unchecked/indeterminate hierarchy semantics;
- strict prevention of hidden/stale route submission in `UNSELECTED` and `SELECTED_ALL` states;
- existing form parsing and canonical server resolution.

Validation:

- one-System whole-System selection submits `mode: 'all'` only;
- deselect removes the System and all of its routes from submission;
- reselect returns to whole-System mode;
- Cancel preserves prior applied state exactly;
- reopen customization reflects prior applied state exactly;
- customized → Whole System clears route submission;
- selecting every visible Topic/Tag remains `mode: 'routes'`, never browser-collapsed to `mode: 'all'`;
- multiple whole-System selection;
- mixed whole-System + narrowed-System selection;
- Topic-only narrowing;
- Tag-only narrowing;
- Topic + Tag narrowing;
- structural parent behavior;
- indeterminate state;
- invalid/empty narrowed scope handling;
- overlapping cross-System Cases still deduplicate;
- existing specialized Multi-System learner UX tests remain green.

Commit this tranche separately before proceeding.

### Tranche 3 — Session controls, count and CTA simplification

Goal: finish the core Study launcher.

Implement:

- concise Scheduled/Free control;
- concise 5/10/20/All control;
- contextual help rather than simultaneous long explanations;
- compact combined eligible-Case count states;
- one clear Start CTA;
- loading/error/zero-candidate states that do not cause layout churn or ambiguity.

Validation:

- Scheduled and Free planning preserve current request shape;
- default remains Scheduled + 10 unless current authority says otherwise;
- `All` remains null/unbounded distinct-case target according to current contract;
- count endpoint stays read-only/server authoritative;
- planning still immediately opens first Review;
- current validation/error messages remain actionable;
- keyboard operation works without pointer input.

Commit this tranche separately before proceeding.

### Tranche 4 — Secondary surfaces, route-level data loading, responsive/accessibility polish and reconciliation

Goal: complete the decluttering without retaining hidden server-side cost or losing discoverability/safety.

Implement as supported by preceding tranches:

- `/study/progress` or equivalent detailed Progress surface;
- `/study/settings` or equivalent preference surface;
- clearly separated Manage Study Data/danger-zone surface;
- move full detailed data queries to the routes that actually render them;
- keep `/study` limited to launcher-required data plus mandatory ownership/fence state;
- avoid duplicating FSRS/progress calculations while introducing focused summary loading;
- responsive behavior for narrow/mobile screens;
- keyboard/focus behavior for customization disclosures/dialogs;
- screen-reader labels and live-region behavior for count/status changes;
- long System/Topic/Tag-name handling;
- visual state clarity for selected/customized/disabled/error states;
- final documentation updates describing implemented behavior rather than planned behavior.

Validation:

- `/study` no longer eagerly loads full detailed history/Progress when only the compact summary is rendered;
- `/study/progress` owns detailed Progress/history retrieval;
- settings/data routes load only their required detailed state;
- deletion fence status remains available early enough to block Study correctly;
- moving forms/actions does not alter Reset/Fresh/delete semantics;
- mobile/narrow layout does not merely produce a long stack of full-size cards;
- no hidden control becomes inaccessible by keyboard;
- focus returns predictably after closing any modal/dialog/drawer;
- Topic parent indeterminate state is perceivable;
- destructive actions remain clearly differentiated and confirmed;
- all relevant general and specialized learner/runtime tests pass.

Commit this tranche separately.

## 18. Testing and regression expectations

The implementation agent should inspect current test/CI ownership rather than inventing a new broad workflow by default.

At minimum, preserve/extend coverage for:

- the four-state acceptance matrix;
- `/study` source/interaction contracts;
- learner runtime cutover regressions;
- Scheduled and Free run planning;
- run-size behavior;
- browser run storage/open/completion;
- Active Review behavior;
- Multi-System form parsing and scope resolution;
- the applied-vs-draft customization state machine;
- no stale/hidden route submission;
- whole-System vs all-visible-routes distinction;
- combined eligible count;
- Topic hierarchy semantics;
- cross-System continuous navigation;
- Reset/Fresh actions;
- learner study-data deletion;
- Expanded Learning preference behavior;
- route-level detailed-data ownership after secondary-surface extraction.

Add focused component/browser-level tests where progressive-disclosure interaction has meaningful behavior not covered by existing source-contract tests.

Do not weaken specialized tests merely to make the redesign easier to land.

## 19. UX acceptance scenarios

Before marking the PR Ready, manually or automatically verify:

1. Active Review exists → Resume primary, new-run launcher unavailable;
2. resumable browser run without Active Review → Continue primary, new-run secondary;
3. neither Active Review nor browser run → new-run launcher primary;
4. deletion in progress → Study launcher unavailable, deletion continuation primary;
5. status/error/recovery message;
6. one System selected whole;
7. deselect selected whole System;
8. reselect returns to whole-System;
9. open customization from whole, edit, Cancel;
10. open customization from whole, choose explicit routes, Apply;
11. reopen customized System and see applied routes;
12. customized System switched back to Whole System;
13. all visible Topics/Tags selected but still explicit routes mode;
14. several Systems selected whole;
15. one System customized by Topic;
16. one System customized by Tag;
17. mixed whole + customized Systems;
18. zero eligible Cases;
19. count loading and count failure;
20. Free Study + All;
21. Scheduled Study + fixed run size;
22. many Systems;
23. System with deep Topic hierarchy;
24. System with many curated Tags;
25. long labels;
26. Reset/Fresh/manage-data navigation;
27. `/study` launcher data load without full detailed Progress/history load;
28. direct `/study/progress` detailed load;
29. mobile/narrow viewport;
30. keyboard-only operation;
31. screen-reader semantics for dynamic count/status/customization state.

## 20. Review clarifications locked before implementation

The following decisions were added after plan review and are not optional implementation details:

1. **System customization state is explicit.** `UNSELECTED`, `SELECTED_ALL`, and `SELECTED_ROUTES` are distinct applied states; customization uses a separate draft. Cancel never mutates the applied state. Deselect clears customization for the current launcher state. Reselect returns to canonical whole-System. Hidden/stale routes never submit in `UNSELECTED` or `SELECTED_ALL`.
2. **Whole System is not “all visible routes”.** A distinct `Whole System` choice owns canonical `mode: 'all'`. Group-level actions such as `Select all Topics` remain explicit routes mode even when every currently visible route is checked.
3. **Secondary surfaces own detailed loading.** `/study` loads only launcher-required summary/preference/ownership/fence data. Full Progress/history/settings data moves to the route that renders it; do not retain eager detailed loads behind a visually compact launcher.
4. **Resume/deletion ownership is explicit.** Active Review hides the new-run launcher; resumable browser run makes it secondary; neither makes it primary; deletion-in-progress hides it and keeps Study fenced.

These clarifications must be covered by focused tests/source contracts before the PR is marked Ready.

## 21. Out of scope

Do not use this PR to add:

- balanced/equal System quotas;
- per-System scheduler state;
- new FSRS algorithms or optimizer behavior;
- new descriptor/scope/proof versions;
- new Topic/Tag taxonomy semantics;
- automatic tag inference;
- a synthetic `Mixed` System;
- changes to Case eligibility;
- migration/schema changes unless an explicit blocker is discovered and the plan is re-reviewed;
- Production deployment or Production D1 mutation.

## 22. Success criteria

The redesign is successful when:

1. the page's dominant action is obvious within one scan;
2. Active Review/browser-run/deletion ownership is explicit and unchanged;
3. starting a normal whole-System run requires no exposure to Topic/Tag details;
4. customization has deterministic draft/apply/cancel/deselect/reselect/reopen behavior;
5. hidden or stale Topic/Tag selections can never leak into whole-System or unselected submission;
6. `Whole System` is explicitly distinct from selecting every visible route;
7. advanced scope customization remains fully available when requested;
8. Scheduled/Free and run-size decisions are concise;
9. the learner can see the unique available Case count without reading backend semantics;
10. progress/settings/data management remain discoverable but secondary;
11. detailed secondary data is loaded by the route that renders it rather than eagerly by the launcher;
12. destructive actions no longer visually compete with Study initiation;
13. mobile density is materially reduced rather than merely stacked;
14. accessibility is preserved or improved;
15. current runtime, FSRS, scope, Active Review, reset/deletion and continuous-navigation contracts remain unchanged;
16. the full implementation is delivered as sequential tranches within this single PR.
