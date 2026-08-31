# Learner Systems-First Study Layout Plan

_Status: implementation-ready plan for Draft PR #119._

_Last updated: 31 August 2026_

## Goal

Make learner Study use the existing contextual navigation model:

```text
Study
→ choose System
→ choose All / Topic / curated Tag
→ choose question set
→ start Review
```

The Production Admin portal's **Preview learner study** entry must show the same prospective learner experience even while the real learner rollout flag remains disabled. Admin preview is therefore a pre-rollout UX validation surface, not merely a link to whatever learner rollout state happens to be active.

This work must not redefine the taxonomy model, Case classification, question eligibility, Review provenance, production content, or ordinary learner rollout policy.

## Current state confirmed from implementation

### Learner Study entry

`src/routes/study/+page.server.js` already supports two paths:

- when `SYSTEM_STUDY_NAVIGATION_ENABLED` is enabled, load `listStudySystems()` and expose `startSystem`;
- otherwise load the legacy Topic list and expose `start`.

The current `startSystem` action has its own feature-flag guard. Therefore Admin preview cannot be implemented only by rendering System data: a flag-off Admin preview also needs a safe way to invoke the same System-start workflow without weakening the ordinary learner action.

### Learner Study presentation

`src/routes/study/+page.svelte` currently contains both:

- the systems-first markup; and
- the legacy Topic fallback.

The systems-first branch renders every System's route choices, question-set controls, and Start button simultaneously. This is the presentation density this PR is intended to fix.

### Existing learner Review

`src/routes/study/[reviewId]/+page.server.js` and `+page.svelte` already own the real learner Review UI and Review lifecycle.

For System Reviews, `nextCaseAvailable` and the `next` action currently depend on `systemStudyNavigationEnabled(platform?.env)`. If an Admin starts a System Review while the global learner flag is off, the initial review itself can work, but the existing route would suppress/reject System **Next case** unless this Admin-preview case is handled deliberately.

### Admin boundary

The Production Admin dashboard currently links **Preview learner study** directly to `/study`, so it inherits the learner feature flag and shows Topics while the flag is off.

`src/routes/admin/+layout.server.js` already provides the desired authorization boundary:

- Preview Worker is rejected;
- authentication is required;
- the user must have the production `admin` role.

This is separate from the retained Preview Worker / `preview_admin` subsystem.

## Product model to preserve

The existing contextual navigation contract remains authoritative:

- **System** is the top-level learner navigation grouping.
- **Topic** is the canonical Case classification and direct Topic-question scope.
- **Tag** is cross-cutting metadata that may be curated as a learner route within one or more Systems.
- A Case still has one canonical Primary Topic plus zero or more Case Tags.
- Selecting a Tag route does not reclassify the Case or substitute another Study Topic.
- `System → All` remains the deduplicated union of native descendant Topic routes plus curated Tag routes, with native Topic provenance taking precedence for duplicate Cases.
- Existing Review snapshots, question eligibility, provenance, reveal/rating behavior, Original→Expanded continuation, and ordinary learner Next-case semantics remain authoritative.

## Target learner experience

### Stage 1 — choose a System

The systems-first Study entry initially presents compact System choices.

Each choice should expose only information needed to choose the System:

- System name;
- eligible Case count;
- a clear select/open affordance.

The initial viewport should answer:

> **What System do I want to study?**

Do not initially render every Topic, Tag, question-pool choice, and Start button for every System.

### Stage 2 — configure the selected System route

After selection, progressively disclose only that System's study configuration.

Present routes in this semantic order:

1. **All cases** — primary/default;
2. **Topics** — native descendant Topic routes;
3. **Curated Tags** — explicitly labelled Tags and visually secondary/distinct from Topics.

For nested Topics, retain breadcrumb context where it disambiguates hierarchy.

Changing the selected System should reset its route to **All cases** and its question set to **Original questions**, unless the page is restoring a failed submitted form for that System.

### Stage 3 — choose question set

Only after a System is selected, show:

- **Original questions** — default;
- **Expanded Learning**.

### Stage 4 — start Review

Use the existing canonical `startSystemReview(...)` behavior.

Validation errors must remain associated with the submitted/selected System, and the UI must restore that System and the rejected route/question-set selection after an action failure.

## Production Admin learner-preview requirement

The Production Admin portal must be able to exercise the prospective systems-first learner flow before it is enabled globally.

Required behavior:

1. **Preview learner study** opens a dedicated Admin-authorized entry such as `/admin/study-preview`.
2. The Admin entry always loads `listStudySystems()` regardless of `SYSTEM_STUDY_NAVIGATION_ENABLED`.
3. It uses the same System chooser/configuration presentation owner as the real System-enabled `/study` path.
4. It uses the same route/input validation and the same canonical `startSystemReview(...)` operation as the learner path.
5. The feature-flag bypass exists only because the request is inside the existing Production Admin authorization boundary; the public `/study` System action retains its current flag guard.
6. Starting a System Review from Admin preview redirects into the existing learner Review page rather than a copied Admin review page.
7. A Production Admin viewing a System Review while the global System-navigation flag is disabled may continue to the next System case. This exception is Admin-only; ordinary learners remain governed by the rollout flag.
8. In that Admin-preview state, the Review page should provide a sensible return path to `/admin/study-preview` rather than sending the Admin back to the flag-off Topic list.
9. Preview Worker / Preview-only Admin learner-study restrictions remain intact.
10. No query-string switch on `/study` may grant preview authority to a non-Admin.

## Resolved implementation architecture

The implementation should use one presentation owner and one System-start validation/workflow owner while keeping authorization/rollout decisions at route boundaries.

### 1. Shared systems-first chooser component

Create a focused shared component, preferably:

```text
src/lib/components/study/SystemStudyChooser.svelte
```

Responsibilities:

- render the compact System chooser;
- own progressive-disclosure client state;
- render the selected System's All / Topics / Curated Tags sections;
- render Original / Expanded question-set controls;
- preserve failed form state for the submitted System;
- submit the existing named action `?/startSystem`;
- remain agnostic about whether its caller is ordinary learner Study or Production Admin preview.

Do **not** put authorization, feature-flag decisions, database reads, or Review creation into the Svelte component.

`src/routes/study/+page.svelte` should retain the learner page shell/header and legacy Topic fallback. Its System-enabled branch should delegate to the shared component instead of owning a second copy of the systems-first UI.

`src/routes/admin/study-preview/+page.svelte` should provide only a small Admin-preview shell/indicator and **Back to Admin** affordance around the same shared chooser.

### 2. Shared flag-independent System-start workflow

The existing public `startSystem` action combines:

- rollout gating;
- FormData parsing;
- System route parsing;
- question-pool validation;
- `startSystemReview(...)` invocation;
- mapping known domain errors into the form failure shape.

The Admin route needs the same behavior except for the rollout gate. Avoid copying that logic.

Extract the smallest coherent route-independent workflow into a new focused TypeScript server module, for example:

```text
src/lib/server/learning/start-system-study.ts
```

The exact filename/API may change if current implementation evidence supports a clearer boundary, but the ownership rules are:

- it must not authorize Admin users;
- it must not read `SYSTEM_STUDY_NAVIGATION_ENABLED`;
- it validates/parses the System-start request consistently;
- it invokes the existing canonical `startSystemReview(...)` operation;
- it exposes a result/error contract that both SvelteKit route actions can map consistently.

Then:

- ordinary `/study?/startSystem` keeps its current feature-flag check before invoking the shared workflow;
- `/admin/study-preview?/startSystem` relies on the inherited `/admin` authorization boundary and invokes the same workflow without the learner rollout gate.

This makes the bypass explicit at the route boundary instead of embedding an `isAdmin || flag` rule inside the canonical learner workflow.

### 3. Dedicated Production Admin preview entry

Add:

```text
src/routes/admin/study-preview/+page.server.js
src/routes/admin/study-preview/+page.svelte
```

The route inherits `src/routes/admin/+layout.server.js`; do not reimplement production-Admin authorization independently unless a route-local assertion is needed as defense in depth.

Server load:

- if DB binding is absent, return the same meaningful database-not-configured state used by Study;
- otherwise call `listStudySystems(createDb(DB))` regardless of feature flag;
- return only data required by the shared chooser.

Action:

- expose the same named `startSystem` action expected by the shared chooser;
- require DB/user context;
- invoke the shared System-start workflow;
- preserve the same known validation failure payload (`message`, `systemId`, `route`, `questionPoolMode`);
- redirect successful starts to the existing `/study/{reviewId}` learner Review route.

Update `src/routes/admin/+page.svelte` so **Preview learner study** points to `/admin/study-preview`.

### 4. End-to-end Admin preview through the existing Review route

Do not build `/admin/study-preview/[reviewId]` unless implementation evidence proves it is necessary. Reuse the actual learner Review page.

