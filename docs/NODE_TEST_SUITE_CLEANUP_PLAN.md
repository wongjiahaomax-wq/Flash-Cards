# Node Test Suite Cleanup Plan

Status: implementation plan active / Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test selection infrastructure, Checkpoint 2B change-aware specialized CI, Checkpoint 2C named production-operator validation ownership, Checkpoint 2D safe fast-test exclusions, Checkpoint 3 intentional UX regression review, Checkpoint 4 source-contract consolidation/review complete, and the first two bounded Checkpoint 5 behavioral rewrites implemented in Draft PR #115: Case-editor responsive and Case Images

This document is the implementation contract that follows `docs/TEST_SUITE_AUDIT.md`.

PR #115 now contains Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test selection infrastructure, Checkpoint 2B change-aware specialized CI, Checkpoint 2C named production-operator validation ownership, Checkpoint 2D activation of exactly six specialized fast-test exclusions, Checkpoint 3 review and retention of the two intentional UX regression contracts, Checkpoint 4's five bounded corrected source-contract consolidation tranches plus the explicit Stimulus Family façade `RETAIN` review, and the first two bounded Checkpoint 5 behavioral-contract rewrites: Case-editor responsive and Case Images. Checkpoint 4 is complete for the audited primary source/UI inventory. The remaining Checkpoint 5 subsystem rewrites, profiling, additional exclusions, and the remaining durable-guidance work are still pending.

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
- `npm test` remains the canonical complete suite as `node --test`;
- Checkpoint 2A introduced `npm run test:fast` with zero exclusions and therefore zero maintained-file coverage reduction at that checkpoint;
- Checkpoint 2B adds specialized checks from the actual PR diff without changing the base fast/full contracts;
- Checkpoint 2C gives both production-operator test families explicit named checks and central changed-path ownership;
- Checkpoint 2D activates exactly six independently approved specialized exclusions from generic unrelated-Draft `test:fast`, while complete `npm test` retains all six and related Drafts regain them through specialized ownership.

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
- no missing-table/column probing required.

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

**Status: implemented in Draft PR #115. Checkpoints 2B, 2C and 2D are also implemented.**

### Objective

Create the selection mechanism safely before excluding anything.

### Package contract

Added:

```text
npm run test:fast
```

Kept:

```text
npm test
```

complete and unchanged as `node --test`.

No `test:full` alias was added.

### Selector architecture

The central repository-owned implementation is:

```text
scripts/test-selection.mjs
scripts/test-fast.mjs
```

Maintained Node tests are discovered repository-wide by the repository's current `.test.js` JavaScript convention, with `.test.mjs`/`.test.cjs` supported consistently. Generated/dependency directories are ignored and helper modules such as `test/current-schema.js` are not treated as maintained test files. Discovery is deterministic and does not hard-code today's test-file list or directory allow-list.

The selector:

- discovers maintained Node test files deterministically;
- defaults new ordinary `.test` JavaScript files into fast;
- owns one explicit exact-path exclusion manifest, `FAST_TEST_EXCLUSIONS`;
- fails if an exclusion names a missing maintained test;
- rejects duplicate exclusions;
- exposes complete, selected and excluded paths for diagnostics/tests;
- does not infer exclusions from filenames or categories.

### Rollout record

Checkpoint 2A intentionally began with:

```text
FAST_TEST_EXCLUSIONS = []
```

so the selection mechanism was validated with zero coverage reduction before any omission. Checkpoint 2D later activated exactly six reviewed exclusions without changing this selector architecture or its default-to-fast rule for new ordinary tests.

### Validation integration

`scripts/validation-contract.mjs` owns a distinct `testFast` check:

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

Fast/Draft validation executes `npm run test:fast`. Full/Ready validation continues to execute complete `npm test`.

`scripts/validate-ci.mjs` attaches the structured Node reporter to both `test` and `testFast`. `scripts/test-fast.mjs` passes fast-check identity/reproduction metadata through to the existing reporter so connector-readable failure records remain attributable to `testFast` and reproduce with `npm run test:fast`.

### Contract tests

Checkpoint 2A and the later 2D activation together prove:

- every fast-selected test belongs to complete maintained discovery;
- every configured exclusion must exist;
- duplicate exclusions fail loudly;
- every discovered maintained test is selected or explicitly excluded;
- a newly discovered ordinary `.test.js` file enters fast automatically without an allow-list edit;
- the active exclusion set is exactly the six independently approved specialized paths;
- ordering is deterministic;
- `npm test` remains exactly `node --test`;
- fast validation uses `testFast` / `npm run test:fast`;
- full validation still uses `test` / `npm test`;
- both Node checks receive structured reporter treatment;
- fast reporter records retain `testFast` identity/repro information;
- workflow YAML does not own test paths or exclusions.

### Acceptance criteria

Checkpoint 2A's zero-reduction rollout was satisfied before exclusions were activated. The current selector still preserves complete semantics, default-to-fast behavior and exact accounting after Checkpoint 2D.

Implementation CI run #1294, before 2D activation, reported 110 maintained files, 110 selected, zero excluded, with 656/656 fast Node tests passing.

---

## Checkpoint 2B — Make ordinary CI change-aware for specialized checks

**Status: implemented in Draft PR #115. Checkpoints 2C and 2D are also implemented.**

### Objective

Create the safety mechanism required before specialized tests can leave unrelated Drafts.

### Implemented architecture

`scripts/agent-checks-lib.mjs` remains the one central changed-path rule authority. Each rule can contribute ordinary advisory requirements and a `specializedRequired` subset. The final classifier exposes `specializedRequiredChecks`; those checks are included in the agent's `requiredChecks`, and ordinary CI consumes that same specialized subset rather than defining a second classifier.

For slide-review tooling itself:

```text
tools/slide-import-review/**
  -> slideReviewTest
  -> slideReviewBuild
```

Independent review of Checkpoint 2D identified an additional cross-boundary dependency of the excluded `tools/slide-import-review/tests/core.test.js`: it imports production package/parsing/media limits and verifies finalizer compatibility against production parsers. The central classifier therefore also owns these exact production compatibility inputs:

```text
src/lib/server/import/content-package.js
src/lib/server/import/reviewed-content-package.js
src/lib/server/storage/media.js
  -> slideReviewTest
```

These three production files do **not** require `slideReviewBuild`; they can invalidate the excluded Node compatibility contract but do not themselves alter the standalone browser build machinery.

Checkpoint 2C extends the same authority to the two production operators. The workflow contains no slide-review or production-operator path pattern.

### CI changed-file source

CI uses the actual pull-request base/head SHAs already supplied by `.github/workflows/ci.yml` and resolves the full feature diff with repository-owned Git code:

```text
git diff --name-only --diff-filter=ACDMRTUXB <base>...<head>
```

The workflow's only orchestration change is `fetch-depth: 0` so the merge-base needed by the three-dot diff is reliably present. It does not own classification logic, test-file paths, exclusion manifests or satisfaction rules.

### Base + specialized resolution

CI resolves:

```text
base validation checks for current mode
+ specializedRequiredChecks from changed paths
= deterministic deduplicated checks
```

The base definitions remain exactly:

```text
fast = diff, testFast, svelte
full = diff, db, test, svelte, build, authSmoke
```

### Deduplication / satisfaction

`scripts/validation-contract.mjs` owns explicit satisfaction metadata and deterministic check ordering. Complete `test` satisfies:

```text
testFast
ecgAssetRenameOperatorTest
productionTaxonomyOperatorTest
slideReviewTest
```

`testFast` does **not** satisfy either production-operator check or `slideReviewTest`. That distinction is now essential because Checkpoint 2D excludes those specialized test files from generic fast selection.

For slide-review, `test` still does not satisfy `slideReviewBuild`, so the non-duplicated specialized build remains mandatory when tooling paths require it. The three explicit production compatibility dependencies require only `slideReviewTest`, which complete `test` satisfies in full mode.

### Fail-safe behavior

Validation/classification infrastructure changes preserve the selected base mode and additionally require the ordinary-CI specialized set:

```text
ecgAssetRenameOperatorTest
productionTaxonomyOperatorTest
slideReviewTest
slideReviewBuild
```

