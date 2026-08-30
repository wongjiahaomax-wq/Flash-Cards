# Test Suite Audit

Status: audit complete / Checkpoint 4 source-contract consolidation/review, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test infrastructure, Checkpoint 2B change-aware specialized CI, Checkpoint 2C named production-operator validation ownership, Checkpoint 2D safe exclusion activation, Checkpoint 3 intentional UX regression review, and the first bounded Checkpoint 5 Case-editor responsive behavioral rewrite implemented in Draft PR #115

This document is the durable evidence record for PR #115. It audits the repository-wide Node test suite, `npm run check`, and the repository-owned validation architecture. The audit/planning work is complete, and this document now also records completed Checkpoint 4 source-contract consolidation/review, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test selection infrastructure, Checkpoint 2B change-aware specialized CI, Checkpoint 2C named production-operator checks, Checkpoint 2D activation of the six approved specialized exclusions plus the independent-review correction to slide-review production dependency ownership, Checkpoint 3 review of the two intentional UX regression contracts, and the first bounded Checkpoint 5 Case-editor responsive rewrite in the same Draft PR.

Those implementations remain intentionally bounded. Checkpoint 2D reduces generic unrelated-Draft fast selection by exactly six maintained specialized files while retaining complete `npm test` coverage and central related-Draft specialized ownership. Checkpoint 3 retains both intentional UX regression contracts because the repository has no cheap layout-capable rendered test layer that would provide a stronger owner; independent review then required a narrow hardening of the horizontal-overflow source assertion so the retained owner cannot false-green on a declaration in another CSS rule. Checkpoint 4 is complete for the audited primary source/UI inventory after five bounded consolidation tranches plus the separate Stimulus Family façade `RETAIN` review. The first bounded Checkpoint 5 tranche rewrites the Case-editor responsive contract around stronger semantic/composition ownership while retaining thin source/data-flow ownership where no browser/layout-capable layer exists. Remaining Checkpoint 5 subsystem rewrites, additional exclusions, and profiling remain pending.

The implementation contract is `docs/NODE_TEST_SUITE_CLEANUP_PLAN.md`.

## 1. Executive findings

The audited baseline is broad but mostly valuable:

- the audited `node --test` baseline discovered 109 maintained test files;
- the audited green CI baseline ran 635 tests with 635 passing;
- the Node test stage was approximately 19.6 seconds;
- `npm run check` was approximately 18.5 seconds;
- `npm test` is the canonical complete Node suite;
- Checkpoint 2A changed Draft `validate:fast` to invoke `npm run test:fast`, initially with an empty exclusion set so maintained-test coverage remained complete during rollout;
- Checkpoint 2B makes ordinary CI consume centrally classified specialized requirements from the actual PR feature diff;
- Checkpoint 2C gives the ECG Batch 01 Asset rename and agreed taxonomy production-operator tests explicit repository-owned named checks and exact changed-path ownership;
- Checkpoint 2D activates exactly six approved specialized exclusions from generic unrelated-Draft `test:fast`; corrective implementation CI discovered 110 maintained files, selected 104 and excluded six;
- Checkpoint 3 reviewed the Shared Questions width and application horizontal-overflow regressions and retained both source contracts because no practical stronger cheap/reliable layout owner exists in the repository; independent review then hardened the horizontal-overflow assertion to ensure the required declaration is actually inside the `body` rule;
- the second bounded Checkpoint 4 tranche removes two assertions from `admin-topics-form-contract.test.js`: one incidental literal-copy guard and one duplicated writer-error source assertion, while two independent-review passes harden the surviving UI/action reachability owner against six false-green or cross-file wiring paths;
- the third bounded Checkpoint 4 tranche removes duplicated raw `local-runtime-lib.mjs` source assertions from `wrangler-authority-contract.test.js` because `local-runtime.test.js` directly owns the constructed preview-plan semantics, while retaining the fast local-auth invocation owner and a hardened local-preview plan-delegation boundary;
- the fourth bounded Checkpoint 4 tranche removes duplicated image-question count/workflow assertions and incidental copy/implementation locks from `admin-editor-preview-contract.test.js`, while hardening Preview composition and production question-scope route delegation and retaining the shared editor's action/data/form/scope/Study-isolation architecture;
- the fifth bounded Checkpoint 4 tranche removes raw Question/Image/Topic/Tag/dashboard production-ownership source assertions from `preview-deployment-contract.test.js` only after direct DB tests are identified as stronger owners, while retaining the Preview Worker/deployment/credential/auth/route/logout architecture;
- `stimulus-family-facade-contract.test.js` received a separate stronger-owner review and is explicitly retained unchanged because public constructor identity and forbidden dependency direction are architecture invariants not replaced by domain behavior tests;
- the first bounded Checkpoint 5 tranche rewrites `admin-case-editor-responsive-contract.test.js` so helper/storage semantics are delegated to the executable layout-helper owner, while one-tree composition, in-place switching, form/action reachability, exact viewport restoration, bounded field behavior, and minimum wide/narrow layout structure remain protected; final self-review makes the one-tree owner independent of current component names/import directories by rejecting layout-selected Svelte subtrees that contain authoring forms, and avoids freezing exact helper names, breakpoints, grid-versus-flex technique, row counts, height caps, expand/collapse copy, shared image-helper identity, or class ordering;
- Ready/non-Draft `validate:full` continues to run complete `npm test` plus the repository's additional full checks, with structural deduplication for specialized Node coverage already satisfied by complete `test`.

The original audit hypothesis was only partly correct. There is a meaningful cluster of brittle source-level UI contracts, but source-reading itself is not the problem. Several source/configuration contracts protect real architectural or operational boundaries and should remain.

Seven corrections from independent review materially changed the recommended plan:

1. **Static `test:fast` exclusions were unsafe before change-aware CI ownership existed.** Checkpoint 2B closed the ordinary-CI execution gap for existing slide-review specialization. Checkpoint 2C closed the corresponding ownership gap for the two production-operator tests. Checkpoint 2D activates only those six independently approved files after the ownership prerequisites were accepted.
2. **Slide-review's specialized ownership crosses the tooling-directory boundary.** Independent review of the first 2D implementation found that excluded `tools/slide-import-review/tests/core.test.js` directly imports `src/lib/server/import/content-package.js`, `src/lib/server/import/reviewed-content-package.js`, and `src/lib/server/storage/media.js` to synchronize production limits and verify finalizer compatibility with production parsers. Those exact production files therefore require `slideReviewTest` even though they are outside `tools/slide-import-review/**`; they do not require `slideReviewBuild`.
3. **The two proposed unconditional UI-test removals were over-classified.** Both were introduced alongside deliberate UX fixes and protect intentional regression outcomes, albeit through brittle source assertions. Checkpoint 3 investigated whether stronger practical owners now exist and found none: the repository has no browser/layout-capable test infrastructure, and nearby responsive/UI contracts remain source-level. Both tests are therefore retained rather than replaced by weaker pseudo-rendered assertions or retired without a product decision. Independent review then identified one precision defect in the retained horizontal-overflow owner; that source contract was tightened in-place rather than replacing it with weaker infrastructure.
4. **A thinner source contract still has to prove the actual UI/action boundary.** Two review passes over the Admin Topic/System consolidation found six false-green paths: the Topic parent picker was not tied to the Topic-only branch; the organizer match could be satisfied by an import; the Case action match could be satisfied by an imported writer symbol; the creation form was not tied to `?/createConcept`; the retired `Additional Study Topic` guard did not scan the delegated organizer; and the named Case action was not tied to the writer call and submitted `topic_id`/`system_id`. The corrected source owner now protects those exact reachability/wiring boundaries while direct DB tests continue to own mutation semantics.
5. **Executable plan ownership can replace source-text duplication without retiring the wrapper boundary.** The Wrangler review found that `test/local-runtime.test.js` already imports `createLocalPreviewPlan()` and directly asserts the repository Wrangler path, `process.execPath`, exact local migration/serve arguments, and absence of `npx`/inline version drift. Those semantics are stronger than regexes over `local-runtime-lib.mjs`. The wrapper still needs a thin architecture owner, however: `local-preview.mjs` must delegate its build/migrate/serve execution to that plan and contain no Wrangler authority of its own. Independent review strengthened that wrapper guard and separated the local-auth authority concerns into explicit no-`npx` and no-inline-version guards, so an unversioned `npx wrangler` cannot evade the contract.
6. **Preview parity needs composition and adapter reachability, not duplicate component vocabulary.** The Admin/Preview review found that `test/reusable-image-question-card-counts.test.js` already directly owns the Case-specific/Reusable image-question vocabulary and Manage-questions workflow, so those assertions can leave the parity source contract. Conversely, importing the production editor or writer symbols is not enough to prove parity: the corrected owner requires the production component to be aliased and rendered exactly once in Preview and requires the production question-scope route to actually await its domain writers.
7. **Preview deployment architecture and production data isolation have different strongest owners.** Deployment target, immutable PR head selection, schema/config refusal, credential scoping, Worker/auth/Study route isolation, Preview-only authoring, and logout ordering remain legitimate source/configuration architecture contracts. Raw production-library SQL-shape assertions do not: Asset, Topic, Tag, Question-library, content-guard, and dashboard tests directly execute Preview-owned fixtures. Independent review initially retained the dashboard source assertions conservatively, then removed them only after `performance-read-model.test.js` was found to execute the same production/Preview count boundary directly.

