# Study Page UX Redesign Plan

_Status: implementation is present on the PR #159 branch and pending review. This document remains the planning authority and does not itself change learner runtime semantics, Production data, migrations, or deployment._

_Date: 6 September 2026._

## 1. Goal

Refocus learner `/study` from a combined launcher/settings/analytics/data-management control panel into a clear Study launcher.

Primary learner hierarchy:

```text
1. Continue studying
2. Start a new Study run
3. View progress
4. Change Study settings
5. Manage/reset Study data
```

Normal new-run flow:

```text
Select Systems
→ optionally customize selected Systems
→ choose Scheduled or Free
→ choose 5 / 10 / 20 / All
→ see informational authoritative eligible count
→ Start
```

The redesign is information architecture and interaction work. It must preserve the existing learner-runtime, FSRS, scope, Active Review, browser-run, Reset/Fresh, and deletion contracts.

## 2. Authority and safety boundary

Before each tranche, re-read current code and the relevant current authorities, especially:

- `docs/DOCUMENTATION_INDEX.md`;
- `docs/LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md`;
- `docs/LEARNER_FSRS_RUN_SIZE_PRODUCT_AMENDMENT.md`;
- `docs/MULTI_SYSTEM_STUDY_PLAN.md`;
- `docs/MULTI_SYSTEM_RUNTIME_V2_IMPLEMENTATION.md`;
- `docs/MULTI_SYSTEM_UX_IMPLEMENTATION.md`;
- `docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`;
- current `src/routes/study/**`;
- current learner study-run storage/open/completion code;
- current Progress, preference, Reset/Fresh, deletion and access-boundary tests.

Current executable code, committed schema/migrations, validators and tests outrank stale historical wording.

### 2.1 Learner Study access boundary is mandatory on every new route

Current Study entry points use `learnerStudyAccessError(...)`. The redesign must preserve that exact access owner across any new secondary Study server surface.

Every new server load/action under routes such as:

```text
/study/progress
/study/settings
/study/settings/data
```

must:

- enforce the same learner Study access boundary before reading or mutating learner Study data;
- preserve authentication requirements;
- preserve Preview-only Admin exclusion;
- preserve the learner-runtime write/access fence owned by the shared access helper;
- derive the acting learner from `locals.user` only;
- never accept learner/user identity from form data, query parameters, route params, browser state, or any other submitted client identity;
- avoid copying a weaker route-specific approximation of the access logic when the shared owner can be reused.

Extend the existing Study access-boundary/source-contract regressions to every new secondary route and action.

This requirement applies even to a route that appears read-only, such as detailed Progress.

## 3. Single-PR tranche model

All coding stays in **one Draft PR**.

```text
planning document
→ Tranche 1 + focused validation + commit
→ Tranche 2 + focused validation + commit
→ Tranche 3 + focused validation + commit
→ Tranche 4 + focused validation + commit
→ integrated regression/accessibility review
→ documentation reconciliation
→ mark the same PR Ready for Review
```

Every tranche must leave the branch coherent, testable, and fully navigable.

### 3.1 No dead-link / temporary-removal intermediate state

Lock this delivery approach:

- Tranches 1–3 keep the existing detailed Progress, Expanded Learning, Reset/Fresh, and study-data-deletion controls reachable on `/study`.
- They may be visually demoted, collapsed, or placed in a secondary disclosure, but functionality must not disappear and no link may point to a route that does not yet exist.
- Tranche 4 creates the secondary routes and moves the detailed controls/data ownership.
- In that same tranche, replace the corresponding inline detailed controls with compact links/status entry points.

Do **not** remove inline functionality in an earlier tranche while deferring its destination to a later tranche.

## 4. Frozen runtime contracts

Unless separately reviewed, PR #159 must preserve:

- multi-System runs;
- whole-System canonical `mode: 'all'`;
- explicit Topic/curated-Tag routes for narrowed Systems;
- exact-Topic hierarchy and structural-parent behavior;
- server-side scope validation;
- global candidate union/deduplication;
- deterministic concrete System attribution;
- Scheduled FSRS ordering/state semantics;
- Free Study semantics;
- 5 / 10 / 20 / All distinct-Case targets;
- default run size 10;
- Scheduled short-term repeat semantics;
- descriptor/proof versions and signed run boundaries;
- Active Review attribution/scope guards;
- browser-run ownership and stale-run invalidation;
- plan → first Review immediate opening;
- completion → next Review continuous navigation;
- cross-System next-open behavior;
- Reset/Fresh concurrency and generation-boundary safety;
- staged learner study-data deletion safety;
- current action-specific deletion fencing;
- current learner Study access boundary.

No schema migration is expected. If implementation discovers that a migration or runtime-contract change is required, amend and re-review this plan rather than silently expanding scope.

## 5. Target `/study` information architecture

A no-current-run target may approximate:

```text
Study

Start a study session

What do you want to study?
☑ Cardiology                          Customize
☐ Respiratory
☑ Endocrinology                       Customize

Cardiology + Endocrinology
142 unique Cases available

Study mode
[ Scheduled ] [ Free ]

Session size
[ 5 ] [ 10 ] [ 20 ] [ All ]

[ Start Study ]

Progress       24 due · 68% coverage      View ›
Study settings Expanded Learning: Off     Manage ›
```

This is an information-architecture target, not a pixel specification.

## 6. Continue-state ownership and pre-hydration behavior

Server-known states take precedence immediately:

1. deletion in progress;
2. Active Review;
3. browser-local run state after hydration.

Browser-run existence is localStorage-owned and therefore unresolved before client hydration. Model that state explicitly, for example:

```text
BROWSER_RUN_UNKNOWN
NO_BROWSER_RUN
RESUMABLE_BROWSER_RUN
```

Equivalent internal names are acceptable.

While browser-run state is `UNKNOWN`:

- do not present `Start a study session` as the established primary action;
- do not render a Start→Continue primary-action flash;
- show a neutral compact resolving/skeleton state or defer the ownership-sensitive launcher region;
- avoid unnecessary layout shift.

Acceptance matrix:

| State | Primary surface | New-run launcher | Requirement |
| --- | --- | --- | --- |
| deletion in progress | Continue deletion | hidden/unavailable | Study remains fenced. |
| Active Review exists | Resume Active Review | hidden/unavailable until resolved/discarded | Active Review remains authoritative. |
| no server-owned blocker; browser state unknown | neutral resolving state | not yet primary | Resolve current-user localStorage first. |
| resumable browser run | Continue browser run | secondary `Start a different run` | Existing run remains intact until successful replacement commit. |
| no current run | Start a study session | primary | Normal chooser. |

### 6.1 Active Review copy must respect revealed state

Do not hard-code `Answers not yet revealed`.

Either render state-aware copy from `activeReview.revealed` or use neutral copy such as `Review in progress` that is correct before and after reveal.

## 7. `Start a different run` is non-destructive until success

When a resumable browser run exists, opening the alternate launcher must not destroy it.

The old browser run survives:

- opening the alternate launcher;
- editing scope/mode/run size;
- customization draft edits;
- Cancel/close;
- eligible-count requests or count failures;
- expected validation failures;
- unexpected planning failures;
- missing/invalid replacement descriptor.

Replacement commit point:

```text
server plan succeeds
→ valid descriptor returned
→ descriptor successfully persisted to browser-run storage
→ browserRun becomes replacement
→ open first Review
```

Do not clear the previous run earlier. If persistence of the replacement fails, do not intentionally discard the prior resumable run; preserve recoverability as far as the storage API permits and surface the failure.

## 8. System selector applied-state machine

Each System has an explicit **applied** state:

```text
UNSELECTED
SELECTED_ALL
SELECTED_ROUTES
```

Submission contract:

```text
UNSELECTED
→ submit nothing

SELECTED_ALL
→ submit exactly { systemId, mode: 'all' }
→ submit no Topic/Tag routes

SELECTED_ROUTES
→ submit exactly applied explicit routes
→ { systemId, mode: 'routes', routes: [...] }
```

Hidden checkbox state must never implicitly determine submission.

