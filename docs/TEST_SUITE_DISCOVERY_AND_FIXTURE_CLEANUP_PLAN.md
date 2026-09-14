# Test Suite Discovery and Fixture Cleanup Plan

_Status: planning-only implementation contract for Draft PR #178. No runner, fixture, schema, migration, CI workflow, application behavior, or Production/Preview state has been changed by this document._

_Base used for planning: `main` at `63757ba76ff6d29602d50c9a984c20182eef1d77` (PR #177 merged). Refresh drift-prone facts before implementation._

## Purpose

The 2026-09-11 test-suite redundancy audit did **not** justify broad test deletion. It identified two correctness-bearing maintenance problems worth fixing now:

1. maintained-test discovery counts `scripts/test-runner.mjs` and `scripts/test-presentation.mjs` as tests, while canonical full `npm test` still relies on Node implicit discovery instead of the repository selector;
2. several ordinary runtime tests bootstrap a hand-maintained partial migration sequence and therefore exercise stale schemas instead of the current supported schema.

This PR fixes those two problems and adds one narrow regression guard. It does not attempt a general test-suite refactor.

## Agent target

This plan is for GPT-5.6 Luna implementing locally in Codex/WSL or another environment with a usable checkout and command execution.

Before editing, follow:

```text
root AGENTS.md
scripts/AGENTS.md
docs/AGENT_TASK_MAP.md — Tests / validation architecture / fixtures row
docs/TESTING_AND_VALIDATION_GUIDANCE.md
```

Use the repository's normal `Discovery -> Implementation -> Checkpoint -> Handoff` flow. Once the affected runner/tests/fixtures are established, keep retrieval bounded.

# Scope

## In scope

1. Make `scripts/test-selection.mjs` the maintained-test discovery authority for canonical full `npm test` as well as `test:fast`.
2. Exclude `scripts/test-runner.mjs` and `scripts/test-presentation.mjs` from maintained discovery.
3. Preserve documented targeted test invocations and reporter/presentation behavior.
4. Convert the 13 known stale ordinary runtime fixtures to `applyCurrentSchema`.
5. Preserve genuine historical migration-boundary fixtures explicitly.
6. Add one small repository-specific policy test preventing new hand-maintained partial ordinary-schema bootstraps.
7. Reconcile living testing guidance only where the implemented runner contract makes it materially incomplete.

## Explicitly out of scope

Do not add any of the following to this PR:

- behavioral assertion deletion;
- new fast-test exclusions;
- generic/shared test framework;
- generalized D1 test abstraction;
- slide-review fake-DOM helper refactor;
- import ZIP-helper refactor;
- case-editor test-file consolidation;
- large test-file splitting;
- conversion of already-current dynamic migration enumeration merely for style;
- mutation-testing or coverage framework;
- application/domain behavior changes;
- schema or migration changes;
- CI workflow rewrite unless a concrete implementation-discovered requirement makes it unavoidable;
- Production D1/R2, Preview, deployment, or live-environment mutation.

# Current facts to refresh before editing

At the planning base:

- `package.json`: `npm test -> node scripts/test-runner.mjs`.
- `scripts/test-runner.mjs` currently forwards parsed Node arguments to `node --test`; when no target is supplied, Node owns implicit discovery.
- `scripts/test-fast.mjs` explicitly uses `resolveFastNodeTestSelection()`.
- `scripts/test-selection.mjs` owns `discoverMaintainedNodeTests()`, `isMaintainedNodeTestPath()`, and `FAST_TEST_EXCLUSIONS`.
- `NON_TEST_TOOLING_FILES` excludes `scripts/test-fast.mjs` and `scripts/test-selection.mjs`, but not the runner/presentation modules.
- the audit snapshot observed 194 selector-discovered paths, of which 192 were real tests; six approved fast exclusions then imply 186 fast-selected files if the repository has not moved.
- `test/current-schema.js` already applies every contiguous repository migration in order.
- living guidance already distinguishes ordinary current-runtime fixtures from intentional historical migration fixtures.

Before mutation, refresh only these drift-prone facts:

```text
PR head/base
current migration tip
maintained discovery count
FAST_TEST_EXCLUSIONS
explicit partial-migration bootstrap inventory
actual child-process test behavior in the local environment
```

Do not force stale counts or inventories if the branch has moved.

# Required invariants

## A. Complete maintained-suite invariant

Canonical no-target full commands:

```text
npm test
npm run test:ci
npm run test:verbose
```

must execute an **explicit complete maintained-test list from `scripts/test-selection.mjs`**.

No canonical no-target full run may silently fall back to Node implicit discovery.

If maintained discovery resolves to zero, fail closed before spawning Node tests.

## B. Fast-suite invariant

`npm run test:fast` remains:

```text
complete maintained discovery
minus exactly FAST_TEST_EXCLUSIONS
```

Do not add a second discovery implementation or another fast exclusion.

## C. Targeted-run invariant

Existing supported focused commands must remain focused, including:

```text
npm test -- test/example.test.js
npm run test:verbose -- test/example.test.js
npm run slide-review:test
npm run slide-prep:test
```

Do not append the whole maintained suite when the caller has supplied an explicit maintained-test target/path/glob.

## D. Node-options-without-target invariant

A full invocation containing Node test options but **no explicit maintained-test target** must still use repository maintained discovery.

Example:

```text
npm test -- --test-name-pattern=foo
```

must become conceptually:

```text
node --test <presentation args> --test-name-pattern=foo <explicit maintained file list>
```

and must not fall back to Node implicit discovery.

Do **not** build a general Node CLI parser. Use the smallest token-aware scanner needed for the supported Node test options that can consume a following argument, including the separate-value form of `--test-name-pattern`. For each explicitly supported option, skip its following value token before applying `isMaintainedNodeTestPath()` only to the remaining positional file/path/glob candidates; treat `--option=value` as self-contained. At minimum, `--test-name-pattern tests/fake.test.js` must treat `tests/fake.test.js` as the option value, not an explicit target, while `--test-name-pattern=foo` remains an option with no target. Keep the supported-option set explicit and small; do not infer arbitrary CLI grammar or support arbitrary non-maintained JavaScript entrypoints.

If at least one explicit maintained target is present, preserve the caller invocation unchanged. If none is present, preserve the Node options and append complete maintained discovery.

Do not broaden this task into supporting arbitrary non-maintained JavaScript entrypoints as test targets.

## E. Presentation invariant

Preserve reporter precedence and presentation semantics:

```text
explicit caller-selected reporter/presentation
> CI/automation/deployment presentation
> local compact default
```

`CI_NODE_TEST_CHECK_ID` and `CI_NODE_TEST_REPRO_COMMAND` remain reporter metadata only.

Preserve `process.execPath`, `stdio: 'inherit'`, `shell: false`, environment forwarding, and child exit-status behavior.

## F. Fixture invariant

Ordinary application/runtime behavior tests use the current supported schema.

Historical schema is valid only when migration/upgrade/sequencing behavior is itself under test. Historical data states that remain valid should normally be represented as current schema plus explicit seed state.

## G. Coverage-preservation invariant

This is infrastructure/fixture cleanup, not product behavior change.

Preserve behavioral assertions and owner boundaries. If moving a stale fixture to current schema exposes a legitimate current constraint, minimally repair test setup/data. Do not weaken production constraints, add runtime fallbacks, edit migration SQL, or restore obsolete schemas merely to keep an old fixture green.

# Implementation sequence

Implement in four tranches.

---

# Tranche 1 — single-source maintained discovery

## Expected files

Primary:

```text
scripts/test-selection.mjs
scripts/test-runner.mjs
tests/test-selection.test.js
tests/compact-terminal-validation.test.js
```

Possible living documentation update later:

```text
docs/TESTING_AND_VALIDATION_GUIDANCE.md
```

Do not edit `scripts/test-fast.mjs` unless a very small shared-selector adjustment is actually required.

## 1.1 Exclude the two orchestration false positives

Add these exact paths to `NON_TEST_TOOLING_FILES`:

```text
scripts/test-runner.mjs
scripts/test-presentation.mjs
```

Keep the existing exact exclusions:

```text
scripts/test-fast.mjs
scripts/test-selection.mjs
```

Do not replace exact paths with broad filename/directory heuristics.

## 1.2 Make canonical full runs use maintained discovery

In `scripts/test-runner.mjs`:

1. import `discoverMaintainedNodeTests` and `isMaintainedNodeTestPath` from `scripts/test-selection.mjs`;
2. keep `parseTestPresentationArgs(argv)` as the presentation parser;
3. determine whether the forwarded `nodeArgs` contain an explicit repository-maintained test target/path/glob;
4. if an explicit maintained target exists, keep the forwarded Node/test arguments unchanged;
5. if no explicit maintained target exists, resolve complete maintained discovery against `cwd` and append the explicit discovered file list after preserving any forwarded Node test options;
6. if that required complete discovery is empty, throw a clear error and do not spawn;
7. pass the final list through `nodeTestArgsForPresentation(...)` and then spawn `node --test` as before;
8. preserve process executable, cwd, env, stdio, shell mode, result error handling, and exit status.

The explicit-target detector must stay small and token-aware. It should scan only the forwarded Node arguments, skip the separate value token for each explicitly supported value-taking Node test option, and call `isMaintainedNodeTestPath()` only on the remaining positional candidates. For example, `['--test-name-pattern', 'tests/fake.test.js']` has no explicit target; the path-looking value must not prevent complete discovery from being appended. Do not classify arbitrary unknown option values or build a general CLI parser.

Because `discoverMaintainedNodeTests()` is async, the simplest solution is to make `runNodeTests()` async and await it in the direct-execution path. Update direct callers/tests accordingly rather than adding a second synchronous filesystem walker.

## 1.3 Regression coverage

Extend existing tests; do not create another selector framework.

In `tests/test-selection.test.js`, prove:

```text
scripts/test-runner.mjs -> not maintained
scripts/test-presentation.mjs -> not maintained
repository discovery excludes both
FAST_TEST_EXCLUSIONS remains the existing exact six
fast selection == complete maintained discovery - six exclusions
```

In `tests/compact-terminal-validation.test.js`, adapt `runNodeTests` coverage to async and prove four cases.

### Case A — canonical no-target

Using a temporary root with a small deterministic set of test-shaped files plus the orchestration false-positive names:

- `argv: []` explicitly passes exactly maintained discovered files;
- orchestration modules are absent;
- local presentation remains correct.

### Case B — options but no target

Use both option forms:

```text
argv: ['--test-name-pattern=foo']
argv: ['--test-name-pattern', 'tests/fake.test.js']
```

prove:

- each option is preserved;
- for the separate-value form, the path-looking value is skipped as an option value rather than treated as an explicit target;
- complete maintained discovery is appended explicitly, including for `tests/fake.test.js`;
- no implicit-discovery path remains.

### Case C — explicit target

For a caller-supplied maintained file or maintained glob:

- target remains focused;
- unrelated maintained files are not appended;
- CI/local/verbose presentation only changes presentation, not target selection.

Include at least one package-script-shaped glob case such as the slide-review or slide-prep pattern so the supported glob path remains protected.

### Case D — zero-discovery fail closed

When a complete maintained list is required but resolves to zero:

- fail clearly;
- do not invoke spawn.

Do not hard-code repository-wide counts in unit tests. Assert set relationships and small deterministic temp-root behavior.

## Focused Tranche 1 validation

```sh
npm test -- tests/test-selection.test.js tests/compact-terminal-validation.test.js
npm test -- test/ecg-batch-01-asset-rename.test.js
npm run slide-review:test
npm run slide-prep:test
```

The latter commands are targeted-invocation sanity checks. Do not repeat them after unrelated later edits unless those edits could invalidate their result.

---

# Tranche 2 — normalize stale ordinary current-runtime fixtures

The audit's ordinary-current list contained 19 files, not 20. Six already enumerate every migration dynamically and are semantically current. The following 13 are the known stale/partial ordinary runtime fixtures required in this PR.

## 2.1 Required conversions

Convert these to `applyCurrentSchema`:

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
2. keep the existing in-memory SQLite/D1 adapter unless a narrow current-schema adjustment is necessary;
3. preserve existing `PRAGMA foreign_keys = ON` behavior/order;
4. replace hard-coded migration arrays/concatenation with `applyCurrentSchema(sqlite)`;
5. remove migration-only imports/constants/manual `ALTER TABLE` shims that become unused;
6. preserve domain seeds and assertions unless current constraints require a minimal seed correction;
7. do not edit production implementation or migration SQL to accommodate the old fixture.

Special attention:

- `test/asset-library.test.js` and `test/preview-workspace-foundations.test.js` manually emulate later deduplication columns; current schema should own those columns after conversion.
- staging tests keep their local domain-specific setup. Do not introduce a generic staging fixture abstraction in this PR.

## 2.2 Already-current dynamic bootstraps — leave unchanged

These are not correctness defects because they enumerate the entire migration directory dynamically:

```text
test/asset-higher-resolution-replacement.test.js
test/asset-replacement-race-preview.test.js
test/stimulus-family-correctness-checkpoint-a.test.js
test/stimulus-family-correctness-checkpoint-a-boundaries.test.js
test/stimulus-family-live-prompt-trigger-alignment.test.js
test/stimulus-prompt-specificity-characterisation.test.js
```

Do not convert them for style consistency in this PR.

## Focused Tranche 2 validation

Run coherent groups rather than one full-suite run after every file:

```sh
npm test -- test/asset-library.test.js test/asset-preview-isolation.test.js test/preview-workspace-foundations.test.js

npm test -- test/case-library-inactive-tags.test.js test/case-primary-topic-staging.test.js test/case-tag-bulk.test.js test/case-tag-staging.test.js test/taxonomy-hierarchy-staging.test.js test/taxonomy-workspace-staging.test.js

npm test -- test/question-library.test.js test/question-library-unicode-search.test.js test/tag-library.test.js test/tagging-stage-b-admin-consistency.test.js
```

If current schema exposes a real production invariant, minimally update fixture data rather than restoring a stale schema.

---

# Tranche 3 — narrow current-schema fixture-policy guard

## Goal

Prevent recurrence of the concrete defect: an ordinary runtime test executing a hand-maintained literal migration subset which silently stops receiving later migrations.

This must remain a repository-specific regression test, **not a general source linter**.

Recommended file:

```text
tests/current-schema-fixture-policy.test.js
```

## 3.1 Discover candidate test files using repository discovery

Do not create a second `test/**/*.test.js` glob policy.

Use `discoverMaintainedNodeTests()` and then filter to repository application-test roots:

```text
test/
tests/
```

Exclude the policy-test file itself from the repository scan:

```text
tests/current-schema-fixture-policy.test.js
```

That file intentionally contains synthetic prohibited examples for detector self-coverage and must not flag itself.

Do not scan slide-review/source-prep tool trees unless implementation evidence shows they own application migration fixtures.

## 3.2 Keep detection syntactic and narrow

The detector only needs to recognize the known repository pattern class that caused the stale fixtures: **literal/hand-maintained migration lists or equivalent literal migration-file bootstrap code that is executed as an application schema**.

It is acceptable to use small source-string/regex checks tailored to the current repository patterns.

Do not attempt data-flow analysis. Do not add AST/parser dependencies. Do not promise to detect every theoretically possible obsolete-schema construction.

The guard must allow:

1. `applyCurrentSchema(...)`;
2. complete dynamic enumeration of the migration directory;
3. source-only assertions that read migration SQL without using it to bootstrap an application runtime schema;
4. exact documented historical migration-boundary exceptions.

These allowances are classification-specific, not whole-file exemptions. Detect and classify any executed literal partial-migration bootstrap independently of whether the same file also contains `applyCurrentSchema(...)`. The presence of `applyCurrentSchema` must never short-circuit scanning or suppress another detected bootstrap in that file. A detected literal historical bootstrap is allowed only when that exact path is present in the documented historical exception map.

Before enforcing, run the detector/search in an inventory/report mode against the current branch and classify every hit. If a file does not fit the known ordinary or historical categories, inspect that file before extending the allowlist or conversion set.

## 3.3 Expected historical exception map

Use an exact `path -> reason` map. Do not allowlist directories, prefixes, regex families, all FSRS tests, or all import tests.

Expected historical boundaries at the planning base:

```text
test/auth-migration.test.js
  Better Auth migration 0001 in isolation.

test/learner-fsrs-active-review-resume-race.test.js
  Minimal pre-FSRS schema plus migrations 0019/0020.

test/learner-fsrs-active-review-scope.test.js
  Minimal active-review scope schema from 0019/0020.

test/learner-fsrs-active-review.test.js
  Minimal active-review schema from 0019/0020.

test/learner-fsrs-foundation.test.js
  Migration 0019 foundation in isolation.

test/learner-fsrs-free-study.test.js
  Ordered FSRS migrations 0019-0022.

test/learner-fsrs-reset-fresh.test.js
  Ordered FSRS migrations 0019/0020/0024.

test/learner-fsrs-retention-admin.test.js
  Migration 0019 foundation in a minimal historical fixture.

test/learner-fsrs-scheduled-completion.test.js
  Ordered FSRS migrations 0019-0021.

test/learner-study-data-deletion.test.js
  Explicit pre-0027 versus current-schema behavior.

test/multi-topic-migration-d1.test.js
  Migrations 0000/0002 form the historical base for applying 0003.

test/original-stimulus-semantics.test.js
  Pre-0016 schema plus migration 0016 under test.

test/question-pool-mode-invariants.test.js
  Migration 0014 in isolation.

test/resumable-content-import.test.js
  Migration 0004 checkpoint/import-job boundary behavior.

test/resumable-import-contract.test.js
  Explicit 0000-0004 upgrade path proving resumable import schema creation.

test/resumable-import-lease-safety.test.js
  Migration 0004 import-job schema in isolation.

test/tag-shared-schema.test.js
  Explicit 0000-0008 Stage B foundation plus pre-0008 -> 0008 upgrade/preservation behavior.
```

This list is an expected planning inventory, not permission to skip the current-head scan. Add an exception only when the file genuinely tests a historical migration boundary.

## 3.4 Guard self-coverage

Test the detector with inline representative source strings:

```text
literal partial migration list executed into SQLite -> detected
applyCurrentSchema(...) -> allowed
file containing applyCurrentSchema plus a separate literal partial bootstrap -> partial bootstrap still detected
allowed historical-exception path with its allowed historical bootstrap plus an additional unrelated partial-schema bootstrap -> historical match allowed, unrelated bootstrap still rejected
complete dynamic migration-directory enumeration -> allowed
single migration file read for source assertion only -> allowed
```

Then run it across the actual maintained application-test files and emit a useful failure containing:

```text
file path
why it matched
expected action: current schema or exact documented migration-boundary exception
```

Do not create temporary repository files solely to test the scanner if inline samples prove detector behavior.

## Focused Tranche 3 validation

```sh
npm test -- tests/current-schema-fixture-policy.test.js
npm test -- tests/test-selection.test.js tests/compact-terminal-validation.test.js
```

The second command confirms the newly added maintained policy test enters normal discovery/fast selection automatically.

---

# Tranche 4 — reconcile living testing guidance

After implementation/tests are coherent, inspect `docs/TESTING_AND_VALIDATION_GUIDANCE.md`.

Update only what becomes materially incomplete. The durable discovery relationship should be clear:

```text
scripts/test-selection.mjs
  -> complete maintained discovery
  -> npm test uses all maintained tests
  -> test:fast uses the same set minus FAST_TEST_EXCLUSIONS
```

Do not copy repository-wide file counts, migration exception inventories, or implementation details into living guidance.

The existing schema-fixture guidance already has the correct semantic rule. Add only a small clarification if needed; do not rewrite it around this PR.

No roadmap, product-design, data-model, deployment, Production-status, or documentation-index update should be needed unless implementation unexpectedly changes one of those authorities.

# Luna workflow

## Step 1 — establish current state

From the PR branch:

```sh
npm run agent:doctor
```

Refresh PR head/base and the drift-prone facts listed above. Do not repeat the whole redundancy audit.

Before Tranches 2/3, use a bounded search for concepts such as:

```text
migrationSql
migrationNames
migrationUrls
readFileSync + drizzle
readdirSync + drizzle
applyCurrentSchema
sqlite.exec(...migration...)
```

The goal is classification only.

## Step 2 — implement coherent tranches

For each tranche:

1. make the coherent related edits;
2. inspect the scoped delta;
3. run the focused checks listed for that tranche;
4. fix only attributable failures;
5. continue once the tranche is coherent.

Do not run full validation after each small edit.

## Step 3 — checkpoint

After Tranches 1-3:

```sh
npm run agent:checks
```

Follow the current checkpoint guidance, normally including `npm run validate:fast` when applicable.

If `validate:fast` passes and no later change can invalidate that result, do **not** rerun `npm run test:fast` merely to obtain duplicate evidence.

## Step 4 — final handoff

After the final code/documentation delta:

1. rerun `npm run agent:checks` because changed-file classification may have changed;
2. execute every final required and specialized check it reports;
3. use `npm run validate:full` when that is the repository-selected ordinary handoff path;
4. treat a successful unchanged `validate:full` Node stage as evidence for canonical `npm test`; do not rerun `npm test` solely for duplication;
5. similarly, retain prior `validate:fast`/focused evidence unless subsequent changes could invalidate it;
6. inspect the complete intended-base -> current-head diff once;
7. verify there are no unintended application, schema, migration, CI workflow, Production/Preview, or unrelated test changes;
8. update the Draft PR body with implemented tranches and actual validation evidence.

If child-process execution is blocked by the environment, report that limitation rather than weakening runner/tests.

# Acceptance criteria

Implementation is complete when all of the following are true.

## Discovery

- `scripts/test-runner.mjs` and `scripts/test-presentation.mjs` are not maintained tests.
- canonical no-target full runs receive an explicit maintained file list from `scripts/test-selection.mjs`.
- options-only full invocations such as `--test-name-pattern=...` preserve those options **and** append maintained discovery.
- explicit maintained file/glob invocations remain focused.
- required full discovery resolving to zero fails before spawn.
- fast selection remains complete maintained discovery minus exactly the approved six exclusions.
- a new ordinary maintained test enters fast selection automatically unless separately approved for exclusion.

## Presentation / process behavior

- compact/CI/verbose and explicit reporter precedence remain unchanged;
- caller environment, `process.execPath`, `stdio`, `shell:false`, spawn errors, and child status remain preserved;
- the async runner change, if used, does not alter exit semantics.

## Fixtures

- all 13 known stale ordinary fixtures use current schema;
- their behavioral assertions remain present;
- the six complete dynamic current-schema bootstraps remain valid and are not required to change;
- genuine migration-boundary fixtures remain historical, including `resumable-import-contract` and `tag-shared-schema`;
- no production fallback, schema change, or migration edit is introduced to accommodate old fixtures.

## Policy guard

- maintained application-test discovery is reused rather than reimplemented with a second glob rule;
- the guard excludes its own synthetic self-test source from repository scanning;
- known literal partial ordinary-schema bootstraps are rejected;
- `applyCurrentSchema`, complete dynamic enumeration, and source-only migration assertions are allowed;
- the presence of `applyCurrentSchema` does not suppress detection of a separate literal partial bootstrap in the same file;
- a historical exception is not a whole-file exemption: an allowed historical file with an additional unrelated partial-schema bootstrap still rejects the additional bootstrap;
- historical exceptions are exact paths with reasons;
- the detector remains intentionally syntactic/repository-specific, not a generic lint/parser architecture.

## Scope / safety

- no product/domain behavior changes;
- no behavioral test deletion;
- no new fast exclusion;
- no schema/migration changes;
- no Production/Preview mutation;
- no broad fixture/harness refactor;
- no `.github` workflow change unless an implementation-discovered hard requirement is separately justified.

# Deferred follow-ups

Do not implement these in PR #178 unless a concrete correctness dependency unexpectedly requires one:

1. convert the six already-current dynamic migration enumerators to `applyCurrentSchema` for consistency;
2. consider one narrowly scoped staging D1 fixture if repeated maintenance pain continues;
3. extract slide-review fake-DOM helpers;
4. extract reviewed-import ZIP construction helpers;
5. move the case-editor canonical-reconciliation test without deleting its assertion;
6. split very large image/dedup tests only if navigation/reviewability remains materially poor.

Repeated setup, similar names, or large file size alone is not evidence of behavioral redundancy.

# Handover summary for Luna

Implement PR #178 with this priority order:

```text
1. full + fast share maintained discovery;
2. remove runner/presentation false positives;
3. preserve explicit targets and make options-only full runs explicit too;
4. convert only the 13 stale ordinary fixtures to current schema;
5. retain exact historical migration tests, including tag-shared-schema;
6. add one narrow syntactic policy guard using maintained discovery;
7. follow repository-selected validation without redundant reruns;
8. do not broaden into assertion deletion or general test refactoring.
```

If current-head evidence contradicts a fixture classification or reveals a changed safety boundary, stop only that affected tranche, document the concrete discrepancy, and resolve it from current code/tests/guidance rather than guessing from the audit snapshot.