PR #115 has implemented five bounded source-contract consolidation tranches, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A's selection architecture, Checkpoint 2B's central change-aware specialized-CI mechanism, Checkpoint 2C's named production-operator ownership, Checkpoint 2D's six safe specialized omissions with the corrected slide-review production dependency boundary, Checkpoint 3's explicit retention review for the two intentional UX regressions plus the focused hardening of the horizontal-overflow owner required by independent review, and the first bounded Checkpoint 5 Case-editor responsive rewrite. Independent review of the first consolidation tranche confirmed the core consolidation principle but also showed that domain/model coverage is not automatically a replacement for UI reachability. The corrected first tranche therefore keeps thin UI/data-flow owners for Case Images information architecture, post-curation Original reassignment, the unified taxonomy staged-review/apply flow, and Case Library workflow wiring while leaving deep semantics under stronger helper/model/server/DB tests. The second tranche applies the same rule to the separate Admin Topic/System form contract. The third tranche applies it to local Wrangler authority: executable preview-plan semantics move to `local-runtime.test.js`, while the local-auth script and local-preview wrapper retain only the source/architecture boundaries not proven by that behavioral owner. The fourth tranche applies the same separation to Admin/Preview Case-editor parity: dedicated reusable-image tests own duplicated count/workflow UI, while the parity source owner remains responsible for real production-editor composition, Preview adapter/data/form parity, question-scope route reachability, and Preview Study isolation. The fifth tranche applies it to Preview deployment: direct DB tests own production-data exclusion semantics, while the source/config contract retains the deployment/auth/route safety boundary. A separate Stimulus façade review concludes `RETAIN unchanged` because its dependency/public-identity invariants have no stronger behavioral replacement. The first Checkpoint 5 tranche applies the same ownership rule to the responsive Case editor: executable helper semantics move to the existing direct helper test, while no browser/layout-capable owner exists for the distinct composition, scroll, and responsive-layout invariants.

Checkpoint 1 aligned ordinary D1-backed current-runtime fixtures with the current supported schema without converting genuine migration tests into current-schema tests. The canonical bootstrap is `test/current-schema.js`, which discovers the complete numbered migration set in deterministic order. Historical application states remain representable as data inside the current schema; historical schemas remain only where migration/upgrade behavior is itself the subject under test.

Checkpoint 2A then introduced `scripts/test-selection.mjs` and `scripts/test-fast.mjs`, preserved `npm test = node --test`, added `npm run test:fast`, and made Draft validation use the distinct `testFast` check. Selection is exclusion-based, explicit, deterministic and repository-owned. New ordinary `.test` JavaScript files enter fast automatically without an allow-list edit.

Checkpoint 2B keeps the base fast/full contracts unchanged. `scripts/agent-checks-lib.mjs` remains the single changed-path rule authority and exposes the specialized requirement subset that `agent:checks` reports and `scripts/validate-ci.mjs` executes. CI classifies the actual PR base-to-head feature diff, then combines the current mode's base checks with specialized requirements through explicit validation-check satisfaction rules.

Checkpoint 2C extends that same architecture rather than adding another classifier. The ECG operator owns `scripts/rename-ecg-batch-01-assets.mjs`, its imported deterministic target manifest `scripts/ecg-batch-01-asset-rename-targets.mjs`, and `test/ecg-batch-01-asset-rename.test.js`. The taxonomy operator owns `scripts/apply-agreed-taxonomy.mjs` and `test/production-taxonomy-operator.test.js`. Full `test` satisfies both narrow operator checks; `testFast` deliberately does not.

Checkpoint 2D activates exactly these six exclusions:

```text
tools/slide-import-review/tests/build.test.js
tools/slide-import-review/tests/core.test.js
tools/slide-import-review/tests/review-fixes.test.js
tools/slide-import-review/tests/source-coverage.test.js
test/ecg-batch-01-asset-rename.test.js
test/production-taxonomy-operator.test.js
```

Complete maintained discovery still contains all six. Related Drafts regain mandatory coverage through the central specialized owners established in 2B/2C and the 2D review correction. In particular, the excluded slide-review `core.test.js` contract also owns these explicit production-side dependencies:

```text
src/lib/server/import/content-package.js
src/lib/server/import/reviewed-content-package.js
src/lib/server/storage/media.js
  -> slideReviewTest
```

Full/Ready retains complete `npm test` and structural deduplication.

Checkpoint 3 leaves the Shared Questions target test and both production source owners unchanged. The investigation found no Playwright/Cypress/Puppeteer-style browser harness, no jsdom/happy-dom/Testing Library/Vitest component layer, and no existing authoritative `scrollWidth`, `clientWidth`, or `getBoundingClientRect` layout contract. `package.json` continues to use Node's built-in test runner plus `svelte-check`; nearby responsive Admin tests likewise inspect source when layout structure is the only cheap deterministic owner. Introducing a browser dependency solely for these two assertions would violate the cleanup guardrail, while a DOM mock that does not calculate CSS layout would be weaker than the precise source regressions. Independent review found that the retained horizontal-overflow regex could cross CSS rule boundaries and false-green; only that target test was tightened to extract the `body` rule before asserting the declaration inside it.

The overall direction remains:

- improve CI failure readability;
- keep ordinary fixtures aligned with the supported current schema;
- keep `npm test` complete;
- keep the fast tier exclusion-based and conservative;
- preserve broad `svelte-check`;
- consolidate brittle/duplicated contracts only when the protected invariant is understood;
- require safe conditional specialization before any exclusion;
- profile before weakening high-value domain coverage or adding further exclusions.

## 2. Current validation architecture

### Complete Node suite

`package.json` defines:

```text
npm test -> node --test
```

At the audited baseline, Node discovery reached:

- `test/` — 103 files;
- `tests/` — 2 files;
- `tools/slide-import-review/tests/` — 4 files.

Total audited baseline: 109 files.

Checkpoint 2B added `tests/ci-change-aware.test.js`, so the current PR head discovers 110 maintained files. Checkpoints 2C/2D strengthen assertions within existing maintained test files rather than adding another maintained test file. Corrective Checkpoint 2D CI run #1303 reported:

```text
complete=110
selected=104
excluded=6
```

That run passed all 629 fast-selected Node tests. `npm test` continues to mean the complete maintained Node suite and is not redirected through the fast selector. Focused selection contracts independently prove that complete discovery includes all six exclusions and that selected + excluded exactly reconstructs complete discovery.

### Fast selection authority

Checkpoint 2A adds:

```text
scripts/test-selection.mjs
scripts/test-fast.mjs
```

Maintained Node-test discovery is repository-wide and convention-based rather than a directory allow-list. The selector recognizes `.test.js`, `.test.mjs` and `.test.cjs`, skips dependency/generated output directories, and does not treat ordinary helper modules such as `test/current-schema.js` as maintained test files.

The explicit exclusion authority is now exactly:

```text
FAST_TEST_EXCLUSIONS = [
  tools/slide-import-review/tests/build.test.js
  tools/slide-import-review/tests/core.test.js
  tools/slide-import-review/tests/review-fixes.test.js
  tools/slide-import-review/tests/source-coverage.test.js
  test/ecg-batch-01-asset-rename.test.js
  test/production-taxonomy-operator.test.js
]
```

Every exclusion must be an exact discovered path. Missing or duplicate exclusions fail loudly. Selection exposes complete, selected and excluded lists in deterministic order. No filename-pattern exclusion, directory exclusion, second manifest or complete-test allow-list was introduced.

### Svelte/compiler checks

`npm run check` is:

```text
svelte-kit sync && svelte-check --tsconfig ./jsconfig.json
```

It catches compiler/static/reactivity/accessibility problems that raw-source Node tests do not replace. The audit found no evidence for narrowing it.

Recommendation: keep it in both fast and full validation.

### Current fast/full composition

The repository-owned authority is `scripts/validation-contract.mjs`.

Fast mode remains:

```text
diff whitespace check
npm run test:fast
npm run check
```

Full mode remains:

```text
diff whitespace check
npm run db:check
npm test
npm run check
npm run build
npm run auth:smoke:local
```

`runtime:smoke`, the two production-operator checks, and slide-review checks are named specialized checks, not universal members of fast/full.

### Ordinary GitHub Actions behavior

The CI workflow chooses a mode from PR state and invokes `scripts/validate-ci.mjs`.

Conceptually:

```text
Draft PR            -> base fast + specialized checks required by PR paths
Ready/non-Draft PR  -> base full + non-duplicated specialized checks required by PR paths
Draft -> Ready      -> full on that head
newer same-PR run   -> supersedes/cancels older run
```

The workflow remains orchestration-only and does not own test paths, exclusion manifests, slide-review/operator classification, or deduplication rules. It supplies the real PR base/head SHAs and checks out full history (`fetch-depth: 0`) so repository code can resolve a true `base...head` feature diff.

`scripts/validate-ci.mjs` obtains the changed repository paths from that feature diff, passes them through the same `classifyChangedFiles(...)` authority used by `agent:checks`, and combines only `specializedRequiredChecks` with the unchanged base mode.

### Validation satisfaction / deduplication

`scripts/validation-contract.mjs` owns check satisfaction explicitly rather than by command-string matching.

The current relevant rule is:

```text
test
  satisfies testFast
  satisfies ecgAssetRenameOperatorTest
  satisfies productionTaxonomyOperatorTest
  satisfies slideReviewTest
```

`testFast` does **not** satisfy either production-operator check or `slideReviewTest`. That is now a live safety property because the underlying specialized tests are excluded from generic fast selection.

Therefore an ECG-related Draft runs:

```text
diff
testFast
svelte
ecgAssetRenameOperatorTest
```

and a taxonomy-related Draft runs:

```text
diff
testFast
svelte
productionTaxonomyOperatorTest
```

A slide-review tooling Draft runs:

```text
diff
testFast
svelte
slideReviewTest
slideReviewBuild
```

A Draft changing one of the three production compatibility dependencies imported by excluded `core.test.js` runs:

```text
diff
testFast
svelte
slideReviewTest
```

