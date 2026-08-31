# PR #119 — ChatGPT Chat Sol implementation prompt

You are the implementation agent for the EXISTING Draft PR:

`wongjiahaomax-wq/Flash-Cards`

PR:

`#119 — Learner UX: systems-first study layout`

This is a continuation of the existing PR.

Do not create a new PR.
Do not create a new feature branch.
Do not restart from `main`.
Do not merge the PR.
Do not mark the PR Ready for Review.
Keep PR #119 Draft at handoff.

Your task is to implement the learner systems-first Study UX and the Production Admin learner-preview behavior already planned in this PR.

## First: inspect the actual current state

Do not assume this prompt's repository details are fresher than the repository.

Before editing:

1. Inspect PR #119 itself:
   - current head SHA;
   - head branch;
   - intended base;
   - complete current diff against base;
   - current Draft status;
   - current GitHub CI/check state.
2. Continue the existing PR #119 branch exactly as it exists.
3. Read repository guidance:
   - `AGENTS.md`;
   - `docs/DOCUMENTATION_INDEX.md`;
   - `docs/AGENT_TASK_MAP.md`;
   - nearest scoped guidance for every area you touch, especially `src/routes/admin/AGENTS.md`;
   - `docs/ENGINEERING_ARCHITECTURE_GUIDELINES.md`, because this task introduces a focused shared UI/server boundary.
4. Read the PR's implementation contract in full:
   - `docs/LEARNER_SYSTEMS_FIRST_STUDY_LAYOUT_PLAN.md`.
5. Inspect the directly relevant implementation and tests before changing anything. At minimum inspect:
   - `src/routes/study/+page.server.js`;
   - `src/routes/study/+page.svelte`;
   - `src/routes/study/[reviewId]/+page.server.js`;
   - `src/routes/study/[reviewId]/+page.svelte`;
   - `src/routes/admin/+layout.server.js`;
   - `src/routes/admin/+page.svelte`;
   - `src/lib/server/preview-auth.js`;
   - `src/lib/server/db/study-navigation.ts`;
   - `src/lib/server/learning/system-review-navigation.ts`;
   - `src/lib/server/learning/system-study-routes.ts`;
   - relevant `startSystemReview(...)` implementation in `src/lib/server/db/learning.js`;
   - `test/contextual-system-topic-tag-navigation.test.js`;
   - `test/system-review-navigation.test.js`;
   - any existing Study/Admin/auth/UI source-contract tests that current repository search shows are directly relevant.

If current implementation has moved since this prompt was written, follow current executable behavior and the PR plan's invariants rather than forcing stale file assumptions.

## Goal

Implement the existing contextual learner Study navigation as a progressive systems-first UX:

`System → All / Topic / curated Tag → question set → Review`

At the same time, fix the Production Admin dashboard's **Preview learner study** behavior so an authenticated Production Admin can preview and exercise that prospective systems-first learner flow before it is enabled for ordinary learners.

The Admin preview must use the actual learner presentation/workflows, not a copied visual mock.

## Current problem to preserve/resolve correctly

The repository already supports System navigation behind `SYSTEM_STUDY_NAVIGATION_ENABLED`.

While the flag is off:

- ordinary `/study` intentionally falls back to the legacy Topic flow;
- ordinary `/study?/startSystem` must remain unavailable;
- the Admin dashboard currently links **Preview learner study** directly to `/study`, so Admin also sees Topics and cannot inspect the prospective learner System UX.

The existing `startSystem` action also checks the feature flag. Therefore merely loading System data in an Admin page is insufficient; the Admin preview needs a narrowly authorized way to invoke the same System-start validation and Review creation without weakening the public learner boundary.

Also note that the existing `/study/[reviewId]` route suppresses System **Next case** when the feature flag is off. If Admin preview can create a System Review before rollout, the Admin must be able to continue that preview coherently while ordinary learners remain gated.

## Non-negotiable product/domain invariants

Preserve all of these:

- System is the top-level learner navigation grouping.
- Topic is canonical Case classification and direct Topic-question scope.
- Tag is contextual cross-cutting metadata, not an alternate Topic.
- A Case still has one canonical Primary Topic plus zero or more Case Tags.
- Selecting a curated Tag does not reclassify the Case.
- `System → All` keeps existing deduplication and native-Topic-precedence behavior.
- Existing System route membership validation remains authoritative.
- Existing Original vs Expanded question-pool semantics remain authoritative.
- Existing Review snapshot/provenance semantics remain authoritative.
- Existing reveal, rating, Original→Expanded continuation, and learner Review behavior remain authoritative.
- Ordinary learner Next-case behavior remains governed by the rollout flag.
- The Admin preview exception must not globally enable learner System navigation.

