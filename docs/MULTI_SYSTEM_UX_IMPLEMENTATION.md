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

## Regression and CI ownership

Learner UX regression coverage locks:

- multi-System form parsing;
- whole-System `mode: 'all'` without route materialization;
- explicit per-System narrowing;
- single-System form preservation;
- union/deduplicated count semantics with an overlapping Case;
- continuous browser-run advancement across Cases contributed by different Systems;
- source contracts requiring the learner chooser, server count owner, canonical multi-System planners, and existing continuous-navigation owner.

The dedicated Multi-System Runtime v2 workflow now also owns:

```text
src/lib/server/learning/plan-system-study.ts
test/multi-system-learner-ux.test.js
```

and runs the learner UX regression alongside the existing Runtime v2 source/runtime tests plus migrated-D1 scope/lifecycle acceptance and supported-envelope benchmarks.

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

At implementation handoff, repository merge and Production operations are separate explicit steps.

```text
Base Runtime v2: merged PR #147
UX PR: reviewable, not merged
Production D1 mutation: not performed
Production Worker deployment: not performed
Production cutover workflow dispatch: not performed
```

A repository implementation or merged PR is not evidence that Production is deployed.