while operator-related full/Ready runs and slide-review-production-contract full/Ready runs resolve to the unchanged full base because complete `test` satisfies the narrow Node requirements. For slide-review tooling full/Ready changes, `slideReviewBuild` remains additional because complete `test` does not satisfy the build check.

### CI Node diagnostics

`scripts/validate-ci.mjs` recognizes the current CI Node-test checks:

```text
test
testFast
ecgAssetRenameOperatorTest
productionTaxonomyOperatorTest
slideReviewTest
```

`test` and `testFast` retain their established reporter wiring. The three named specialized Node checks receive the same structured reporter through CI-only environment wiring. For the two direct operator commands, the reporter is applied through `NODE_OPTIONS` before the explicit `node --test <file>` positional arguments. Their reproduction identities are derived from the repository validation contract:

```text
ecgAssetRenameOperatorTest
  -> node --test test/ecg-batch-01-asset-rename.test.js

productionTaxonomyOperatorTest
  -> node --test test/production-taxonomy-operator.test.js
```

`slideReviewTest` retains `npm run slide-review:test`. Non-Node checks do not receive the reporter. Checkpoint 2D changes selection and changed-path ownership only; it does not alter these diagnostic identities.

### Agent classifier behavior

`agent:checks` uses `scripts/agent-checks-lib.mjs` to classify changed paths. The same `VALIDATION_RULES` own both the complete agent advisory requirements and the specialized subset ordinary CI adds to its base mode.

For the specialized families:

```text
tools/slide-import-review/**
  -> slideReviewTest
  -> slideReviewBuild

src/lib/server/import/content-package.js
src/lib/server/import/reviewed-content-package.js
src/lib/server/storage/media.js
  -> slideReviewTest

scripts/rename-ecg-batch-01-assets.mjs
scripts/ecg-batch-01-asset-rename-targets.mjs
test/ecg-batch-01-asset-rename.test.js
  -> ecgAssetRenameOperatorTest

scripts/apply-agreed-taxonomy.mjs
test/production-taxonomy-operator.test.js
  -> productionTaxonomyOperatorTest
```

The three production-side slide-review paths are included because excluded `core.test.js` directly imports them for synchronized production limits and finalizer/parser compatibility. They require only `slideReviewTest`, not `slideReviewBuild`.

The ECG target manifest is included because the operator imports/re-exports the deterministic target data and the dedicated test directly protects those IDs, storage keys, and names. The taxonomy operator has no analogous repository-owned helper/data dependency, so no broader pattern was added.

Validation/classification infrastructure changes fail safe by preserving the selected base mode and additionally requiring the ordinary-CI specialized set:

```text
ecgAssetRenameOperatorTest
productionTaxonomyOperatorTest
slideReviewTest
slideReviewBuild
```

Important otherwise-unclassified code/tooling paths keep the classifier's prior conservative full advisory behavior for agents and likewise require this specialized fail-safe set in ordinary CI.

## 3. Runtime baseline

The audited green GitHub Actions baseline reported:

| Stage | Result |
| --- | ---: |
| Node TAP duration | ~19.63 s |
| Node CI group wall time | ~19.9 s |
| `npm run check` group | ~18.5 s |
| Node tests | 635 pass / 0 fail |
| Svelte check | 0 errors; warnings remained visible |

The audit did not establish a per-file wall-clock profile. Individual TAP durations are not equivalent to process/file wall time because Node starts many test files and scheduling/module-startup costs matter.

Important conclusion: deleting a few millisecond-scale source assertions cannot materially solve a ~19.6-second Node stage. Maintenance cleanup and latency optimization are different problems.

Corrective Checkpoint 2D implementation CI #1303 observed 104 selected files instead of 110 and 629 fast-selected tests passing. That is sufficient to establish the direct selection effect but not a material performance claim. No median or profiling claim is made from a single run; Checkpoint 6 remains pending.

## 4. CI diagnostics problem

The original audit found that Node-test failures were difficult to locate in CI output. Current `main` includes the separate PR #117 connector-readable/structured Node-test diagnostics work. That upstream change did not alter the complete-suite contract and is not part of PR #115's source-contract consolidation.

The durable diagnostics requirements remain:

- preserve the intended executed coverage;
- keep `npm test` unchanged;
- keep CI presentation compact;
- use Node test events/custom reporter machinery for structured failure extraction;
- do not parse `dot`/`spec` human reporter text as a programmatic API;
- show failures prominently near the end with name, location, message, expected/actual when available, and useful stack;
- preserve/improve GitHub `::error` annotations and connector-readable failure records.

Checkpoint 2B extended this baseline to specialized slide-review Node checks without changing the existing `test` / `testFast` identities. Checkpoint 2C extended the same reporter architecture to the two direct production-operator checks. Checkpoint 2D leaves that reporting architecture unchanged while moving six files out of generic fast selection and correcting the changed-path ownership of the excluded slide-review compatibility contract.

## 5. Schema-fixture finding

The suite contained ordinary application tests that manually applied selected historical migration subsets or inline partial application schemas, then executed current application code.

That is architecturally different from a real migration test.

The durable distinction is:

### Current application behavior tests

- execute current application code;
- use the current supported schema;
- may contain historical or edge-case data states inside that schema.

### Migration/upgrade tests

- may construct a historical schema deliberately;
- apply migrations;
- assert upgrade, data preservation, constraints, or sequencing.

### Historical data-state tests

- use current schema;
- represent valid data created under older product behavior;
- do not require current runtime code to probe for missing tables/columns.

Permanent runtime `no such table` / `no such column` fallback behavior should not be restored merely to keep stale ordinary fixtures passing.

### Checkpoint 1 implementation record

Checkpoint 1 was implemented in Draft PR #115 after integrating current `main` (including PR #113's current-schema helper/runtime compatibility cleanup).

The systematic primary inventory searched `test/` for fixtures directly reading `0000_dashing_centennial.sql` and found 25 files. Their final classification is:

- **24 files normalized or partially normalized** so their ordinary current-runtime fixtures use `applyCurrentSchema(...)` from `test/current-schema.js`;
- **1 file intentionally left historical:** `test/contextual-system-topic-tag-navigation.test.js`, because it directly exercises migration `0015_contextual_system_topic_tag_navigation.sql`;
- three of the 24 changed files remain deliberately mixed because a migration-specific test is embedded alongside ordinary runtime tests:
  - `test/resumable-content-import.test.js` retains its explicit migration 0004 fresh/upgrade coverage;
  - `test/learning-db.test.js` retains its explicit migration 0014 `question_pool_mode` backfill coverage;
  - `test/original-stimulus-semantics.test.js` retains its explicit pre-0016 -> 0016 migration coverage while its ordinary runtime fixture now uses the current schema.

A broader direct-reader sweep also found five ordinary tests that already discover and apply the complete numbered migration directory dynamically:

- `test/stimulus-prompt-specificity-characterisation.test.js`;
- `test/stimulus-family-live-prompt-trigger-alignment.test.js`;
- `test/asset-higher-resolution-replacement.test.js`;
- `test/stimulus-family-correctness-checkpoint-a.test.js`;
- `test/stimulus-family-correctness-checkpoint-a-boundaries.test.js`.

Those five already satisfy the current-schema invariant. They were deliberately left unchanged in this checkpoint rather than broadening the work into cosmetic bootstrap consolidation. `test/current-schema.js` itself is the sixth direct migration-directory reader and remains the canonical shared authority.

Historical data-state scenarios—including inactive Cases, archived Stimulus options, legacy relationship shapes that remain valid, and historical Review snapshots—continue to be constructed as data under the current schema. No production runtime missing-table/missing-column fallback was restored.

Exact-head Draft CI on implementation head `e02ff7c7f0b331d6ca10a8a90d8d61fdf29ad550` passed in run #1254. Its repository-owned `fast` validation executed the diff whitespace check, the complete then-current `npm test` suite (625/625 passed), and `npm run check` (0 errors; 5 existing warnings). The local execution environment in that work session did not have a usable GitHub checkout, so no local command execution was claimed.

### Checkpoint 2A implementation record

Checkpoint 2A introduced the selection mechanism without changing complete-suite semantics or removing any maintained test from Draft validation at rollout time.

The package contract is:

```text
npm test
  -> node --test

npm run test:fast
  -> node scripts/test-fast.mjs
```

The selector's key safety properties are contract-tested:

- fast-selected paths are drawn from complete maintained discovery;
- every explicit exclusion must exist;
- duplicate exclusions fail loudly;
- every discovered maintained test is either selected or explicitly excluded;
- new ordinary `.test.js` files default into fast without editing an allow-list;
- ordering is deterministic;
- `npm test` remains exactly `node --test`;
- full validation continues to own `npm test`;
- fast validation owns `npm run test:fast`;
- CI's structured reporter applies to both base Node checks and to named specialized Node checks through the established mechanism;
- workflow YAML contains no test-file list or exclusion ownership.

`scripts/test-fast.mjs` invokes Node directly with an explicit deterministic selected-file list, preserves the child status, refuses a zero-selection fallback, and lets selector failures fail the command rather than silently falling back to `npm test` or implicit discovery.

No production/application/schema/domain code was changed for Checkpoint 2A.

### Checkpoint 2B implementation record

Checkpoint 2B implements change-aware ordinary CI without changing the generic fast/full mode definitions.

The architecture is:

```text
actual PR base...head changed paths
        ↓
classifyChangedFiles(...)
        ↓
specializedRequiredChecks
        ↓
base mode checks + specialized checks
        ↓
explicit satisfaction/deduplication
        ↓
CI execution
```

The same classifier result is used by `agent:checks` reporting and CI planning. `.github/workflows/ci.yml` contains no slide-review path rules; its only 2B change is full-history checkout so repository code can compute the feature diff reliably.

