# Test Suite Discovery and Fixture Cleanup Plan

_Status: planning-only implementation contract for a Draft PR. No test runner, fixture, helper, assertion, schema, migration, CI workflow, or application behavior has been changed by this document._

_Base used for planning: `main` at `63757ba76ff6d29602d50c9a984c20182eef1d77` (PR #177 merged). Refresh drift-prone facts before implementation._

## Purpose

A 2026-09-11 exploratory redundancy audit found no proven broad behavioral-test redundancy. The high-confidence problems are narrower:

1. maintained-test discovery currently counts `scripts/test-runner.mjs` and `scripts/test-presentation.mjs` as tests even though both are orchestration modules;
2. complete `npm test` and `npm run test:fast` currently have different discovery authorities, so fixing only the selector exclusion set would leave the complete suite on implicit Node discovery;
3. several ordinary runtime tests still bootstrap a hard-coded partial migration sequence and therefore exercise an obsolete schema even though `test/current-schema.js` exists;
4. current-schema fixture policy can regress because no small executable guard distinguishes ordinary runtime fixtures from intentional migration-boundary fixtures.

The audit also found repeated harnesses and a few navigational consolidation candidates, but those do not currently justify assertion deletion or a broad refactor. This PR should fix the correctness-bearing discovery/fixture issues first and preserve existing behavioral coverage.

## Agent target

This plan is written for GPT-5.6 Luna implementing locally in Codex/WSL or another environment with a usable checkout and command execution.

Follow root `AGENTS.md`, `scripts/AGENTS.md`, the relevant `docs/AGENT_TASK_MAP.md` routing, and `docs/TESTING_AND_VALIDATION_GUIDANCE.md`. Do not treat this plan as authority over current executable code if the branch moves.

Use the repository's normal `Discovery -> Implementation -> Checkpoint -> Handoff` flow. Keep retrieval bounded after the directly affected runner/tests/fixtures are established.

## Scope decision

### In scope for this PR

1. **Single-source maintained-test discovery** for the canonical no-target complete suite and the existing fast suite.
2. **Exclude the two orchestration false positives** from maintained discovery.
3. **Preserve focused/targeted test invocation** without expanding it to the complete suite.
4. **Normalize the 13 genuinely stale ordinary runtime fixtures** to `applyCurrentSchema`.
5. **Retain intentional historical/migration fixtures explicitly**, including the previously omitted `test/resumable-import-contract.test.js` exception.
6. **Add one narrow fixture-policy contract test** that prevents new ordinary explicit partial migration bootstraps without banning legitimate migration source assertions or complete dynamic current-schema bootstraps.
7. Update living testing guidance only where the implementation makes its description materially incomplete.

### Explicitly out of scope

Do **not** bundle the lower-confidence maintenance ideas from the redundancy audit into this PR:

- no behavioral assertion deletion;
- no new fast-test exclusions;
- no universal/shared test framework;
- no broad D1-adapter abstraction;
- no slide-review fake-DOM helper extraction;
- no import ZIP-helper extraction;
- no case-editor test-file consolidation;
- no large image/deduplication test-file split;
- no conversion of already-correct dynamic current-schema bootstraps merely for style consistency;
- no mutation-testing/coverage framework;
- no application/domain behavior changes;
- no schema or migration changes;
- no `.github` workflow changes unless implementation proves they are strictly required for the stated runner contract;
- no Production D1/R2, deployment, Preview, or live-environment mutation.

These can be separate follow-ups if they later show concrete maintenance value.

## Current implementation facts to confirm before editing

At the planning base:

- `package.json` maps `npm test` to `node scripts/test-runner.mjs`.
- `scripts/test-runner.mjs` strips repository presentation args and invokes `node --test` with the remaining Node args. With no target it relies on Node implicit discovery.
- `scripts/test-fast.mjs` calls `resolveFastNodeTestSelection()` and passes the explicit selected list to `node --test`.
- `scripts/test-selection.mjs` owns `discoverMaintainedNodeTests()` and `FAST_TEST_EXCLUSIONS`.
- `NON_TEST_TOOLING_FILES` currently excludes `scripts/test-fast.mjs` and `scripts/test-selection.mjs`, but not `scripts/test-runner.mjs` or `scripts/test-presentation.mjs`.
- the audit observed 194 discovered paths / 188 fast-selected because of those two false positives; the actual maintained test roots contained 192 real test files. With the existing six fast exclusions, the expected relationship after the fix is 192 complete / 186 fast-selected **if the repository has not moved**. Treat that as a planning snapshot, not a hard-coded contract.
- `test/current-schema.js` already applies every contiguous repository migration in order and is the preferred ordinary current-runtime fixture helper.
- `docs/TESTING_AND_VALIDATION_GUIDANCE.md` already distinguishes current runtime behavior from deliberate migration/upgrade behavior and allows an equally-current purpose-built fixture; do not turn one helper implementation into a universal architecture rule.

Before implementation, refresh:

```text
branch/head/base
current migration tip
maintained discovery count
FAST_TEST_EXCLUSIONS (must still be exactly the currently approved set unless separately reviewed)
explicit partial-migration bootstrap inventory
child-process test baseline in the actual implementation environment
```

If these facts materially differ, adapt the implementation while preserving the invariants below rather than forcing stale counts/file lists.

# Required invariants

## A. Complete-suite invariant

Canonical no-target:

```text
npm test
npm run test:ci
npm run test:verbose
```

must execute the complete repository-maintained Node test set explicitly selected by `scripts/test-selection.mjs`.

The full suite must not fall back to implicit Node discovery if maintained selection fails or resolves to zero.

## B. Fast-suite invariant

`npm run test:fast` remains:

```text
complete maintained discovery
minus exactly FAST_TEST_EXCLUSIONS
```

Do not add a second discovery rule and do not add a seventh exclusion as part of this PR.

## C. Targeted-run invariant

Existing focused invocations must stay focused:

```text
npm test -- test/example.test.js
npm run test:verbose -- test/example.test.js
npm run slide-review:test
```

Do not silently append the complete maintained suite when the caller already supplied forwarded Node/test arguments.

For simplicity, do **not** build a general Node CLI parser. After repository `--presentation=` handling:

- if `nodeArgs.length === 0`, resolve and append complete maintained discovery;
- if `nodeArgs.length > 0`, preserve those caller arguments unchanged.

This deliberately keeps explicit/custom invocations on their existing passthrough path while fixing the canonical no-target suite. It also avoids misclassifying separate option values as test paths.

## D. Presentation invariant

The selection fix must not change reporter precedence or compact/CI/verbose presentation semantics.

Preserve:

```text
explicit caller-selected reporter/presentation
> CI/automation/deployment presentation
> local compact default
```

`CI_NODE_TEST_CHECK_ID` and `CI_NODE_TEST_REPRO_COMMAND` remain metadata only.

## E. Fixture invariant

Ordinary runtime/data behavior tests use the current supported schema.

A test may retain an explicit historical schema only when the subject is genuinely a migration/upgrade/sequencing boundary. Historical data shapes that are still valid should be represented as current schema + explicit seed state, not an obsolete schema.

## F. Coverage-preservation invariant

This PR changes setup/discovery ownership, not product behavior. Preserve existing assertions and their owner boundaries. If converting a stale fixture exposes a failure under the current schema, repair the **test setup/data** to be valid under the current schema unless the failure demonstrates a real application bug. Do not weaken a production constraint, add runtime fallback behavior, or revert a migration to keep an obsolete fixture green.

# Implementation sequence

Implement in the following tranches. Keep each tranche coherent and run the focused checks listed before moving on.

---

## Tranche 1 — unify complete and fast maintained-test discovery

### Files expected to change

Primary:

```text
scripts/test-selection.mjs
scripts/test-runner.mjs
tests/test-selection.test.js
tests/compact-terminal-validation.test.js
```

Possibly, after implementation:

```text
docs/TESTING_AND_VALIDATION_GUIDANCE.md
```

Do not edit `scripts/test-fast.mjs` unless required to share a small existing selector primitive; its current explicit selection behavior is already conceptually correct.

### 1.1 Exclude orchestration modules

Add these exact repository-relative paths to `NON_TEST_TOOLING_FILES`:

```text
scripts/test-runner.mjs
scripts/test-presentation.mjs
```

Keep the existing exclusions:

```text
scripts/test-fast.mjs
scripts/test-selection.mjs
```

Do not replace the exact non-test set with filename heuristics or directory exclusions that could hide future legitimate maintained tests.

### 1.2 Make the complete no-target runner use selector discovery

In `scripts/test-runner.mjs`:

1. import `discoverMaintainedNodeTests` from `scripts/test-selection.mjs`;
2. preserve `parseTestPresentationArgs(argv)` as the presentation owner;
3. after parsing, when `nodeArgs.length === 0`, resolve complete maintained discovery against `cwd`;
4. refuse to spawn when complete selection is empty; throw a clear error rather than letting Node implicitly rediscover files;
5. pass the explicit discovered file list through `nodeTestArgsForPresentation(...)` and then to `node --test`;
6. when `nodeArgs.length > 0`, pass those args through unchanged as today;
7. preserve `process.execPath`, `stdio: 'inherit'`, `shell: false`, caller environment, and child exit status.

Because `discoverMaintainedNodeTests` is asynchronous, the simplest implementation is to make `runNodeTests()` async and await it in the direct-execution block. Update its direct tests/callers rather than creating a second synchronous filesystem walker.

Do not add a second discovery implementation to `test-runner.mjs`.

### 1.3 Regression coverage

Extend existing tests rather than creating a new selector test framework.

In `tests/test-selection.test.js`, prove at minimum:

- `isMaintainedNodeTestPath('scripts/test-runner.mjs') === false`;
- `isMaintainedNodeTestPath('scripts/test-presentation.mjs') === false`;
- both remain absent from repository `discoverMaintainedNodeTests(...)`;
- the six existing `FAST_TEST_EXCLUSIONS` remain exactly the approved set;
- fast selection still equals complete maintained discovery minus those six.

In `tests/compact-terminal-validation.test.js`, adapt existing `runNodeTests` tests to async and prove:

**No-target complete path**

- use a temp root with a small deterministic set of real test-shaped files and the orchestration false-positive filenames;
- `runNodeTests({ cwd: tempRoot, argv: [], spawn: mockSpawn })` passes exactly the selector-discovered maintained files to `node --test`;
- orchestration files are not present;
- the selected reporter remains correct.

**Targeted path**

- the existing focused-file case remains exactly focused and does not append unrelated maintained tests;
- CI/verbose presentation remains presentation-only and does not alter caller targets.

**Fail-safe path**

- no-target runner refuses zero maintained tests and does not call spawn.

Do not hard-code repository-wide file counts in unit tests. Assert set relationships and exact small temp-fixture behavior.

### Focused validation after Tranche 1

```sh
npm test -- tests/test-selection.test.js tests/compact-terminal-validation.test.js
npm test -- test/ecg-batch-01-asset-rename.test.js
npm run slide-review:test
```

The second and third checks are sanity checks that existing specialized/targeted invocations still remain targetable. If `agent:checks` identifies a different narrower relevant command at implementation time, follow current repository guidance.

---

## Tranche 2 — normalize genuinely stale ordinary runtime fixtures

The audit's original ordinary list contained 19 files, not 20. Six already enumerate every migration dynamically and are semantically current. Only the following **13** are high-confidence stale/partial ordinary runtime bootstraps and are required in this PR.

### 2.1 Required current-schema conversions

Convert these files to `applyCurrentSchema`:

```text
test/asset-library.test.js
test/asset-preview-isolation.test.js
test/case-library-inactive-tags.test.js
test/case-primary-topic-staging.test.js
test/case-tag-bulk.test.js
test/case-tag-staging.test.js
test/question-library.test.js
test/question-library-unicode-search.test.js
test/preview-workspace-foundations.test.js
test/tag-library.test.js
test/tagging-stage-b-admin-consistency.test.js
test/taxonomy-hierarchy-staging.test.js
test/taxonomy-workspace-staging.test.js
```

For each file:

1. import `applyCurrentSchema` from `./current-schema.js`;
2. preserve the existing in-memory SQLite/D1 adapter and domain-specific seed data unless a current-schema constraint requires a narrow seed correction;
3. preserve `PRAGMA foreign_keys = ON` behavior/order where already present;
4. replace the hard-coded migration array/string/manual migration concatenation with `applyCurrentSchema(sqlite)`;
5. remove now-unused `readFileSync`/migration-name constants/manual `ALTER TABLE` shims only when they are no longer used for another legitimate source assertion;
6. do not rewrite assertions, production implementation, or migration SQL merely to make conversion easier.

Special attention:

- `test/asset-library.test.js` and `test/preview-workspace-foundations.test.js` manually emulate later deduplication columns; remove those shims when current schema owns them.
- the four staging tests should keep their domain-specific setup/assertions local. This tranche removes stale migration bootstrap duplication; it does **not** authorize a generic staging D1 fixture abstraction.

### 2.2 Already-current dynamic bootstraps — leave unchanged in this PR

These six ordinary tests dynamically enumerate the complete migration directory and are therefore not correctness defects:

```text
test/asset-higher-resolution-replacement.test.js
test/asset-replacement-race-preview.test.js
test/stimulus-family-correctness-checkpoint-a.test.js
test/stimulus-family-correctness-checkpoint-a-boundaries.test.js
test/stimulus-family-live-prompt-trigger-alignment.test.js
test/stimulus-prompt-specificity-characterisation.test.js
```

Do not convert them merely for stylistic uniformity in this PR. They can later use `applyCurrentSchema` if a separate cleanup shows enough maintenance value. The future policy guard must not classify their complete dynamic bootstrap as stale.

### 2.3 Focused fixture validation

Run the converted tests in coherent subsystem groups, not one full-suite rerun after every file.

Suggested grouping:

```sh
npm test -- test/asset-library.test.js test/asset-preview-isolation.test.js test/preview-workspace-foundations.test.js

npm test -- test/case-library-inactive-tags.test.js test/case-primary-topic-staging.test.js test/case-tag-bulk.test.js test/case-tag-staging.test.js test/taxonomy-hierarchy-staging.test.js test/taxonomy-workspace-staging.test.js

npm test -- test/question-library.test.js test/question-library-unicode-search.test.js test/tag-library.test.js test/tagging-stage-b-admin-consistency.test.js
```

If a group fails because a newer migration now enforces a valid production invariant, inspect that invariant and minimally update fixture data. Do not restore the old schema.

---

## Tranche 3 — add a narrow current-schema fixture-policy guard

### Goal

Prevent the specific regression that caused the stale fixtures: an ordinary runtime test explicitly executing a hand-maintained partial migration sequence that silently stops receiving newer migrations.

This is **not** a general source linter and must not ban all migration reads.

### Recommended file

```text
tests/current-schema-fixture-policy.test.js
```

### Scan scope

Scan only application test roots where repository schema fixtures belong:

```text
test/**/*.test.js
tests/**/*.test.js
```

Do not scan slide-review/source-prep tool trees unless evidence shows they actually own application migration fixtures.

### Detection scope

The classifier should be deliberately narrow. Detect recognizable **executed explicit migration bootstraps**, for example:

- a hard-coded migration filename/name array used to build SQL that is executed into SQLite; or
- an equivalent explicit partial migration SQL bootstrap.

Do **not** flag solely because a file contains `readFileSync`, a `drizzle/*.sql` path, or migration text.

The guard must allow:

1. ordinary tests using `applyCurrentSchema`;
2. complete dynamic enumeration of the migration directory, because it remains current by construction (even though the shared helper is preferred for maintainability);
3. focused source-contract assertions that read one migration file without using that read as an application-schema bootstrap;
4. exact intentional historical/migration exceptions listed below.

Keep the detector local/simple. Do not introduce a generic lint DSL, parser dependency, AST dependency, or repository-wide policy framework.

### Intentional historical/migration exception map

Before enforcing the map, run the planned search over the **current implementation head** and reconcile every detected explicit bootstrap. If an unexpected file appears, classify it by behavior before adding it to either ordinary conversion or exception scope.

Expected intentional exceptions from the audited base:

```text
test/auth-migration.test.js
  Better Auth migration 0001 in isolation.

test/learner-fsrs-active-review-resume-race.test.js
  Minimal pre-FSRS tables plus migrations 0019/0020.

test/learner-fsrs-active-review-scope.test.js
  Minimal active-review scope schema from migrations 0019/0020.

test/learner-fsrs-active-review.test.js
  Minimal active-review schema from migrations 0019/0020.

test/learner-fsrs-foundation.test.js
  Migration 0019 foundation in isolation.

test/learner-fsrs-free-study.test.js
  Ordered FSRS migrations 0019-0022.

test/learner-fsrs-reset-fresh.test.js
  Ordered FSRS migrations 0019/0020/0024.

test/learner-fsrs-retention-admin.test.js
  Migration 0019 foundation in a minimal fixture.

test/learner-fsrs-scheduled-completion.test.js
  Ordered FSRS migrations 0019-0021.

test/learner-study-data-deletion.test.js
  Pre-0027 schema versus current-schema comparison.

test/multi-topic-migration-d1.test.js
  Migrations 0000/0002 as the base for applying 0003.

test/original-stimulus-semantics.test.js
  Pre-0016 schema plus migration 0016 under test.

test/question-pool-mode-invariants.test.js
  Migration 0014 in isolation.

test/resumable-content-import.test.js
  Migration 0004 checkpoint schema and migration-boundary assertions.

test/resumable-import-contract.test.js
  Explicit 0000-0004 upgrade path proving resumable import schema creation. This file was omitted from the exploratory report's exception list and must be retained.

test/resumable-import-lease-safety.test.js
  Migration 0004 import-job schema in isolation.
```

Use an exact `path -> reason` map. Do not allowlist an entire directory, prefix, regex family, or all FSRS/import tests.

Where an exception currently lacks an obvious nearby comment describing the historical boundary, add a short comment only if it materially improves readability. Avoid noisy comments that merely repeat the filename.

### Guard self-coverage

Keep self-coverage small. In the policy test, exercise the detector with representative source strings for:

- an explicit partial executed migration list -> detected;
- `applyCurrentSchema(...)` -> allowed;
- complete dynamic migration-directory enumeration -> allowed;
- a single migration text/source assertion that is not used as schema bootstrap -> allowed.

Then scan the actual repository test roots and fail with a useful message containing:

```text
file path
classification problem
expected action: use current schema or add an exact documented migration-boundary exception
```

Do not build fixtures/files on disk solely to test the policy scanner if inline strings cover its logic.

### Focused validation after Tranche 3

```sh
npm test -- tests/current-schema-fixture-policy.test.js
```

Then rerun the Tranche 1 selector tests because adding a new maintained test should automatically enter both complete discovery and fast selection unless explicitly excluded (it must **not** be excluded).

---

## Tranche 4 — reconcile living testing documentation

After code/tests are green, inspect `docs/TESTING_AND_VALIDATION_GUIDANCE.md` for statements made materially incomplete by Tranche 1.

At minimum, the documentation should accurately express:

```text
scripts/test-selection.mjs
→ complete maintained discovery
→ npm test uses all maintained tests
→ test:fast uses the same maintained set minus FAST_TEST_EXCLUSIONS
```

Do not copy the full implementation, file counts, or exception inventory into living guidance. Keep drift-prone counts in tests/executable code, not prose.

The existing schema-fixture section already states the correct semantic policy (`current schema` for ordinary runtime behavior, explicit historical schemas for migration/upgrade behavior). Update it only if the new guard requires a small durable clarification; do not rewrite it around this PR.

No `DOCUMENTATION_INDEX.md`, roadmap, product design, data-model, deployment, or Production-status update should be required unless implementation unexpectedly changes one of those authorities.

# Luna implementation workflow

## Step 1 — establish current state

From the PR branch:

```sh
npm run agent:doctor
```

Then refresh current head/base and inspect only the files needed for Tranche 1. Do not re-audit the entire repository before starting.

Before implementing Tranche 2/3, run a bounded migration-bootstrap search to verify the 13 ordinary files and exception map against the actual branch. Suitable search concepts include:

```text
migrationSql
migrationNames
readFileSync + drizzle
readdirSync + drizzle
applyCurrentSchema
```

The purpose is classification, not a second broad redundancy audit.

## Step 2 — implement one tranche at a time

For each tranche:

1. make the coherent set of related edits;
2. inspect the scoped diff;
3. run the listed focused checks;
4. fix only failures attributable to that tranche;
5. continue when the tranche is coherent.

Do not run the full suite after every small file edit.

## Step 3 — checkpoint

After Tranches 1-3 are coherent:

```sh
npm run agent:checks -- --compact
```

Run the current checkpoint guidance it reports, normally including `npm run validate:fast` when appropriate.

The exploratory audit previously encountered sandbox `EPERM`/child-process capture failures. In a normal local WSL/Codex environment, rerun the actual commands and treat current execution as authority. If the environment still blocks child processes, report that as an environment limitation rather than weakening tests or runner behavior.

## Step 4 — final handoff validation

Before final handoff/review:

1. rerun `npm run agent:checks -- --compact` after the final implementation delta;
2. execute **every** final required check and specialized check it reports;
3. ensure canonical `npm test` and `npm run test:fast` both run cleanly in a permissive environment;
4. inspect the complete intended-base -> head diff once;
5. verify no application code, migrations, schema, Production tooling, or unrelated tests were changed accidentally;
6. update the Draft PR body with implemented tranches, validation evidence, and any intentionally deferred follow-up.

Use `npm run validate:full` when it is the current repository-selected ordinary handoff path. Do not substitute focused test success for final required checks.

# Acceptance criteria

The implementation is complete only when all of the following hold.

## Maintained discovery

- `scripts/test-runner.mjs` and `scripts/test-presentation.mjs` are not maintained tests.
- canonical no-target `npm test` gets its complete file list from `scripts/test-selection.mjs`.
- no-target full discovery resolving to zero fails closed before spawning Node tests.
- fast selection uses the same complete maintained set minus exactly the approved `FAST_TEST_EXCLUSIONS`.
- no new fast exclusion is introduced.
- ordinary new maintained tests continue to enter fast selection automatically.

## Targeting/presentation

- `npm test -- <file>` remains focused on the caller-supplied target/args.
- slide-review targeted test commands remain targeted.
- compact, CI, verbose, explicit reporter precedence, metadata, child status, `process.execPath`, `stdio`, and `shell:false` semantics remain unchanged except for the intentional async wrapper needed by maintained discovery.

## Fixtures

- all 13 required ordinary stale fixtures use current schema rather than hard-coded partial migration sequences/manual column shims.
- their behavioral assertions remain present.
- the six already-current dynamic bootstraps remain valid and are not required to change in this PR.
- intentional migration-boundary tests retain their historical schema, including `test/resumable-import-contract.test.js`.
- no application fallback or migration/schema change is added to accommodate old test fixtures.

## Policy guard

- a new ordinary explicit partial migration bootstrap in `test/` or `tests/` causes a focused, understandable failure;
- `applyCurrentSchema`, complete dynamic enumeration, and source-only migration assertions are not falsely rejected;
- intentional historical exceptions are exact-path + reason entries;
- the guard is a small maintained test, not a new general lint architecture.

## Scope / safety

- no product/domain behavior changes;
- no behavioral test deletion;
- no schema/migration changes;
- no Production/Preview mutation;
- no `.github` workflow change unless separately justified by an implementation-discovered hard requirement;
- no broad refactor/helper framework.

# Deferred follow-up candidates

Do not implement these in this PR. Record them only if later maintenance pain justifies separate work:

1. replace the six already-current dynamic schema enumerators with `applyCurrentSchema` for consistency;
2. extract a narrowly scoped staging D1 fixture for the four taxonomy/case staging tests;
3. extract slide-review fake-DOM helpers shared by approval/dependency invalidation tests;
4. extract ZIP construction helpers shared by import hardening/safety tests;
5. move the single case-editor canonical-reconciliation test into the mutation-owner file without deleting the assertion;
6. split `admin-image-deduplication.test.js` by behavior owner if navigation/reviewability remains materially difficult.

No follow-up should infer behavioral redundancy from repeated setup, similar names, or file size alone.

# Handover summary for Luna

Implement this plan in the same Draft PR. The priority is **test infrastructure correctness, not test-count reduction**:

```text
1. make full + fast share maintained discovery;
2. remove the two orchestration false positives;
3. preserve targeted/presentation behavior;
4. move only the 13 genuinely stale ordinary fixtures to current schema;
5. preserve exact historical migration exceptions;
6. add one narrow regression guard;
7. run repository-selected final validation;
8. do not broaden into behavioral deletion or maintenance-only refactors.
```

If implementation reveals a changed safety boundary or a classification that contradicts this plan, stop that specific tranche, document the concrete discrepancy in the PR, and resolve it from current code/tests/guidance. Do not guess from the old audit snapshot.