Do not change application/domain behavior beyond the explicitly requested Admin-preview authorization path and the learner Study presentation change.

## Security / rollout invariants

- Ordinary `/study` must continue to respect `SYSTEM_STUDY_NAVIGATION_ENABLED` until an explicit later rollout decision.
- Do not set or enable that production flag as part of this implementation.
- Do not add a public query-string bypass such as `/study?preview=true`.
- The Production Admin preview must live under the existing `/admin` authorization boundary, preferably `/admin/study-preview`.
- Reuse the canonical `isProductionAdmin(...)` predicate where a Production Admin check is needed.
- Preserve the existing Preview Worker / Preview-only Admin learner Study block.
- Do not broaden `preview_admin` authority.
- Do not redesign the retained Preview Worker subsystem.
- Do not weaken Production-vs-Preview data ownership predicates.

## UX requirements

### Systems-first learner entry

When System navigation is available, `/study` should initially show compact System choices rather than all nested controls for all Systems.

Each initial System choice should show roughly:

- System name;
- eligible Case count;
- a clear select/open affordance.

On selection, progressively disclose only that System's configuration.

Route order must be:

1. **All cases**;
2. **Topics**;
3. **Curated Tags**.

Topics and Tags must remain semantically/visually distinguishable.

Nested Topic breadcrumbs should remain available where useful.

Question-set controls appear only for the selected System:

- Original questions — default;
- Expanded Learning.

Fresh System selection defaults:

- route = `all`;
- question pool = `core`.

If a `startSystem` action fails, reopen the submitted System and restore its submitted route/question-pool values. Do not display that error against unrelated Systems.

The learner must have an obvious way to change the selected System.

The interaction must remain keyboard accessible and use native form/button/radio semantics where practical.

### Responsive requirements

- compact System grid on desktop where appropriate;
- single-column or otherwise natural flow on narrow viewports;
- long System/Topic/Tag names and breadcrumbs wrap;
- no horizontal overflow;
- controls remain comfortably tappable.

Do not turn this into a broad visual redesign of unrelated pages.

## Preferred implementation architecture

Treat `docs/LEARNER_SYSTEMS_FIRST_STUDY_LAYOUT_PLAN.md` as the detailed contract. The preferred shape is below; adjust exact filenames/API only if current code provides a materially better narrow implementation.

### A. Shared System chooser

Create a focused shared Svelte component, preferably:

`src/lib/components/study/SystemStudyChooser.svelte`

It should own only systems-first presentation/client selection state.

It should be reused by:

- the System-enabled branch of `/study`;
- `/admin/study-preview`.

Do not copy the System UI into two pages.

Keep learner page shell/account/header and the legacy Topic branch in `/study/+page.svelte` unless a smaller coherent extraction is clearly better.

The Admin preview page may add only a small **Admin learner preview** indicator and **Back to Admin** affordance around the actual shared learner chooser.

### B. Shared flag-independent System-start workflow

Do not duplicate the current System route parsing/question-pool validation/start logic into the Admin route.

Extract the smallest coherent route-independent server workflow, preferably a new TypeScript module under:

`src/lib/server/learning/`

For example:

`src/lib/server/learning/start-system-study.ts`

The exact API is yours to design after reading current code, but it must:

- be independent of Admin authorization;
- be independent of `SYSTEM_STUDY_NAVIGATION_ENABLED`;
- parse/validate the requested `systemId`, route, and `questionPoolMode` consistently;
- invoke the existing canonical `startSystemReview(...)` operation;
- preserve current known failure semantics so both routes can return the same useful form payload.

Then:

- public `/study?/startSystem` retains its existing feature-flag guard before invoking the shared workflow;
- `/admin/study-preview?/startSystem` is allowed because the request is already inside the Production Admin route boundary, not because the shared workflow knows about Admins.

Do not create a generic authorization abstraction just for this task.

### C. Dedicated Admin preview entry

Add the Admin-only route under the existing Admin layout:

`/admin/study-preview`

Expected files:

- `src/routes/admin/study-preview/+page.server.js`;
- `src/routes/admin/study-preview/+page.svelte`.

The inherited `/admin/+layout.server.js` remains the primary Production Admin boundary.

