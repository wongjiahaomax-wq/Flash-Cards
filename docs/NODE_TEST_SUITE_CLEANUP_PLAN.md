# Node Test Suite Cleanup Plan

Status: implementation plan active / Checkpoint 1 current-schema fixture normalization and the first source-contract consolidation tranche implemented in Draft PR #115

This document is the implementation contract that follows `docs/TEST_SUITE_AUDIT.md`.

PR #115 now contains Checkpoint 1 current-schema fixture normalization and the first corrected source-contract consolidation tranche described under Checkpoint 4. It does **not** implement the whole cleanup plan. Fast-tier selection, change-aware CI specialization, production-operator specialization, broader behavioral rewrites, profiling, and the remaining durable-guidance work are still pending.

Checkpoint 0's compact CI diagnostics were implemented separately on current `main` by merged PR #117. They are part of the current repository baseline, not implementation performed by PR #115.

## 1. Goals

The cleanup has four distinct goals:

1. **Make Node-test failures easy to find and diagnose in GitHub Actions.**
2. **Make ordinary fixtures represent a supported runtime configuration.** Current application tests use the current schema; historical schemas are reserved for migration/upgrade/sequencing tests.
3. **Reduce Draft validation latency without creating coverage holes.**
4. **Reduce brittle and duplicated contracts without discarding intentional behavior.**

Audited baseline:

- 109 Node-discovered test files;
- 635 tests in the audited green run;
- approximately 19.6 seconds for Node tests in GitHub Actions;
- approximately 18.5 seconds for `npm run check`;
- `npm test` is currently `node --test` and remains the canonical complete suite;
- Draft `validate:fast` currently still runs the complete Node suite.

## 2. Hard constraints

The implementation must not:

- redefine `npm test` to mean a subset;
- statically exclude a specialized test from Draft CI when related changes can pass without running an equivalent specialized check;
- treat `agent:checks` advisory output as if ordinary CI had executed those checks;
- remove a regression test merely because its assertion is source-based without identifying the protected product/architecture invariant;
- treat domain coverage as an automatic substitute for a distinct UI-reachability or integration invariant;
- remove safety-critical coverage simply because it sounds integration-heavy or DB-heavy;
- narrow broad `npm run check` without separate evidence;
- restore permanent historical-schema probing/fallbacks in runtime code merely to satisfy stale fixtures;
- collapse/rewrite historical migration SQL as part of test cleanup;
- mutate Production D1/R2 for tests;
- duplicate validation ownership into workflow YAML;
- infer fast/full ownership from broad filename fragments;
- introduce a heavyweight browser/E2E stack solely to preserve incidental visual assertions;
- change application domain semantics as part of this work.

## 3. Durable repository invariants

### 3.1 Complete-suite invariant

```text
npm test
```

means the complete maintained Node suite.

Ready/full validation must continue to execute it.

### 3.2 New-test default invariant

New ordinary tests should enter Draft fast validation automatically.

Fast selection must therefore be exclusion-based, not a giant allow-list.

However, an exclusion is permitted only when conditional ownership is safe: related code changes must cause ordinary CI to run the specialized check that owns the excluded test.

### 3.3 Conditional-specialization invariant

A test may be omitted from **unrelated** Drafts only if all of these are true:

1. the test has a clear specialized owner;
2. that owner is represented as a repository-owned named validation check;
3. changed paths that can invalidate the protected behavior map to that check;
4. ordinary CI executes the central change-aware requirements for the actual PR diff;
5. contract tests prove a related Draft cannot go green without the specialized check;
6. full `npm test` still contains the test.

If any condition is missing, the test stays in generic Draft fast coverage.

### 3.4 Schema-fixture invariant

Tests distinguish:

**Current application behavior**
- current app code;
- current supported schema;
- historical/edge data states allowed inside that schema.

**Migration/upgrade behavior**
- historical schema allowed deliberately;
- migrations applied explicitly;
- upgrade/preservation/constraint/sequencing asserted.

**Historical data-state behavior**
- current schema;
- older valid data shapes/states;
- no missing-table/column runtime probing required.