Focused contracts prove unrelated Draft, slide-review tooling Draft, slide-review full/Ready deduplication, shared classifier authority, validation-tooling fail-safe behavior, actual three-dot feature-diff semantics, specialized reporter identity, workflow orchestration-only ownership, and invalid configuration failure. The later 2D review correction extends these contracts to the three explicit production compatibility paths imported by excluded `core.test.js`.

Implementation head `0277911099b661699c202283559a5a9da53cf0e2` passed Draft CI run #1283. The log proved:

- CI mode `fast`;
- 44 PR-changed paths classified from the actual base/head feature diff;
- specialized requirements `slideReviewTest, slideReviewBuild` because this PR changes validation infrastructure;
- executed checks `diff, testFast, svelte, slideReviewTest, slideReviewBuild`;
- `test:fast`: **110 complete / 110 selected / 0 excluded; 645/645 tests passed**;
- `npm run check`: **0 errors, 5 existing warnings**;
- `slide-review:test`: **23/23 passed** through the structured reporter path;
- `slide-review:build`: passed and built `tools/slide-import-review/dist/index.html`;
- repository CI validation passed.

Wrangler runtime smoke run #114 on that implementation head also passed. This work session used Remote GitHub mode; no local repository command execution is claimed.

No production/application/schema/domain code was changed for Checkpoint 2B.

### Checkpoint 2C implementation record

Checkpoint 2C adds safe named ownership around the two existing fail-closed production-operator tests without changing either operator's production semantics.

The repository validation contract owns:

```text
ecgAssetRenameOperatorTest
  -> node --test test/ecg-batch-01-asset-rename.test.js

productionTaxonomyOperatorTest
  -> node --test test/production-taxonomy-operator.test.js
```

Central changed-path ownership is exact rather than broad:

```text
scripts/rename-ecg-batch-01-assets.mjs
scripts/ecg-batch-01-asset-rename-targets.mjs
test/ecg-batch-01-asset-rename.test.js
  -> ecgAssetRenameOperatorTest

scripts/apply-agreed-taxonomy.mjs
test/production-taxonomy-operator.test.js
  -> productionTaxonomyOperatorTest
```

The extra ECG target-manifest path is a real operator-owned input: the operator imports/re-exports `packageId` and `renameTargets` from it, and the dedicated test protects deterministic Asset IDs, storage keys, filenames and guarded mutation generation. No additional taxonomy helper/config path was found.

The structural satisfaction contract is intentionally asymmetric:

```text
test
  satisfies ecgAssetRenameOperatorTest
  satisfies productionTaxonomyOperatorTest

testFast
  does not satisfy either operator check
```

This keeps full/Ready execution deduplicated while permitting Checkpoint 2D to remove those test files from unrelated generic fast coverage. During 2C itself, related Drafts intentionally executed the operator test once inside `testFast` and once as the named specialized check because the exclusion manifest was still empty.

Validation/classifier infrastructure and important unclassified tooling paths fail safe with both operator checks plus the slide-review pair while preserving their base fast/full mode. `agent:checks` and ordinary CI consume the same classifier; workflow YAML contains no operator path matching.

Both new checks use the structured Node reporter with check-specific identities and reproduction commands. Existing `test`, `testFast`, and `slideReviewTest` identities remain unchanged.

Implementation head `2250552b9a8b62b06717492421c7a139e323dbc0` passed Draft CI run #1294. The log proved:

- CI mode `fast`;
- 44 PR-changed paths classified from the actual base/head feature diff;
- specialized requirements `ecgAssetRenameOperatorTest, productionTaxonomyOperatorTest, slideReviewTest, slideReviewBuild`;
- executed checks `diff, testFast, svelte, ecgAssetRenameOperatorTest, productionTaxonomyOperatorTest, slideReviewTest, slideReviewBuild`;
- `test:fast`: **110 complete / 110 selected / 0 excluded; 656/656 tests passed**;
- `npm run check`: **0 errors, 5 existing warnings**;
- ECG operator check: **6/6 passed**;
- taxonomy operator check: **3/3 passed**;
- `slide-review:test`: **23/23 passed**;
- `slide-review:build`: passed;
- repository CI validation passed.

Wrangler runtime smoke run #125 also passed. The work session used Remote GitHub mode; no local repository command execution is claimed. No Production D1/R2 credentials were retrieved or used and neither production operator was executed against production.

No production/application/schema/domain code was changed for Checkpoint 2C. `npm test` remains exactly `node --test`.

### Checkpoint 2D implementation record

Checkpoint 2D activates only the six specialized paths already accepted for conditional omission. It does not change the six-file exclusion set after activation, application/domain behavior, schema/migrations, workflow path ownership, validation satisfaction graph, or either production operator.

The active exclusions are exactly:

```text
tools/slide-import-review/tests/build.test.js
tools/slide-import-review/tests/core.test.js
tools/slide-import-review/tests/review-fixes.test.js
tools/slide-import-review/tests/source-coverage.test.js
test/ecg-batch-01-asset-rename.test.js
test/production-taxonomy-operator.test.js
```

Focused selection contracts prove all six remain in complete maintained discovery, all six are absent from generic fast selection, and no seventh maintained test is removed: selected + excluded equals complete discovery. The manifest is exact-path based, has no duplicate, rejects nonexistent exclusions, and preserves default-to-fast behavior for newly discovered ordinary tests.

The first 2D implementation correctly proved the basic three-state mechanics for tooling-directory slide-review changes and both production-operator families, but independent review found one High-severity boundary omission: `tools/slide-import-review/tests/core.test.js` directly imports three production-side modules that could invalidate the excluded compatibility contract without matching `tools/slide-import-review/**`.

The correction adds one exact central classifier rule:

```text
src/lib/server/import/content-package.js
src/lib/server/import/reviewed-content-package.js
src/lib/server/storage/media.js
  -> slideReviewTest
```

No build requirement is attached to those production paths. `core.test.js` uses them for production-limit synchronization and finalizer acceptance by current production parsers; they do not themselves alter the browser build contract.

Focused CI contracts now prove all required states and boundaries:

- **unrelated omission:** an unrelated Draft receives only `diff, testFast, svelte`; the six files are absent from generic fast selection;
- **slide-review tooling related owner:** `tools/slide-import-review/**` requires `slideReviewTest` + `slideReviewBuild`;
- **slide-review production-contract related owner:** each of the three exact production dependencies requires `slideReviewTest` without `slideReviewBuild`;
- **ECG related owner:** ECG-owned paths require `ecgAssetRenameOperatorTest`;
- **taxonomy related owner:** taxonomy-owned paths require `productionTaxonomyOperatorTest`;
- **full inclusion/deduplication:** complete `test` satisfies each specialized Node owner, including the production-contract `slideReviewTest`, so full mode does not redundantly run the narrow Node check; `slideReviewBuild` remains separately required only for slide-review tooling changes;
- **isolation/accumulation:** ECG and taxonomy do not spuriously trigger one another and multi-family changes accumulate applicable owners exactly once.

The initial exclusion mechanics passed on head `bd93043bd112a0e96cc233ff99228a91fe863831` in Draft CI run #1297 and runtime-smoke #128.

The independent-review correction passed on head `4aa59b30b4197fba22240a61d76daa480b6902cf` in Draft CI run #1303. The log proved:

- CI mode `fast`;
- 44 PR-changed paths classified from the actual base/head feature diff;
- specialized requirements `ecgAssetRenameOperatorTest, productionTaxonomyOperatorTest, slideReviewTest, slideReviewBuild`;
- executed checks `diff, testFast, svelte, ecgAssetRenameOperatorTest, productionTaxonomyOperatorTest, slideReviewTest, slideReviewBuild`;
- `test:fast`: **110 complete / 104 selected / 6 excluded; 629/629 tests passed**;
- the six exclusions printed by the runner remained exactly the approved six paths;
- `npm run check`: **0 errors, 5 existing warnings**;
- ECG operator check: **6/6 passed**;
- taxonomy operator check: **3/3 passed**;
- `slide-review:test`: **23/23 passed**;
- `slide-review:build`: passed;
- repository CI validation passed.

Wrangler runtime smoke run #134 also passed on the corrective head. The work session used Remote GitHub mode; no local repository validation command execution is claimed. No Production D1/R2 credentials were retrieved or used, neither production operator was executed against production, and no production resource was mutated.

The direct file-selection effect remains: on the same 110-file maintained discovery, generic fast selection changed from 110 selected / 0 excluded to 104 selected / 6 excluded. No performance claim is made from these runs; profiling and median comparison remain pending.

## 6. Source-contract audit

The repository contains many source-reading tests. They fall into materially different classes.

### A. Deliberate architecture/safety contracts — keep

Examples include:

- Preview deployment ownership/configuration boundaries;
- Stimulus Family façade dependency direction and public identity;
- repository-installed Wrangler authority / wrapper delegation rules;
- resumable-import runtime structure and side-effect ordering;
- selected Windows/process invocation contracts.

For these, source/configuration structure can itself be part of the intended contract.

Disposition: **KEEP**, usually in Draft fast validation.

### B. Valuable behavior expressed too brittly — rewrite when practical

Examples include:

- responsive Case editor/single-tree behavior;
- Case Images editor information architecture;
- Stimulus role authoring controls;
- bounded Case-editor read-model protections;
- reusable-image route/domain safety where route wiring currently carries part of the guarantee.

Disposition: **KEEP THE INVARIANT; REWRITE OR CONSOLIDATE THE ASSERTION FORM**.

A rewrite does not automatically require full browser E2E. Prefer the cheapest layer that actually owns the invariant: domain/helper test, server action, query-count/read-bound test, rendered component test, or a narrow architecture check.

### C. Duplicated source/UI contracts — consolidate

Primary overlap clusters:

- Case Library PR104 UI/source contracts versus functional filtering/state/topic/classification tests;
- taxonomy Admin source contracts versus model/staging/case-tag/primary-topic owners;
- Case Images source/layout contracts versus stimulus/image domain semantics.

Disposition: **CONSOLIDATE AROUND THE STRONGEST OWNER**.

### First consolidation tranche implemented in Draft PR #115

The first tranche applies the classification above without treating all source tests as disposable.

- **Case Library:** direct state, selection and classification helpers own their pure semantics; DB/server tests own filtering/domain behavior. The thin source contract intentionally remains responsible for UI composition and reachability: deliberate navigation/restoration wiring, named-action/query-context wiring, selected-Case form payloads, retry reconciliation integration, classification/global-move reachability, and the single responsive bulk-action surface. Placeholder copy and incidental toolbar styling are not protected.
- **Taxonomy workspace:** model/staging tests own hierarchy projection, Primary Topic/Case Tag semantics, stale-state validation and fail-before-write behavior. One thin source contract owns browse/organize reachability plus the unified staged review surface and its `applyWorkspace` delegation. The former standalone `admin-taxonomy-case-tag-contract.test.js` remains deleted because its Case Tag UI guarantees are explicitly present in the revised workspace contract and its mutation semantics remain covered by Case Tag model/staging tests.
- **Case Images:** domain tests own image/Stimulus semantics. The UI contract still protects the learner-visible image overview, linked Q&A, role vocabulary (`Original`, `Alternative`, `Always shown`, `Needs role`), question-scope vocabulary (`Image-specific`, `Reusable`, `Shared across this image set`), Advanced image-management access, advanced image-set role vocabulary, and the canonical `#images` anchor. Negative assertions for retired incidental markup are not restored merely to preserve the old test shape.
- **Stimulus curation:** `original-stimulus-semantics.test.js` and related domain tests own role mutation, identity/history and rollback behavior. The UI contract owns initial role assignment, post-curation `Use as Original` reachability through the canonical role route, and Alternative-to-Always-shown reachability only for non-Original options through the canonical conversion route.

This tranche therefore removes implementation-detail duplication while retaining semantic product vocabulary and workflow reachability where no stronger rendered/UI owner exists.

### Second bounded consolidation tranche — Admin Topic/System form

The second Checkpoint 4 tranche is deliberately limited to `test/admin-topics-form-contract.test.js`; it does not reopen the already-corrected Taxonomy workspace tranche and does not begin Checkpoint 5.

The assertion-level disposition is:

- **Removed — incidental implementation detail:** the route-level negative match for the literal `Hierarchy manager`. The durable composition invariant is that the Systems & Topics route renders the canonical organizer; this obsolete heading phrase is not semantic product vocabulary.
- **Removed — duplicate:** the raw `taxonomy-admin-write.ts` source assertion for the exact stale-Primary-Topic error string. `test/admin-case-library-topic-authoring.test.js` is the demonstrably stronger owner: it directly executes `moveTopicToSystem(...)` against a current-schema DB fixture, rejects a stale/non-current Primary Topic, and proves the Topic hierarchy parent was not written.
- **Retained — UI reachability/integration:** explicit `+ New System` and `+ New Topic` entry points, the `?/createConcept` form action, the Topic-only searchable parent picker, chosen `parent_id` payload, blank hidden System `parent_id`, and `+ Add Topic` / `+ Add subtopic` entry points.
- **Retained — semantic product vocabulary:** `System`, `Topic`, and `Unassigned` distinctions remain intentional authoring meaning.
- **Retained — composition:** the route must render exactly one `TaxonomyOrganizer`.
- **Retained — explicitly retired product invariant:** the route and delegated organizer remain free of `Additional Study Topic` authoring. Repository Admin guidance deliberately defines current authoring as one canonical Primary Topic plus Case Tags and treats historical secondary Topic rows as compatibility data, so this negative guard is not incidental copy.
- **Retained — server/data-flow safety:** `createConcept` passes the submitted `parent_id` to the taxonomy writer and the writer normalizes all System creation to `parentId = null`. History shows the contract was introduced with `1a9105f — Hide topic parents for Systems`; no stronger direct behavioral test currently proves this successful normalization path, so the source/data-flow assertion remains the strongest cheap owner.
- **Retained — Case-editor workflow reachability:** the Case Topics form exposes `?/assignPrimaryTopicToSystem`, carries the current `topic_id`, offers a parent `system_id`, and the scoped Case route action delegates to `assignPrimaryTopicToSystem(...)` using those submitted IDs. DB-backed authoring tests remain the stronger mutation/validation owner and the deleted writer-error source assertion is not restored.

Independent review was performed in two passes. The first pass found three precision holes:

1. a parent-picker assertion could pass even if the picker became visible for Systems; the corrected test now requires the Topic-only branch plus the blank System-parent branch;
2. a generic `TaxonomyOrganizer` symbol match could pass on an import even if the organizer was no longer rendered; the corrected test counts rendered `<TaxonomyOrganizer` tags and requires exactly one;
3. a generic `assignPrimaryTopicToSystem` match could pass on the imported writer symbol; the corrected test requires the named `assignPrimaryTopicToSystem: async` route action, and the Topic creation parent mapping is scoped to the `createConcept` action block.

The final review pass found three additional cross-file gaps:

4. creation controls and the server action could both survive while the creation form posted somewhere else; the corrected test now requires `action="?/createConcept"` on the organizer form;
5. the retained `Additional Study Topic` guard scanned only the wrapper page while the authoring UI lives in `TaxonomyOrganizer`; the corrected test scans both sources;
6. the Case route could define the named action without delegating to the taxonomy writer, or could forward the wrong fields; the corrected test scopes the action block and requires the `assignPrimaryTopicToSystem(...)` call plus `topic_id` and `system_id` mapping.

No removed assertion was restored by either review pass. The source contract is thinner in semantic duplication but stronger and more explicit about its actual UI/action integration ownership.

### Third bounded consolidation tranche — Wrangler/local-preview authority

The third Checkpoint 4 tranche is deliberately limited to `test/wrangler-authority-contract.test.js`.

The assertion-level disposition is:

- **Removed — duplicate:** raw source matching over `scripts/local-runtime-lib.mjs` for the repository Wrangler path, `process.execPath`, local D1 migration arguments, and absence of `npx`/inline Wrangler version drift. `test/local-runtime.test.js` is the stronger owner because it imports `wranglerCli` and `createLocalPreviewPlan()` and asserts the exact constructed path, exact migration and serve commands/arguments, local-only flags, and absence of drift in the resulting plan.
- **Consolidated within the surviving local-auth owner:** the old conjunctive `npx ... wrangler@<version>` negative assertion is replaced by two stronger independent guards: `local-auth-smoke.mjs` must contain no `npx` token at all and no inline `wrangler@<version>` token at all. This keeps the launcher-authority and version-authority invariants explicit instead of relying on an overlapping narrow pattern.
- **Retained — architecture/operational authority:** the local auth smoke must resolve the CLI from repository `node_modules`, invoke it through `process.execPath` for both synchronous Wrangler commands and the spawned dev worker, verify it with `--version`, contain no `npx`, and contain no inline Wrangler version pin. The actual `authSmoke` command remains a full-validation runtime check, so this fast source owner is still the strongest cheap Draft guard of its invocation structure.
- **Retained/hardened — wrapper integration:** `local-preview.mjs` must construct one `createLocalPreviewPlan()`, run the plan's build and migration steps, and launch the plan's serve command/args. It must contain no `npx` or Wrangler authority token of its own. The exact plan semantics are no longer duplicated in this source test.
- **Retained — repository dependency authority:** the package must declare a concrete semver Wrangler dependency so the repository-local CLI path has an installed owner.

Independent review found and corrected two issues:

1. the initial wrapper guard rejected `npx`, `wranglerCli`, and a quoted bare `wrangler`, but could miss a differently constructed direct Wrangler path. The final guard expresses the stronger intended wrapper invariant: `local-preview.mjs` contains no `npx` or Wrangler authority token at all and delegates execution solely through the tested plan;
2. the local-auth half's old conjunctive `npx ... wrangler@<version>` assertion did not independently protect the launcher boundary. An unversioned `npx wrangler` could therefore evade that expression. The final owner separates the concerns: any `npx` is forbidden, and any inline `wrangler@<version>` is forbidden regardless of launcher.

No runtime script, package dependency, validation rule, fast exclusion, schema, migration, application/domain behavior, or production resource changed in this tranche.

### Fourth bounded consolidation tranche — Admin/Preview Case-editor parity

The fourth Checkpoint 4 tranche is deliberately limited to `test/admin-editor-preview-contract.test.js`.

The assertion-level disposition is:

- **Removed — duplicate UI vocabulary/workflow:** direct source assertions for `Case-specific Image Questions`, `Reusable Image Questions`, and `Manage questions`. `test/reusable-image-question-card-counts.test.js` is the stronger owner because it directly protects the reusable count semantics, component vocabulary, Manage-questions reveal/focus behavior, and Preview isolation from production reusable-question mutation controls.
- **Removed — incidental implementation detail:** the exact `let reusableTotal = $derived(reusable?.total ?? 0)` source expression. The dedicated reusable-image-question suite protects the count outcome; a specific Svelte derived-variable implementation is not the product contract.
- **Removed — incidental copy:** the literal `Applies to:` label. The two meaningful scope choices and their fixed/option target values remain protected.
- **Retained/hardened — production-editor composition:** Preview must import the real production Admin Case editor, tie its Preview alias to that component, and render exactly one `<PreviewCaseEditor>`. An import alone can no longer satisfy the contract, and the current JSDoc cast syntax is not frozen.
- **Retained — adapter parity:** every named action reachable from the shared editor/component family must have a Preview adapter action, and every top-level data key read by the production wrapper must be supplied by `loadPreviewCaseEditor()`.
- **Retained — form serialization:** the shared editor's critical field names remain explicit because Preview and Production rely on the same submitted contracts after component extraction.
- **Retained — question-scope reachability:** the UI exposes Case-wide versus fixed/alternative stimulus targeting; Preview selects its named `?/saveQuestion` adapter while Production selects `/admin/cases/<id>/question-scope`.
- **Retained/hardened — production route delegation:** the question-scope route must actually await `moveCaseQuestionToStimulusTarget(...)` and `saveQuestionAtScope(...)`; imported symbols alone are not enough. `test/question-scope.test.js` and related DB-backed tests remain the stronger owners for deep move/save semantics.
- **Retained — Preview Study isolation:** the shared editor still suppresses learner Study navigation in Preview and communicates that Study is production-only.