Load behavior:

- if DB is unavailable, expose a meaningful database-not-configured state;
- otherwise call `listStudySystems(...)` regardless of the learner feature flag;
- return only the model needed by the shared chooser.

Action behavior:

- expose named `startSystem` so the shared chooser can use the same form action name;
- require valid DB/user context;
- invoke the shared flag-independent System-start workflow;
- preserve the same validation failure shape used by learner Study;
- redirect successful starts to the existing `/study/{reviewId}` route.

Change the Production Admin dashboard **Preview learner study** shortcut from `/study` to `/admin/study-preview`.

### D. Reuse the real learner Review page for Admin preview

Do not create a copied Admin review page unless concrete evidence shows it is unavoidable.

A System Review started from Admin preview should redirect into the existing learner `/study/[reviewId]` UI.

While `SYSTEM_STUDY_NAVIGATION_ENABLED=false`:

- ordinary learners must still have System Next case unavailable;
- an authenticated Production Admin viewing an existing System Review must be allowed to use System Next case so the pre-rollout preview is end-to-end.

Implement this narrowly in `src/routes/study/[reviewId]/+page.server.js` using the canonical `isProductionAdmin(...)` predicate.

The effective System-next availability decision must be identical in both places:

- the `nextCaseAvailable` value returned by `load`;
- the boolean supplied to `resolveNextSystemStudyRoute(...)` in the `next` action.

Do not create UI/action disagreement.

For a flag-off Production Admin System Review, expose enough navigation state for the existing Review page to link back to `/admin/study-preview` rather than the legacy Topic screen. Keep the actual Review content/UI unchanged apart from this narrow preview navigation indicator/return behavior if needed.

The existing Preview Worker / Preview-only Admin learner-access block must still execute before this Production Admin exception can matter.

## Suggested implementation checkpoints

Implement coherently; these are sequencing boundaries, not separate PRs.

### Checkpoint A — shared System-start server workflow

- extract route-independent System-start parsing/validation/start behavior;
- keep public learner feature flag guard intact;
- add focused tests where needed;
- ensure error behavior/provenance is unchanged.

### Checkpoint B — shared chooser + progressive disclosure

- extract System UI from `/study`;
- implement compact System selection;
- implement All / Topics / Curated Tags grouping;
- implement question-set disclosure;
- preserve failed form state;
- keep legacy Topic fallback behavior intact.

### Checkpoint C — Production Admin preview entry

- add `/admin/study-preview`;
- always load System navigation there;
- reuse shared chooser and shared start workflow;
- update dashboard link;
- verify authorization/wiring.

### Checkpoint D — end-to-end Admin preview Review

- allow flag-off Production Admin System Next case only;
- ordinary learner flag behavior unchanged;
- align load/action availability predicate;
- return Admin preview to `/admin/study-preview` appropriately.

### Checkpoint E — full integrated validation

- exercise learner flag-off behavior;
- exercise learner flag-on System chooser;
- exercise Admin flag-off systems-first preview;
- exercise Original and Expanded starts;
- exercise reveal/rate/continue/Next-case preview flow;
- exercise narrow viewport/long labels;
- validate security boundaries;
- run final repository validation.

## Testing requirements

Do not rely only on visual inspection or source contracts for server/domain behavior.

Preserve and use existing domain tests, especially the current System navigation and Review provenance owners.

Add or extend focused tests so the following are demonstrably protected:

1. ordinary flag-off `/study` cannot use System start;
2. the Admin preview route is under the Production Admin authorization boundary;
3. Admin preview can start a System Review while the learner flag is off;
4. both entry paths share the same System-start parsing/validation/Review creation owner;
5. invalid System/route combinations still fail safely;
6. invalid/unavailable question-pool behavior is unchanged;
7. System Review provenance is unchanged;
8. ordinary flag-off learner System Next case remains unavailable;
9. flag-off Production Admin System Review Next case is available;
10. Preview Worker / Preview-only Admin remains blocked from learner Study;
11. Admin dashboard preview points to the explicit Admin preview route;
12. learner System view and Admin preview share one System chooser presentation owner;
13. failed action state restores the correct selected System/route/question set.

A narrowly scoped source-level assertion is acceptable for UI reuse/wiring when it is the strongest cheap owner. Do not replace stronger behavioral tests with source reading merely to simplify the suite.

## Validation workflow

Follow the current repository-owned validation contract rather than hard-coding obsolete commands.