This applies to the validation contract/runner/classifier, fast-selector infrastructure, CI reporter, CI workflow/package ownership, and focused validation tests. Important otherwise-unclassified code/tooling paths preserve the existing conservative full advisory requirements for `agent:checks` and likewise acquire the ordinary-CI specialized fail-safe set. Configuration references to unknown validation check IDs fail loudly.

### Specialized Node diagnostics

`slideReviewTest`, `ecgAssetRenameOperatorTest`, and `productionTaxonomyOperatorTest` use the structured Node reporter without moving their commands into workflow YAML. The specialized reporter identity and reproduction command are derived from the repository validation contract. The established `test` and `testFast` reporter identities remain unchanged.

### Focused contract tests

`tests/ci-change-aware.test.js` and related validation-tooling tests prove:

- unrelated Draft -> base fast only, with none of the specialized owners;
- slide-review tooling Draft -> base fast + specialized test/build;
- each of the three slide-review production compatibility dependencies -> base fast + `slideReviewTest` only;
- each of those production compatibility paths in full mode -> the unchanged full base because complete `test` satisfies `slideReviewTest`;
- slide-review full/Ready tooling change -> full base + build, without duplicate specialized Node execution;
- operator-related Drafts -> base fast + the matching named operator check;
- operator-related full/Ready -> full base without redundant narrow operator execution because complete `test` satisfies those checks;
- `testFast` does not satisfy the excluded specialized Node owners;
- multiple specialized families accumulate all applicable owners exactly once;
- `agent:checks` and CI consume one central specialized requirement authority;
- validation infrastructure changes fail safe while preserving base fast/full semantics;
- otherwise-unclassified important tooling paths fail safe;
- the actual three-dot feature diff excludes unrelated base-branch advancement;
- specialized Node reporting has the correct identity/reproduction path;
- workflow YAML remains orchestration-only;
- invalid validation configuration fails loudly.

### Checkpoint 2B implementation validation evidence

Implementation head `0277911099b661699c202283559a5a9da53cf0e2` passed Draft CI run #1283. Its logs proved:

```text
Repository CI validation mode: fast
Repository CI changed paths: 44
Repository CI specialized requirements: slideReviewTest, slideReviewBuild
Repository CI checks: diff, testFast, svelte, slideReviewTest, slideReviewBuild
```

Results:

- feature-diff whitespace check passed;
- `npm run test:fast`: **110 complete / 110 selected / 0 excluded; 645/645 passed**;
- `npm run check`: **0 errors, 5 existing warnings**;
- `npm run slide-review:test`: **23/23 passed**;
- `npm run slide-review:build`: passed;
- repository CI validation passed;
- Wrangler runtime smoke run #114 passed on that implementation head.

The available work session used Remote GitHub mode, so no local repository command execution is claimed. The literal `npm test` command remains `node --test`; Draft CI was intentionally left in Draft/fast mode rather than marking the PR Ready merely to force full validation.

### Acceptance criteria

- related specialized changes demonstrably require their specialized checks in ordinary CI;
- `agent:checks` and CI cannot drift onto separate path rule sets;
- conditional behavior is contract-tested before and after exclusions are activated.

These criteria remain satisfied after the Checkpoint 2D review correction.

---

## Checkpoint 2C — Add named production-operator checks

**Status: implemented in Draft PR #115. Checkpoint 2D is also implemented.**

### Objective

Give the two production-operator tests safe conditional ownership before they can leave unrelated Drafts.

### Named checks

Repository validation owns two explicit checks:

```text
ecgAssetRenameOperatorTest
  -> node --test test/ecg-batch-01-asset-rename.test.js

productionTaxonomyOperatorTest
  -> node --test test/production-taxonomy-operator.test.js
```

No package aliases were added merely to name these checks. `.github/workflows/ci.yml` remains orchestration-only.

### Changed-path ownership

The ECG check is required for these exact repository-owned inputs:

```text
scripts/rename-ecg-batch-01-assets.mjs
scripts/ecg-batch-01-asset-rename-targets.mjs
test/ecg-batch-01-asset-rename.test.js
```

The extra target-manifest path is intentional: `rename-ecg-batch-01-assets.mjs` imports and re-exports the deterministic `packageId`/`renameTargets` data from `ecg-batch-01-asset-rename-targets.mjs`, and the dedicated test directly protects those deterministic target IDs, storage keys, and intended names.

The taxonomy check is required for:

```text
scripts/apply-agreed-taxonomy.mjs
test/production-taxonomy-operator.test.js
```

The taxonomy operator does not import/read an analogous repository-owned helper or data file, so no broader taxonomy tooling pattern was added.

### Draft behavior

During Checkpoint 2C, while `FAST_TEST_EXCLUSIONS = []`, a related Draft temporarily executed the matching operator test both through generic `testFast` and through its named specialized owner. Checkpoint 2D removes that temporary duplication from generic fast selection while preserving the same related-Draft plans:

```text
ECG-related Draft:
  diff
  testFast
  svelte
  ecgAssetRenameOperatorTest

Taxonomy-related Draft:
  diff
  testFast
  svelte
  productionTaxonomyOperatorTest

Both families changed:
  diff
  testFast
  svelte
  ecgAssetRenameOperatorTest
  productionTaxonomyOperatorTest
```

`testFast` is not recorded as satisfying either operator check.

### Full/Ready deduplication

Complete `test` / `npm test` remains the durable complete owner and structurally satisfies both narrow operator checks. Therefore an operator-related full/Ready plan uses the unchanged full base and does not run the narrow operator file again:

```text
diff
db
test
svelte
build
authSmoke
```

If slide-review changes are also present, `slideReviewBuild` remains additional because complete `test` does not satisfy that build check.

### Fail-safe behavior

`CI_SPECIALIZED_CHECK_IDS` includes both production-operator checks plus the slide-review test/build pair. Validation/classifier infrastructure changes and important unclassified tooling paths therefore receive the conservative specialized set while preserving the selected base mode. Draft validation-infrastructure changes stay on the fast base; Ready/full stays on the full base.

### CI diagnostics

Both named operator checks are recognized as Node-test checks. CI injects the existing structured reporter through `NODE_OPTIONS` before the direct `node --test <file>` positional arguments. Reporter identity and reproduction commands are derived from `validation-contract.mjs`:

```text
check=ecgAssetRenameOperatorTest
command=node --test test/ecg-batch-01-asset-rename.test.js

check=productionTaxonomyOperatorTest
command=node --test test/production-taxonomy-operator.test.js
```

The existing `test`, `testFast`, and `slideReviewTest` reporter behavior remains intact.

### Contract coverage

Focused tests prove:

- ECG operator script, target manifest, and dedicated test map only to the ECG check;
- taxonomy operator script and dedicated test map only to the taxonomy check;
- unrelated application changes trigger neither operator check;
- each operator family does not trigger the other family;
- related Draft plans add the matching specialized check exactly once;
- changing both families adds both without duplicates;
- full/Ready plans rely on explicit complete-test satisfaction and omit both narrow checks;
- `testFast` does not satisfy either operator check;
- validation infrastructure and important unclassified tooling fail safe with the full ordinary-CI specialized set while preserving base-mode semantics;
- `agent:checks` and CI consume the same classifier;
- workflow YAML contains no operator path ownership;
- the two new checks use structured Node diagnostics with correct reproduction commands.

### Implementation validation evidence

Implementation head `2250552b9a8b62b06717492421c7a139e323dbc0` passed Draft CI run #1294. The logs proved:

```text
Repository CI validation mode: fast
Repository CI changed paths: 44
Repository CI specialized requirements: ecgAssetRenameOperatorTest, productionTaxonomyOperatorTest, slideReviewTest, slideReviewBuild
Repository CI checks: diff, testFast, svelte, ecgAssetRenameOperatorTest, productionTaxonomyOperatorTest, slideReviewTest, slideReviewBuild
```

Results:

- feature-diff whitespace check passed;
- `npm run test:fast`: **110 complete / 110 selected / 0 excluded; 656/656 passed**;
- `npm run check`: **0 errors, 5 existing warnings**;
- ECG operator specialized check: **6/6 passed**;
- production taxonomy operator specialized check: **3/3 passed**;
- `npm run slide-review:test`: **23/23 passed**;
- `npm run slide-review:build`: passed;
- repository CI validation passed;
- Wrangler runtime smoke run #125 passed on that implementation head.