Independent review corrected three issues before tranche completion:

1. the old composition assertion could pass if the production editor was imported but no longer rendered. The final owner requires the alias relationship and exactly one rendered Preview editor;
2. generic writer-symbol matches in the production question-scope route could pass on imports alone. The final assertions require actual awaited calls;
3. an intermediate alias check froze the current `/** @type {any} */` cast comment. The final relationship check is syntax-tolerant, and the same pass removed the non-semantic `Applies to:` copy lock while preserving both scope choices and target values.

No Preview/Production runtime route, shared Case-editor component, DB/domain code, schema/migration, validation rule, fast exclusion, deployment configuration, or production resource changed in this tranche.

### Fifth bounded consolidation tranche — Preview deployment ownership

The fifth Checkpoint 4 tranche is deliberately limited to `test/preview-deployment-contract.test.js`.

The source contract is now separated by ownership layer:

- **Removed — duplicate Question Library ownership source assertion:** the Admin Questions route's ownership text is not a stronger owner than executable Question Library pagination/usage tests that seed Preview-owned Prompt/Case data and verify production results exclude it.
- **Removed — duplicate Image Library ownership source assertions:** `asset-preview-isolation.test.js`, `image-management-v2.test.js`, and Admin image workflow tests directly seed Preview-owned Assets/Cases and verify normal listing/detail/mutation behavior excludes or rejects them.
- **Removed — duplicate Topic Library source assertions:** `topic-library.test.js` directly inserts a Preview-owned Case and proves normal Topic counts/details remain production-only.
- **Removed — duplicate Tag Library source/guard assertions:** `tag-library.test.js` directly inserts Preview-owned Cases/Prompts and proves Tag counts, assignment/detail lists, mutation targets, and writes exclude/reject them; `content-guards.test.js` directly executes production ownership guards.
- **Removed after independent review — duplicate dashboard SQL-shape assertions:** `performance-read-model.test.js` executes `getAdminDashboardSummary()` with Preview Case, Asset, and Prompt fixtures and verifies production counts/summaries, making raw `admin-dashboard.js` ownership regexes weaker duplication.
- **Retained — Preview Worker resource/configuration authority:** distinct Preview Worker identity/auth URL/Preview Mode plus intentional D1/R2 resource reuse.
- **Retained — deployment safety:** exact same-repository open PR/head SHA ownership, repository-installed Wrangler Preview target, schema/config refusal, lockfile install, full operator validation, no remote D1 migration/production deploy.
- **Retained — credential scope:** Cloudflare credentials remain after validation and only on the final Preview deploy step; no production D1 write token is admitted.
- **Retained — role/auth/route isolation:** Preview bootstrap creates only `preview_admin`; Preview Worker blocks production Admin, learner Study and Better Auth Admin API before production handlers; allowed auth session flows remain reachable.
- **Retained — Preview-only Study boundary:** Preview-only admins are barred from Study while combined production/Preview admins use the production learner guard path.
- **Retained — Preview authoring boundary:** Preview Case route requires Preview ownership, rejects global authoring, and does not use production Admin mutation helpers.
- **Retained — logout ordering:** workspace reset must succeed before Better Auth sign-out.

This is intentionally not a deployment workflow refactor. No workflow/config/runtime file changed; the retained source/config assertions remain because those structures are themselves the operational safety contract.

### Explicit architecture review — Stimulus Family façade

`test/stimulus-family-facade-contract.test.js` received a separate stronger-owner review. Final disposition: **RETAIN unchanged**.

The façade tests protect public compatibility operation availability, exact canonical `StimulusGroupInputError` constructor identity, lower-level dependency direction away from the façade, and learner Stimulus adapter independence from production mutation services/the façade. Domain-level Stimulus correctness tests do not prove absence of forbidden dependencies or constructor identity, so there is no demonstrably stronger replacement for those architecture assertions.

### Inventory corrections and explicit retain decisions

Prior review also corrected the candidate inventory rather than treating filenames as evidence:

- `test/content-import-safety-contract.test.js` directly executes reviewed-package parsing/validation behavior. It is a behavioral safety test, not a primary source/UI contract candidate. It remains unchanged and in fast coverage.
- `test/resumable-import-contract.test.js` is mixed. Its source portions protect deliberate operational architecture: the exact submitted ZIP digest must be rejected before job creation when it differs from the successful preview digest, and the bounded resumable engine must not fall back to the legacy monolithic validation/import path. Its third assertion is a genuine migration upgrade contract. `test/resumable-content-import.test.js` strongly owns chunking, persistence, leases, idempotency and related runtime semantics but does not replace those route/order boundaries. Final disposition: **RETAIN**.

### Checkpoint 4 inventory closure

The audited primary Checkpoint 4 source/UI inventory is now exhausted. Each candidate was consolidated, identified as behavioral rather than source-cleanup work, or explicitly retained after stronger-owner review.

`test/admin-case-editor-responsive-contract.test.js` is source-oriented, but its Checkpoint 4 disposition remains unchanged: it belongs to the separate Checkpoint 5 behavioral rewrite rather than to source-contract deletion.

### Checkpoint 5 first bounded tranche — Case-editor responsive behavioral rewrite

Target:

```text
test/admin-case-editor-responsive-contract.test.js
```

Protected product/behavior invariants:

- Classic/Compact switching remains presentation-only;
- there is one logical Case-editor authoring tree rather than duplicate layout-specific editor implementations;
- switching layout does not navigate, reload, invalidate/remount, or replace the existing authoring workflow;
- existing Case Question forms remain part of the same authoring tree;
- Compact scope/reorder controls remain reachable for existing Case Questions;
- enhanced reorder preserves the exact viewport after the action completes;
- Prompt and Answer fields begin with comparable usable editing space, long Answers can expand while remaining bounded, and image-specific editors retain smaller contextual bounded growth;
- Compact Prompt/Answer editing remains horizontal at the shared wide viewport class, reflows at a narrow class, and the wide Compact navigation remains sticky with positive anchor clearance.

Assertion-by-assertion disposition:

- **Rewritten to stronger executable owner:** layout preference normalization, read/write semantics, persistence and storage-failure fallback remain directly executed by `test/admin-case-editor-layout.test.js`. The responsive contract no longer freezes the exact `$state('compact')` default literal, direct `window.localStorage` negative checks, or exact helper-name/implementation spelling merely to prove helper behavior. The route keeps a thin name-agnostic integration/data-flow owner: it reads the helpers actually imported from the layout module, proves mount and layout-change flows share one storage-access helper, use distinct read/write-side helpers, assign the root layout state in place, and avoid navigation/reload/invalidation.
- **Retained/hardened as composition owner:** the old literal absence check for `ClassicCaseEditor|CompactCaseEditor` is replaced with structural ownership. The test derives the active layout state from the root editor, requires each imported shared `$lib/components/case-editor/...` component to render exactly once, and rejects raw forms or shared authoring components inside layout conditionals. Final self-review then closes the import-path/name escape hatch: every local Svelte component actually selected by a layout branch is resolved recursively and must have no transitive `<form>` subtree. Thus a renamed or relocated Classic/Compact wrapper cannot hide a second authoring tree while presentation-only conditional components remain allowed.
- **Retained as UI reachability owner:** Classic and Compact controls must expose their distinct layout values and dispatch those values to the route handler; existing `?/saveQuestion` edit-form identity must remain outside layout conditionals; Compact scope-change and reorder controls remain in the existing-question card/header rather than a second workflow.
- **Retained as intentional scroll regression:** both reorder directions must use the same enhanced callback. The contract follows the callback actually supplied to `use:enhance={...}`, requires exact X/Y capture and restoration around history replacement/invalidation with scroll anchoring suppressed, and rejects the prior relative `scrollBy`/navigation/reload path. DB reorder tests remain stronger owners for persisted ordering semantics but do not own viewport preservation or UI enhancement reachability.
- **Rewritten away from incidental form tokens:** exact `rows="3"` is replaced with comparable, multi-line Prompt/Answer initial sizing. Exact auto-grow helper names, one-shared-helper identity, exact expand/collapse copy and exact numeric `maxHeight` values are retired. The test follows each action actually wired to a field, requires finite bounded growth plus input/click and accessible expanded-state wiring, and requires the largest contextual image-question bound to remain smaller than the main Answer editor's bound.
- **Rewritten away from incidental responsive tokens:** exact `@media (min-width: 1024px)`, exact `2fr / 3fr`, exact sticky-navigation declaration text and exact `scroll-margin-top: 4.75rem` are retired. The test scopes assertions to actual CSS rule bodies, finds wide/narrow viewport classes structurally, accepts either meaningful horizontal grid/flex composition when wide and single-column grid/flex composition when narrow, requires the same wide class for sticky navigation, and requires positive anchor clearance. Grid-only technique is not the product invariant.
- **Removed as incidental markup technique:** exact `<details class="scope-change scope-change-header">` text, exact scope/reorder adjacency regex, and exact `class="stack image-question-form"` ordering are no longer durable. The contract checks semantic class membership and the question-card/action region instead of token order.