If you have a usable local checkout/command execution environment, start with:

`npm run agent:doctor`

During implementation:

- run focused tests after meaningful server/workflow logic changes;
- use Vite/HMR for iterative Svelte/CSS work;
- do not run full validation after every visual edit;
- after a coherent implementation batch run `npm run agent:checks`;
- run all required/recommended specialized checks that are relevant;
- use `npm run validate:fast` at useful checkpoints.

Before final handoff, if local execution is available, run:

`npm run validate:full`

Do not claim a command ran when it did not.

If you are operating remotely through GitHub without a usable local command environment:

- make coherent edits rather than speculative CI loops;
- review the complete PR diff before handoff;
- inspect GitHub CI/check results;
- report GitHub CI evidence separately from local execution;
- clearly state any validation you could not execute.

## Manual/UX verification matrix

Use available local/browser capabilities where possible.

At minimum verify these scenarios conceptually and, when runtime/browser access exists, interactively:

| User/context | Feature flag | Expected Study entry |
| --- | --- | --- |
| ordinary learner | off | legacy Topic flow |
| ordinary learner | on | new systems-first progressive chooser |
| Production Admin `/study` | off | still legacy Topic flow; Admin privilege does not silently change public entry |
| Production Admin `/admin/study-preview` | off | systems-first progressive chooser |
| Preview Worker / Preview-only Admin | any | existing learner Study restriction remains |

For the Admin preview flow with flag off:

- select a System;
- select All;
- select a native Topic;
- select a curated Tag if available;
- start Original questions;
- start Expanded Learning;
- confirm invalid/unavailable selection error state stays on the selected System;
- complete a System Review and use Next case;
- confirm return navigation goes back to Admin learner preview rather than the flag-off learner Topic list.

Also inspect mobile/narrow behavior and long Topic/Tag breadcrumbs for horizontal overflow.

## Acceptance criteria

Do not hand off until the implementation satisfies all of these or you explicitly report a concrete blocker:

1. System-enabled `/study` initially shows compact System choices.
2. Only the selected System exposes route and question-set controls.
3. All cases + Original questions are fresh-selection defaults.
4. Topics and curated Tags remain visibly/semantically distinct.
5. Failed System start restores the submitted System, route, question set, and local error.
6. Existing route eligibility, deduplication, question-pool semantics, Review snapshots/provenance, and ordinary learner Review behavior remain intact.
7. Narrow/mobile layouts do not horizontally overflow.
8. With flag off, ordinary `/study` remains the legacy Topic flow.
9. With flag off, Production Admin `/admin/study-preview` shows the new systems-first learner flow.
10. Public learner Study and Admin preview use the same System chooser component/presentation owner.
11. Learner System start and Admin preview System start use the same flag-independent validation/start workflow owner.
12. Admin-started System Review uses the actual learner Review page.
13. Flag-off Production Admin System Review can use Next case; flag-off ordinary learner cannot.
14. Non-Admins cannot force the Admin preview/bypass from public Study.
15. Preview Worker / Preview-only Admin restrictions are unchanged.
16. No schema/migration change exists.
17. No production D1/R2 mutation occurred.
18. No deployment occurred.
19. PR #119 is still Draft.

## Explicitly out of scope

Do not:

- enable the learner System-navigation production flag;
- change taxonomy/domain semantics;
- add Additional Study Topics;
- change Case classification;
- change question eligibility/provenance rules;
- change Review snapshot/rating semantics;
- add schema or migrations;
- edit historical migrations;
- mutate Production D1/R2;
- deploy anything;
- redesign unrelated Admin pages;
- redesign/decommission/expand the Preview Worker subsystem;
- create a second learner Review app under Admin without compelling current-code evidence;
- broaden this into a general Study architecture refactor;
- merge the PR;
- mark it Ready for Review.

## Handoff requirements

At the end:

1. keep PR #119 Draft;
2. report the final PR head SHA;
3. summarize implementation by behavioral area, not just filenames;
4. list every file changed;
5. report focused tests/checks actually executed and their results;
6. report GitHub CI/check evidence separately;
7. explicitly state anything you could not execute or verify;
8. state whether any implementation detail diverged from `docs/LEARNER_SYSTEMS_FIRST_STUDY_LAYOUT_PLAN.md`, and why;
9. identify any remaining user-testing items, especially progressive-disclosure ergonomics/mobile layout;
10. stop. Do not begin learner rollout/feature-flag enablement without a new explicit instruction.