### 3.5 Contract-strength invariant

Prefer the strongest cheap owner of an invariant:

1. domain/helper behavior for pure semantics;
2. server/action/query behavior for server-owned semantics;
3. rendered/component behavior for user-observable reachability where practical;
4. a thin source/data-flow contract when UI wiring or architecture structure itself is the invariant and no stronger cheap rendered owner exists;
5. raw implementation text only when no stronger practical owner exists and the regression intent is still important.

A stronger semantic owner only replaces the semantic part of a source test. It does not automatically replace user-facing composition, control reachability, form/action wiring, or semantic product vocabulary.

## 4. Implementation sequence

The work is ordered so diagnostics and test validity are stable before performance/coverage decisions are made.

---

## Checkpoint 0 — Compact CI Node-test diagnostics

**Status: implemented separately on current `main` by PR #117; no additional Checkpoint 0 implementation is part of PR #115.**

### Objective

Make failures obvious without changing what tests execute.

### Durable design

Keep:

```text
npm test = node --test
```

unchanged.

CI-specific presentation should:

- consume structured Node test events rather than parse human TAP/spec/dot text;
- keep passing output compact;
- print failures conspicuously near the end;
- preserve child-process exit status exactly;
- retain test name, source location, error/message, expected/actual and useful stack details where available;
- preserve GitHub annotations and connector-readable failure/reproduction records.

The current repository implementation lives in the PR #117 CI reporter/wrapper changes and is now baseline context for later checkpoints.

---

## Checkpoint 1 — Current-schema fixture normalization

**Status: implemented in Draft PR #115.**

### Objective

Stop ordinary current-runtime tests from silently depending on unsupported partial historical schemas.

### Required work

Classify manually migrated/inline-schema fixtures before changing them:

- current application behavior;
- migration/upgrade;
- historical data-state;
- explicit deployment/sequencing compatibility.

Normalize only ordinary current application tests automatically.

### Shared current-schema bootstrap

Use the repository-owned `test/current-schema.js` helper, introduced on current `main`, which:

- discovers the complete numbered migration set from `drizzle/` in deterministic order;
- validates contiguous migration numbering;
- applies the actual migration authority rather than a stale hand-maintained subset;
- fails loudly on migration failure;
- avoids missing-table/column probing as control flow;
- lets ordinary D1-backed tests avoid copying migration lists.

### Implemented inventory

A systematic search for `0000_dashing_centennial.sql` in `test/` found 25 primary fixture files.

- 24 were normalized or partially normalized so their ordinary current-runtime fixtures use `applyCurrentSchema(...)`.
- `test/contextual-system-topic-tag-navigation.test.js` remains intentionally historical because it directly tests migration 0015.
- `test/resumable-content-import.test.js` is intentionally mixed: ordinary importer fixtures use current schema, while explicit migration 0004 coverage remains historical.
- `test/learning-db.test.js` is intentionally mixed: ordinary learner/review fixtures use current schema, while explicit migration 0014 backfill coverage remains historical.
- `test/original-stimulus-semantics.test.js` is intentionally mixed: ordinary Stimulus runtime fixtures use current schema, while explicit pre-0016 -> 0016 migration coverage remains historical.

A broader direct-reader sweep found five additional ordinary tests that already enumerate and apply the complete numbered migration directory dynamically:

```text
test/stimulus-prompt-specificity-characterisation.test.js
test/stimulus-family-live-prompt-trigger-alignment.test.js
test/asset-higher-resolution-replacement.test.js
test/stimulus-family-correctness-checkpoint-a.test.js
test/stimulus-family-correctness-checkpoint-a-boundaries.test.js
```

They already satisfy the current-schema invariant and were intentionally left unchanged instead of expanding Checkpoint 1 into cosmetic helper consolidation.

### Preserve historical tests

Do not normalize genuine migration tests merely because they use old SQL.

Retained examples in this checkpoint include:

- migration 0004 fresh/upgrade behavior for resumable imports;
- migration 0014 review `question_pool_mode` backfill;
- migration 0015 contextual System/Topic/Tag navigation behavior;
- migration 0016 Original stimulus migration behavior.

Historical data-state tests continue to use current schema and construct older valid states as data. No production runtime `no such table` / `no such column` fallback was restored.

### Acceptance criteria

- ordinary current-runtime tests use current schema or an equally current purpose-built fixture;
- migration tests remain deliberately historical;
- historical data states are represented within supported schema;
- no runtime fallback is added only for tests;
- fixture intent is obvious.

These criteria are satisfied for the audited Checkpoint 1 target set. Implementation head `e02ff7c7f0b331d6ca10a8a90d8d61fdf29ad550` passed Draft CI run #1254: diff whitespace, complete `npm test` (625/625 passed), and `npm run check` (0 errors, 5 existing warnings). No local command execution is claimed for this work session because no usable local checkout was available.

---

## Checkpoint 2A — Introduce `test:fast` infrastructure with no coverage reduction

**Status: pending. Not in the current PR #115 tranche.**

### Objective

Create the selection mechanism safely before excluding anything.

### Package contract

Add:

```text
npm run test:fast
```

Keep:

```text
npm test
```

complete.

Do not add `test:full` initially.

### Selector architecture

Use a central repository-owned selector, e.g. `scripts/test-selection.mjs` / `scripts/test-fast.mjs`.

The selector should:

- discover maintained Node test files deterministically;
- default new ordinary tests into fast;
- support a small explicit exclusion manifest;
- fail if an exclusion names a missing file;
- expose selected/excluded paths for diagnostics/tests;
- avoid filename-category inference.

### Important rollout rule

At the end of **2A**, the exclusion manifest may be empty.

`test:fast` is allowed to execute the same tests as `npm test` initially.

That is intentional: the goal of 2A is to prove selection/default semantics without reducing coverage.

### Validation integration

Add a distinct fast Node check to `scripts/validation-contract.mjs`.

Base composition becomes conceptually:

```text
fast:
  diff
  testFast
  svelte

full:
  diff
  db
  test
  svelte
  build
  authSmoke
```

Workflow YAML remains orchestration only.

`validate-ci.mjs` must preserve the current compact reporter behavior for both `test` and `testFast`.

### Contract tests

Prove:

- every fast-selected test belongs to complete discovery;
- every exclusion exists;
- every discovered maintained test is fast or explicitly excluded;
- a new ordinary test defaults to fast;
- `npm test` remains complete;
- full uses `npm test`;
- workflow YAML contains no duplicated file list.

### Acceptance criteria

- zero coverage reduction is acceptable and preferred at this stage;
- complete semantics unchanged;
- default-to-fast behavior proven;
- repository remains green.

---

## Checkpoint 2B — Make ordinary CI change-aware for specialized checks

**Status: pending. Not in the current PR #115 tranche.**

### Objective

Create the safety mechanism required before specialized tests can leave unrelated Drafts.

### Current architectural gap

The repository already has changed-path classification in `scripts/agent-checks-lib.mjs`.

For slide-review it can report:

```text
tools/slide-import-review/**
  -> slideReviewTest
  -> slideReviewBuild
```

But ordinary CI currently selects only fast/full and does not execute those classifier requirements.

Therefore advisory classification is insufficient for generic-fast exclusions.

### Required architecture

Extract/retain one central changed-path-to-check resolver that is reusable by:

- `agent:checks` for reporting;
- `validate-ci.mjs` for actual execution.

Do not create a second independent classifier in CI.

### CI changed-file source

Use the actual PR diff base/head already available to CI validation.

CI should resolve:

```text
base mode checks
+ specialized checks required by changed paths
```

and execute the deduplicated result.

### Fail-safe behavior

Important unclassified code/tooling paths should continue to fall back safely rather than silently receiving fewer checks.

### Deduplication

The resolver should understand when a broader check already satisfies a narrower one.

Examples:

- full `npm test` already executes the slide-review test files and operator tests;
- a slide-review **build** check may still be additionally required for a slide-review change;
- Draft `test:fast`, after exclusions are activated, may need the specialized test check added back.