### 8.1 Selection lifecycle

- selecting an unselected System enters `SELECTED_ALL`;
- deselecting enters `UNSELECTED` and clears its applied customization for the current launcher state;
- reselecting returns to `SELECTED_ALL`;
- no hidden/stale route values may submit from `UNSELECTED` or `SELECTED_ALL`.

### 8.2 Customization draft is separate from applied state

Opening `Customize` / `Edit` creates a draft.

From `SELECTED_ALL`:

- draft starts as `Whole System`;
- route controls become relevant only after explicit switch to `Specific Topics / Tags`.

From `SELECTED_ROUTES`:

- draft starts from exactly the currently applied route set.

Cancel/close without Apply:

- discard draft;
- applied state and submitted scope remain unchanged.

Apply `Whole System`:

- commit `SELECTED_ALL`;
- clear/ignore prior routes;
- route controls become non-submitting.

Apply `Specific Topics / Tags`:

- require at least one valid explicit contributing route;
- commit `SELECTED_ROUTES` with exactly the applied route set.

### 8.3 Whole System is distinct from selecting every visible route

Customization should make scope mode explicit:

```text
Scope
(•) Whole System
( ) Specific Topics / Tags
```

Scoped bulk actions may exist, e.g.:

```text
Select all Topics
Clear Topics
Select all Tags
Clear Tags
```

Selecting every currently visible Topic/Tag is still routes mode. The browser must never infer canonical `mode: 'all'` from all visible checkboxes being selected.

### 8.4 Preserve Topic hierarchy semantics

Preserve:

- exact-Topic routes only where exact `caseCount > 0`;
- structural zero-exact-Case Topics as UI controls only;
- parent toggles over contributing descendant exact routes;
- indeterminate parent state;
- current ordering/depth/breadcrumb behavior;
- curated Tags as independent routes.

## 9. Eligible-count contract

The combined count remains **informational**. The planner/server resolver remains authoritative for whether a Study run can actually be planned.

### 9.1 Count only applied scope

Count requests must be derived from the same **applied** System state used for submission.

Customization draft behavior:

- opening a draft does not change the displayed count;
- editing draft Topics/Tags does not change the displayed count;
- Cancel leaves count and applied scope unchanged;
- Apply commits the new applied scope, invalidates the old displayed count, and triggers a fresh authoritative count request.

The count endpoint must never receive hidden/cancelled draft routes as though they were applied.

### 9.2 Count failure must not block a valid plan

A temporary read-only count failure must not, by itself, disable or prevent submission of an otherwise valid Study plan.

Allowed UI:

```text
Calculating…
142 unique Cases available
Unable to calculate available Cases. You can still start Study.
No Cases match this selection.
```

The client may use a successful zero count as helpful feedback, but server planning remains the final authority. Do not convert count availability into a new client-side authorization or planning prerequisite.

### 9.3 No arithmetic Topic+Tag count

Do not show a customized per-System count by adding Topic/Tag counts. Those scopes overlap.

Example safe row:

```text
☑ Cardiology
   Arrhythmias + ECG                      Edit
```

Only show a customized per-System Case count if an authoritative server-side union resolver supplies it for that exact applied System scope.

### 9.4 Preserve stale/out-of-order response suppression

The current `/study` count flow uses request sequencing so an older response cannot overwrite a newer selection's count. Preserve that invariant after the applied/draft redesign.

Required behavior:

- every authoritative count request is associated with the applied-scope version/snapshot that triggered it;
- when a newer applied scope triggers another request, all older in-flight count responses become stale for presentation purposes;
- only the latest still-current request may update displayed count, count error/message, or count-loading completion state;
- an older success must not overwrite a newer success or newer error;
- an older error must not overwrite a newer success or newer error;
- draft-only edits do not create a new applied-scope count version because they do not affect the displayed count;
- Apply creates the new applied scope, invalidates the previously displayed count, and starts a request that supersedes any older in-flight request.

Equivalent implementation mechanisms are acceptable: monotonically increasing request IDs, an applied-scope generation token, an applied-scope fingerprint plus request sequence, or another explicit stale-response guard. The important contract is that the displayed count always corresponds to the **latest applied scope**, regardless of network response order.

