# Node Test Suite Cleanup Plan

Status: implementation plan complete / implementation not started

This document is the implementation plan that follows the repository-wide audit in `docs/TEST_SUITE_AUDIT.md`.

PR #115 remains a planning/audit PR. This document defines the work, ordering, safety boundaries, checkpoints, measurements, and acceptance criteria for later implementation. It does not authorize weakening domain coverage merely to make Draft CI faster.

## 1. Goals

The cleanup has four distinct goals that must not be conflated:

1. **Make Node-test failures easy to find and diagnose in GitHub Actions.**
2. **Make ordinary test fixtures represent a supported runtime configuration.** Current application tests should run against the current schema; historical schemas belong in migration/upgrade tests.
3. **Reduce Draft validation latency without weakening high-value regression coverage.**
4. **Reduce brittle and duplicated tests that block legitimate refactors without protecting meaningful behavior.**

The current audited baseline is:

- 109 Node-discovered test files;
- 635 individual tests in the audited green run;
- approximately 19.6 seconds for the Node test stage in GitHub Actions;
- approximately 18.5 seconds for `npm run check`;
- `npm test` is currently `node --test` and is the canonical complete suite;
- Draft `validate:fast` currently still runs the complete Node suite.

## 2. Non-goals and hard constraints

The cleanup must not:

- make `npm test` cease to mean the complete maintained Node suite;
- remove safety-critical coverage simply because a test is DB-heavy, integration-heavy, or source-reading;
- reduce broad `npm run check` / `svelte-check` coverage without separate evidence;
- restore permanent runtime compatibility fallbacks for obsolete schemas in order to make stale tests pass;
- collapse or rewrite historical migration SQL as part of test cleanup;
- mutate Production D1 or R2 for test purposes;
- duplicate validation command ownership into `.github/workflows/ci.yml`;
- infer fast/full ownership from broad filename globs such as `*db*`, `*migration*`, `*contract*`, or `*runtime*`;
- introduce a heavyweight browser/E2E stack solely to preserve incidental presentation assertions;
- change application domain semantics as part of this work.

## 3. Repository-wide test invariants

The implementation should make these durable rules explicit.

### 3.1 Complete-suite invariant

`npm test` remains the canonical complete Node suite.

Ready-for-review/full validation must continue to run the complete suite.

A future `test:fast` command is a Draft optimization only. It must not redefine what “all tests” means.

### 3.2 New-test default invariant

New ordinary tests must default into the Draft fast suite automatically.

Fast selection therefore needs to be **exclusion-based**, with a short explicit list of specialized/full-only files. Do not maintain a large allow-list of every fast test.

A new test should require an explicit reviewed decision to be excluded from fast validation.

### 3.3 Schema-fixture invariant

Tests must distinguish three cases:

1. **Current application behavior tests**
   - run current application code;
   - initialize the current supported schema;
   - may create historical/edge-case data inside that current schema.

2. **Migration/upgrade tests**
   - may deliberately initialize a historical schema;
   - apply one or more migrations;
   - assert upgrade, preservation, constraint, or sequencing behavior.

3. **Historical data-state tests**
   - use the current schema;
   - represent data created under earlier product behavior where that data remains valid;
   - do not require the current runtime to probe for missing tables/columns.

Ordinary runtime tests must not silently become “current application + obsolete partial schema” compatibility tests.

### 3.4 Validation-authority invariant

`scripts/validation-contract.mjs` remains the single repository-owned authority for named validation checks and fast/full composition.

`.github/workflows/ci.yml` remains orchestration only.

`scripts/validate.mjs`, `scripts/validate-ci.mjs`, and agent tooling continue to consume the shared contract rather than maintaining parallel command lists.

### 3.5 Source-contract invariant

Source inspection is allowed where source/configuration **is itself the contract**, for example dependency direction, deployment wiring, command authority, or runtime-safety structure.

