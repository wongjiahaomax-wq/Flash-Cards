# Multi-System Learner UX Implementation

_Status: repository implementation authority for the Multi-System UX learner cutover. This document does not claim Production deployment or Production D1 mutation._

_Date: 5 September 2026._

This document records the learner-facing tranche assigned by `MULTI_SYSTEM_STUDY_PLAN.md`, built on the already-merged Runtime v2 foundation from PR #147. Current executable code remains authoritative where this companion and implementation differ.

## Learner chooser

Normal `/study` now presents one combined chooser rather than one independent form per System.

The learner may:

- select one or more active Systems;
- leave a selected System at its default whole-System scope;
- expand a System and turn on narrowing when only specific existing Topics and/or curated Tags should be included;
- choose Scheduled Study or Free Study once for the combined run;
- choose `5`, `10`, `20`, or `All available` distinct Cases once for the combined run, with `10` as the default.

A selected System that is not narrowed is submitted to the v2 runtime as:

```js
{ systemId: '<system>', mode: 'all' }
```

The browser does not materialize all of that System's Topic/Tag routes merely to express whole-System selection.

A narrowed System is submitted as:

```js
{
  systemId: '<system>',
  mode: 'routes',
  routes: [
    { routeType: 'topic', routeId: '<topic>' },
    { routeType: 'tag', routeId: '<curated-tag>' }
  ]
}
```

The existing local `/fsrs-preview` single-System form remains accepted by the shared parser and is translated into one v2 routes-mode System entry. This preserves the valid single-System flow as a special case without introducing descriptor/proof compatibility machinery.

### Topic hierarchy semantics

The multi-System learner chooser preserves the pre-existing exact-Topic hierarchy contract rather than flattening structural Topics into routes.

`src/lib/study-topic-hierarchy.js` centralizes the hierarchy primitives used by the learner surface:

- exact-Topic route enumeration excludes Topics whose exact `caseCount` is zero;
- a structural parent with zero exact Cases is a UI control only and never receives a submitted `route:<systemId>` form name;
- checking or clearing a parent toggles the contributing exact-Topic routes in its descendant subtree;
- partial descendant selection produces the indeterminate parent state;
- Topic display order and indentation follow the existing breadcrumb hierarchy;
- curated Tags remain independent routes and may add Cases outside checked Topics.

This is the same semantic model that the earlier single-System chooser enforced: structural parents help navigate/select the tree but do not change exact Topic membership into descendant-inclusive server routes.

## Server-authoritative request wiring

The learner form is only a request boundary.

`src/lib/server/learning/plan-system-study.ts` parses the submitted Systems and requested narrowing, then delegates directly to the merged canonical Runtime v2 planners:

```text
planScheduledMultiSystemStudyRun
planFreeMultiSystemStudyRun
```

Those planners continue to call `resolveMultiSystemStudySelection(...)`, which owns:

- raw v2 scope bounds;
- active-System validation;
- Topic/curated-Tag validation against the declared System;
- deterministic normalization;
- candidate resolution;
- global Case union/deduplication;
- deterministic concrete System attribution.

No browser-supplied candidate list, eligible count, or attribution System is authoritative.

The Runtime v2 descriptor/proof versions, Active Review v2 attribution envelope, D1 guard, exact-zero cutover mechanics, and Production fence are unchanged by this UX tranche.

## Combined eligible Case count

`POST /study/api/count` is a read-only learner count owner. It uses the same submitted-scope parser and calls the same authoritative `resolveMultiSystemStudySelection(...)` server resolver used by planning.

The displayed count is therefore:

```text
selection.candidates.length
```

after the canonical cross-System union/deduplication step.

The UI never sums per-System counts. A Case reachable through more than one selected System contributes exactly once to the displayed combined count, matching the planner's candidate semantics.

Per-System card counts remain informational whole-System counts only; they are not added to derive the combined count.

## Scheduled and Free Study behavior

Scheduled Study applies the existing FSRS ordering policy to the combined unique candidate pool. There is no equal/balanced System quota and no per-System scheduler state.

Free Study builds one shuffled bag from the combined unique candidate pool and continues to write no Scheduled FSRS rating/state/event/optimizer/System aggregate.