Do not run the same test unnecessarily twice merely because two rules mention it.

### Required tests

Prove at minimum:

- unrelated application Draft -> base fast only;
- slide-review Draft -> base fast + slide-review test/build;
- slide-review Ready/full -> full complete tests + required non-duplicated slide-review build;
- validation-tooling changes fail safe;
- agent reporting and CI execution derive from the same classification authority;
- workflow YAML still does not own path rules.

### Acceptance criteria

- related specialized changes cannot go green without their specialized check;
- `agent:checks` and CI cannot drift onto separate rule sets;
- conditional behavior is test-covered before exclusions are activated.

---

## Checkpoint 2C — Add named production-operator checks

**Status: pending. Not in the current PR #115 tranche.**

### Objective

Give the two production-operator tests safe conditional ownership before they can leave unrelated Drafts.

### Current tests

#### ECG Batch 01 Asset rename

```text
test/ecg-batch-01-asset-rename.test.js
```

protects:

```text
scripts/rename-ecg-batch-01-assets.mjs
```

including deterministic targets, fail-closed preconditions/postconditions, storage identity, and guarded mutation behavior.

#### Agreed taxonomy operator

```text
test/production-taxonomy-operator.test.js
```

protects:

```text
scripts/apply-agreed-taxonomy.mjs
```

including fail-closed preconditions/postconditions, idempotency, and preservation of unrelated routes.

### Required named checks

Add repository-owned checks for these operator test owners. They may be two checks or one coherent `productionOperatorTests` check, provided path ownership stays explicit and testable.

Example conceptual checks:

```text
node --test test/ecg-batch-01-asset-rename.test.js
node --test test/production-taxonomy-operator.test.js
```

### Required path rules

A change to either:

- the production operator script;
- its dedicated test;
- any explicitly identified operator-owned configuration/data file;

must require the matching operator test in ordinary CI.

### Acceptance criteria

- both operators have named validation ownership;
- both have central changed-path rules;
- Draft CI actually executes those checks for related changes;
- full `npm test` still includes both tests.

---

## Checkpoint 2D — Activate safe exclusions for unrelated Drafts

**Status: pending. Not in the current PR #115 tranche.**

### Objective

Only now reduce generic Draft test coverage for specialized families.

### Candidate exclusions

After 2B/2C acceptance criteria are met, the following may be excluded from generic `test:fast`:

```text
tools/slide-import-review/tests/build.test.js
tools/slide-import-review/tests/core.test.js
tools/slide-import-review/tests/review-fixes.test.js
tools/slide-import-review/tests/source-coverage.test.js
test/ecg-batch-01-asset-rename.test.js
test/production-taxonomy-operator.test.js
```

### Semantics after activation

**Unrelated Draft:** these specialized tests may be omitted.

**Related Draft:** central changed-path ownership adds the specialized check back automatically.

**Ready/full:** `npm test` contains all six regardless; add only any non-duplicated specialized check still required (for example slide-review build).

### Tests

Prove all three cases for each specialized family:

- unrelated Draft omission;
- related Draft mandatory execution;
- full complete inclusion.

### Acceptance criteria

No related Draft can receive green ordinary CI while its specialized owner did not execute.

If that property cannot be proven, leave the relevant test in generic fast.

---

## Checkpoint 3 — Review the two intentional UX regression contracts

**Status: pending. The first PR #115 consolidation tranche intentionally leaves both existing tests unchanged.**

### Objective

Replace brittle implementation assertions only after the underlying product invariant is confirmed.

There are **no unconditional deletions in this checkpoint**.

### 3.1 Shared Questions width

Current test:

```text
test/admin-shared-questions-width-contract.test.js
```

Current source owner:

```text
src/routes/admin/shared-questions/+page.svelte
```

It protects the deliberate regression outcome that the Shared Questions page uses the available admin content width and does not regress to an unnecessary page/form-grid max-width constraint.

It was introduced with the UX change in commit:

```text
d5fba9b — Refine admin editor widths and expandable fields
```