Source inspection is not justified merely because it is easy. Tests should not freeze exact CSS declarations, local helper names, equivalent expression forms, incidental markup order, or ordinary copy when a stronger behavioral owner exists.

## 4. Implementation sequence

The work should be performed in independently reviewable checkpoints. Do not combine all cleanup into one unreviewable change.

---

## Checkpoint 0 — CI Node-test diagnostics

### Objective

Make the actual failures immediately visible in GitHub Actions before changing test selection or coverage.

The current CI wrapper captures `npm test` output but then prints the entire TAP stream. With hundreds of passing tests, failures are buried inside a very large log. The existing post-failure regex annotation helps, but it is not sufficient because the human-readable log remains noisy and the regex depends on TAP text shape.

### Design

Keep local/canonical semantics unchanged:

```text
npm test -> node --test
```

For GitHub Actions only, invoke the same test execution with a dedicated compact reporter.

Node 22 supports `--test-reporter`, built-in compact reporters, custom reporters based on the `node:test` event stream, and multiple reporters. Node's documentation also warns that human reporter text is not a stable programmatic API. Therefore:

- do not parse the textual `dot` or `spec` reporter as structured data;
- use the test event stream/custom reporter for any structured failure extraction;
- keep reporter behavior CI-specific rather than changing application tests.

Recommended implementation:

- add a small repository-owned CI reporter, e.g. `scripts/node-test-ci-reporter.mjs`;
- invoke it from the CI validation path only, either by augmenting the `npm test` invocation or through a thin CI-specific wrapper;
- leave `npm test` itself unchanged;
- update `scripts/validate-ci.mjs` so it no longer re-dumps hundreds of successful TAP records;
- preserve the child process exit status exactly.

### Desired successful output

A successful run should consume very little vertical space, for example a few lines of progress plus a summary:

```text
Run Node tests
................................................................
........................................................
635 passed | 0 failed | 635 total | 19.6s
```

Exact punctuation/layout is not an API contract; readability is the contract.

### Desired failure output

Failures should be grouped conspicuously near the end of the Node-test section:

```text
NODE TEST FAILURES

1. role conversion rejects a mismatched Case before writing either relationship
   test/original-stimulus-semantics.test.js:380
   AssertionError: ...
   expected: ...
   actual: ...
   useful stack frames...

2. the current Original must be replaced before it can move to Always shown
   test/original-stimulus-semantics.test.js:411
   AssertionError: ...

2 failed | 633 passed | 635 total
```

The reporter should retain useful diagnostics supplied by Node, including error message, location, stack, and expected/actual data when available.

### GitHub annotations

Preserve or improve GitHub `::error` annotations.

Preferred behavior:

- one concise annotation per failing test when a reliable source location exists;
- otherwise one concise Node-test failure annotation with the complete failure detail still visible in the grouped log;
- do not place hundreds of passing records into annotations;
- do not make the annotation parser depend on unstable human reporter formatting.

### Tests for the reporter

Add focused contract/unit tests proving that the CI reporter:

- renders passing events compactly;
- renders one failure with its name and error detail;
- renders multiple failures separately;
- preserves source location when supplied;
- renders a final pass/fail/total summary;
- handles missing optional diagnostic fields;
- does not treat ordinary passing output as a failure;
- does not alter the test process exit result.

Do not run the whole application suite merely to test reporter formatting.

### Acceptance criteria

- the same tests execute before and after this checkpoint;
- `npm test` remains unchanged;
- successful CI output is dramatically shorter;
- a deliberately failing reporter fixture makes the failure obvious near the end of the test group;
- failure details remain sufficient for debugging without downloading/searching the entire raw log;
- validation ownership remains centralized.

---

## Checkpoint 1 — Current-schema fixture normalization

### Objective

Remove the architectural inconsistency where ordinary current-runtime tests construct obsolete partial schemas and rely on runtime compatibility fallbacks.

This is a test-suite cleanup concern independent of whether runtime fallback removal is implemented in another PR.

### Required classification