In `src/routes/study/[reviewId]/+page.server.js`, distinguish two concepts:

- global learner System-navigation rollout state;
- whether the current authenticated user is allowed to continue an already-created System Review for Admin preview.

For ordinary learners, current flag behavior remains unchanged.

For authenticated Production Admins, when viewing a System Review, allow System Next-case resolution even when the global learner flag is off. Use the existing canonical `isProductionAdmin(...)` role predicate; do not invent a second role parser.

The same effective availability predicate must drive both:

- `caseStudy.nextCaseAvailable` in `load`; and
- the boolean passed to `resolveNextSystemStudyRoute(...)` in the `next` action.

This prevents UI/action disagreement.

Also return a small navigation model such as a back href/label or Admin-preview indicator so `+page.svelte` can route the Admin back to `/admin/study-preview` for a flag-off System Review. Avoid changing the actual Review content/presentation.

The existing `assertLearnerStudyAccess(...)` Preview Worker / Preview-only Admin block remains authoritative and must not be weakened.

### 5. Progressive-disclosure behavior

The shared chooser should have deterministic state behavior:

- initial state: no System selected;
- selecting a System: expose only that System's configuration;
- default route on fresh selection: `all`;
- default question set on fresh selection: `core` / Original questions;
- failed `startSystem` submission: automatically reopen `form.systemId` and restore `form.route` + `form.questionPoolMode`;
- changing to another System after an error must not show the previous System's validation message;
- **Change System** or selecting another System must remain obvious and keyboard accessible.

Prefer ordinary buttons/radios and native form semantics. Do not require URL-addressable selected-System state for this PR unless implementation testing shows a real usability/accessibility need.

## Expected implementation surface

Likely primary changes:

```text
src/lib/components/study/SystemStudyChooser.svelte
src/lib/server/learning/start-system-study.ts
src/routes/study/+page.server.js
src/routes/study/+page.svelte
src/routes/study/[reviewId]/+page.server.js
src/routes/study/[reviewId]/+page.svelte
src/routes/admin/+page.svelte
src/routes/admin/study-preview/+page.server.js
src/routes/admin/study-preview/+page.svelte
```

Tests should be selected from current owners rather than blindly editing every nearby test. Likely focused coverage includes:

```text
test/contextual-system-topic-tag-navigation.test.js
test/system-review-navigation.test.js
```

and a focused new/extended contract for Admin Study preview authorization/wiring or shared UI reachability if no current test owns those invariants strongly enough.

No schema or migration change is expected.

## Implementation sequence

### Checkpoint A — establish shared System-start workflow

1. Read current `startSystem` implementation and relevant domain tests.
2. Extract only the flag-independent parsing/validation/start behavior.
3. Keep the public `/study` feature-flag guard in place.
4. Add focused tests for extracted validation/workflow behavior if current tests do not already own it.
5. Confirm no Review/domain semantics changed.

Why first: this creates one safe server behavior owner before adding a second route consumer.

### Checkpoint B — extract and redesign the shared chooser

1. Extract only the System-enabled presentation from `/study/+page.svelte`.
2. Implement compact System selection and progressive disclosure.
3. Preserve form failure restoration.
4. Keep the legacy Topic branch unchanged except for any minimal integration adjustment.
5. Exercise long labels, nested breadcrumbs, curated Tags, empty sections, and mobile wrapping.

Why second: both future consumers then use the finished presentation owner.

### Checkpoint C — add Production Admin preview entry

1. Add `/admin/study-preview` under the inherited Production Admin layout.
2. Load Systems regardless of rollout flag.
3. Reuse the shared chooser and shared start workflow.
4. Redirect successful starts to the actual learner Review route.
5. Repoint the dashboard shortcut.
6. Add focused authorization/wiring coverage.

### Checkpoint D — make Admin preview Review continuation coherent

1. Reuse `isProductionAdmin(...)` in `/study/[reviewId]`.
2. Allow a Production Admin to continue a System Review when the global flag is off.
3. Keep ordinary learner flag behavior unchanged.
4. Ensure `nextCaseAvailable` and `next` action use the same effective predicate.
5. Provide the Admin-preview return link when appropriate.
6. Add/extend focused Next-case tests.

### Checkpoint E — integrated validation and UX review