The implementation was performed in Remote GitHub mode. No local repository command execution is claimed. No Production D1/R2 credentials were retrieved or used, and neither production operator was executed against production; only their repository test files ran.

### Acceptance criteria

Checkpoint 2C satisfied the conditional ownership prerequisite for both production-operator test families. Checkpoint 2D subsequently used that prerequisite without changing production-operator behavior.

---

## Checkpoint 2D — Activate safe exclusions for unrelated Drafts

**Status: implemented in Draft PR #115, including the cross-boundary slide-review ownership correction from independent review.**

### Objective

Reduce generic unrelated-Draft Node coverage only for the specialized families whose central conditional ownership is already proven.

### Active exclusions

`FAST_TEST_EXCLUSIONS` now contains exactly:

```text
tools/slide-import-review/tests/build.test.js
tools/slide-import-review/tests/core.test.js
tools/slide-import-review/tests/review-fixes.test.js
tools/slide-import-review/tests/source-coverage.test.js
test/ecg-batch-01-asset-rename.test.js
test/production-taxonomy-operator.test.js
```

No seventh exclusion was activated. Selection remains exact-path based. Duplicate exclusions and exclusions that do not resolve to a discovered maintained test still fail loudly. New ordinary maintained tests still enter fast automatically unless explicitly added to this manifest through a separately reviewed change.

### Required semantics now implemented

**Unrelated Draft:** generic `testFast` omits the six paths and no specialized owner is added for genuinely unrelated application changes.

**Slide-review tooling Draft:** central `tools/slide-import-review/**` ownership adds `slideReviewTest` and `slideReviewBuild`; the four slide-review tests execute through `npm run slide-review:test` rather than generic fast.

**Slide-review production-contract Draft:** because excluded `core.test.js` directly imports production package/parsing/media limits and verifies finalizer compatibility with production parsers, changes to these exact production dependencies add `slideReviewTest` even though they are outside `tools/slide-import-review/**`:

```text
src/lib/server/import/content-package.js
src/lib/server/import/reviewed-content-package.js
src/lib/server/storage/media.js
  -> slideReviewTest
```

They do not add `slideReviewBuild`; the production files can invalidate the excluded Node compatibility contract but do not alter the standalone browser build contract.

**ECG-related Draft:** central ECG ownership adds `ecgAssetRenameOperatorTest`; `test/ecg-batch-01-asset-rename.test.js` executes through that named direct Node check rather than generic fast.

**Taxonomy-related Draft:** central taxonomy ownership adds `productionTaxonomyOperatorTest`; `test/production-taxonomy-operator.test.js` executes through that named direct Node check rather than generic fast.

**Multiple specialized families:** all applicable owners accumulate exactly once. A Draft touching all three tooling/operator families resolves to:

```text
diff
testFast
svelte
ecgAssetRenameOperatorTest
productionTaxonomyOperatorTest
slideReviewTest
slideReviewBuild
```

**Ready/full:** complete `test` / `npm test` still discovers all six. It structurally satisfies `testFast`, both production-operator Node checks and `slideReviewTest`, so narrow Node checks are not redundantly re-run. `slideReviewBuild` remains separately required only when a slide-review tooling path requires the build contract.

### Contract proofs

Focused contracts in `tests/test-selection.test.js` and `tests/ci-change-aware.test.js` prove:

- the active exclusion manifest contains exactly the six approved paths and has no duplicate;
- maintained discovery still contains every one of the six paths;
- selected + excluded is exactly complete maintained discovery, so no seventh maintained test disappears;
- new ordinary Node-standard tests continue to default into fast without allow-list maintenance;
- helper/generated/dependency discovery rules and deterministic ordering remain intact;
- the fast runner still preserves child exit status and `testFast` reporter/reproduction identity;
- an unrelated application Draft resolves to only `diff, testFast, svelte` and no specialized owner;
- each ECG-owned path requires only `ecgAssetRenameOperatorTest` for that family;
- each taxonomy-owned path requires only `productionTaxonomyOperatorTest` for that family;
- slide-review tooling paths require both `slideReviewTest` and `slideReviewBuild`;
- each of `src/lib/server/import/content-package.js`, `src/lib/server/import/reviewed-content-package.js`, and `src/lib/server/storage/media.js` requires `slideReviewTest` in Draft mode without adding `slideReviewBuild`;
- those three production compatibility paths resolve to the ordinary full base in full mode because complete `test` satisfies `slideReviewTest`;
- ECG and taxonomy do not spuriously trigger one another;
- all three specialized families add every applicable owner exactly once;
- full validation deduplicates all specialized Node owners through complete `test` while retaining `slideReviewBuild` when tooling changes require it;
- workflow YAML remains orchestration-only and owns neither test paths nor the exclusion manifest;
- invalid validation-check configuration still fails loudly.

The key safety property is therefore structurally enforced and directly contract-tested:

> No related Draft can receive green ordinary CI while its excluded specialized test family did not execute through its required owner.

### Independent-review correction

The first 2D implementation correctly activated the six exact exclusions, but independent review found one High-severity boundary gap: excluded `tools/slide-import-review/tests/core.test.js` directly imports `content-package.js`, `reviewed-content-package.js`, and `storage/media.js`, while the initial slide-review classifier only owned `tools/slide-import-review/**`.

The correction is intentionally narrow. A separate `slide-review-production-contract` classifier rule now owns exactly those three production dependencies and requires only `slideReviewTest`. The six-file exclusion manifest is unchanged, no seventh exclusion was added, and no application/domain or production-operator behavior changed.

### Implementation validation evidence

The initial exclusion mechanics were demonstrated by head `bd93043bd112a0e96cc233ff99228a91fe863831` in Draft CI run #1297 and Wrangler runtime smoke run #128.

The independent-review correction was then implemented on head `4aa59b30b4197fba22240a61d76daa480b6902cf`. Draft CI run #1303 passed and proved the corrected contracts are part of the executed fast suite:

```text
Repository CI validation mode: fast
Repository CI changed paths: 44
Repository CI specialized requirements: ecgAssetRenameOperatorTest, productionTaxonomyOperatorTest, slideReviewTest, slideReviewBuild
Repository CI checks: diff, testFast, svelte, ecgAssetRenameOperatorTest, productionTaxonomyOperatorTest, slideReviewTest, slideReviewBuild
```

Results on the corrective head:

- feature-diff whitespace check passed;
- `npm run test:fast`: **110 complete / 104 selected / 6 excluded; 629/629 passed**;
- the six printed exclusions remained exactly the approved six paths;
- `npm run check`: **0 errors, 5 existing warnings**;
- ECG operator specialized check: **6/6 passed**;
- production taxonomy operator specialized check: **3/3 passed**;
- `npm run slide-review:test`: **23/23 passed**;
- `npm run slide-review:build`: passed;
- repository CI validation passed;
- Wrangler runtime smoke run #134 passed.

The before/after maintained-file selection on the same 110-file discovery set remains:

```text
before Checkpoint 2D: 110 selected / 0 excluded
 after Checkpoint 2D: 104 selected / 6 excluded
```

This is an observed file-selection reduction only. No performance or latency improvement is claimed from these implementation runs; profiling/measurement remains a later checkpoint.

This work was performed in Remote GitHub mode, so no local repository validation command execution is claimed. No Production D1/R2 credentials were retrieved or used, neither production operator was executed against production, and no production data/resource was mutated.

### Acceptance criteria

Satisfied for the six approved paths after the independent-review correction. No additional exclusion is authorized by this checkpoint.

---

## Checkpoint 3 — Review the two intentional UX regression contracts

**Status: implemented in Draft PR #115. Both contracts are retained after explicit stronger-owner investigation, with the horizontal-overflow owner hardened after independent review.**

### Objective

Replace brittle implementation assertions only after the underlying product invariant is confirmed.

There are **no unconditional deletions in this checkpoint**.

### Investigation performed