Before modifying a manually migrated fixture, classify the test as one of:

- ordinary current application behavior;
- migration/upgrade behavior;
- historical data-state behavior;
- explicit deployment/sequencing compatibility behavior.

Only the first category should be automatically normalized to current schema.

### Shared current-schema bootstrap

Introduce or standardize one repository-owned helper for ordinary tests that need a D1 schema.

The helper should:

- apply the repository's complete current migration set in deterministic migration order;
- derive the migration set from the actual repository migration files / current migration authority, not a stale hand-maintained subset;
- fail loudly if a migration cannot be applied;
- avoid `no such column` / `no such table` probing as control flow;
- be usable by ordinary D1-backed tests without each file copying a migration list.

If repository migration metadata is not a complete source of truth, do not silently rely on it. The bootstrap source must actually cover the current schema.

### Audit targets

Search for tests that:

- read a manually selected list of migration files;
- inline `CREATE TABLE` definitions that mimic application tables;
- deliberately omit newer columns/tables and then call current application modules;
- catch `no such table` / `no such column` inside test setup to support multiple schema generations.

Do **not** mass-rewrite every test that reads SQL. Migration tests legitimately read historical SQL.

### Preserve migration tests

Examples of valid historical-schema testing include:

- applying migration N to the schema produced by N-1;
- verifying data preservation during an upgrade;
- asserting a migration trigger/constraint is created correctly;
- validating deployment sequencing contracts.

Those tests should remain historical by design.

### Acceptance criteria

- ordinary current-runtime D1 tests use the current schema bootstrap or an equally current purpose-built fixture;
- explicit migration tests remain historical;
- historical data states are represented inside the current schema rather than through missing columns/tables;
- no application compatibility fallback is added merely to make a test fixture pass;
- fixture intent is obvious from test setup.

---

## Checkpoint 2 — Introduce `test:fast`

### Objective

Make Draft validation meaningfully faster without weakening the canonical complete suite.

### Package/command contract

Add:

```text
npm run test:fast
```

Do not add `test:full` initially. `npm test` already means complete.

### Selection architecture

Use a repository-owned selector rather than workflow globs.

Recommended shape:

```text
complete test discovery
        |
        +--> npm test      -> all maintained Node tests
        |
        +--> fast selector -> all discovered ordinary tests
                              minus explicit specialized/full exclusions
```

The selector should:

- discover the repository's maintained Node test files deterministically;
- maintain a short explicit exclusion manifest;
- fail when an exclusion names a missing file;
- make newly discovered ordinary tests fast by default;
- emit the selected/excluded files in a deterministic order when diagnostics are requested;
- avoid subsystem inference from filename fragments.

A small script such as `scripts/test-selection.mjs` / `scripts/test-fast.mjs` is preferable to duplicating long argument lists in `package.json` or Actions YAML.

### Initial fast exclusions

Start conservatively with only:

```text
tools/slide-import-review/tests/build.test.js
tools/slide-import-review/tests/core.test.js
tools/slide-import-review/tests/review-fixes.test.js
tools/slide-import-review/tests/source-coverage.test.js
test/ecg-batch-01-asset-rename.test.js
test/production-taxonomy-operator.test.js
```

Rationale:

- slide-review has clear specialized ownership and dedicated `slide-review:test` / `slide-review:build` checks;
- the two production-operator files are important while their operators remain runnable but are not ordinary application behavior needed in every unrelated Draft.

Everything else stays fast initially, including:

- D1 and migration tests;
- auth and Preview/Production isolation contracts;
- asset/R2 safety tests;
- import and resumable-import safety;
- learner/review behavior;
- Stimulus Family semantics;
- reusable-question behavior;
- Case lifecycle;
- taxonomy/tag behavior;
- validation/agent tooling;
- local-runtime helper tests;
- Wrangler authority contracts.

### Validation-contract integration

Add a distinct repository-owned named check for the fast Node suite.

Expected composition:

```text
fast:
  diff whitespace
  npm run test:fast
  npm run check

full:
  diff whitespace
  npm run db:check
  npm test
  npm run check
  npm run build
  npm run auth:smoke:local
```

Do not silently add `runtime:smoke` or slide-review tooling to universal full validation; they remain specialized checks unless separately decided.

`validate-ci.mjs` must recognize both complete and fast Node-test checks for compact CI reporting.

### Selector contract tests

Add tests proving:

- every selected fast test is part of the maintained complete discovery set;
- every explicit fast exclusion exists;
- every maintained discovered test is either fast or explicitly excluded;
- a newly added ordinary test would default to fast;
- the six initial exclusions are not selected for unrelated Draft fast validation;
- `npm test` remains the complete command;
- full validation uses `npm test`, not `test:fast`;
- workflow YAML does not grow a duplicate test list.

### Acceptance criteria

- complete-suite semantics are unchanged;
- Draft uses `test:fast` through the shared validation contract;
- Ready/full uses `npm test`;
- new ordinary tests cannot silently disappear from Draft validation;
- initial exclusions are limited to the explicitly approved specialized/operator set.

---

## Checkpoint 3 — Remove clearly incidental source contracts

### Objective

Remove tests whose unique contract is an implementation detail rather than application behavior.

### Initial removals

The audit identified two strong removal candidates:

#### `test/admin-shared-questions-width-contract.test.js`

It freezes an exact width declaration such as `width: min(100%, 120rem)`.

Unique coverage is the CSS technique itself. That is not a durable domain, safety, accessibility, or functional invariant.

Disposition: **REMOVE**.

#### `test/admin-horizontal-overflow-contract.test.js`

It freezes an exact global `overflow-x` CSS technique rather than testing observable horizontal-overflow behavior.

Disposition: **REMOVE**.

### Guardrail

Do not generalize these removals into “delete source-reading tests.” Valuable architecture/safety source contracts remain.

### Acceptance criteria

- each removed test has an explicit statement of what unique coverage is lost;
- no domain/safety invariant disappears;
- `npm test`, `test:fast`, and `npm run check` remain green;
- removal is justified by refactor resilience, not claimed as a meaningful runtime optimization.

---

## Checkpoint 4 — Consolidate duplicated source/UI contracts

### Objective

Reduce multiple tests asserting the same behavior through increasingly brittle source expressions.

### Primary consolidation targets

#### Case Library PR104 contract family

`admin-case-library-pr104-ui.test.js` overlaps functional owners for filtering, state, topic authoring, and classification.

Keep only genuinely unique UI/data-flow guarantees. Remove duplicate assertions about exact expressions, CSS, or ordinary copy when functional tests already own the invariant.

#### Taxonomy Admin contract family

Review together:

- `admin-taxonomy-workspace-contract.test.js`;
- `admin-taxonomy-case-tag-contract.test.js`;
- `admin-topics-form-contract.test.js`;
- `taxonomy-workspace-model.test.js`;
- `taxonomy-workspace-staging.test.js`;
- `taxonomy-hierarchy-staging.test.js`;
- `case-primary-topic-*`;
- `case-tag-*`.

Prefer domain/model/staging tests as owners of mutation/preflight/hierarchy semantics. Retain raw source assertions only for a real architectural boundary that cannot be owned more directly.

#### Case Images / Stimulus curation overlap

Review together:

- `case-images-editor-layout.test.js`;
- `stimulus-curation-editor-controls.test.js`;
- `original-stimulus-semantics.test.js`;
- `admin-image-workflow.test.js`.

Domain role semantics belong in domain tests. UI tests should own only unique authoring affordances and intentional vocabulary.

### Method

For every assertion considered for deletion:

1. state the invariant it claims to protect;
2. identify the strongest existing owner;
3. if no strong owner exists and the invariant matters, add/strengthen that owner first;
4. only then delete the duplicated/brittle assertion.

### Acceptance criteria