The exact CSS/source regex is brittle; the product intent is real.

Disposition options, in priority order:

1. replace with a lightweight rendered/layout behavior test that checks the intended usable width without freezing exact CSS;
2. consolidate into an existing suitable rendered component owner if one exists;
3. retain the source regression contract temporarily if no stronger cheap owner exists;
4. delete only after an explicit product decision that this width behavior is no longer a protected invariant.

### 3.2 Application horizontal overflow

Current test:

```text
test/admin-horizontal-overflow-contract.test.js
```

protects the intentional regression outcome that child layouts do not cause unwanted application-level horizontal scrolling.

It was introduced in the same `d5fba9b` UX-fix commit alongside `body { overflow-x: hidden; }`.

The exact CSS declaration is an implementation technique, not a direct measurement of overflow, and can mask the true offending child. But the user-visible regression matters.

Disposition options:

1. prefer a lightweight rendered check of actual horizontal overflow at representative viewports;
2. otherwise retain the current source contract until a stronger owner exists;
3. delete only if the product invariant is consciously retired.

### Browser-infrastructure guardrail

Do not add a heavyweight E2E stack solely for these two checks.

If the repository lacks a lightweight rendered testing layer, keeping an imperfect regression contract can be safer than deleting an intentional regression guarantee with no replacement.

### Acceptance criteria

For each test, record one of:

- stronger replacement exists and old source assertion is removed;
- old assertion retained intentionally pending infrastructure;
- product invariant explicitly retired and test removed.

No silent deletion.

---

## Checkpoint 4 — Consolidate duplicated source/UI contracts

**Status: first corrected tranche implemented in Draft PR #115; additional consolidation is not implied.**

### Objective

Reduce repeated source assertions while keeping unique behavior and UI reachability.

### Ownership rule for this checkpoint

For every removed assertion, classify it as:

1. duplicate — stronger owner exists;
2. UI reachability/integration — keep a thin owner;
3. semantic product vocabulary — keep if intentional;
4. incidental implementation detail — safe to remove;
5. explicitly retired product invariant — remove only with an explicit decision.

A model/DB test that proves a mutation works does not prove that an Admin can reach that mutation through the intended UI.

### Corrected PR #115 tranche

#### Case Library PR104 family

`admin-case-library-pr104-ui.test.js` is consolidated against direct owners for filtering, state helpers, selection helpers and classification helpers.

The remaining thin source contract intentionally protects:

- deliberate search/native Back-Forward restoration wiring;
- page/sort/lifecycle links using the shared Case Library state model;
- named mutation/query-context wiring into quick Topic and bulk Tag controls;
- separate required bulk Primary Topic assignment versus global Topic hierarchy move forms, including selected Case payloads;
- failed Topic-creation/normal-navigation integration with the shared selection reconciliation helper;
- active-only classification editing, explicit global hierarchy-change reachability and canonical classification route delegation;
- one mutually exclusive responsive bulk toolbar.

Removed details include placeholder wording, incidental toolbar visual styling, status-display plumbing that is not a durable contract, and deep mutation implementation assertions already owned by direct server/domain tests.

#### Taxonomy Admin family

`admin-taxonomy-workspace-contract.test.js` remains the thin UI/integration owner for:

- browse versus organize reachability;
- hierarchy controls;
- Case Primary Topic and Case Tag staging controls;
- the shared staged review surface showing Topic hierarchy, Case Primary Topic and Case Tag changes;
- the unified `?/applyWorkspace` form and route delegation to `applyStagedTaxonomyWorkspace`.

`taxonomy-workspace-model.test.js`, `taxonomy-workspace-staging.test.js`, hierarchy/Primary-Topic staging tests and Case Tag model/staging tests remain the stronger owners for projection, stale-state validation, mutation semantics, batch limits and fail-before-write behavior.

`test/admin-taxonomy-case-tag-contract.test.js` remains deleted: after the corrected workspace contract, its meaningful UI guarantees are explicitly owned there, while its semantics are directly owned by Case Tag model/staging tests.