Checkpoint 3 read both target test files and both directly inspected production files in full, inspected nearby Admin responsive/layout tests, searched the repository for rendered Svelte/component testing, DOM/layout measurement, browser/E2E infrastructure, width/overflow assertions, and shared Admin layout owners, and inspected the introducing history in:

```text
d5fba9b — Refine admin editor widths and expandable fields
```

The repository has no cheap deterministic browser-layout owner to consolidate into:

- no Playwright/Cypress/Puppeteer browser harness;
- no jsdom/happy-dom/Testing Library/Vitest component/layout stack;
- no authoritative `scrollWidth`, `clientWidth`, or `getBoundingClientRect` regression contract;
- `package.json` continues to use Node's built-in test runner plus Svelte static/compiler checks;
- nearby Admin responsive contracts remain source-level when layout structure itself is the practical cheap owner.

Svelte compilation does not measure effective CSS layout. Introducing a non-layout DOM mock and asserting synthetic dimensions would be weaker than the current precise source regressions, while introducing a heavyweight browser/E2E dependency solely for these two tests would violate this plan's guardrail.

### 3.1 Shared Questions width

Current test:

```text
test/admin-shared-questions-width-contract.test.js
```

Current source owner:

```text
src/routes/admin/shared-questions/+page.svelte
```

Protected invariant: the Shared Questions page uses the available admin content width and does not regress to an unnecessary restrictive page/form-grid max-width behavior.

History confirms the regression was deliberate: `d5fba9b` changed `.page` from `max-width: 1180px` to `width: 100%`, removed `.form-grid`'s `max-width: 850px`, and added the source contract in the same UX-fix commit.

**Final disposition: RETAIN.**

Surviving owner:

```text
test/admin-shared-questions-width-contract.test.js
```

Why retention is necessary: no existing rendered/component owner measures usable width, and the repository has no layout-capable harness that could provide a stronger deterministic outcome check without adding disproportionate infrastructure. A class-name/render-only test or DOM mock without CSS layout would be weaker. The current assertion is implementation-oriented, but it remains the strongest cheap practical owner of this intentional regression. The product invariant is not retired.

### 3.2 Application horizontal overflow

Current test:

```text
test/admin-horizontal-overflow-contract.test.js
```

Protected invariant: application/Admin child layouts should not cause unwanted page-level horizontal scrolling.

It was introduced in the same `d5fba9b` UX-fix commit alongside `body { overflow-x: hidden; }`.

The exact CSS declaration is an implementation technique rather than a direct measurement of overflow, and global clipping can theoretically conceal the true offending child.

**Final disposition: RETAIN.**

Surviving owner:

```text
test/admin-horizontal-overflow-contract.test.js
```

Why retention is necessary: the repository has no browser/layout-capable mechanism that can reliably measure document `scrollWidth` versus `clientWidth` at representative viewports. A DOM mock that does not calculate CSS layout would not strengthen the guarantee. Until a real lightweight rendered layout owner exists, or the product invariant is explicitly retired, the current source contract remains the strongest cheap practical regression owner.

Independent review found a narrower correctness problem in that retained source owner: its original `/body\s*\{[\s\S]*overflow-x:\s*hidden;/` expression could cross the closing brace of `body` and falsely pass when `overflow-x: hidden` appeared only in a later selector. The retained contract was therefore hardened without changing the production CSS. It now extracts the `body { ... }` rule first and asserts `overflow-x: hidden;` inside that block, so a same-property declaration elsewhere in the stylesheet cannot satisfy the contract.

### Checkpoint 3 scope result

One target test file required a narrow correctness modification after independent review:

```text
test/admin-horizontal-overflow-contract.test.js
```

No production Svelte/CSS file, `FAST_TEST_EXCLUSIONS`, change-aware CI implementation, production-operator command, schema/migration, application/domain behavior, or browser-testing dependency was changed. The Shared Questions test remained unchanged. Durable documentation was updated to record the correction rather than continuing to claim that Checkpoint 3 was documentation-only.

### Acceptance criteria

Satisfied after the review correction:

- both intentional regressions were investigated independently;
- each protected invariant is explicit;
- both dispositions remain explicit `RETAIN` decisions;
- neither test was deleted merely because it is source-based;
- the retained horizontal-overflow owner now fails if the required declaration is removed from `body` even when the same declaration appears in a later selector;
- no weaker pseudo-rendered replacement was introduced;
- no browser/E2E infrastructure was added;
- both product invariants continue to have explicit surviving owners.

---

## Checkpoint 4 — Consolidate duplicated source/UI contracts

**Status: complete for the audited primary source/UI contract inventory in Draft PR #115.**

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

### Corrected first PR #115 tranche

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

### Second bounded tranche — Admin Topic/System form contract

The second independently reviewable Checkpoint 4 tranche is limited to:

```text
test/admin-topics-form-contract.test.js
```

It is intentionally not a general Taxonomy-workspace rewrite. The existing workspace disposition above remains unchanged.

Removed assertions:

- **Incidental implementation detail:** the negative assertion for the literal copy `Hierarchy manager`. The durable composition invariant is that the route renders the canonical `TaxonomyOrganizer`; a particular obsolete heading phrase is not product meaning.
- **Duplicate semantic assertion:** the raw-source match for `The selected Topic is not the current Primary Topic for this Case.` The stronger owner is `test/admin-case-library-topic-authoring.test.js`, which directly executes `moveTopicToSystem(...)` against a current-schema DB fixture and proves a stale/non-current Topic is rejected with no hierarchy write.

Retained thin ownership:

- **UI reachability/integration:** explicit `+ New System` and `+ New Topic` entry points into the shared creation flow, including the `?/createConcept` form action that connects those controls to the named server action;
- **UI reachability/integration + hierarchy safety:** the parent picker exists only for Topic creation, submits the chosen Topic parent, and System creation submits a blank hidden `parent_id`;
- **Semantic product vocabulary:** parent choices remain visibly distinguished as `System` versus `Topic`, with `Unassigned`, `+ Add Topic`, and `+ Add subtopic` authoring vocabulary;
- **Composition:** the Systems & Topics route renders exactly one `TaxonomyOrganizer` component;
- **Explicitly retired product invariant:** the route and delegated organizer remain free of `Additional Study Topic` authoring vocabulary. This negative guard is retained because Additional Study Topics are intentionally retired from current authoring behavior, not because negative text assertions are preferred generally;
- **Server/action wiring:** `createConcept` passes the submitted `parent_id` into the taxonomy writer and the writer normalizes all System creation to `parentId = null`. History shows this contract was introduced with the deliberate `Hide topic parents for Systems` change; no stronger direct behavioral owner currently proves the successful normalization path, so the cheap source/data-flow owner remains;
- **Case-editor workflow reachability:** the Case Topics UI exposes `?/assignPrimaryTopicToSystem`, submits the current Primary Topic and selected parent System, the Case route defines that named action, and the action delegates to `assignPrimaryTopicToSystem(...)` with those submitted IDs. Mutation validation remains owned by the DB-backed authoring tests rather than duplicated as writer source text here.

Independent review of the first consolidation edit found three precision gaps in the surviving source owner and corrected them before tranche completion:

1. the existing `System creation remains top-level` test could false-green if the Topic parent picker became visible for System creation, because it only asserted that the picker existed somewhere. The corrected owner now requires the Topic-only branch and the blank System `parent_id` branch explicitly;
2. `/TaxonomyOrganizer/` could pass on an import after the component stopped rendering. The corrected owner counts rendered `<TaxonomyOrganizer` tags and requires exactly one;
3. the Case action assertion could pass on the imported writer symbol alone. It now requires the named `assignPrimaryTopicToSystem: async` action, and the Topic creation route assertion scopes its parent mapping to the `createConcept` action block.

A subsequent final independent-review pass found three additional cross-file reachability/vocabulary gaps and corrected those as well:

4. creation controls and a server action could both exist while the organizer form posted somewhere else; the retained owner now requires `action="?/createConcept"` on the creation form;
5. the retired `Additional Study Topic` guard only scanned the route wrapper even though authoring lives in the delegated organizer; it now scans both the route and organizer source;
6. the Case route could define the named action without delegating to the taxonomy writer or could forward the wrong fields; the retained owner now scopes the action block and requires the `assignPrimaryTopicToSystem(...)` call plus `topic_id` and `system_id` payload mapping.