Stronger-owner and retained-owner rationale:

- `test/admin-case-editor-layout.test.js` is stronger for pure preference/storage behavior because it executes the helper semantics rather than inspecting the route's spelling;
- DB-backed Case Question/question-scope tests are stronger for mutation correctness but cannot replace UI reachability, composition, enhanced scroll restoration, or layout structure;
- the repository still has no Playwright/Cypress/Puppeteer, jsdom/happy-dom/Testing Library/Vitest layout-capable owner. Svelte compilation does not calculate responsive geometry. A fake DOM or class-name-only rendered test would therefore be weaker than the focused source/CSS rule owner retained for these layout outcomes.

Independent self-review corrections before handoff:

1. the first opening-tag parser stopped at `=>` inside a Svelte event expression, so it could truncate a layout control; it was replaced by a brace/quote-aware Svelte-tag reader;
2. the first scope/reorder slice looked for the `Whole Case` identity badge inside the narrower action container, although the badge correctly belongs to the question-card identity area; the final owner scopes identity to the card heading and the scope/reorder controls to the action header;
3. the first enhancement assertion followed Svelte's imported `enhance` action symbol rather than the callback supplied to `use:enhance={...}`; the final test extracts and follows the actual callback identifier;
4. after the behavioral tests were green, `svelte-check` exposed nullable helper-return paths in the new source-inspection utilities; those paths were made explicit rather than suppressing diagnostics or weakening assertions;
5. the first structural single-tree check was still biased toward the current `$lib/components/case-editor/...` import family, so a future layout-selected wrapper from another local import path could theoretically evade the ownership conclusion. The final owner resolves all local Svelte imports used by a layout branch and recursively rejects any layout-selected component with a transitive `<form>` subtree, while still allowing presentation-only conditional components such as the current audit view;
6. the same final review removed the remaining exact expand/collapse copy and shared-image-helper locks, generalized wide/narrow layout ownership to horizontal/single-column behavior rather than grid-only technique, and made the layout-helper wiring assertion operate on imported helper roles rather than their current names.

No production source, component, route, schema/migration, validation architecture, fast exclusion, workflow, browser/component dependency, application/domain behavior, or production resource changed in this tranche.

Validation during self-review was deliberately allowed to expose test defects rather than being hidden. CI #1340 and #1341 failed on new source-parser/callback assertions; CI #1342 then reached 629/629 fast Node tests but exposed nullable-helper type diagnostics; those were corrected and implementation head `7a47f6dceb841c2764d632a9f76a307e51756754` passed Draft CI #1343. The later independent-style hardening produced test head `4175da4c1c68acf634a5e4173749b945d8c144ed`; CI #1346 again passed all 629 fast Node tests but found four JSDoc/inference errors in the new recursive helper code. The type-only correction at `65bf73d01ee8cec49aa906dc3945d0119f541b78` then passed Draft CI #1347: 110 maintained / 104 selected / 6 excluded, 629/629 fast Node tests, 0 Svelte errors / 5 existing warnings, ECG 6/6, taxonomy 3/3, slide-review 23/23 and slide-review build. Wrangler runtime-smoke #178 also passed. The plan-only documentation head `c914d605013c6a57a182f4966741906076b4f0a3` then passed Draft CI #1348 and runtime-smoke #179. Exact-head CI after this final audit reconciliation remains the final tranche gate and is recorded in the implementation handoff rather than pre-stated here.

### D. Checkpoint 3: intentional UX regressions retained after stronger-owner review

Checkpoint 3 inspected both current test files in full, their production source owners, nearby Admin source/behavior tests, repository dependencies/scripts, browser/DOM/layout infrastructure, existing width/overflow assertions, and the introducing history in `d5fba9b` (`Refine admin editor widths and expandable fields`).

The repository currently has no cheap deterministic test environment that computes browser layout. No Playwright/Cypress/Puppeteer browser harness or jsdom/happy-dom/Testing Library/Vitest component layer is present, and there is no existing authoritative `scrollWidth`, `clientWidth`, or `getBoundingClientRect` contract to consolidate into. Svelte compilation/static checking does not establish effective width or horizontal scroll behavior. Adding a fake DOM that reports synthetic layout values would be a weaker pseudo-rendered contract; adding a browser/E2E stack solely for these two assertions would be disproportionate.

#### `test/admin-shared-questions-width-contract.test.js`

The current test reads:

```text
src/routes/admin/shared-questions/+page.svelte
```

It requires the page to use the available admin content width:

- `.page { width: 100%; ... }`;
- `.form-grid` remains unconstrained by a reintroduced max-width;
- no `.page { max-width: ... }` regression.

Git history confirms that `d5fba9b` deliberately changed `.page` from `max-width: 1180px` to `width: 100%` and removed `.form-grid`'s `max-width: 850px`, then added this regression contract in the same commit.

Protected product invariant: **Shared Questions should use the available admin content width rather than regress to an unnecessarily constrained page/form-grid layout.**

Final Checkpoint 3 disposition: **RETAIN**.

Surviving owner: `test/admin-shared-questions-width-contract.test.js` itself. It remains implementation-oriented, but today it is the strongest cheap deterministic owner of the specific regression. No existing rendered/component test measures usable width, and replacing it with class-name/render-only assertions would move farther away from the invariant. The product invariant has not been retired.

#### `test/admin-horizontal-overflow-contract.test.js`

The current test reads `src/app.css` and requires `body { overflow-x: hidden; }`.

Git history confirms it was introduced in the same UX-fix commit alongside that global CSS change.

Protected product invariant: **application/Admin child layouts should not cause unwanted page-level horizontal scrolling.**

Final Checkpoint 3 disposition: **RETAIN**.

Surviving owner: `test/admin-horizontal-overflow-contract.test.js` itself. The declaration is a proxy/implementation mechanism rather than a direct `scrollWidth <= clientWidth` measurement, and global clipping can theoretically conceal the true offending child. However, the repository has no browser/layout-capable harness that can measure document overflow reliably at representative viewports. A non-layout DOM mock would not improve the guarantee. The source contract therefore remains the strongest cheap practical owner until a real rendered layout layer exists or the product invariant is explicitly retired.

Independent review found one Medium-severity precision defect in the retained owner: the original regex used `body\s*\{[\s\S]*overflow-x:\s*hidden;`, so `[\s\S]*` could cross the closing brace of `body` and match the same declaration in a later rule. That would allow a false green after removal of the protected `body` mechanism. The correction keeps the same disposition and same source owner, but extracts the `body { ... }` block first and then asserts `overflow-x: hidden;` against that block. A later selector can no longer satisfy the contract.

No production Svelte/CSS change, test deletion, browser dependency, new fast exclusion, or change-aware CI modification was required by Checkpoint 3. The only target-test code change was the narrow hardening of `test/admin-horizontal-overflow-contract.test.js` described above; the Shared Questions contract stayed unchanged.

## 7. High-value coverage that must remain effective

The cleanup must preserve effective regression protection for:

- Production/Preview isolation and ownership;
- auth/authz;
- D1/R2 destructive and race-sensitive operations;
- migration/schema constraints;
- learner/review selection, persistence and provenance;
- Stimulus Family semantics;
- reusable questions and image-question safety;
- content imports and resumable runtime safety;
- Case lifecycle, taxonomy, tags and classification staging;
- deployment/runtime authority contracts.

A test being old, ugly, source-based, or individually slow is not enough reason to weaken these families.

## 8. Corrected fast-tier analysis

### Checkpoint 2A safety mechanism

Checkpoint 2A established the selector and validation wiring first with no exclusions, deliberately separating safe mechanism rollout from later coverage reduction.

At that stage:

```text
complete discovered maintained tests
== fast-selected maintained tests
excluded maintained tests
== 0
```

### Checkpoint 2B conditional ownership mechanism

Checkpoint 2B established the missing ordinary-CI change-aware mechanism. Slide-review tooling paths require `slideReviewTest` and `slideReviewBuild` in ordinary CI, and full `test` structurally satisfies the specialized Node-test requirement without satisfying the specialized build.

The 2D independent review subsequently identified and corrected the cross-boundary production dependencies of excluded slide-review `core.test.js`: `content-package.js`, `reviewed-content-package.js`, and `storage/media.js` now require `slideReviewTest` only.

### Checkpoint 2C production-operator ownership mechanism

Checkpoint 2C added the same safe ownership for both production-operator test families. Related ECG/taxonomy Drafts receive the matching named operator check. Full `test` satisfies those narrow checks; `testFast` does not.

### Checkpoint 2D exclusion activation

Checkpoint 2D activates exactly the six specialized paths reviewed for conditional omission:

```text
tools/slide-import-review/tests/build.test.js
tools/slide-import-review/tests/core.test.js
tools/slide-import-review/tests/review-fixes.test.js
tools/slide-import-review/tests/source-coverage.test.js
test/ecg-batch-01-asset-rename.test.js
test/production-taxonomy-operator.test.js
```

The rationale is now executable rather than aspirational:

- unrelated Draft generic fast omits all six;
- slide-review tooling changes centrally require `slideReviewTest` and `slideReviewBuild`;
- changes to `src/lib/server/import/content-package.js`, `src/lib/server/import/reviewed-content-package.js`, or `src/lib/server/storage/media.js` centrally require `slideReviewTest` because excluded `core.test.js` imports them for production compatibility;
- ECG operator changes centrally require `ecgAssetRenameOperatorTest`;
- taxonomy operator changes centrally require `productionTaxonomyOperatorTest`;
- ordinary CI executes those requirements from the actual PR diff;
- complete maintained discovery still contains all six;
- full `npm test` structurally satisfies all three specialized Node-test owners;
- `testFast` does not satisfy those excluded specialized owners;
- slide-review build remains an additional non-Node requirement only for slide-review tooling paths;
- multiple specialized families accumulate all applicable owners exactly once.