Add a focused regression that performs rapid successive applied-scope changes, resolves the newer count request first and an older request afterward, and proves the late stale response cannot change the displayed latest-scope count/status.

## 10. Failed-plan rehydration and freshness

Expected validation failures should preserve still-valid learner intent while rejecting stale scope.

Preserve when still valid:

- Scheduled/Free;
- run size;
- selected Systems;
- whole-System `SELECTED_ALL` selections;
- explicit routes that are proven current and valid.

Do not silently convert a narrowed System with no remaining valid routes into whole-System scope.

### 10.1 Validity requires a fresh authority source

Do **not** decide that a previously submitted route is still valid solely by comparing it with pre-submit browser metadata, because that metadata may be the stale source of the failure.

Before preserving/filtering submitted explicit routes after a stale-scope validation failure, use one of these freshness sources:

1. **preferred:** server returns sanitized/validated scope information together with the validation response, based on current server metadata; or
2. refresh/reload current System/Topic/Tag metadata from the server, then rehydrate only routes that remain valid against that refreshed metadata.

If neither fresh source is available for a particular failure, keep the error explicit and require a fresh chooser state rather than silently claiming the old client route is valid.

Never keep rejected stale routes hidden in controls where they can be resubmitted later.

Unexpected failures may retain the current applied client state, but must not clear an existing resumable browser run or manufacture a successful scope.

## 11. Study mode, run size and CTA

Keep Scheduled/Free concise, with contextual help only for the selected mode.

Preserve run-size choices:

```text
[ 5 ] [ 10 ] [ 20 ] [ All ]
```

Default remains 10.

Provide one clear Start CTA. Client validation may guide the learner, but server planning remains authoritative.

## 12. Secondary route data ownership

Detailed information should be loaded by the route that renders it.

Target ownership after Tranche 4:

```text
/study
→ ownership/fence state
→ Systems required for launcher
→ minimal preference summary
→ minimal Progress summary

/study/progress
→ full detailed Progress/history

/study/settings
→ preference management

/study/settings/data
→ Reset/Fresh/delete management
```

If the existing detailed Progress function performs substantially more work than the launcher summary requires, introduce/reuse a focused summary query rather than loading the full result and discarding most fields. Share lower-level calculations rather than duplicating semantics.

## 13. Deletion fencing and action ownership after route split

### 13.1 `/study/progress` must fence before detailed loading

Current `/study` deliberately avoids detailed Progress loading while study-data deletion is active. Preserve that safety when detailed Progress gets its own route.

`/study/progress` must:

- apply the common learner Study access boundary first;
- check deletion state before full Progress/history queries;
- avoid displaying partially deleted/intermediate Study state;
- redirect or render the appropriate deletion-blocked state according to the implementation pattern chosen.

Do not execute the expensive/detailed Progress query and then decide to hide it afterward.

### 13.2 Preserve existing per-action deletion guards

Route extraction must not homogenize current action behavior.

Lock the existing distinctions:

- `plan` — fenced while deletion is active;
- `discard` — fenced;
- `Reset Progress` — fenced;
- `Fresh FSRS Start` — fenced;
- Expanded Learning preference management — remains available under current behavior;
- `deleteStudyData` / `continueStudyDataDeletion` — own and advance the deletion state machine.

All acting user identity remains `locals.user`.

## 14. Browser-local invalidation across secondary routes

Today boundary actions return `browserRunInvalidated`, and `/study` consumes that result to clear learner browser-run localStorage. Moving those actions to `/study/settings/data` must preserve the browser-local half of the boundary.

After successful Reset/Fresh/delete actions that invalidate browser-run state:

- the browser must still clear the same current-user Study run from localStorage;
- the invalidation must occur on the route where the action result is handled or through a shared client helper intentionally reused there;
- navigation back to `/study` must not resurrect the stale run;
- continue-deletion/completion paths must preserve current invalidation semantics;
- server invalidation alone is not sufficient because the browser run is localStorage-owned.

