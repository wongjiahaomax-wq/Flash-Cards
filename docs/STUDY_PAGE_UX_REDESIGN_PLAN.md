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

### 5.8 Browser-local ownership must be resolved before primary action is shown

A resumable browser run is localStorage-owned and is only known after client hydration. The redesign must not render the new-run launcher as the primary action during that unresolved interval and then switch to Continue after `onMount()`.

### 5.9 Existing browser state is replaced only at a successful replacement commit point

Opening, editing, cancelling, or unsuccessfully submitting `Start a different run` must not destroy the current resumable browser run. Replacement occurs only after the server returns a valid new descriptor and that descriptor is successfully persisted as the new browser run.

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

Do not show a per-System customized Case count such as `Arrhythmias + ECG — 43 Cases` unless that number is obtained through an authoritative server-side union resolver for that exact System scope. Topic and Tag counts overlap and must not be arithmetically added in the browser. A safe compact summary is simply:

```text
☑ Cardiology
   Arrhythmias + ECG                     Edit
```

## 7. Continue-state ownership, hydration and acceptance matrix

The redesign must make current ownership/resume behavior explicit rather than allowing visual changes to alter it accidentally.

### 7.1 Server-authoritative states first

Two server-known states outrank browser-local state immediately:

- an Active Review exists;
- study-data deletion is in progress.

If either exists, the browser does not need to wait for localStorage hydration to decide the primary surface.

### 7.2 Pre-hydration browser-run state

When there is no server-known Active Review and no deletion fence, browser-run ownership is initially unresolved until localStorage has been read for the authenticated learner.

Model this explicitly, for example:

```text
BROWSER_RUN_UNKNOWN
NO_BROWSER_RUN
RESUMABLE_BROWSER_RUN
```

Equivalent internal names are acceptable.

While browser-run state is `UNKNOWN`:

- do not present the new-run launcher as the established primary action;
- do not render a misleading `Start a study session` state that will immediately flip to Continue;
- render a compact neutral loading/skeleton/resolving state or defer the ownership-sensitive portion of the launcher until hydration completes;
- avoid layout shift where practical;
- once localStorage is resolved, render either Continue or new-run primary according to the acceptance matrix below.

This is an ownership correctness requirement, not merely animation polish.

### 7.3 Acceptance-state matrix

| Server/browser state | Primary surface | New-run launcher | Required behavior |
| --- | --- | --- | --- |
| Study-data deletion in progress | Continue deletion | Hidden/unavailable | Study stays fenced. Do not load/enable study planning. |
| Active Review exists | Resume Active Review | Hidden/unavailable until the Active Review is resumed or explicitly discarded | Active Review remains authoritative. Do not plan a replacement run behind it. |
| No Active Review/deletion; browser state unresolved | Neutral ownership-loading state | Not yet primary | Resolve current-user localStorage state before deciding Continue vs Start. |
| No Active Review; resumable browser run exists | Continue browser run | Available only as visually secondary `Start a different run` | Existing run remains intact unless replacement planning reaches the successful commit point. |
| No Active Review; no resumable browser run | Start a study session | Primary and available | Normal chooser behavior. |

Status/error/recovery states must still surface the existing actionable message without changing underlying ownership rules.

### 7.4 Active Review presentation must respect revealed state

Do not hard-code `Answers not yet revealed`.

The compact card must either:

- render state-aware copy from `activeReview.revealed`, e.g. `Answers revealed` vs `Answers not yet revealed`; or
- use neutral copy such as `Review in progress` that remains correct in both states.

Target shape:

```text
Continue studying

Scheduled Study
Review in progress

[ Resume Review ]
```

### 7.5 Resumable browser run

Target shape:

```text
Continue your session

Scheduled Study · 4 of 10 completed

[ Continue ]
```

Retain necessary run state and existing recovery/clear behavior. Stale-run invalidation, Active Review precedence and browser-run ownership must remain unchanged.

## 8. `Start a different run` replacement semantics

When a resumable browser run exists and the learner chooses the secondary `Start a different run` path:

- opening the alternate launcher does not clear or mutate the existing browser run;
- editing Systems/routes/mode/run size does not clear or mutate it;
- cancelling/closing the alternate launcher leaves it unchanged;
- eligible-count requests leave it unchanged;
- expected or unexpected planning failure leaves it unchanged;
- server validation failure leaves it unchanged;
- an invalid/missing descriptor leaves it unchanged.

The replacement commit point is:

```text
server planning succeeds
→ valid replacement descriptor returned
→ replacement descriptor successfully persisted to browser-run storage
→ browserRun becomes the replacement
→ open first Review
```

Do not clear the old run before this point.

If browser persistence of the replacement descriptor fails, the implementation must not intentionally discard the previous resumable run. Handle/report the storage failure while preserving recoverability as far as the storage API permits.

This does not add a new learner-progress abandonment semantic. It only protects browser-local run continuity while a replacement is being prepared.

## 9. System selector redesign

### 9.1 Compact default rows

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
   Arrhythmias + ECG                   Edit
```

Exact visual form may be list rows, compact cards or another accessible pattern, but the default learner scan should remain compact.

### 9.2 Canonical System scope state machine

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

### 9.3 Selection/deselection behavior

Required behavior:

- selecting an unselected System enters `SELECTED_ALL`;
- deselecting a System enters `UNSELECTED` and clears its applied customization for the current launcher state;
- reselecting therefore returns to `SELECTED_ALL`, not a hidden stale narrowed scope;
- while `UNSELECTED`, no Topic/Tag values for that System may be submitted;
- while `SELECTED_ALL`, no hidden/stale Topic/Tag values for that System may be submitted.

### 9.4 Customization draft vs applied state

Opening `Customize` / `Edit` creates an editable **draft**. The draft must not alter submitted scope until the learner applies it.

**Open from `SELECTED_ALL`:**

- draft starts in `Whole System` mode;
- Topic/Tag route controls become relevant only after explicit switch to `Specific Topics / Tags`;
- opening/closing without Apply cannot silently convert the System to routes mode.

**Open from `SELECTED_ROUTES`:**

- draft initializes from the currently applied route set;
- reopening shows applied customization, not abandoned edits.

**Cancel / close without Apply:**

- discard draft edits;
- leave applied System state unchanged;
- leave submitted scope unchanged.

**Apply `Whole System`:**

- commit `SELECTED_ALL`;
- clear/ignore prior applied route selections;
- ensure route controls are non-submitting;
- row summary returns to whole-System presentation.

**Apply `Specific Topics / Tags`:**

- require at least one valid explicit contributing route according to current validation rules;
- commit `SELECTED_ROUTES` with exactly those routes;
- row summary reflects the applied narrowed scope.

The server remains authoritative and must still reject invalid or stale routes.

### 9.5 Whole-System vs “Select all” must remain distinct

Do not use a generic `Select all` action that can be confused with canonical whole-System selection.

Make scope mode explicit:

```text
Scope
(•) Whole System
( ) Specific Topics / Tags
```

When `Specific Topics / Tags` is selected, group actions may be offered with explicit names:

```text
Select all Topics
Clear Topics
Select all Tags
Clear Tags
```

Selecting every currently visible Topic/Tag route is still **routes mode**. The browser must never collapse this to canonical `mode: 'all'` merely because every visible route is checked.

Only the explicit `Whole System` choice restores canonical `mode: 'all'`.

### 9.6 Preserve Topic hierarchy semantics

The redesign must preserve:

- exact-Topic routes only where exact `caseCount > 0`;
- structural zero-exact-Case Topics as UI controls rather than submitted routes;
- parent toggles affecting contributing descendant exact-Topic routes;
- indeterminate parent state for partial descendants;
- hierarchy ordering/breadcrumb depth;
- curated Tags as independent routes.

## 10. Failed-plan rehydration contract

Expected planning validation failures must preserve still-valid learner choices rather than resetting the launcher or resurrecting hidden stale inputs.

On expected server validation failure:

- preserve the submitted Scheduled/Free choice when still valid;
- preserve submitted run size when still valid;
- preserve selected Systems that still exist and remain selectable;
- preserve `SELECTED_ALL` for still-valid whole-System selections;
- preserve only still-valid explicit Topic/curated-Tag routes for `SELECTED_ROUTES` Systems;
- remove/reject routes that are stale, inactive, no longer contributing, or no longer part of the current server-provided System metadata;
- never retain removed invalid routes in hidden controls that could be resubmitted later;
- surface an actionable validation message when any submitted scope is rejected or normalized;
- if a narrowed System loses every valid route after stale-route filtering, do not silently convert it to whole-System. Keep the error explicit or require the learner to choose a new valid scope.

The server remains authoritative. Client rehydration is for preserving valid intent, not bypassing server validation.

Unexpected failures may keep the current applied client state, but must not clear the existing resumable browser run or manufacture a successful scope.

## 11. Study-mode redesign

Present Scheduled vs Free as one concise decision rather than two permanently explanatory blocks.

Target:

```text
Study mode