These corrections harden the surviving thin owner without restoring the removed duplicate/incidental assertions or moving deep semantics back into source inspection.

### Third bounded tranche — Wrangler/local-preview authority contract

The third independently reviewable Checkpoint 4 tranche is limited to:

```text
test/wrangler-authority-contract.test.js
```

It preserves repository-installed Wrangler authority while moving local-preview command semantics to the stronger executable-plan owner that already exists.

Removed/consolidated assertions:

- **Duplicate:** four raw-source assertions over `scripts/local-runtime-lib.mjs` that matched the repository Wrangler path, `process.execPath`, local D1 migration arguments, and absence of `npx`/an inline Wrangler version. The stronger owner is `test/local-runtime.test.js`: it directly imports `wranglerCli` and `createLocalPreviewPlan()`, asserts the exact repository-local Wrangler path, exact migration and serve commands/arguments, local-only flags, and absence of `npx`/inline Wrangler versions from the constructed plan.
- **Consolidated within the surviving local-auth contract:** the old conjunctive negative assertion for `npx ... wrangler@<version>` is replaced by two stronger independent guards: no `npx` token at all, and no inline `wrangler@<version>` token at all. This preserves both repository-installed execution authority and version-pin ownership without the narrower overlapping regex.

Retained/hardened thin ownership:

- **Architecture / operational wiring:** `local-auth-smoke.mjs` must still resolve Wrangler from this repository's `node_modules`, execute it through `process.execPath` for both synchronous commands and the spawned dev worker, verify it with `--version`, contain no `npx`, and contain no inline `wrangler@<version>` pin. The actual full auth smoke is intentionally a full-validation runtime check; this fast source owner cheaply protects its invocation authority on Drafts.
- **Wrapper integration:** `local-preview.mjs` must delegate to `createLocalPreviewPlan()`, run the plan's build and migration steps, and launch the plan's serve command/arguments. It must contain no `npx` or Wrangler authority token of its own. Exact Wrangler path/command semantics are no longer duplicated here; they belong to `test/local-runtime.test.js`.
- **Repository dependency ownership:** the package still declares a concrete semver Wrangler dependency so the scripts' repository-local CLI path has an installed authority.

Independent review corrected two issues before tranche completion:

1. the first wrapper guard only rejected `npx`, `wranglerCli`, and a quoted bare `wrangler`, so a differently constructed direct Wrangler path could evade it. The final guard encodes the stronger intended architecture: the wrapper may not contain any `npx` or Wrangler authority token and must obtain execution solely through the tested plan;
2. the local-auth half used one narrow conjunctive `npx ... wrangler@<version>` assertion. Review showed that its two protected concerns should be explicit and independent: an unversioned `npx wrangler` must also be forbidden, while any inline Wrangler version must be forbidden regardless of launcher. The final owner therefore uses separate no-`npx` and no-inline-version assertions.

No runtime script, package dependency, validation architecture, fast exclusion, schema, migration, application/domain behavior, or production resource changed in this tranche.

### Fourth bounded tranche — Admin/Preview Case-editor parity contract

The fourth independently reviewable Checkpoint 4 tranche is limited to:

```text
test/admin-editor-preview-contract.test.js
```

It keeps the source/architecture boundaries that make the real production Admin Case editor safely reusable in Preview, while removing duplicated image-question UI assertions already owned elsewhere.

Removed/consolidated assertions:

- **Duplicate UI vocabulary/workflow:** the `ImageQuestionCounts` source assertions for `Case-specific Image Questions`, `Reusable Image Questions`, and `Manage questions`. `test/reusable-image-question-card-counts.test.js` is the stronger surviving owner: it directly owns the reusable count semantics, the Case-specific/Reusable component vocabulary, the Manage-questions reveal/focus behavior, and Preview isolation from production reusable-question mutation controls.
- **Incidental implementation detail:** the exact `let reusableTotal = $derived(reusable?.total ?? 0)` implementation assertion. User-visible reusable count semantics remain under the dedicated reusable-image-question suite; the particular Svelte derived-variable spelling is not a product invariant.
- **Incidental copy:** the literal `Applies to:` label. The meaningful scope choices and their target wiring remain protected independently.

Retained/hardened thin ownership:

- **Production-editor composition:** Preview must import the production Admin Case editor, bind its Preview alias to that imported component, and render exactly one `<PreviewCaseEditor>` rather than silently drifting to a copied UI. The alias assertion deliberately does not freeze the current JSDoc cast comment.
- **Named-action parity:** every named form action reachable from the shared Admin Case editor/component family must have a Preview adapter action, so component extraction cannot create an unhandled Preview form submission.
- **Loader-data parity:** every top-level `data.*` key read by the shared Admin Case editor wrapper must be supplied by `loadPreviewCaseEditor()`.
- **Serialization reachability:** critical form field names remain present after component extraction because the Preview adapter and production actions rely on the same submitted contract.
- **Question-scope reachability:** the UI still exposes `This whole Case` versus `A specific image / stimulus`, including `fixed:<assetId>` and `option:<optionId>` targets. Production uses the dedicated `/admin/cases/<id>/question-scope` route while Preview uses its named `?/saveQuestion` adapter instead of gaining a production question-scope route.
- **Route delegation:** the production question-scope route must actually `await moveCaseQuestionToStimulusTarget(...)` and `await saveQuestionAtScope(...)`; imports alone cannot satisfy the contract. Deep move/save semantics remain owned by `test/question-scope.test.js` and related DB-backed tests.
- **Preview Study isolation:** the shared editor continues to suppress learner Study navigation in Preview and communicates that Study is production-only.

Independent review corrected three precision/ownership issues before tranche completion:

1. the original composition assertion could false-green when `AdminCaseEditor` was imported but never rendered. The final owner ties the Preview alias to the imported component and requires exactly one rendered `<PreviewCaseEditor>`;
2. generic question-scope writer-symbol assertions could pass on imports alone. They now require actual awaited writer calls from the production route;
3. an intermediate alias assertion froze the current `/** @type {any} */` cast syntax. It was relaxed to protect the alias-to-production-component relationship without converting the cast comment into a new implementation lock. The same review removed the non-semantic `Applies to:` copy assertion while retaining both scope choices and their target values.

No Preview/production runtime route, shared editor component, DB/domain code, schema/migration, validation architecture, fast exclusion, deployment configuration, or production resource changed in this tranche.

### Fifth bounded tranche — Preview deployment ownership contract

The fifth independently reviewable Checkpoint 4 tranche is limited to:

```text
test/preview-deployment-contract.test.js
```

The contract originally mixed two different ownership layers: deliberate Preview deployment/auth/route architecture and raw source assertions over production data-library ownership filters. This tranche removes only the latter where executable DB tests are stronger owners.

Removed/consolidated assertions:

- **Question Library ownership filter source assertion:** the Admin Questions route assertion for `isNull(questionPrompts.previewSessionId)` is removed. The route is intentionally a thin adapter and its current source occurrence is only documentation of ownership delegated to the Question Library helper; executable Question Library pagination/usage tests seed Preview-owned Prompt/Case data and verify it does not enter production results.
- **Image Library ownership filter source assertions:** raw `asset-library.js` matches for production Asset/Case ownership are removed. `test/asset-preview-isolation.test.js`, `test/image-management-v2.test.js`, and Admin image workflow tests directly seed Preview-owned Assets/Cases and prove production listing/detail/mutation flows exclude or reject them.
- **Topic Library ownership filter source assertions:** raw `topic-library.js` matches are removed. `test/topic-library.test.js` directly inserts a Preview-owned Case and proves normal Topic counts and details remain production-only.
- **Tag Library ownership/filter/guard source assertions:** raw `tag-library.js` ownership and guard-symbol matches are removed. `test/tag-library.test.js` directly inserts Preview-owned Cases/Prompts and proves counts, assignment/detail lists, mutation targets, and writes exclude or reject them. `test/content-guards.test.js` separately executes the production ownership guards.
- **Admin dashboard ownership SQL-shape assertions:** the dashboard source-read test is removed after independent review found the demonstrably stronger `test/performance-read-model.test.js`, which executes `getAdminDashboardSummary()` with Preview Case, Asset, and Prompt fixtures and verifies production counts/summaries remain isolated.

