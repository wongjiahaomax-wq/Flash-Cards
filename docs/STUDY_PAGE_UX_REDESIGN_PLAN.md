# Study Page UX Redesign Plan

_Status: implementation plan for a single Draft PR. The PR should be implemented in sequential, reviewable tranches on one branch. This document does not itself change learner runtime semantics, Production data, migrations, or deployment._

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
- current specialized learner/FSRS/Multi-System regressions and CI.

Current executable code, committed schema/migrations, validators and tests outrank stale historical wording.

## 3. Single-PR tranche model

All coding for this redesign should remain in **one Draft PR**.

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

Each tranche should leave the branch internally coherent and testable. Avoid partially implementing a later tranche merely because adjacent code is already open.

The tranche boundaries are for coding/review discipline, not separate product releases.

## 4. Product hierarchy

The target learner priority is:

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

Secondary analytics, preferences and destructive controls should not compete visually with this path.

## 5. Current UX problems

### 5.1 Too many unrelated responsibilities

Study initiation, progress analytics, preferences, recent history, reset controls and destructive data management coexist on the same primary surface.

These represent different learner intents but are presented at similar visual weight.

### 5.2 Resume actions are insufficiently dominant

An active Review or resumable browser run is normally the learner's most important next action, but the learner can still be presented with the large new-run configuration and unrelated controls around it.

### 5.3 Multi-System configuration is visually expensive

The current chooser correctly supports whole-System selection plus optional Topic/Tag narrowing, but large System cards and nested configuration make the default path look more complex than the underlying product rule:

```text
selected System = whole System unless explicitly customized
```

### 5.4 Advanced implementation language leaks into learner UI

Runtime details such as canonical `mode: "all"` are useful engineering concepts but should not be required learner vocabulary.

### 5.5 Progress is effectively its own product surface

Current progress presentation includes headline metrics, rating distribution, per-System coverage, recent history and reset controls. This is enough information to justify secondary/dedicated presentation rather than occupying the main launcher at full size.

### 5.6 Destructive controls compete with normal studying

Reset Progress, Fresh FSRS Start and learner study-data deletion are rare boundary-changing actions. They should be clearly separated from routine Study initiation.

### 5.7 Responsive stacking does not solve information density

The existing responsive layout generally stacks large sections on narrower screens. That preserves functionality but can make mobile pages extremely long. The redesign should reduce default information volume, not merely rearrange it.

## 6. UX principles

### 6.1 Primary action first

When an active Review or resumable run exists, continuing it should be the strongest learner action.

Otherwise the new-run launcher should dominate.

### 6.2 Progressive disclosure

Advanced configuration should appear only when explicitly requested.

In particular:

```text
Select System
→ whole-System scope by default
→ Customize only when needed
```

### 6.3 Keep runtime sophistication behind simple controls

The backend may require canonical scope descriptors, exact-Topic semantics, deduplication, attribution, signed proofs and Active Review boundaries. The learner should see simple product decisions rather than backend terminology.

### 6.4 Contextual help over permanent explanation

Prefer a short active-state explanation or help affordance over simultaneously showing detailed descriptions for every possible option.

### 6.5 Dangerous actions belong in a secondary danger zone

Boundary-changing/destructive actions must remain available and safe, but should not visually resemble normal Study controls.

### 6.6 Accessibility is part of the redesign

Progressive disclosure must preserve keyboard access, semantic labels, focus behavior, visible state, indeterminate Topic hierarchy behavior and screen-reader usability.

## 7. Target `/study` information architecture

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

## 8. Continue-state design

### 8.1 Active Review

If an active Review exists, prioritize it above new-run planning.

Target shape:

```text
Continue studying

Scheduled Study
Answers not yet revealed

[ Resume Review ]
```

Only information useful for the immediate decision should be shown by default.

### 8.2 Existing browser run

If no active Review exists but a browser run is resumable:

```text
Continue your session

Scheduled Study · 4 of 10 completed

[ Continue ]
```

Retain necessary run state and existing recovery/clear behavior. This redesign must not weaken stale-run invalidation, Active Review precedence or browser-run ownership rules.

### 8.3 Starting another run

Starting a new run while a resumable state exists should be visually secondary and must continue to respect current runtime/Active Review safety behavior.

Do not invent a new abandonment/reset semantic as part of this UX work.

## 9. System selector redesign

### 9.1 Compact default rows

Replace large always-prominent System cards with a denser selectable representation.

Example:

```text
☐ Cardiology                         128 Cases
☐ Respiratory                         94 Cases
```

Selected:

```text
☑ Cardiology                         128 Cases
                                      Customize
```

Customized:

```text
☑ Cardiology
   Arrhythmias + ECG                  43 Cases
                                      Edit
```