Test this from the secondary route, not only by navigating through `/study` afterward.

## 15. Implementation tranches

### Tranche 1 — hierarchy, ownership hydration, resume-first declutter

Implement:

- acceptance-state matrix;
- pre-hydration browser-run `UNKNOWN` state;
- dominant Continue behavior;
- revealed-safe Active Review copy;
- secondary `Start a different run` entry;
- visual demotion/collapse of Progress/settings/data controls while keeping them fully reachable inline;
- no dead secondary links yet.

Validate:

- no Start→Continue flash;
- Active Review precedence;
- deletion precedence;
- browser run Continue behavior;
- old run preserved when alternate launcher is merely opened/cancelled;
- inline Progress/settings/data actions remain reachable and functional;
- existing access-boundary/runtime regressions stay green.

Commit separately.

### Tranche 2 — compact Systems, applied/draft state, failed-plan rehydration

Implement:

- compact System rows;
- explicit `UNSELECTED` / `SELECTED_ALL` / `SELECTED_ROUTES`;
- separate customization draft;
- deterministic Apply/Cancel/deselect/reselect/reopen behavior;
- explicit Whole System vs Specific Topics/Tags;
- hierarchy/indeterminate behavior;
- no hidden/stale submission;
- failed-plan rehydration using fresh server-sanctioned validity information.

Validate all state transitions plus stale-route failure cases. Specifically prove that pre-submit client metadata is not the sole freshness authority after a stale-route rejection.

Commit separately.

### Tranche 3 — session controls, applied-state count, replacement commit point

Implement:

- concise Scheduled/Free;
- concise 5/10/20/All;
- applied-state-only count requests;
- draft edits do not affect count until Apply;
- Apply triggers fresh authoritative count;
- preserve request sequencing/stale-response suppression across rapid successive applied-scope changes;
- count failure remains non-blocking for planning;
- no arithmetic Topic+Tag counts;
- one Start CTA;
- replacement browser run is persisted only after successful valid plan response.

Validate:

- planner request shape unchanged;
- count endpoint read-only and informational;
- count outage does not independently block valid plan submission;
- rapid successive applied-scope count requests cannot be overwritten by late stale responses;
- failed replacement planning preserves prior browser run;
- successful replacement persists new run and opens first Review.

Commit separately.

### Tranche 4 — secondary routes, access/data/deletion safety, responsive/accessibility polish

Create `/study/progress`, `/study/settings`, `/study/settings/data` or equivalent chosen secondary routes and move detailed controls/data ownership in this same tranche.

Implement:

- common `learnerStudyAccessError` boundary on every new server load/action;
- `locals.user` as sole acting learner identity;
- full Progress/history query ownership on Progress route;
- deletion check before detailed Progress loading;
- preference route preserving current preference/deletion behavior;
- data-management route preserving action-specific fences;
- browser-local invalidation handling for Reset/Fresh/delete on the new route;
- compact `/study` links replacing the still-reachable inline controls in the same commit;
- mobile, keyboard, focus, long-label, live-region and screen-reader polish;
- final documentation reconciliation.

Validate:

- no dead links or lost functionality during the tranche;
- new routes enforce the exact Study access owner;
- submitted identity cannot select another learner;
- Preview-only Admin/access fences remain enforced;
- `/study` does not eagerly load full detailed Progress/history;
- `/study/progress` does not load detailed Progress during deletion;
- Reset/Fresh/delete clear browser-local run from the secondary route;
- preference remains available according to current behavior;
- all relevant specialized regressions pass.

Commit separately.

## 16. Regression requirements

Preserve/extend focused coverage for:

- learner Study access boundary on `/study` and all new secondary routes/actions;
- authentication, Preview-only Admin exclusion and learner runtime access/write fence;
- identity derived only from `locals.user`;
- Active Review/deletion/browser-run ownership matrix;
- pre-hydration browser-run state;
- Active Review revealed/unrevealed copy;
- browser run storage/open/completion;
- non-destructive `Start a different run`;
- replacement commit point;
- System applied/draft state machine;
- no stale/hidden route submission;
- Whole System vs all-visible-routes distinction;
- exact Topic hierarchy;
- applied-state-only combined count;
- stale/out-of-order count response suppression so only the latest applied scope can update count UI;
- count failure not becoming a plan gate;
- authoritative union/deduplication;
- failed-plan rehydration from fresh validity information;
- Scheduled/Free and run-size behavior;
- cross-System continuous navigation;
- Expanded Learning preference behavior;
- Reset/Fresh actions;
- learner study-data deletion;
- browser-local invalidation after moved boundary actions;
- deletion fencing before detailed Progress loading;
- route-level detailed-data ownership.

Do not weaken existing specialized tests merely to land the redesign.

## 17. Acceptance scenarios

Before marking PR #159 Ready, verify at least:

1. deletion in progress;
2. Active Review unrevealed;
3. Active Review revealed;
4. browser ownership unresolved before hydration;
5. resumable browser run;
6. no current run;
7. `Start a different run` opened then cancelled;
8. replacement planning fails and old run survives;
9. replacement planning succeeds and new run replaces old run;
10. whole-System selection;
11. deselect/reselect;
12. customize then Cancel;
13. customize routes then Apply;
14. customized → Whole System;
15. all visible routes remain routes mode;
16. draft route edits leave count unchanged;
17. Apply changes scope and triggers fresh count;
18. rapid successive applied-scope changes return count responses out of order and only the latest applied scope remains displayed;
19. count request fails but valid plan can still submit;
20. zero-count feedback;
21. stale route rejected with fresh metadata/server-sanitized rehydration;
22. narrowed System loses every valid route and is not silently widened;
23. multi-System overlapping Cases remain deduplicated;
24. Scheduled + fixed run size;
25. Free + All;
26. Tranches 1–3 retain inline Progress/settings/data reachability;
27. Tranche 4 secondary routes enforce `learnerStudyAccessError`;
28. direct `/study/progress` during deletion does not load/display partial Progress;
29. Reset from secondary route clears browser run;
30. Fresh from secondary route clears browser run;
31. delete/continue deletion from secondary route preserve browser invalidation;
32. preference remains available according to current deletion behavior;
33. another learner identity cannot be supplied by the client;
34. Preview-only Admin exclusion remains enforced;
35. mobile/narrow layout;
36. keyboard-only operation;
37. focus restoration;
38. screen-reader semantics for count/status/customization states;
39. long System/Topic/Tag labels and large System lists.

## 18. Out of scope

Do not add in PR #159:

- balanced/equal System quotas;
- per-System scheduler state;
- new FSRS algorithms/optimizer behavior;
- new descriptor/scope/proof versions;
- new taxonomy semantics;
- automatic Tag inference;
- synthetic `Mixed` System;
- changes to Case eligibility;
- schema/migrations unless a blocker is explicitly re-planned;
- Production deployment or Production D1 mutation.

## 19. Success criteria

The redesign is complete when:

1. the primary Study action is obvious without exposing control-panel density;
2. server-owned and browser-owned resume states have deterministic precedence;
3. no pre-hydration Start→Continue flash occurs;
4. whole-System study remains the simple default;
5. customization has deterministic applied/draft semantics;
6. hidden/cancelled/stale routes never submit;
7. count reflects the latest applied scope only, remains informational, and cannot be overwritten by stale/out-of-order responses;
8. stale-route rehydration uses fresh authority, not stale browser metadata alone;
9. alternate planning never destroys the prior browser run before successful replacement persistence;
10. detailed secondary data is loaded only by the route that renders it;
11. every new Study route preserves the common learner access boundary and `locals.user` identity ownership;
12. deletion fencing and per-action behavior remain unchanged;
13. Reset/Fresh/delete still invalidate browser-local run state after route extraction;
14. every tranche is coherent and leaves no dead links or temporarily removed functionality;
15. mobile/accessibility behavior is preserved or improved;
16. all existing runtime/FSRS/scope/Active Review/reset/deletion/continuous-navigation contracts remain intact;
17. the full implementation lands as sequential commits within this single Draft PR before it is marked Ready.