[ Scheduled ] [ Free ]

Scheduled uses your spaced-repetition queue.  ⓘ
```

When Free is selected, contextual help should describe Free Study instead.

Exact copy can be refined but must not misrepresent current runtime behavior.

## 12. Run-size redesign

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

## 13. Eligible Case counts

### 13.1 Combined launcher count

Preserve the server-authoritative combined count path and canonical union/deduplication semantics.

Do not calculate the combined count by summing per-System counts.

Default presentation:

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

### 13.2 Customized per-System count

Do **not** derive a customized System count by adding Topic and Tag counts. Topic and Tag routes can overlap.

For a customized System row, either:

- omit a count and show the applied scope summary only; or
- request an authoritative union count for that exact per-System applied scope through a server resolver that shares canonical eligibility/deduplication semantics.

Do not introduce a second divergent counting algorithm for presentation convenience.

## 14. Start CTA

The form should culminate in one obvious action:

```text
[ Start 10-Case session ]
```

or:

```text
[ Start Study ]
```

The CTA must be disabled or safely rejected for invalid/empty scope according to existing server-side rules. Client state must not become an authorization or validity authority.

When an existing resumable browser run is being replaced, the CTA follows the replacement commit-point contract in section 8.

## 15. Progress presentation and data-loading ownership

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

### 15.1 Loading requirement

If detailed Progress is moved to `/study/progress`, `/study` must not continue eagerly fetching the complete detailed Progress/history payload merely to render the compact summary.

Route ownership should become:

```text
/study
→ load only launcher-required Progress summary data

/study/progress
→ load full detailed learner Progress/history model
```

If current `getLearnerFsrsProgress(...)` computes/fetches substantially more than the launcher needs, introduce/reuse a focused summary query rather than calling the full query and discarding most of it.

Do not duplicate calculation semantics. Shared lower-level calculation helpers are preferable.

### 15.2 `/study/progress` deletion fence

A direct Progress route must not display partially deleted study state while staged study-data deletion is active.

Before loading detailed Progress/history, `/study/progress` must check the learner study-data deletion status.

If deletion is in progress:

- do not execute the detailed Progress/history query;
- do not render partially deleted analytics/history;
- render/redirect to the appropriate deletion-in-progress recovery surface according to the route design;
- preserve the same Study fence semantics as `/study`.

The deletion-status check therefore precedes detailed Progress retrieval.

## 16. Study settings and loading ownership

Expanded Learning is a persistent preference, not normally a per-run decision.

The main Study page should reduce it to a compact status/manage affordance:

```text
Study settings
Expanded Learning: Off                 Manage ›
```

A secondary `/study/settings` surface may own the full preference control.

The launcher may load the minimal preference value required for its summary but should not eagerly load unrelated settings.

Preserve the existing rule that the preference is applied when the next Scheduled/Free Active Review is frozen.

## 17. Manage Study data / danger zone

Reset Progress, Fresh FSRS Start and learner study-data deletion should be visually separated from ordinary Study initiation.

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
- Active Review invalidation/deletion behavior;
- staged deletion behavior;
- deletion-in-progress blocking behavior;
- final empty-state verification.

### 17.1 Browser-local invalidation must survive route extraction

Today boundary actions can return `browserRunInvalidated`, which `/study` consumes to clear the learner's localStorage run. Moving Reset/Fresh/delete actions to another route must not break that browser-local invalidation.

Required behavior after successful boundary actions:

```text
Reset Progress success
→ clear learner browser run immediately