Retained thin architecture/operational ownership:

- **Preview Worker resource/config authority:** the Preview Worker remains a distinct Worker name/auth URL/Preview Mode while reusing the intended D1/R2 resources.
- **Immutable same-repository deployment authority:** manual Preview deployment resolves an open same-repository PR on `main`, checks out the exact head SHA, uses the repository-installed Wrangler Preview target, and never runs remote D1 migrations or a production deploy.
- **Schema/config safety gates:** schema-changing and `wrangler.jsonc`-changing PRs are refused before deployment; validation remains complete for this operator path and dependency installation remains lockfile-owned.
- **Credential boundary:** Cloudflare deploy credentials appear only after local repository validation and only on the final Preview deploy step; no production D1 write token is admitted.
- **Preview bootstrap role isolation:** bootstrap creates only `preview_admin`, not production `admin`.
- **Worker/route/auth isolation:** Preview Worker blocks production Admin, learner Study, and Better Auth Admin API before those handlers can mutate production state, while allowed Better Auth sign-in/sign-out/session paths remain reachable.
- **Preview-only Study isolation:** Preview-only admins remain barred from Study while combined production/Preview admins can use production Study through the existing learner access guards.
- **Preview Case authoring boundary:** Preview Case actions continue to require Preview ownership and reject global authoring/production Admin mutation helpers.
- **Logout ordering:** Preview workspace reset must succeed before Better Auth sign-out.

Independent review strengthened the consolidation decision rather than broadening source deletion: the last surviving dashboard source assertions were initially kept conservatively, then removed only after `performance-read-model.test.js` was found to execute the same production/Preview count boundary directly. No deployment/auth/route architecture assertion was removed merely because it reads source/configuration.

No workflow, Worker config, Preview route, auth hook, Study route, production DB/helper implementation, schema/migration, validation architecture, fast exclusion, dependency, deployment target, or production resource changed in this tranche.

### Explicit retained architecture review — Stimulus Family façade

`test/stimulus-family-facade-contract.test.js` received a separate stronger-owner review while this branch was active. Final disposition: **RETAIN unchanged**.

Its protected invariants are architecture/public-identity contracts rather than duplicated domain semantics: the compatibility façade must retain its established operations and exact `StimulusGroupInputError` constructor identity; extracted lower-level Stimulus Family implementation modules must not depend upward on the façade; and learner Stimulus adapters must remain independent of production mutation services/the compatibility façade. Behavioral Stimulus correctness tests do not prove absence of forbidden dependencies or continued public constructor identity, so replacing these assertions would weaken coverage.

No code or test edit was required for this retain decision.

### Inventory corrections and explicit retain decisions from prior review

The filename `contract` is not itself evidence that a test belongs in source-contract cleanup.

- `test/content-import-safety-contract.test.js` directly executes reviewed-package parsing and validation behavior. It is therefore a behavioral safety test, not a primary source/UI contract candidate, and is removed from the source-contract inventory without deleting or weakening the test.
- `test/resumable-import-contract.test.js` is a mixed architecture/migration contract and received a stronger-owner review. Its exact-ZIP digest-before-job-creation boundary and prohibition on falling back to the legacy monolithic import path are deliberate operational requirements of the resumable-import architecture, while its migration assertion is genuine upgrade coverage. `test/resumable-content-import.test.js` strongly owns chunking, persistence, leases, idempotency, and related behavior but does not replace those route/order architecture boundaries. Final disposition: **RETAIN**.

### Checkpoint 4 inventory closure

The audited primary Checkpoint 4 source/UI inventory is now exhausted: each candidate was consolidated, reclassified as behavioral coverage, or explicitly retained after stronger-owner review.

The remaining source-oriented test:

```text
test/admin-case-editor-responsive-contract.test.js
```

is intentionally **not** unfinished Checkpoint 4 work. It is already reserved for the separate Checkpoint 5 behavioral-rewrite decision, where the invariant is one logical editor tree with presentation-only layout switching. Checkpoint 4 does not weaken or rewrite it.

### Acceptance criteria

Satisfied for the audited Checkpoint 4 inventory:

- every removed assertion has a named stronger owner or explicit retirement rationale;
- safety/domain meaning remains protected;
- distinct UI reachability/integration remains where no stronger owner exists;
- architecture/configuration source tests are retained when structure itself is the invariant;
- tests are not deleted solely because regex/source inspection is aesthetically undesirable;
- candidates without a safe stronger owner are explicitly retained rather than forced into a deletion quota.

---

## Checkpoint 5 — Behavioral rewrites by subsystem

**Status: first two bounded tranches implemented in Draft PR #115: Case-editor responsive and Case Images; remaining Checkpoint 5 subsystem families are pending.**

### First bounded tranche — Case editor responsive contract

Target:

```text
test/admin-case-editor-responsive-contract.test.js
```

Protected product/behavior invariants:

- Classic/Compact switching remains presentation-only;
- the Case editor retains one logical authoring tree rather than separate Classic/Compact editor implementations;
- changing layout does not navigate, reload, invalidate/remount the authoring workflow, or replace existing Case Question form identity;
- existing Case Question scope/reorder controls remain reachable from the same question authoring tree;
- enhanced reorder keeps the user's viewport position rather than using the previously regressed relative-scroll workaround;
- Prompt and Answer fields start with comparable editing space; long Answers can expand while remaining bounded;
- image-question Prompt/Answer editors retain their more compact contextual bounded-growth behavior;
- Compact editing remains horizontally composed at the shared wide viewport class, reflows on a narrow class, and the wide Compact section navigation remains sticky with nonzero anchor clearance.

Stronger owners reused:

- `test/admin-case-editor-layout.test.js` directly executes Case-editor layout normalization, read/write preference semantics and storage-failure fallback. The responsive contract therefore no longer freezes the default `$state('compact')` literal, exact storage helper invocation spelling, direct `window.localStorage` negative tokens, or the exact setter implementation text merely to prove persistence behavior.
- DB-backed Case Question/question-scope tests remain the stronger owners for mutation semantics. They do not replace the distinct UI reachability, enhanced-scroll, single-tree, or responsive-composition invariants retained here.

Rewritten/retired implementation locks:

- exact helper/component-name bans such as `ClassicCaseEditor|CompactCaseEditor` were replaced by structural ownership. The root layout state is read from the editor's actual `data-editor-layout={...}` binding; every imported shared `case-editor` component must render exactly once outside layout selection; Classic/Compact branches may not own raw forms; and any Svelte component selected by layout is recursively inspected and must not own a transitive authoring-form subtree. Presentation-only layout components remain allowed without freezing their names or import directories;
- exact `rows="3"` is no longer durable; the contract requires Prompt and Answer to start with the same usable multi-line row count instead;
- exact auto-grow helper names, exact expand/collapse copy, one-shared-helper technique, and exact numeric height caps are no longer durable. The contract follows every action actually wired to the relevant fields, proves finite bounded growth plus generic reachable expansion controls, and compares the maximum image-editor growth limit relative to the main Answer editor;
- exact `@media (min-width: 1024px)`, exact `2fr / 3fr`, exact sticky-navigation CSS text, and exact `scroll-margin-top: 4.75rem` are retired as incidental technique. The source/CSS owner now finds the wide/narrow viewport classes structurally, accepts a horizontal grid or flex composition when wide, requires a single-column grid or column-flex reflow when narrow, requires the same wide class for sticky navigation, and requires positive anchor clearance;
- exact class ordering such as `class="stack image-question-form"` is retired; the contract checks class membership instead;
- layout-persistence helper behavior is consolidated into the executable layout-helper test while the route keeps a thin name-agnostic integration/data-flow owner. It reads the helpers actually imported from the layout module and proves the mount and layout-change flows share one storage-access helper, use distinct read/write-side helpers, assign the root layout state in place, and avoid navigation/reload/invalidation.

Retained source/data-flow ownership because no stronger cheap rendered/layout layer exists:

- Classic and Compact controls are present and dispatch their two distinct layout values;
- one logical shared Case-editor component tree remains mounted independent of layout, and any layout-selected component must remain presentation-only rather than hiding a separate authoring-form subtree behind another component name/path;
- existing `?/saveQuestion` edit-form identity remains outside Classic/Compact conditionals;
- Compact scope-change and reorder controls remain reachable together in the existing-question header;
- both reorder directions use the same enhanced callback, and that callback captures/restores the exact X/Y viewport position around history replacement/invalidation while rejecting the prior `scrollBy` path;
- the actual CSS rule bodies, not cross-selector regexes, own the minimum responsive structure needed to protect wide horizontal Prompt/Answer editing, narrow reflow, sticky navigation, and anchor clearance.

Independent self-review corrections made before handoff:

1. the first opening-tag reader stopped at the `=>` token inside a Svelte event expression and could misread a control; it was replaced by a brace/quote-aware Svelte-tag reader;
2. the first scope/reorder slice expected the `Whole Case` identity badge inside the narrower action container, although the badge correctly lives in the question-card identity area; the final owner scopes identity to the card heading and scope/reorder controls to the action header;
3. the first enhancement check followed Svelte's `enhance` action symbol rather than the callback supplied to `use:enhance={...}`; the final owner extracts and follows the actual callback identifier;
4. `svelte-check` exposed nullable helper-return paths in the new test utilities; those paths were made explicit rather than suppressing type diagnostics or weakening assertions;
5. the first structural single-tree check was still biased toward the current `$lib/components/case-editor/...` import family, so a future layout-selected Classic/Compact wrapper from a different import path could theoretically retain one shared component and evade the ownership conclusion. The final owner resolves all local Svelte imports used by a layout branch and recursively rejects any layout-selected component with a transitive `<form>` subtree, while still allowing presentation-only conditional components such as the current audit view;
6. the same final review removed the remaining exact expand/collapse copy and shared-image-helper locks, generalized wide/narrow layout ownership to horizontal/single-column behavior rather than grid-only technique, and made the layout-helper wiring assertion operate on the imported helper roles rather than their current names.

No production source, schema/migration, validation architecture, fast exclusion, workflow, browser/component test dependency, application/domain behavior, or production resource changed in this tranche.

Validation during self-review was deliberately allowed to expose test defects rather than being hidden. CI #1340 and #1341 failed on new source-parser/callback assertions; CI #1342 then reached 629/629 fast Node tests but exposed nullable-helper type diagnostics; those were corrected and implementation head `7a47f6dceb841c2764d632a9f76a307e51756754` passed Draft CI #1343. The later independent-style hardening produced test head `4175da4c1c68acf634a5e4173749b945d8c144ed`; CI #1346 again passed all 629 fast Node tests but found four JSDoc/inference errors in the new recursive helper code. The type-only correction at `65bf73d01ee8cec49aa906dc3945d0119f541b78` then passed Draft CI #1347: 110 maintained / 104 selected / 6 excluded, 629/629 fast Node tests, 0 Svelte errors / 5 existing warnings, ECG 6/6, taxonomy 3/3, slide-review 23/23 and slide-review build. Wrangler runtime-smoke #178 also passed. Exact-head CI after this final documentation reconciliation remains the final tranche gate.

### Second bounded tranche — Case Images editor contract

Target:

```text
test/case-images-editor-layout.test.js
```

Protected product/behavior invariants:

- the production Case editor keeps a learner-visible image overview rather than making Advanced authoring the only image surface;
- each overview image exposes its role and linked Question/Answer context;
- image-set options are labelled Original or Alternative according to the current Original pointer;
- an ordinary attached image is Always shown when an active image family exists, a single ordinary image with no active family may be represented as Original, and multiple ordinary images with no active family remain Needs role rather than being arbitrarily curated;
- linked Q&A distinguishes Image-specific, Reusable, and Shared across this image set scopes and renders the associated Prompt/Answer content;
- Advanced image management remains reachable from the production overview;
- the advanced surface keeps the role-based authoring workflows that start an image set from a chosen ordinary image as Original and add another ordinary image as an Alternative;
- the canonical `#images` anchor remains unique and hands off from the production overview to the Advanced editor when Advanced management opens.

Stronger owners reused:

- `test/original-stimulus-semantics.test.js` is the stronger DB-backed owner for Original/Alternative mutation, learner Core/Expanded selection, conversion atomicity, option/Asset identity, rollback, historical provenance, and validation semantics. The Case Images contract does not duplicate those database/domain guarantees;
- `test/reusable-image-question-card-counts.test.js` is the stronger executable owner for reusable Image Question availability/used semantics and reusable-question lifecycle behavior;
- DB-backed question-scope tests remain the stronger owners for question move/save mutation semantics. None of those tests replace the separate overview composition, visible vocabulary, authoring reachability, or anchor-handoff invariants retained here.

Rewritten/retired implementation locks:

- the exact `Images <span class="count">{imageCount}</span>` markup is replaced by structural ownership of the labelled Images heading and its count expression;
- the exact full explanatory sentence is no longer frozen; the contract preserves the semantic learner-visible-image / linked-Q&A relationship;
- exact role ternary source strings are replaced by extracting and executing the actual role expressions with controlled inputs, proving the intended Original/Alternative/Always-shown/Original-single/Needs-role outcomes;
- exact `<strong>Q</strong>` / `<strong>A</strong>` markup is retired. Q/A labels and rendered scope/Prompt/Answer consumption remain required without locking the emphasis element;
- Advanced workflow assertions are scoped to the actual `?/startAlternativeSet` and `?/addStimulusOption` forms plus their required `asset_id`, `set_name`, `group_id`, and `convert_fixed=on` payloads, instead of permitting matching copy elsewhere in the component;
- the exact overview anchor ternary string and exact advanced-root class ordering are replaced by executing the overview's actual `id` expression for closed/open states and structurally proving Advanced owns exactly one static `#images` anchor while the production overview owns no second static anchor;
- the exact `Image-set actions` disclosure wording is retired because workflow reachability is the durable invariant, not that disclosure label.

Retained source/composition ownership because no stronger cheap rendered/component layer exists:

- the derived role outputs must actually feed the learner-visible ordinary-image and image-set-option role badges, so a correct but dead role expression cannot satisfy the contract;
- ordinary and image-set cards must actually consume `questionsForImage(...)`, and the rendered linked-Q&A region must expose scope, Prompt, Answer, and Q/A labels, so dead scope-construction code cannot satisfy the contract;
- the Advanced entry button must be interactive and reach the handler that opens Advanced management;
- the semantic Advanced headings and role-conversion forms remain direct UI reachability owners;
- the canonical anchor handoff remains a source/composition invariant because there is no existing browser navigation/layout harness that can own fragment targeting more strongly without disproportionate infrastructure.

Independent self-review corrections before handoff:

1. the first rewrite executed the role expressions correctly but did not prove those results were still consumed by the overview. The final owner requires ordinary-image and image-set-option role badges to render `asset.role` and `option.role` respectively;
2. the first rewrite proved the three scope values existed and the overview contained a linked-Q&A region, but dead `questionsForImage(...)` construction could theoretically survive after card integration drifted. The final owner ties both ordinary and image-set card paths to `questionsForImage(...)` and retains rendered scope/Prompt/Answer/Q/A consumption.

No production component, route, domain/DB implementation, schema/migration, workflow, validation architecture, fast exclusion, browser/component dependency, or production resource changed in this tranche.

The first rewrite head `82f9d4e14f36a1fb3800e82baa5f185e1bce4ca5` passed Draft CI #1350 and runtime-smoke #181. The independent-self-review hardening head `d1a81de800077bb28f3d9c523bf0b4b51babd44d` passed Draft CI #1351: 110 maintained / 104 selected / 6 excluded, 631/631 fast Node tests, 0 Svelte errors / 5 existing warnings, ECG 6/6, taxonomy 3/3, slide-review 23/23 and slide-review build; runtime-smoke #182 also passed. Exact-head CI after the documentation reconciliation remains the final tranche gate.

### Remaining candidate families

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

**Status: pending. Not started by the first two Checkpoint 5 tranches.**

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
- new ordinary tests default to fast;
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