Corrective implementation CI #1303 observed:

```text
complete=110
selected=104
excluded=6
```

with 629/629 fast-selected tests passing, followed by the specialized ECG 6/6, taxonomy 3/3, slide-review 23/23 and slide-review build checks.

### Corrected rule

**A test may leave generic Draft fast coverage only after ordinary CI has a centrally owned, tested mechanism that makes its relevant specialized check mandatory when every known repository path capable of invalidating that excluded contract changes.**

Checkpoints 2B/2C established the initial ownership rule, and the 2D independent review corrected the slide-review cross-boundary dependency set. Checkpoint 2D activates only the six approved exclusions. Any seventh exclusion requires a separate evidence/review cycle.

## 9. Current validation architecture after Checkpoint 2D

### Canonical complete suite

```text
npm test
  -> all maintained Node tests
```

Complete discovery contains all six specialized files excluded from generic fast.

### Draft base validation

```text
diff whitespace
npm run test:fast   # all maintained fast-eligible tests except the six exact exclusions
npm run check
```

At the corrective Checkpoint 2D head, maintained discovery was 110 files and generic fast selected 104.

### Change-aware Draft validation

```text
base fast checks
  + specialized checks required by changed paths
```

An unrelated ordinary application Draft resolves to base fast only. A slide-review tooling Draft resolves to base fast plus `slideReviewTest` and `slideReviewBuild`. A Draft touching one of the three slide-review production compatibility dependencies resolves to base fast plus `slideReviewTest` only. An ECG-related Draft adds `ecgAssetRenameOperatorTest`; a taxonomy-related Draft adds `productionTaxonomyOperatorTest`. Changes spanning multiple specialized families receive every applicable owner exactly once. Validation infrastructure changes conservatively retain base fast and add the complete ordinary-CI specialized set.

### Ready/full validation

The full base remains:

```text
diff whitespace
npm run db:check
npm test
npm run check
npm run build
npm run auth:smoke:local
```

For either operator family and for the three slide-review production compatibility dependencies, full `npm test` satisfies the matching narrow Node test, so no redundant specialized Node check is added. For slide-review tooling changes, full `npm test` satisfies `slideReviewTest`, so only `slideReviewBuild` is additional. This satisfaction is explicit repository data, not workflow-specific string matching.

## 10. Test disposition summary

| Group | Revised disposition |
| --- | --- |
| learner/question/reusable behavior | KEEP IN FAST |
| Stimulus Family semantics | KEEP IN FAST |
| imports/resumable safety | KEEP IN FAST; `resumable-import-contract.test.js` explicitly retained after stronger-owner review |
| reviewed content-import safety | KEEP IN FAST; `content-import-safety-contract.test.js` is behavioral validation coverage, not a source-cleanup candidate |
| Preview/auth/ownership | KEEP IN FAST |
| Asset/R2 safety | KEEP IN FAST |
| schema/migration/taxonomy behavior | KEEP IN FAST unless measured evidence and safe conditional ownership justify otherwise |
| Case Library functional/state tests | KEEP IN FAST |
| deliberate architecture/source contracts | KEEP |
| PR104/taxonomy/Case Images duplicated source contracts | CONSOLIDATE; first corrected tranche implemented in PR #115 |
| Admin Topic/System form source contract | SECOND BOUNDED CHECKPOINT 4 TRANCHE: remove incidental copy + duplicated writer-error assertion; retain/harden creation form/action wiring, composition, retired/current vocabulary, top-level-System normalization, and Case-editor writer delegation/payload reachability |
| Wrangler/local-preview authority contract | THIRD BOUNDED CHECKPOINT 4 TRANCHE: move local-preview plan semantics to direct `local-runtime.test.js`; retain local-auth repository-Wrangler invocation with independent no-`npx` / no-inline-version guards and hardened local-preview plan-delegation architecture |
| Admin/Preview Case-editor parity contract | FOURTH BOUNDED CHECKPOINT 4 TRANCHE: remove duplicated image-question vocabulary/workflow plus incidental copy/implementation locks; retain/harden production-editor composition, Preview action/data/form parity, question-scope reachability/delegation, and Preview Study isolation |
| Preview deployment ownership contract | FIFTH BOUNDED CHECKPOINT 4 TRANCHE: move production Question/Image/Topic/Tag/dashboard isolation to direct DB behavior owners; retain deployment/config/credential/auth/route/logout architecture |
| Stimulus Family façade architecture contract | RETAIN unchanged after stronger-owner review; public constructor identity and dependency direction remain source/architecture invariants |
| Case-editor responsive contract | FIRST BOUNDED CHECKPOINT 5 TRANCHE: helper/storage semantics consolidated into direct executable owner; single-tree composition now rejects layout-selected form-bearing Svelte subtrees independent of current component names/paths; in-place switch integration, form/scope/reorder reachability, exact scroll restoration and semantic horizontal/single-column responsive layout remain focused source/data-flow owners without exact breakpoint/helper/copy/grid-only locks |
| other responsive/editor/control behavioral-rewrite candidates | PENDING later bounded Checkpoint 5 tranches; do not infer deletion from source-based form |
| Shared Questions width regression | RETAINED IN CHECKPOINT 3; current source contract remains strongest cheap practical owner |
| application horizontal-overflow regression | RETAINED IN CHECKPOINT 3; source owner hardened after review to constrain the declaration to the `body` rule |
| slide-review tests | EXCLUDE FROM GENERIC FAST only via exact 2D manifest; tooling paths require `slideReviewTest` + `slideReviewBuild`; three explicit production compatibility dependencies require `slideReviewTest`; complete `npm test` retains all four tests |
| ECG production-operator test | EXCLUDE FROM GENERIC FAST only via exact 2D manifest; related Drafts require `ecgAssetRenameOperatorTest`; complete `npm test` retains it |
| taxonomy production-operator test | EXCLUDE FROM GENERIC FAST only via exact 2D manifest; related Drafts require `productionTaxonomyOperatorTest`; complete `npm test` retains it |

## 11. Measurement gate

Checkpoint 2D establishes a real file-selection reduction but does not establish a material performance improvement.

Before making a fast-tier performance claim, measure at least three comparable GitHub Actions runs and compare medians for:

- complete Node stage;
- fast Node stage;
- `npm run check`;
- total Draft validation;
- selected/excluded file counts;
- executed test counts.

Target: at least **20% median reduction in the Node stage** before describing the fast tier as materially worthwhile.

If the six safe, change-aware exclusions do not achieve that, profile before excluding more coverage:

- process/file startup;
- repeated migration application;
- repeated fixture construction;
- subprocess-heavy tests;
- file fragmentation;
- concurrency/scheduling;
- module initialization.

Do not infer cost from names such as `db`, `migration`, `runtime`, or `contract`.

## 12. Final audit conclusion

The suite should not be broadly purged.

The defensible cleanup strategy is:

1. make failures readable;
2. make ordinary fixtures represent supported current runtime state;
3. introduce fast-tier infrastructure without reducing coverage initially;
4. make CI change-aware for specialized checks;
5. give production operators named conditional ownership;
6. activate only the six reviewed specialized exclusions after their complete changed-path ownership is proven, including cross-boundary dependencies of excluded contracts;
7. preserve intentional UX regressions while replacing brittle assertion forms only when a demonstrably stronger practical owner exists, and harden retained source owners when independent review finds false-green paths;
8. consolidate duplicated source contracts in bounded stronger-owner tranches without confusing executable semantics with wrapper/UI/architecture reachability;
9. rewrite behavioral source contracts by subsystem around the strongest cheap owner, retaining focused composition/layout/data-flow source checks where no stronger practical rendered owner exists;
10. profile remaining runtime before trading away high-value coverage or adding exclusions.

PR #115 remains Draft. It now contains completed Checkpoint 4 source-contract consolidation/review, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test infrastructure, Checkpoint 2B change-aware specialized CI, Checkpoint 2C named production-operator validation ownership, Checkpoint 2D activation of exactly six safe specialized exclusions with the independent-review slide-review dependency correction, Checkpoint 3's completed review of the two intentional UX regressions, and the first bounded Checkpoint 5 Case-editor responsive behavioral rewrite. Checkpoint 4 comprises five bounded consolidation tranches plus the separately reviewed Stimulus Family façade `RETAIN` decision. The responsive Case-editor tranche consolidates pure layout preference/storage semantics into `test/admin-case-editor-layout.test.js`, keeps distinct one-tree/UI/scroll/layout ownership in a thinner source/data-flow contract, and changes no production source. The final self-review makes the one-tree owner independent of current component names/import directories by rejecting layout-selected Svelte subtrees that own authoring forms and removes remaining expand/collapse-copy, shared-helper and grid-only technique locks. The broader Case Images, Stimulus curation, performance/read-model and reusable-image safety Checkpoint 5 families remain pending. Checkpoint 6, application behavior changes, schema/migration changes, production mutation, a seventh exclusion, and fast-tier latency claims remain outside this bounded tranche.

The corrected test head `65bf73d01ee8cec49aa906dc3945d0119f541b78` passed Draft CI #1347 with 110 complete / 104 selected / 6 excluded; 629/629 fast-selected tests; 0 Svelte errors / 5 existing warnings; ECG 6/6; taxonomy 3/3; slide-review 23/23; slide-review build passed; repository CI validation passed. Runtime-smoke #178 also passed. The subsequent plan-only documentation head `c914d605013c6a57a182f4966741906076b4f0a3` passed Draft CI #1348 and runtime-smoke #179. This audit reconciliation is the final documentation mutation for the tranche; its exact-head CI/runtime result belongs in the implementation handoff rather than being pre-stated here.