1. Verify ordinary flag-off `/study` is still the legacy Topic flow.
2. Verify flag-on `/study` uses the new systems-first progressive disclosure.
3. Verify flag-off Production Admin `/admin/study-preview` uses the same systems-first chooser.
4. Start Original and Expanded System Reviews from Admin preview.
5. Reveal, rate, continue Original→Expanded where available, and exercise Next case.
6. Verify non-Admin/Preview-only Admin/Preview Worker boundaries remain intact.
7. Verify narrow/mobile layout and no horizontal overflow.
8. Run repository-owned validation required by `agent:checks` and the final handoff contract.

## Focused test requirements

Tests should protect behavior, not implementation trivia. At minimum, obtain evidence for these invariants:

- `SYSTEM_STUDY_NAVIGATION_ENABLED=false` still blocks ordinary `/study` System start;
- the Admin preview route is reachable only through the existing Production Admin boundary;
- Admin preview can invoke the same System-start validation/workflow while the learner flag is off;
- invalid/mismatched System route input still fails safely;
- question-pool validation remains unchanged;
- System Review provenance remains unchanged;
- flag-off ordinary learner System Next-case remains unavailable;
- flag-off Production Admin System Review Next-case is available for preview;
- Preview Worker / Preview-only Admin remains blocked from learner Study;
- the Admin dashboard shortcut points to the explicit Admin preview route;
- the real System-enabled learner page and Admin preview use one systems-first chooser presentation owner.

A source-level UI/wiring contract is acceptable where it is the strongest cheap owner of presentation reuse or route reachability. Do not remove stronger behavioral/domain coverage merely to avoid source-reading tests.

## Validation plan for the coding agent

Before editing, when command execution is available:

```sh
npm run agent:doctor
```

During implementation:

- use focused Node tests after server/workflow changes;
- use Vite/HMR for presentation iteration instead of running broad validation after every CSS/Svelte edit;
- run `npm run agent:checks` after a coherent implementation batch;
- run any specialized checks it requires;
- run `npm run validate:fast` at useful checkpoints, not every edit.

Before handoff when local execution is available:

```sh
npm run validate:full
```

If only remote GitHub execution is available, do not claim local commands ran. Review the full PR diff and report GitHub CI/check evidence separately.

PR #119 must remain Draft for implementation handoff unless the user explicitly asks to change review state.

## Acceptance criteria

1. With System navigation enabled, `/study` initially presents Systems as compact primary choices.
2. Topic/Tag/question-set controls are progressively disclosed only for the selected System.
3. `All cases` and Original questions are the fresh-selection defaults.
4. Topics and curated Tags remain semantically and visually distinguishable.
5. Existing System-route eligibility, Case deduplication, question-pool behavior, Review provenance, snapshots, and ordinary learner Next-case behavior remain unchanged.
6. Failed System-start validation restores the submitted System/route/question-set UI and shows the error only there.
7. The layout remains usable on narrow/mobile viewports without horizontal overflow.
8. With the rollout flag disabled, ordinary `/study` continues to show the legacy Topic flow and cannot start System Study.
9. With the same flag disabled, Production Admin **Preview learner study** opens `/admin/study-preview` and shows the prospective systems-first learner chooser.
10. The Admin preview and real systems-first learner path use the same chooser presentation owner.
11. Admin preview and learner System start use the same flag-independent parsing/validation/Review creation workflow owner.
12. A System Review started from Admin preview renders in the actual learner Review UI.
13. A Production Admin can use System Next case in that preview flow while the global learner flag is off; an ordinary learner cannot.
14. Non-Admins cannot force the preview/bypass from public `/study`.
15. Preview Worker / Preview-only Admin restrictions remain unchanged.
16. No schema/migration change, production D1/R2 mutation, unrelated taxonomy redesign, or deployment is introduced.

## Explicitly out of scope

- changing the System/Topic/Tag domain model;
- adding Additional Study Topics;
- changing Case classification;
- changing question eligibility/provenance semantics;
- changing Review snapshots or rating semantics;
- globally enabling `SYSTEM_STUDY_NAVIGATION_ENABLED` as an incidental part of implementation;
- schema or migration work;
- production D1/R2 mutation;
- unrelated Admin taxonomy UX;
- redesigning or expanding the separate Preview Worker subsystem;
- creating a second copied learner Review application under `/admin` unless concrete implementation evidence makes reuse impossible;
- deployment.

## Handoff prompt

The implementation-agent prompt is stored alongside this plan at:

```text
docs/PR119_IMPLEMENTATION_PROMPT.md
```

That prompt is intended for a ChatGPT Chat Sol coding agent. It tells the agent to continue the existing Draft PR, inspect the actual current PR head before editing, implement this plan, validate it, and leave the PR Draft for independent review.