- no important invariant is removed without an identified replacement owner;
- exact implementation expressions are reduced;
- a refactor that preserves behavior should not require routine regex-test rewrites;
- test files have clearer subsystem ownership.

---

## Checkpoint 5 — Rewrite valuable-but-brittle contracts behaviorally

### Objective

Preserve important regressions while moving them away from incidental source shape.

Do this one family at a time so review can compare old and new protection.

### 5A. Case editor responsive/single-tree behavior

Target:

- `admin-case-editor-responsive-contract.test.js`.

Preserve:

- Compact/Classic is presentation-only;
- one editor tree remains mounted;
- required controls remain usable across intended layout states.

Avoid freezing:

- exact breakpoint values unless product requirements truly specify them;
- helper variable names;
- CSS declaration spelling/order;
- incidental source tokens.

Prefer a lightweight rendered/component contract if practical. Do not add a heavyweight browser stack solely for this.

### 5B. Case Images editor behavior

Target relevant portions of:

- `case-images-editor-layout.test.js`.

Preserve:

- canonical information architecture that affects authoring;
- meaningful image-role vocabulary;
- canonical navigation to Image Library;
- role-changing affordances required by domain behavior.

Move Original/Alternative/Always-shown semantics to domain tests where possible.

### 5C. Stimulus curation controls

Target:

- `stimulus-curation-editor-controls.test.js`.

Preserve the Admin's ability to establish/correct the domain roles and reverse curation decisions.

Prefer server/action/domain or rendered-control behavior over literal raw Svelte source where possible.

### 5D. Performance/read-model contract

Target the brittle source portion of:

- `performance-read-model.test.js`.

Preserve the real invariant: opening the Case editor must not reintroduce an unbounded Case Library read.

Prefer:

- bounded query/read instrumentation;
- call-count/query-shape assertions;
- a narrow dependency boundary only when that is genuinely the architecture contract.

Avoid protecting a specific helper function name if an equivalent implementation remains safe.

### 5E. Reusable-image route/source safety

Keep production-scope, Asset identity, option identity, and mutation safety behavior.

Only remove route/source-form assertions after equivalent route/domain behavior is demonstrably covered.

### Acceptance criteria for each family

- old protected behavior is written down before rewrite;
- new test fails on the intended regression;
- new test survives an equivalent implementation refactor;
- no heavy test framework is introduced without a clear cost/benefit case.

---

## Checkpoint 6 — Runtime profiling and optimization

### Objective

After diagnostics, fixture normalization, and the conservative fast split are stable, measure whether Draft latency actually improved enough.

### Baseline

Use the audited Node-stage baseline of approximately 19.6 seconds as historical evidence, but establish a fresh comparable implementation baseline after the branch is rebased/current.

### Measurement protocol

For each important stage, use at least three comparable GitHub Actions runs and compare medians rather than one-off timings.

Record:

- complete `npm test` wall time;
- `test:fast` wall time;
- `npm run check` wall time;
- total Draft validation wall time;
- number of discovered/selected/excluded files;
- pass/fail counts.

Recommended success gate:

- **at least 20% median reduction in the Node-test stage** before declaring the fast-tier infrastructure materially worthwhile.

Because `npm run check` remains about 18.5 seconds, a 20% Node improvement translates to a smaller total Draft improvement; report both numbers rather than overstating the benefit.

### If the initial split is insufficient

Do not reflexively exclude more high-value tests.

Profile first:

1. per-file/process startup cost;
2. repeated module bootstrap;
3. repeated current-schema migration setup;
4. repeated fixture construction;
5. real-Git/subprocess tests;
6. unusually slow route/import/image tests;
7. test-file fragmentation that creates worker/process overhead;
8. concurrency behavior in the GitHub runner.

### Permitted optimization directions

Depending on evidence:

- consolidate tightly related micro-files when process startup dominates;
- reduce duplicate fixture/migration setup within a file;
- cache immutable fixture text/metadata safely within a process;
- simplify redundant integration setup;
- split genuinely specialized subprocess/operator tooling out of Draft;
- tune test concurrency only with measured evidence.