Exact visual form may be list rows, compact cards or another accessible pattern, but the default learner scan should remain compact.

### 9.2 Preserve whole-System default semantics

Selecting a System without customization must continue to represent canonical whole-System selection.

The browser must not materialize every Topic/Tag route just to express whole-System selection.

### 9.3 Hide Topic/Tag controls until requested

Topic and curated-Tag selection should not render as visually dominant controls for every System by default.

Expose them through an explicit `Customize` / `Edit` action for a selected System.

### 9.4 Customization surface

A customization surface may be an accessible dialog, drawer, popover-sized panel where practical, or an in-page disclosure if that proves more robust.

Target content:

```text
Cardiology
Choose what to include

Topics
☑ Arrhythmias
   ☑ Atrial fibrillation
   ☐ SVT
☐ Heart failure

Tags
☐ ECG
☑ Emergency

[ Select all ]                 [ Apply ]
```

Do not choose a visually attractive pattern at the cost of accessibility or complex focus/state bugs. An in-page progressive disclosure is acceptable if it produces the cleaner default hierarchy.

### 9.5 Preserve Topic hierarchy semantics

The redesign must preserve current semantics:

- exact-Topic routes only where exact `caseCount > 0`;
- structural zero-exact-Case Topics remain UI controls rather than submitted routes;
- parent toggles affect contributing descendant exact-Topic routes;
- partially selected descendants produce indeterminate parent state;
- hierarchy ordering/breadcrumb depth remains correct;
- curated Tags remain independent routes.

## 10. Study-mode redesign

Present Scheduled vs Free as one concise decision rather than two permanently explanatory blocks.

Target:

```text
Study mode

[ Scheduled ] [ Free ]

Scheduled uses your spaced-repetition queue.  ⓘ
```

When Free is selected, contextual help should describe Free Study instead.

Exact copy can be refined, but it must remain medically/product neutral and must not misrepresent current runtime behavior.

## 11. Run-size redesign

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

Detailed repeat-slot semantics do not need to occupy permanent primary-page space. They may be available through concise help where useful.

## 12. Combined eligible Case count

Preserve the server-authoritative count path and canonical union/deduplication semantics.

Do not calculate the combined count by summing per-System counts.

The default presentation should be concise:

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

## 13. Start CTA

The form should culminate in one obvious action.

Example:

```text
[ Start 10-Case session ]
```

or, if dynamic wording creates unnecessary complexity:

```text
[ Start Study ]
```

The CTA must be disabled or safely rejected for invalid/empty scope according to existing server-side rules. Client state must not become an authorization or validity authority.

## 14. Progress presentation

The primary `/study` page should show only enough progress information to orient the learner.

Target summary:

```text
Your progress

24 Due now        68% SRS coverage

[ View progress ]
```

Detailed information can move to a secondary progress surface, including:

- Due / Not due;
- coverage;
- Scheduled activity;
- Free Study activity;
- rating distribution;
- per-System statistics;
- recent Scheduled history;
- detailed-history retention information.

If a dedicated route is introduced, prefer a clear learner route such as `/study/progress` and preserve current data retrieval semantics.

Do not change FSRS calculations or analytics semantics as part of this presentation move.

## 15. Study settings

Expanded Learning is a persistent preference, not normally a per-run decision.

The main Study page should reduce it to a compact status/manage affordance, for example:

```text
Study settings
Expanded Learning: Off                 Manage ›
```

A secondary settings surface may own the full preference control.

If a dedicated route is introduced, prefer a clear route such as `/study/settings`.

Preserve the existing rule that the preference is applied when the next Scheduled/Free Active Review is frozen.

## 16. Manage Study data / danger zone

Reset Progress, Fresh FSRS Start and deletion of learner study data should be visually separated from ordinary Study initiation.

Preferred hierarchy:

```text
Study settings
→ Manage study data
→ Danger zone
```

A dedicated route such as `/study/settings/data` is acceptable if it simplifies the main surface and preserves server actions/safety.

The redesign must not weaken:

- confirmation requirements;
- generation/review-sequence boundary changes;
- stale browser-run invalidation;
- active-Review invalidation/deletion behavior;
- staged deletion behavior;
- deletion-in-progress blocking behavior;
- final empty-state verification.

This tranche is presentation/navigation only unless an existing action must be safely relocated.

## 17. Frozen runtime contracts

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
- staged learner study-data deletion safety.

No schema migration is expected for this UX redesign. If implementation discovers that a migration or runtime-contract change is required, stop that part of the tranche and amend/re-review the plan rather than silently expanding scope.

## 18. Implementation tranches — all within this PR

### Tranche 1 — Page hierarchy and resume-first declutter