#### Case Images family

`case-images-editor-layout.test.js` keeps focused user-observable information-architecture coverage rather than only a structural anchor. It intentionally protects:

- the learner-visible image overview and linked Q&A;
- role vocabulary: Original, Alternative, Always shown, Needs role where applicable;
- question-scope vocabulary: Image-specific, Reusable, Shared across this image set;
- access to Advanced image management;
- role-based image-set vocabulary in the advanced surface;
- the single canonical `#images` anchor.

Deep role-selection/history/identity semantics remain under image/Stimulus domain tests. Incidental CSS/markup and negative vocabulary assertions are not restored solely to preserve the old regex shape.

#### Stimulus curation family

`stimulus-curation-editor-controls.test.js` remains a thin UI/workflow owner for:

- initial Original/Alternative assignment;
- post-curation selection of another eligible option as Original through `/admin/stimulus-roles` and the `set-original` path;
- the current Original being excluded from the Move-to-Always-shown control until another Original is chosen;
- Alternative-to-Always-shown reachability through `/admin/stimulus-supporting`.

`original-stimulus-semantics.test.js`, `simple-stimulus-curation.test.js` and related Stimulus Family tests remain the stronger owners for mutation semantics, history, identity preservation, rollback and validation.

### Acceptance criteria

For every removed assertion:

- identify the invariant;
- identify stronger owner or explicit retirement;
- preserve safety/domain meaning;
- preserve distinct UI reachability/integration where no stronger owner exists;
- avoid deleting solely because regex/source inspection is aesthetically undesirable.

---

## Checkpoint 5 — Behavioral rewrites by subsystem

**Status: pending. Not in the current PR #115 tranche.**

### Candidate families

#### Case editor responsive contract

Protect:

- classic/compact switch is presentation-only;
- one logical editor tree remains mounted;
- usable layout at intended viewport classes.

Rewrite away from exact breakpoint/helper/CSS tokens where practical.

#### Case Images editor

Protect:

- intentional information architecture;
- image role vocabulary where it maps to domain semantics;
- canonical Image Library navigation;
- authoring controls needed to manage image roles/questions.

Avoid freezing incidental markup order/CSS sizing.

#### Stimulus curation controls

Protect the Admin's ability to set/correct Original/Alternative/Always-shown semantics and reverse curation decisions.

Prefer rendered/control behavior over raw Svelte text where practical.

#### Performance/read-model contract

Protect the bounded read behavior, not a specific helper name.

Prefer query/read-bound instrumentation where feasible.

#### Reusable-image safety

Preserve production scope, option/Asset identity, and mutation safety. Rewrite route/source assertions only after equivalent domain/route behavior is proven.

### Acceptance criteria

- no behavior gap during rewrite;
- old brittle owner removed only when replacement is green;
- exact product vocabulary retained when it carries semantic meaning;
- no unnecessary browser-stack expansion.

---

## Checkpoint 6 — Measure and profile runtime

**Status: pending. Not in the current PR #115 tranche.**

### Required measurements

Use at least three comparable CI runs and compare medians for:

- complete Node stage;
- fast Node stage;
- `npm run check`;
- total Draft validation;
- selected/excluded file counts;
- executed test counts.

### Materiality gate

Target at least:

```text
20% median reduction in Node-stage runtime
```

before describing the fast-tier infrastructure as materially worthwhile.

### If the safe exclusions are insufficient

Profile before excluding more high-value tests:

- Node worker/process/file startup;
- repeated migration application;
- repeated DB fixture setup;
- subprocess-heavy tests;
- file fragmentation;
- concurrency/scheduling;
- expensive module initialization.

Do not assume DB/migration tests are the bottleneck from names alone.

### Further exclusions

Any new exclusion requires:

- measured cost evidence;
- clear specialized/full ownership;
- conditional related-change coverage if omitted from generic Draft;
- explicit risk analysis.

---

## Checkpoint 7 — Durable authoring and validation guidance

**Status: pending apart from this plan/audit status reconciliation.**

Update repository guidance so future tests follow the new architecture.