### Prohibited shortcut

Do not move auth, D1, migration, import, learner, Stimulus Family, reusable-question, Preview/Production isolation, Asset/R2, or Case lifecycle tests out of fast merely because they are integration tests.

Risk and ownership must justify any later exclusion.

---

## Checkpoint 7 — Documentation and durable authoring rules

### Objective

Prevent the suite from drifting back into the same problems.

Update repository guidance after implementation to document:

### Test selection

- `npm test` = complete maintained Node suite;
- `npm run test:fast` = Draft subset;
- ordinary new tests default to fast;
- full-only/specialized exclusions require explicit rationale.

### Fixture rules

- current application tests use current schema;
- migration tests may use historical schema deliberately;
- historical data state is not the same as historical schema support;
- no permanent missing-column/table probing in ordinary tests.

### Contract-testing rules

Prefer, in order:

1. domain/server behavior;
2. observable rendered behavior where worthwhile;
3. stable query/interaction boundaries;
4. source/configuration assertions only when source/configuration is itself the intended architecture/safety contract.

Do not freeze exact CSS/source expression/copy without a documented reason.

### CI-output rules

- passing Node tests stay compact;
- failures remain detailed and prominent;
- structured diagnostic logic consumes Node test events, not unstable human reporter text.

Update the appropriate `AGENTS.md` / testing documentation and documentation index/task map where required by repository guidance.

---

## 5. Safety-critical contracts that must remain protected

The cleanup must preserve effective coverage for the following families.

### Production / Preview ownership and isolation

Including Preview deployment ownership, Preview auth/workspace behavior, Asset Preview isolation, and Production-scoped operator constraints.

### Authentication / authorization

Including auth migration/bootstrap behavior, Preview auth, and content access guards.

### D1 / R2 destructive and race-sensitive behavior

Including Asset replacement/identity, image collection rename races, upload/serving/storage behavior, conditional immutability, resumable import lease/runtime safety, and content-import safety.

### Database / migrations

Including migration upgrade behavior, schema constraints/triggers, multi-topic migration behavior, tag/shared schema, Case lifecycle compatibility where explicitly an upgrade test, and Stimulus integrity triggers.

### Learner behavior

Including learning persistence, review provenance/selection, media cache, system review navigation, question pool/scope, and multi-topic study routes.

### Stimulus Family

Including Original/Alternative semantics, group/curation behavior, correctness checkpoints, façade dependency direction, live prompt alignment, prompt specificity, and reusable coverage restoration.

### Reusable questions

Including reusable-image question safety, card counts, identity, question pool mode, and scope invariants.

### Imports

Including content import/hardening/safety, primary-topic guards, resumable import behavior, seed validity, and slide-review tooling through its specialized/full ownership.

### Case lifecycle / taxonomy

Including lifecycle, primary-topic behavior, taxonomy hierarchy/model/staging, tags, and Admin classification/state behavior.

## 6. Source-contract disposition summary

### Keep as deliberate source/config contracts

- `preview-deployment-contract.test.js`;
- `stimulus-family-facade-contract.test.js`;
- `wrangler-authority-contract.test.js`;
- resumable-import runtime/source safety constraints;
- selected Windows CLI process/source contracts.

### Remove

- `admin-shared-questions-width-contract.test.js`;
- `admin-horizontal-overflow-contract.test.js`.

### Consolidate / rewrite behaviorally

- `admin-case-library-pr104-ui.test.js`;
- `admin-taxonomy-workspace-contract.test.js`;
- `admin-taxonomy-case-tag-contract.test.js`;
- `admin-topics-form-contract.test.js`;
- `admin-case-editor-responsive-contract.test.js`;
- `case-images-editor-layout.test.js`;
- `stimulus-curation-editor-controls.test.js`;
- source portion of `performance-read-model.test.js`;
- reusable-image route/source assertions where equivalent behavior coverage is established first.