PR #115 now contains Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test selection infrastructure, Checkpoint 2B change-aware specialized CI, Checkpoint 2C named production-operator validation ownership, Checkpoint 2D activation of exactly six safe specialized exclusions including the independent-review correction to slide-review production dependency ownership, Checkpoint 3 explicit retention of the two intentional UX regression contracts after stronger-owner review plus the independent-review hardening of the horizontal-overflow owner, completed Checkpoint 4 source-contract consolidation/review, and the first two bounded Checkpoint 5 behavioral-contract rewrites: Case-editor responsive and Case Images. Checkpoint 4 comprises five bounded consolidation tranches plus the separate explicit Stimulus Family façade retain review.

### Completed fixture, selection, and UX-contract foundation

- Checkpoint 1 — current-schema fixture normalization — is complete for the audited target set.
- Checkpoint 2A — selector/runner/validation wiring — is implemented; its initial zero-exclusion rollout established the safe foundation.
- Checkpoint 2B — central change-aware specialized CI — is implemented with actual PR feature-diff classification and structural full-mode deduplication.
- Checkpoint 2C — named ECG/taxonomy production-operator checks and exact central path ownership — is implemented.
- Checkpoint 2D — exactly six specialized fast-test exclusions — is implemented with complete-suite inclusion, related-Draft ownership, and the explicit slide-review production compatibility dependencies contract-tested.
- Checkpoint 3 — both intentional UX regressions were investigated and retained because no stronger cheap/reliable layout-capable owner exists; independent review then tightened the retained horizontal-overflow source owner so it cannot falsely pass on a later selector's declaration. Neither product invariant was retired.
- Checkpoint 4 — complete for the audited primary source/UI inventory. The corrected first tranche, Admin Topic/System form tranche, Wrangler/local-preview authority tranche, Admin/Preview Case-editor parity tranche, and Preview deployment ownership tranche are implemented; the Stimulus Family façade was separately reviewed and explicitly retained unchanged.
- Checkpoint 5 — the Case-editor responsive family is implemented as the first bounded tranche. Helper/storage semantics were consolidated into the direct executable layout owner while single-tree composition, enhanced scroll restoration, form reachability and minimum responsive CSS structure remain thin source/data-flow owners because no stronger cheap layout-capable layer exists. Final self-review additionally makes the single-tree owner independent of current component names/import directories by rejecting layout-selected Svelte subtrees that own authoring forms.
- Checkpoint 5 — the Case Images editor family is implemented as the second bounded tranche. Deep Original/Alternative and reusable-question semantics remain under DB/helper owners, while the overview retains a focused composition owner for visible role outcomes, linked Q&A, scoped Advanced role workflows, and the single canonical `#images` handoff. Final self-review ties the executed role/scope logic back to the actual rendered card data flow so dead source cannot false-green.

### Fast-tier boundary after Checkpoint 2D

Do not add a seventh exclusion as part of Checkpoint 2D or infer further safe candidates from filenames/directories. Any later exclusion requires separate measured evidence, ownership analysis and review.

### Remaining UX/source-contract work

Checkpoint 3 and Checkpoint 4 are complete. Within Checkpoint 5, the Case-editor responsive and Case Images tranches are implemented subject to exact-head post-documentation validation and independent review. Stimulus curation, performance/read-model and reusable-image safety remain separate later Checkpoint 5 tranches. The two intentional width/overflow UX regression tests remain explicit surviving owners.

### Profiling

Checkpoint 6 has not started. The observed 2D implementation runs and the Checkpoint 5 validation runs are not sufficient for a performance claim. Additional exclusions require separate measured justification.

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

**Checkpoint 2A:** implementation defaults new ordinary tests into fast, preserves full `npm test`, and established its selection architecture first with zero exclusions.

**Checkpoint 2B:** implementation evidence is established on head `0277911099b661699c202283559a5a9da53cf0e2`: Draft CI run #1283 resolved the full PR feature diff through the central classifier, preserved base fast, added `slideReviewTest` and `slideReviewBuild`, passed 645/645 fast tests with zero exclusions, passed `npm run check`, passed 23/23 specialized slide-review tests, and passed the slide-review build.

**Checkpoint 2C:** implementation evidence is established on head `2250552b9a8b62b06717492421c7a139e323dbc0`: Draft CI run #1294 preserved base fast, added both named operator checks plus the slide-review pair through the shared classifier fail-safe, passed 656/656 fast tests with zero exclusions, passed `npm run check`, passed ECG 6/6, taxonomy 3/3, slide-review 23/23 and the slide-review build. Runtime-smoke run #125 also passed.

**Checkpoint 2D:** the initial exclusion mechanics were established on head `bd93043bd112a0e96cc233ff99228a91fe863831` / CI #1297. Independent review then found the slide-review production-dependency ownership gap. Corrective head `4aa59b30b4197fba22240a61d76daa480b6902cf` / Draft CI #1303 passed with 110 maintained / 104 selected / 6 excluded, 629/629 selected fast tests, 0 Svelte errors/5 existing warnings, ECG 6/6, taxonomy 3/3, slide-review 23/23 and slide-review build; runtime-smoke #134 also passed. Focused contracts now prove each of the three production compatibility dependencies requires `slideReviewTest` in Draft mode and deduplicates through complete `test` in full mode. The final handoff additionally requires green exact-head CI after these documentation changes.

**Checkpoint 3:** satisfied after independent-review correction: both protected product invariants remain intentional and both dispositions remain `RETAIN`; no stronger cheap/reliable layout owner exists; the Shared Questions contract remains unchanged; the horizontal-overflow contract was tightened to extract the `body` rule before asserting `overflow-x: hidden`, eliminating the reviewed cross-rule false-green case. No production/UI code, schema, CI architecture, exclusion, or application/domain behavior changed.

**Checkpoint 4:** satisfied for the audited primary inventory after the fifth Preview-deployment tranche and the separately completed Stimulus façade retain review. The Preview deployment contract now owns only deployment/config/auth/route architecture; production Question/Image/Topic/Tag/dashboard isolation is owned by direct DB behavior tests. The Admin/Preview parity and Wrangler/local-preview tranches retain their distinct composition/delegation boundaries, while `content-import-safety-contract.test.js` is classified as behavioral and `resumable-import-contract.test.js` is explicitly retained. The Case-editor responsive contract remains outside Checkpoint 4 under Checkpoint 5.

**Checkpoint 5, first bounded Case-editor responsive tranche:** after intermediate CI exposed and drove correction of source-parser, callback-selection and type defects, final test-only head `65bf73d01ee8cec49aa906dc3945d0119f541b78` passed Draft CI #1347 with 110 maintained / 104 selected / 6 excluded, 629/629 fast tests, 0 Svelte errors/5 existing warnings, ECG 6/6, taxonomy 3/3, slide-review 23/23 and slide-review build; runtime-smoke #178 passed. Final completion requires the same repository-owned validation on the exact documentation-reconciled head and an independent review before another Checkpoint 5 subsystem begins.

**Checkpoint 5, second bounded Case Images tranche:** first rewrite head `82f9d4e14f36a1fb3800e82baa5f185e1bce4ca5` passed Draft CI #1350 and runtime-smoke #181. Independent self-review then closed dead-role-expression and dead-Q&A-construction false-green paths. Hardened test-only head `d1a81de800077bb28f3d9c523bf0b4b51babd44d` passed Draft CI #1351 with 110 maintained / 104 selected / 6 excluded, 631/631 fast tests, 0 Svelte errors/5 existing warnings, ECG 6/6, taxonomy 3/3, slide-review 23/23 and slide-review build; runtime-smoke #182 passed. Final completion requires the same repository-owned validation on the exact documentation-reconciled head before beginning Stimulus curation.

**Checkpoint 6:** runtime claim backed by comparable CI medians.

## 8. Final target state

The desired repository state after Checkpoint 2D remains:

```text
npm test
  = complete maintained Node suite

npm run test:fast
  = ordinary Draft suite
  = new tests included by default
  = exactly six current specialized omissions with proven conditional ownership

Draft CI
  = base fast checks
  + specialized checks required by changed paths

Ready/full CI
  = complete full checks
  + any specialized non-duplicated checks required by changed paths

agent:checks
  = reports the same centrally owned changed-path requirements CI executes
```