Goal: establish the new information hierarchy without changing multi-System selector semantics yet.

Implement:

- make active Review/current browser run the dominant continue state;
- simplify the page header/intro where possible;
- establish a clearly bounded `Start a study session` area;
- reduce Expanded Learning on the primary page to compact settings/status presentation;
- reduce learner progress on the primary page to a compact summary/entry point;
- move or progressively hide study-data management so it no longer competes with normal Study initiation;
- remove learner-visible backend implementation jargon where not necessary.

Validation:

- active Review remains resumable;
- browser run remains resumable/clearable under current rules;
- deletion-in-progress still blocks Study correctly;
- Expanded Learning preference still persists/applies correctly;
- Reset/Fresh/delete actions remain reachable and protected;
- existing runtime tests continue to pass.

Commit this tranche separately before proceeding.

### Tranche 2 — Compact Systems and progressive scope customization

Goal: make whole-System selection visually simple while preserving all current scope semantics.

Implement:

- compact System selection rows/cards;
- whole-System as the obvious default;
- `Customize` / `Edit` only for selected Systems;
- hide Topic/Tag hierarchy until customization is requested;
- present a concise customized-scope summary on the System row;
- preserve checked/unchecked/indeterminate hierarchy semantics;
- preserve form parsing and canonical server resolution.

Validation:

- one-System whole-System selection;
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

### Tranche 4 — Secondary surfaces, responsive/accessibility polish and final reconciliation

Goal: complete the decluttering without losing discoverability or safety.

Implement as supported by the preceding tranches:

- dedicated/secondary detailed Progress presentation if needed;
- dedicated/secondary Study settings presentation if needed;
- clearly separated Manage Study Data/danger-zone presentation;
- responsive behavior for narrow/mobile screens;
- keyboard/focus behavior for customization disclosures/dialogs;
- screen-reader labels and live-region behavior for count/status changes;
- long System/Topic/Tag-name handling;
- visual state clarity for selected/customized/disabled/error states;
- final documentation updates describing implemented behavior rather than planned behavior.

Validation:

- mobile/narrow layout does not merely produce a very long stack of full-size cards;
- no hidden control becomes inaccessible by keyboard;
- focus returns predictably after closing any modal/dialog/drawer;
- Topic parent indeterminate state is perceivable;
- destructive actions remain clearly differentiated and confirmed;
- all relevant general and specialized learner/runtime tests pass.

Commit this tranche separately.

## 19. Testing and regression expectations

The implementation agent should inspect current test/CI ownership rather than inventing a new broad workflow by default.

At minimum, preserve/extend coverage for:

- `/study` source/interaction contracts;
- learner runtime cutover regressions;
- Scheduled and Free run planning;
- run-size behavior;
- browser run storage/open/completion;
- active Review behavior;
- Multi-System form parsing and scope resolution;
- combined eligible count;
- Topic hierarchy semantics;
- cross-System continuous navigation;
- Reset/Fresh actions;
- learner study-data deletion;
- Expanded Learning preference behavior.

Add focused component/browser-level tests where the new progressive-disclosure interaction has meaningful behavior not covered by existing source-contract tests.

Do not weaken specialized tests merely to make the redesign easier to land.

## 20. UX acceptance scenarios

Before marking the PR Ready, manually or automatically verify these representative states:

1. new learner/no current run;
2. learner with Due Cases;
3. active Review exists;
4. resumable browser run exists;
5. status/error message exists;
6. one System selected whole;
7. several Systems selected whole;
8. one System customized by Topic;
9. one System customized by Tag;
10. mixed whole + customized Systems;
11. zero eligible Cases;
12. count loading and count failure;
13. Free Study + All;
14. Scheduled Study + fixed run size;
15. many Systems;
16. System with deep Topic hierarchy;
17. System with many curated Tags;
18. long labels;
19. deletion in progress;
20. Reset/Fresh/manage-data navigation;
21. mobile/narrow viewport;
22. keyboard-only operation;
23. screen-reader semantics for dynamic count/status/customization state.

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
2. active/resumable work is clearly prioritized;
3. starting a normal whole-System run requires no exposure to Topic/Tag details;
4. advanced scope customization remains fully available when requested;
5. Scheduled/Free and run-size decisions are concise;
6. the learner can see the unique available Case count without reading backend semantics;
7. progress/settings/data management remain discoverable but secondary;
8. destructive actions no longer visually compete with Study initiation;
9. mobile density is materially reduced rather than merely stacked;
10. accessibility is preserved or improved;
11. current runtime, FSRS, scope, Active Review, reset/deletion and continuous-navigation contracts remain unchanged;
12. the full implementation is delivered as sequential tranches within this single PR.