## 7. Implementation PR strategy

PR #115 should remain the durable audit/plan and should not itself implement the cleanup.

Recommended implementation strategy:

### Implementation PR 1 — Test infrastructure foundation

Checkpoints:

- Checkpoint 0: compact structured CI diagnostics;
- Checkpoint 1: current-schema fixture normalization infrastructure and clearly ordinary stale fixtures;
- Checkpoint 2: `test:fast` selector and validation-contract wiring.

Keep this PR Draft through all three checkpoints and make each checkpoint independently reviewable by commit/diff. Do not begin brittle-test deletion until the infrastructure foundation has been reviewed.

### Implementation PR 2 — Low-risk cleanup

Checkpoint 3 plus clearly duplicated incidental assertions from Checkpoint 4.

No application behavior changes.

### Implementation PR 3+ — Behavioral rewrites by family

Perform Checkpoint 5 as one or more small PRs by subsystem. Do not mix unrelated Admin, taxonomy, Stimulus, and performance rewrites into one large patch.

### Profiling follow-up

Checkpoint 6 may be part of the infrastructure PR if it is instrumentation-only, but any broader test-tier exclusion should be separately justified by measured evidence.

## 8. Validation requirements by checkpoint

Every implementation checkpoint should, as applicable, run:

- focused tests for the changed test infrastructure;
- `npm run test:fast` once introduced;
- `npm test` to prove complete coverage remains healthy;
- `npm run check`;
- repository-selected additional checks from `npm run agent:checks`;
- full validation before marking an implementation PR Ready for Review.

For changes to validation infrastructure itself, explicitly inspect the generated command composition and GitHub Actions behavior; green application tests alone are insufficient.

## 9. Final acceptance criteria

The Node-test cleanup is complete only when all of the following are true:

1. `npm test` remains the canonical complete suite.
2. GitHub Actions no longer buries failures under hundreds of successful TAP records.
3. CI failure output presents test name, useful source location, diagnostic message/stack, and a concise final summary when available.
4. Structured failure handling does not parse unstable human reporter text.
5. Ordinary current-runtime tests use the current schema.
6. Historical schemas are confined to explicit migration/upgrade/sequencing tests.
7. Historical data-state tests remain possible within the current schema.
8. Draft validation uses a centrally owned exclusion-based `test:fast` subset.
9. New ordinary tests default to fast.
10. Full validation continues to execute the complete suite.
11. The initial fast exclusions remain limited to the approved slide-review/operator set unless later profiling justifies a reviewed change.
12. Broad `npm run check` remains in fast and full validation.
13. The two pure CSS implementation-lock tests are removed.
14. Valuable UI/source contracts are behaviorally rewritten or consolidated before their old protection is removed.
15. Deliberate architecture/safety source contracts remain.
16. No Production D1/R2 mutation is introduced.
17. No runtime historical-schema fallback is restored to accommodate stale tests.
18. Validation command ownership remains in `scripts/validation-contract.mjs`.
19. The fast tier demonstrates a measured material benefit; target at least 20% median Node-stage improvement across comparable runs.
20. Any further performance optimization is evidence-driven rather than based on test-category assumptions.

## 10. Stop conditions for implementation agents

An implementation agent should stop and request review at the end of each declared checkpoint if it discovers any of the following:

- a proposed removal is the only owner of a safety/domain invariant;
- a test classified as an ordinary runtime test is actually a migration/upgrade contract;
- `npm test` discovery changes unexpectedly;
- new tests can bypass the fast selector silently;
- the CI reporter loses diagnostic detail or changes test exit semantics;
- the fast split requires broad removal of high-risk domain coverage to show a benefit;
- schema-fixture normalization requires application semantic changes;
- validation logic begins diverging between local, CI, and agent tooling.

The correct response to these conditions is to preserve coverage and narrow the change, not to make the suite green by weakening the contract.