Document:

### Test placement

- `npm test` is complete;
- new ordinary tests default to fast once that infrastructure exists;
- specialized exclusion requires explicit ownership and CI path coverage.

### Schema fixtures

- current app tests -> current schema;
- migration tests -> historical schema allowed;
- historical data state != historical runtime schema.

### Contract hierarchy

- behavior first;
- UI reachability/integration remains a separate invariant where applicable;
- architecture/config source test when structure itself matters;
- raw implementation source lock only when justified and reviewed.

### CI diagnostics

- passing output compact;
- failures visible near end;
- structured reporter events, not parsing unstable human text.

### Change-aware specialization

- path rules live in one central authority;
- `agent:checks` reports them;
- ordinary CI executes them;
- workflow YAML does not duplicate them.

---

## 5. Safety-critical families that remain protected

The cleanup must preserve effective regression coverage for:

- Production/Preview isolation and deployment ownership;
- auth/authz;
- destructive/race-sensitive D1/R2 behavior;
- migration/schema constraints;
- learner/review selection, persistence and provenance;
- Stimulus Family semantics;
- reusable-question behavior;
- import and resumable-runtime safety;
- Case lifecycle;
- taxonomy/tags/classification;
- repository runtime/deployment authority.

Broad `npm run check` remains in fast/full.

## 6. Implementation strategy after the completed PR #115 checkpoints

PR #115 now contains Checkpoint 1 current-schema fixture normalization plus the corrected first source-contract consolidation tranche under Checkpoint 4. Do not infer that later checkpoints have started merely because their design remains documented here.

### Completed fixture foundation

Checkpoint 1 — current-schema fixture normalization — is complete for the audited target set.

### Next safe fast-tier infrastructure

Checkpoints:

- 2A — selector, no coverage reduction;
- 2B — CI change-aware specialized execution;
- 2C — named production-operator checks;
- 2D — activate only proven-safe exclusions.

Do not activate exclusions before the conditional safety tests are green.

### Remaining UX/source-contract work

Checkpoint 3 and any further independently justified portions of Checkpoints 4/5.

No unconditional deletion of the two intentional width/overflow UX regression tests.

### Profiling

Run Checkpoint 6 only after safe fast-tier behavior exists. Additional exclusions require separate measured justification.

## 7. Review gates

Before each implementation checkpoint is considered complete:

- inspect the actual changed files and full diff;
- preserve Draft status until the checkpoint receives independent review;
- use repository-owned validation;
- do not claim local execution unless it actually occurred;
- ensure current CI is green on the exact reviewed head.

Specific gates:

**Checkpoint 0:** already satisfied on current main by the separately merged PR #117 diagnostics work; preserve that contract.

**Checkpoint 1:** satisfied for the audited target set: unsupported ordinary partial-schema fixtures were normalized, genuine migration fixtures were retained deliberately, and the implementation head passed repository-owned Draft validation.

**Checkpoint 2A:** new tests default fast; no coverage reduction yet.

**Checkpoint 2B:** related specialized changes demonstrably trigger specialized checks in ordinary CI.

**Checkpoint 2C:** both production operators have named, path-owned checks.

**Checkpoint 2D:** only then can the six specialized files leave unrelated Draft generic fast coverage.

**Checkpoint 3:** each UX regression contract is replaced, retained, or explicitly retired—never silently deleted.

**Checkpoint 4:** every removal has an explicit stronger owner or retirement, and distinct UI reachability/semantic vocabulary remains protected where applicable.

**Checkpoint 6:** runtime claim backed by comparable CI medians.

## 8. Final target state

The desired repository state remains:

```text
npm test
  = complete maintained Node suite

npm run test:fast
  = ordinary Draft suite
  = new tests included by default
  = specialized omissions only where CI conditional ownership is proven

Draft CI
  = base fast checks
  + specialized checks required by changed paths

Ready/full CI
  = complete full checks
  + any specialized non-duplicated checks required by changed paths

agent:checks
  = reports the same centrally owned changed-path requirements CI executes
```