For both modes, run size is one global distinct-Case target across the combined pool:

```text
5 / 10 / 20 / All available
```

Default remains `10`.

Required Scheduled short-term repeats retain their existing semantics and do not consume another distinct-Case slot.

## Continuous navigation

The existing learner navigation owner is deliberately reused rather than forked for Multi-System UX.

Planning still writes the returned v2 descriptor to browser run state and immediately calls the normal `/study/api/open` path, so plan → first Case opening remains immediate.

After completion, `/study/[reviewId]` applies the returned descriptor update and calls `requestNextLearnerStudyWork(...)` again. Because the v2 descriptor already contains the complete mixed run scope and combined queue/bag, the next Case may belong to a different selected System without returning to the chooser.

No System-specific navigation branch or synthetic `Mixed` System was added.

### Real A → B next-open acceptance

The specialized Runtime v2 CI now includes `scripts/multi-system-v2-cross-navigation-d1.mjs` and its workerd Worker fixture. The fixture seeds two real Cases with distinct concrete attribution:

```text
Case A → System A Primary Topic
Case B → System B Primary Topic
```

For both Scheduled and Free Study the acceptance performs the actual sequence:

```text
canonical multi-System plan
→ select/open Case A through the real Active Review creator
→ reveal + commit the real server completion
→ apply the returned durable completion receipt/event to descriptor v2
→ select the next descriptor item
→ open Case B through the real Active Review creator
→ verify concrete System B attribution and preserved two-System runScope
→ complete Case B
```

This complements the original Runtime v2 overlapping-Case lifecycle fixture. The original fixture continues to prove deterministic attribution/deduplication for one Case reachable through more than one System; the new fixture specifically proves completion → next-open across a genuine System boundary.

## Regression and CI ownership

Learner UX regression coverage locks:

- multi-System form parsing;
- whole-System `mode: 'all'` without route materialization;
- explicit per-System narrowing;
- single-System form preservation;
- structural Topic parents remaining non-submitting descendant controls;
- subtree toggle, hierarchy ordering and indeterminate-state source contracts on the actual `/study` learner surface;
- union/deduplicated count semantics with an overlapping Case;
- Scheduled and Free browser-descriptor advancement across Cases contributed by different Systems;
- migrated-D1 Scheduled and Free Case-A → completion → real Case-B next-open acceptance;
- source contracts requiring the learner chooser, server count owner, canonical multi-System planners, and existing continuous-navigation owner.

The dedicated Multi-System Runtime v2 workflow owns the learner hierarchy/request surfaces and their focused regressions, including:

```text
src/lib/study-topic-hierarchy.js
src/lib/server/learning/plan-system-study.ts
src/routes/study/**
test/multi-system-learner-ux.test.js
test/system-study-chooser-pr-b.test.js
scripts/multi-system-v2-*.mjs
scripts/multi-system-v2-*.js
```

It runs the learner UX regressions alongside the existing Runtime v2 source/runtime tests, migrated-D1 scope/lifecycle acceptance, the real cross-System next-open acceptance, and supported-envelope benchmarks.

The normal repository CI and existing Scheduled/Free/browser workflows remain additional owners for their respective runtime surfaces.

## Deliberately unchanged / deferred

This UX tranche does not introduce:

- balanced or equal System quotas;
- per-System FSRS state or parameter sets;
- a synthetic `Mixed` System;
- FSRS algorithm/optimizer changes;
- another descriptor, scope, or proof version;
- v1 learner compatibility machinery;
- a different Active Review attribution model;
- Production deployment or Production D1 mutation.

Any future balanced/interleaved sampling mode remains a separate product decision.

## Release status

Repository merge and Production operations are separate explicit steps. Establish the current branch/PR merge state from GitHub rather than relying on a status sentence in this document.

```text
Base Runtime v2: merged PR #147
UX implementation: repository branch/PR represented by this document
Production D1 mutation by this tranche: not performed
Production Worker deployment by this tranche: not performed
Production cutover workflow dispatch by this tranche: not performed
```

A repository implementation or merged PR is not evidence that Production is deployed.