Fresh FSRS Start success
→ clear learner browser run immediately

Delete Study Data begins/advances successfully with browserRunInvalidated
→ clear learner browser run immediately
```

This must happen on the route/component that receives the action result; it must **not** depend on later navigation back to `/study` to consume the flag.

Use a shared browser-run invalidation helper/action-result handler if useful, but preserve the existing current-user storage ownership rules.

Clearing is idempotent. A staged deletion continuation may return the invalidation signal again without harm.

### 17.2 Per-action deletion guard matrix

Route splitting must preserve current action-level fence behavior deliberately:

| Action | During study-data deletion | Required ownership |
| --- | --- | --- |
| Plan Study run | Blocked/fenced | Must continue checking deletion before planning. |
| Discard Active Review | Blocked/fenced | Preserve current guard behavior. |
| Reset Progress | Blocked/fenced | Preserve current guard behavior. |
| Fresh FSRS Start | Blocked/fenced | Preserve current guard behavior. |
| Expanded Learning preference | Remains available | Do not accidentally add the Study-deletion fence merely because settings moved routes; current behavior permits preference update. |
| Delete Study Data | Owns transition into deletion | Begins the staged deletion state machine after confirmation. |
| Continue Study Data Deletion | Owns active deletion progression | Advances/retries the staged state machine; no separate inactivity guard. |
| Detailed Progress load | Blocked before query | Do not load partially deleted Progress/history. |

Do not generalize one route-wide guard across every action if that changes these established distinctions.

## 18. Frozen runtime contracts

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
- browser-local invalidation after Reset/Fresh/delete;
- successful-replacement-only browser-run overwrite;
- plan → first Review immediate opening;
- completion → next Review continuous navigation;
- cross-System next-open behavior;
- Reset/Fresh concurrency safety;
- staged learner study-data deletion safety;
- deletion-in-progress Study fence;
- current action-specific deletion guard distinctions;
- server authority over all submitted scope/routes.

UI-state invariant:

> Only explicit applied System state may determine submitted scope. Hidden, cancelled, stale, invalid, or disabled Topic/Tag controls must never leak into the request.

Browser-run invariant:

> Existing resumable browser state is not destroyed by merely opening/editing/cancelling or failing a replacement plan. It is replaced only after a valid returned descriptor is successfully committed to browser storage.

No schema migration is expected for this UX redesign. If implementation discovers that a migration or runtime-contract change is required, stop that part of the tranche and amend/re-review the plan rather than silently expanding scope.

## 19. Implementation tranches — all within this PR

### Tranche 1 — Page hierarchy, ownership hydration and resume-first declutter

Goal: establish the new information hierarchy without changing multi-System selector semantics yet.

Implement:

- encode the acceptance-state matrix;
- add explicit pre-hydration browser-run ownership state;
- avoid presenting new-run primary before localStorage ownership is resolved;
- make Active Review/current browser run the dominant applicable continue state;
- make Active Review compact copy respect `revealed` or use neutral in-progress copy;
- hide new-run launcher during Active Review and deletion-in-progress states;
- keep `Start a different run` secondary when only a resumable browser run exists;
- preserve existing browser run while the alternate launcher is merely opened/edited/cancelled;
- simplify header/intro;
- establish a clearly bounded `Start a study session` area;
- reduce Expanded Learning and Progress to compact primary-page summaries/entry points;
- move/progressively hide study-data management;
- remove learner-visible backend jargon where unnecessary.

Validation:

- no primary-action flash from Start → Continue during hydration;
- Active Review remains resumable/discardable and revealed-state copy is correct;
- no replacement run is planned behind unresolved Active Review;
- browser run remains resumable/clearable under current rules;
- alternate-launcher open/edit/cancel preserves existing run;
- deletion-in-progress blocks Study and exposes deletion continuation/recovery;
- preference behavior remains intact;
- existing runtime tests pass.

Commit this tranche separately before proceeding.

### Tranche 2 — Compact Systems, explicit customization state machine and failed-plan rehydration

Goal: make whole-System selection visually simple while preserving current scope semantics and valid learner input after expected validation failures.

Implement:

- compact System selection rows/cards;
- explicit `UNSELECTED` / `SELECTED_ALL` / `SELECTED_ROUTES` applied state;
- whole-System default on selection/reselection;
- `Customize` / `Edit` only for selected Systems;
- separate customization draft state;
- deterministic Cancel / Apply / deselect / reselect / reopen behavior;
- explicit `Whole System` vs `Specific Topics / Tags`;
- no ambiguous generic `Select all`;
- scoped group actions if useful;
- strict prevention of hidden/stale route submission;
- failed-plan rehydration that preserves still-valid mode/run-size/System/routes while rejecting stale routes;
- no silent narrowed→whole conversion after all narrowed routes become invalid;
- existing form parsing/canonical server resolution.

Validation:

- whole-System submits `mode: 'all'` only;
- deselect removes System/routes;
- reselect returns to whole-System;
- Cancel preserves prior applied state;
- reopen reflects prior applied state;
- customized → Whole System clears route submission;
- all visible routes selected remains `mode: 'routes'`;
- expected failed plan preserves valid inputs;
- stale invalid route is not hidden/re-submitted;
- narrowed scope with no remaining valid route produces explicit correction/error state;
- multiple/mixed System selections remain correct;
- Topic hierarchy/indeterminate behavior remains correct;
- overlapping Cases still deduplicate;
- specialized Multi-System tests remain green.

Commit this tranche separately before proceeding.

### Tranche 3 — Session controls, authoritative count and replacement commit point

Goal: finish the core Study launcher without weakening browser-run continuity or count semantics.

Implement:

- concise Scheduled/Free control;
- concise 5/10/20/All control;
- contextual help;
- compact combined eligible-count states;
- omit customized per-System counts unless backed by authoritative union resolver;
- one clear Start CTA;
- explicit successful-replacement commit point for `Start a different run`;
- loading/error/zero-candidate states without ambiguity.

Validation:

- Scheduled/Free request shape unchanged;
- default remains Scheduled + 10 unless current authority says otherwise;
- `All` remains current null/unbounded distinct-case target;
- count endpoint remains read-only/server authoritative;
- no Topic+Tag arithmetic count appears;
- failed replacement planning preserves existing browser run;
- successful replacement persists new descriptor before treating old run as replaced;
- planning still immediately opens first Review;
- validation messages remain actionable;
- keyboard operation works without pointer input.

Commit this tranche separately before proceeding.

### Tranche 4 — Secondary routes, deletion/invalidation safety, responsive/accessibility polish and reconciliation

Goal: complete decluttering without retaining hidden server-side cost or losing browser-local/runtime safety.

Implement as supported by preceding tranches:

- `/study/progress` or equivalent detailed Progress surface;
- `/study/settings` or equivalent preference surface;
- separated Manage Study Data/danger-zone surface;
- full detailed queries on routes that actually render them;
- `/study` limited to launcher-required data plus mandatory ownership/fence state;
- deletion check before detailed `/study/progress` query;
- browser-run invalidation handling on whichever secondary route receives Reset/Fresh/delete action results;
- preserve action-specific deletion guards from section 17.2;
- avoid duplicated FSRS/progress calculation semantics;
- responsive narrow/mobile behavior;
- keyboard/focus behavior;
- screen-reader labels/live regions;
- long System/Topic/Tag-name handling;
- visual selected/customized/disabled/error clarity;
- final documentation reconciliation.

Validation:

- `/study` does not eagerly load full detailed Progress/history;
- `/study/progress` owns detailed retrieval and refuses to query/render it during active deletion;
- settings/data routes load only required detailed state;
- Reset/Fresh/delete action success clears current-user browser run even when action occurs away from `/study`;
- preference update remains available during deletion as before;
- plan/discard/Reset/Fresh remain fenced;
- delete/continue own deletion state machine;
- moving forms/actions does not alter confirmations or boundary semantics;
- mobile layout materially reduces density;
- all hidden controls remain keyboard accessible where applicable;
- focus restoration and indeterminate state are perceivable;
- all relevant general and specialized learner/runtime tests pass.

Commit this tranche separately.

## 20. Testing and regression expectations

The implementation agent should inspect current test/CI ownership rather than inventing a new broad workflow by default.

At minimum preserve/extend coverage for:

- server-known Active Review and deletion ownership;
- pre-hydration browser-run `UNKNOWN` state;
- no Start→Continue ownership flash;
- Active Review revealed/unrevealed compact presentation;
- resumable browser run and `Start a different run`;
- existing run preservation across alternate-launcher open/edit/cancel/count/failure;
- successful replacement commit point;
- `/study` source/interaction contracts;
- learner runtime cutover regressions;
- Scheduled and Free planning;
- run-size behavior;
- browser run storage/open/completion;
- Multi-System form parsing/scope resolution;
- applied-vs-draft customization state machine;
- no stale/hidden route submission;
- Whole-System vs all-visible-routes distinction;
- failed-plan rehydration with stale-route filtering;
- combined eligible count;
- no client arithmetic customized Topic+Tag count;
- Topic hierarchy semantics;
- cross-System continuous navigation;
- Reset/Fresh actions;
- learner study-data deletion;
- browser-local invalidation from secondary routes;
- Expanded Learning preference behavior during and outside deletion;
- `/study/progress` deletion fence before detailed query;
- route-level detailed-data ownership.

Add focused component/browser-level tests where progressive-disclosure or hydration behavior is not covered by existing source-contract tests.

Do not weaken specialized tests merely to make the redesign easier to land.

## 21. UX acceptance scenarios

Before marking the PR Ready, manually or automatically verify:

1. deletion in progress at initial load → deletion continuation primary, no Study launcher;
2. Active Review exists → Resume primary, no new-run launcher;
3. Active Review unrevealed → correct state-aware/neutral copy;
4. Active Review revealed → correct state-aware/neutral copy;
5. no Active Review/deletion before hydration → neutral ownership state, not Start primary;
6. hydration resolves resumable browser run → Continue primary, new-run secondary;
7. hydration resolves no browser run → new-run primary;
8. open `Start a different run`, then cancel → old browser run unchanged;
9. edit alternate run and trigger count requests → old browser run unchanged;
10. alternate planning validation failure → old browser run unchanged;
11. alternate planning success → new descriptor replaces old only at successful persistence commit point;
12. one System selected whole;
13. deselect/reselect returns to whole-System;
14. customize then Cancel;
15. customize explicit routes then Apply;
16. reopen customized System and see applied routes;
17. customized → Whole System;
18. all visible Topics/Tags selected but still routes mode;
19. failed plan preserves valid Scheduled/Free + run size + valid scope;
20. failed plan with stale route removes/rejects stale route visibly;
21. failed narrowed scope with zero remaining valid routes does not silently become whole-System;
22. mixed whole + customized Systems;
23. combined count loading/zero/error;
24. customized Topic+Tag summary does not show an arithmetic count;
25. Free Study + All;
26. Scheduled Study + fixed run size;
27. many Systems/deep hierarchy/many Tags/long labels;
28. Reset on secondary data route clears browser run;
29. Fresh Start on secondary data route clears browser run;
30. begin/continue study-data deletion clears browser run idempotently;
31. preference update remains available during active deletion;
32. plan/discard/Reset/Fresh remain fenced during active deletion;
33. direct `/study/progress` during deletion does not load/render detailed partial state;
34. `/study` launcher load avoids full detailed Progress/history query;
35. direct `/study/progress` outside deletion loads detailed model;
36. mobile/narrow viewport;
37. keyboard-only operation;
38. screen-reader semantics for dynamic count/status/customization/hydration state.

## 22. Review clarifications locked before implementation

The following review decisions are not optional implementation details:

1. **System customization state is explicit.** `UNSELECTED`, `SELECTED_ALL`, and `SELECTED_ROUTES` are distinct applied states with separate draft state. Cancel never mutates applied state. Deselect clears customization. Reselect returns to whole-System. Hidden/stale routes never submit in unselected/whole mode.
2. **Whole System is not “all visible routes”.** Only explicit `Whole System` owns canonical `mode: 'all'`; selecting every visible route remains routes mode.
3. **Secondary surfaces own detailed loading.** `/study` does not retain full detailed Progress/history/settings loads after those surfaces move out.
4. **Resume/deletion ownership is explicit.** Active Review hides new-run; browser run makes it secondary; neither makes it primary; deletion hides it and keeps Study fenced.
5. **Browser-run ownership has a pre-hydration state.** The UI must not briefly promote Start before localStorage is resolved.
6. **Replacement planning is non-destructive until success.** Existing browser run survives alternate-launcher open/edit/cancel/count/failure and is replaced only after valid returned descriptor persistence succeeds.
7. **Boundary-action localStorage invalidation follows the action.** Reset/Fresh/delete must clear the browser run even when moved off `/study`; returning to `/study` is not required.
8. **Progress is deletion-fenced before detailed load.** Direct `/study/progress` must not query/render partially deleted state.
9. **Customized counts remain authoritative.** Never add Topic/Tag counts; omit the per-System number unless resolved as a union by the server.
10. **Failed-plan rehydration preserves valid intent only.** Valid selections/mode/run size survive expected failure; stale routes are removed/rejected and never hidden for resubmission.
11. **Active Review copy respects revealed state.** No hard-coded unrevealed wording.
12. **Deletion guards remain action-specific.** Plan/discard/Reset/Fresh are fenced; preference remains available; delete/continue own deletion progression.

These clarifications require focused tests/source contracts before the PR is marked Ready.

## 23. Out of scope

Do not use this PR to add:

- balanced/equal System quotas;
- per-System scheduler state;
- new FSRS algorithms or optimizer behavior;
- new descriptor/scope/proof versions;
- new Topic/Tag taxonomy semantics;
- automatic tag inference;
- synthetic `Mixed` System;
- changes to Case eligibility;
- migration/schema changes unless an explicit blocker is discovered and the plan is re-reviewed;
- Production deployment or Production D1 mutation.

## 24. Success criteria

The redesign is successful when:

1. the page's dominant action is obvious and ownership-correct within one scan;
2. no browser-run ownership flash occurs during hydration;
3. Active Review/browser-run/deletion ownership remains unchanged;
4. existing resumable browser runs survive incomplete/failed replacement attempts;
5. Active Review compact copy is valid in both revealed states;
6. normal whole-System study does not expose Topic/Tag complexity;
7. customization has deterministic draft/apply/cancel/deselect/reselect/reopen behavior;
8. hidden/stale/invalid routes cannot leak into submission;
9. Whole System is explicitly distinct from selecting every visible route;
10. failed-plan rehydration preserves valid learner intent without retaining stale routes;
11. Scheduled/Free and run-size decisions are concise;
12. combined and optional customized counts use authoritative union semantics only;
13. Progress/settings/data management remain discoverable but secondary;
14. detailed secondary data is loaded by the route that renders it;
15. `/study/progress` cannot expose partially deleted state;
16. Reset/Fresh/delete browser-local invalidation still works after route extraction;
17. current per-action deletion fence distinctions are preserved;
18. destructive actions no longer visually compete with Study initiation;
19. mobile density is materially reduced rather than merely stacked;
20. accessibility is preserved or improved;
21. current runtime, FSRS, scope, Active Review, reset/deletion and continuous-navigation contracts remain unchanged;
22. the full implementation is delivered as sequential tranches within this single PR.
