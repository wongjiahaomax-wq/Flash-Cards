# Test Suite Audit

Status: audit complete / first source-contract consolidation tranche, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A zero-exclusion fast-test infrastructure, and Checkpoint 2B change-aware specialized CI implemented in Draft PR #115

This document is the durable evidence record for PR #115. It audits the repository-wide Node test suite, `npm run check`, and the repository-owned validation architecture. The audit/planning work is complete, and this document now also records the first implemented source-contract consolidation tranche, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test selection infrastructure, and Checkpoint 2B change-aware specialized CI in the same Draft PR.

Those implementations remain intentionally bounded. Checkpoint 2B adds conditional specialized CI ownership without activating any fast-test exclusion. Production-operator specialization, exclusion activation, broader behavioral rewrite, and profiling remain pending.

The implementation contract is `docs/NODE_TEST_SUITE_CLEANUP_PLAN.md`.

## 1. Executive findings

The audited baseline is broad but mostly valuable:

- the audited `node --test` baseline discovered 109 maintained test files;
- the audited green CI baseline ran 635 tests with 635 passing;
- the Node test stage was approximately 19.6 seconds;
- `npm run check` was approximately 18.5 seconds;
- `npm test` is the canonical complete Node suite;
- Checkpoint 2A changes Draft `validate:fast` to invoke `npm run test:fast`, but the explicit exclusion set is empty, so maintained-test coverage remains complete;
- Checkpoint 2B makes ordinary CI consume centrally classified specialized requirements from the actual PR feature diff;
- Ready/non-Draft `validate:full` continues to run complete `npm test` plus the repository's additional full checks, with structural deduplication for specialized Node coverage already satisfied by complete `test`.

The original audit hypothesis was only partly correct. There is a meaningful cluster of brittle source-level UI contracts, but source-reading itself is not the problem. Several source/configuration contracts protect real architectural or operational boundaries and should remain.

Two corrections from independent review materially change the recommended plan:

1. **Static `test:fast` exclusions were unsafe before change-aware CI ownership existed.** The repository's path classifier knew about specialized slide-review checks, but `agent:checks` only reported requirements. Checkpoint 2B closes that architectural gap for existing slide-review specialization; the two production-operator tests still do not have named specialized checks and therefore remain generic Draft coverage.
2. **The two proposed unconditional UI-test removals were over-classified.** Both were introduced alongside deliberate UX fixes and protect intentional regression outcomes, albeit through brittle source assertions. They must be rewritten, retained, or consciously retired after confirming the product invariant; they are not automatic deletions.

PR #115 has implemented the first source-contract consolidation tranche, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A's zero-exclusion selection architecture, and Checkpoint 2B's central change-aware specialized-CI mechanism. Independent review of the consolidation tranche confirmed the core consolidation principle but also showed that domain/model coverage is not automatically a replacement for UI reachability. The corrected tranche therefore keeps thin UI/data-flow owners for Case Images information architecture, post-curation Original reassignment, the unified taxonomy staged-review/apply flow, and Case Library workflow wiring while leaving deep semantics under stronger helper/model/server/DB tests.

Checkpoint 1 aligned ordinary D1-backed current-runtime fixtures with the current supported schema without converting genuine migration tests into current-schema tests. The canonical bootstrap is `test/current-schema.js`, which discovers the complete numbered migration set in deterministic order. Historical application states remain representable as data inside the current schema; historical schemas remain only where migration/upgrade behavior is itself the subject under test.

Checkpoint 2A then introduced `scripts/test-selection.mjs` and `scripts/test-fast.mjs`, preserved `npm test = node --test`, added `npm run test:fast`, and made Draft validation use the distinct `testFast` check. Selection is exclusion-based, explicit, deterministic and repository-owned. `FAST_TEST_EXCLUSIONS` is deliberately empty, so no specialized test has left Draft coverage. New ordinary `.test` JavaScript files enter fast automatically without an allow-list edit.

Checkpoint 2B keeps those base fast/full contracts unchanged. `scripts/agent-checks-lib.mjs` remains the single changed-path rule authority and exposes the specialized requirement subset that `agent:checks` reports and `scripts/validate-ci.mjs` executes. CI classifies the actual PR base-to-head feature diff, then combines the current mode's base checks with specialized requirements through explicit validation-check satisfaction rules. For slide-review changes, full `test` satisfies `slideReviewTest`, but does not satisfy `slideReviewBuild`.

The overall direction remains:

- improve CI failure readability;
- keep ordinary fixtures aligned with the supported current schema;
- keep `npm test` complete;
- establish a conservative fast tier before excluding anything;
- preserve broad `svelte-check`;
- consolidate brittle/duplicated contracts only when the protected invariant is understood;
- make conditional specialization safe before activating exclusions;
- profile before weakening high-value domain coverage.

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

Checkpoint 2B adds `tests/ci-change-aware.test.js`, so the current PR head discovers 110 maintained files. Exact-head Draft CI run #1283 reported:

```text
complete=110
selected=110
excluded=0
```

That run passed all 645 fast Node tests. `npm test` continues to mean the complete maintained Node suite and is not redirected through the fast selector.

### Fast selection authority

Checkpoint 2A adds:

```text
scripts/test-selection.mjs
scripts/test-fast.mjs
```

Maintained Node-test discovery is repository-wide and convention-based rather than a directory allow-list. The selector recognizes `.test.js`, `.test.mjs` and `.test.cjs`, skips dependency/generated output directories, and does not treat ordinary helper modules such as `test/current-schema.js` as maintained test files.

The explicit exclusion authority is:

```text
FAST_TEST_EXCLUSIONS = []
```

Every exclusion must be an exact discovered path. Missing or duplicate exclusions fail loudly. Selection exposes complete, selected and excluded lists in deterministic order.

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

`runtime:smoke` and slide-review checks are named specialized checks, not universal members of fast/full.

### Ordinary GitHub Actions behavior

The CI workflow chooses a mode from PR state and invokes `scripts/validate-ci.mjs`.

Conceptually:

```text
Draft PR            -> base fast + specialized checks required by PR paths
Ready/non-Draft PR  -> base full + non-duplicated specialized checks required by PR paths
Draft -> Ready      -> full on that head
newer same-PR run   -> supersedes/cancels older run
```

The workflow remains orchestration-only and does not own test paths, exclusion manifests, slide-review classification, or deduplication rules. It supplies the real PR base/head SHAs and now checks out full history (`fetch-depth: 0`) so repository code can resolve a true `base...head` feature diff.

`scripts/validate-ci.mjs` obtains the changed repository paths from that feature diff, passes them through the same `classifyChangedFiles(...)` authority used by `agent:checks`, and combines only `specializedRequiredChecks` with the unchanged base mode.

### Validation satisfaction / deduplication

`scripts/validation-contract.mjs` owns check satisfaction explicitly rather than by command-string matching.

The current relevant rule is:

```text
test
  satisfies testFast
  satisfies slideReviewTest
```

Therefore a slide-review Draft runs:

```text
diff
testFast
svelte
slideReviewTest
slideReviewBuild
```

while a slide-review full/Ready run resolves to:

```text
diff
db
test
svelte
build
authSmoke
slideReviewBuild
```

The complete `test` check removes the redundant specialized Node-test execution, but does not suppress `slideReviewBuild`.

### CI Node diagnostics

`scripts/validate-ci.mjs` recognizes all CI Node-test checks currently relevant to this checkpoint:

```text
test
testFast
slideReviewTest
```

`test` and `testFast` retain their established reporter wiring. `slideReviewTest` executes the existing repository-owned named command and receives the same structured reporter through CI-only environment wiring, with `check=slideReviewTest` and `npm run slide-review:test` reproduction identity. Non-Node checks do not receive the reporter.

### Agent classifier behavior

`agent:checks` uses `scripts/agent-checks-lib.mjs` to classify changed paths. The same `VALIDATION_RULES` now own both the complete agent advisory requirements and the specialized subset ordinary CI adds to its base mode.

For slide-review:

```text
tools/slide-import-review/**
  -> specializedRequiredChecks:
     slideReviewTest
     slideReviewBuild
```

Those checks are also included in the agent report's `requiredChecks`. CI does not contain a second slide-review path pattern or duplicate classifier.

Validation/classification infrastructure changes fail safe by preserving the selected base mode and additionally requiring the existing specialized slide-review test/build pair. Important otherwise-unclassified code/tooling paths keep the classifier's prior conservative full advisory behavior for agents and likewise require the current specialized pair in ordinary CI.

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

Checkpoint 2A and 2B deliberately make no performance claim. With zero exclusions, `npm run test:fast` still runs every maintained test file. Profiling and runtime claims remain deferred.

## 4. CI diagnostics problem

The original audit found that Node-test failures were difficult to locate in CI output. Current `main` includes the separate PR #117 connector-readable/structured Node-test diagnostics work. That upstream change did not alter the complete-suite contract and is not part of PR #115's source-contract consolidation.

The durable diagnostics requirements remain:

- preserve the same executed tests;
- keep `npm test` unchanged;
- keep CI presentation compact;
- use Node test events/custom reporter machinery for structured failure extraction;
- do not parse `dot`/`spec` human reporter text as a programmatic API;
- show failures prominently near the end with name, location, message, expected/actual when available, and useful stack;
- preserve/improve GitHub `::error` annotations and connector-readable failure records.

Checkpoint 2B extends this baseline to specialized slide-review Node checks without changing the existing `test` / `testFast` identities. During implementation, a failed intermediate CI run demonstrated that identity leakage is detectable: the final implementation deliberately modifies the environment only for `slideReviewTest` and leaves `test`/`testFast` behavior unchanged.

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

Checkpoint 2A introduces the selection mechanism without changing complete-suite semantics or removing any maintained test from Draft validation.

The package contract is now:

```text
npm test
  -> node --test

npm run test:fast
  -> node scripts/test-fast.mjs
```

The selector's key safety properties are contract-tested:

- fast-selected paths are drawn from complete maintained discovery;
- every explicit exclusion must exist in discovery;
- every discovered maintained test is either selected or explicitly excluded;
- new ordinary `.test.js` files default into fast without editing an allow-list;
- ordering is deterministic;
- the real exclusion list is empty;
- with the real empty configuration, fast-selected paths equal complete maintained discovery;
- `npm test` remains exactly `node --test`;
- full validation continues to own `npm test`;
- fast validation owns `npm run test:fast`;
- CI's structured reporter applies to both Node checks and not to non-Node checks;
- workflow YAML contains no test-file list or exclusion ownership.

`scripts/test-fast.mjs` invokes Node directly with an explicit deterministic selected-file list, preserves the child status, refuses a zero-selection fallback, and lets selector failures fail the command rather than silently falling back to `npm test` or implicit discovery.

No production/application/schema/domain code was changed for Checkpoint 2A.

### Checkpoint 2B implementation record

Checkpoint 2B implements change-aware ordinary CI without changing the generic fast/full mode definitions or activating exclusions.

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

Focused contracts prove unrelated Draft, slide-review Draft, slide-review full/Ready deduplication, shared classifier authority, validation-tooling fail-safe behavior, actual three-dot feature-diff semantics, specialized reporter identity, workflow orchestration-only ownership, invalid configuration failure, and the continued empty exclusion set.

Exact-head Draft CI on implementation head `0277911099b661699c202283559a5a9da53cf0e2` passed in run #1283. The log proved:

- CI mode `fast`;
- 44 PR-changed paths classified from the actual base/head feature diff;
- specialized requirements `slideReviewTest, slideReviewBuild` because this PR changes validation infrastructure;
- executed checks `diff, testFast, svelte, slideReviewTest, slideReviewBuild`;
- `test:fast`: **110 complete / 110 selected / 0 excluded; 645/645 tests passed**;
- `npm run check`: **0 errors, 5 existing warnings**;
- `slide-review:test`: **23/23 passed** through the structured reporter path;
- `slide-review:build`: passed and built `tools/slide-import-review/dist/index.html`;
- repository CI validation passed.

Exact-head Wrangler runtime smoke run #114 also passed. This work session used Remote GitHub mode; no local repository command execution is claimed.

No production/application/schema/domain code was changed for Checkpoint 2B. No production-operator specialized check was added and `FAST_TEST_EXCLUSIONS` remains empty.

## 6. Source-contract audit

The repository contains many source-reading tests. They fall into materially different classes.

### A. Deliberate architecture/safety contracts — keep

Examples include:

- Preview deployment ownership/configuration boundaries;
- Stimulus Family façade dependency direction and public identity;
- Wrangler authority / repository-pinned invocation rules;
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

### D. Corrected classification: intentional UX regressions expressed brittly

#### `test/admin-shared-questions-width-contract.test.js`

The current test reads:

```text
src/routes/admin/shared-questions/+page.svelte
```

It requires the page to use the available admin content width:

- `.page { width: 100%; ... }`;
- `.form-grid` remains unconstrained by a reintroduced max-width;
- no `.page { max-width: ... }` regression.

The earlier audit incorrectly described a different route/class/declaration. That description is withdrawn.

Git history shows the test was introduced in commit `d5fba9b` (`Refine admin editor widths and expandable fields`) together with the deliberate Shared Questions width UX change.

Underlying product regression intent: **Shared Questions should use the available admin content width rather than regress to an unnecessarily constrained editor layout.**

The current source regex is brittle, but the invariant was intentional.

Disposition: **KEEP UNTIL REPLACED OR EXPLICITLY RETIRED**. Prefer a behavioral/rendered layout owner when practical. If the product decision is that the width invariant no longer matters, record that decision before deleting the test.

#### `test/admin-horizontal-overflow-contract.test.js`

The current test reads `src/app.css` and requires `body { overflow-x: hidden; }`.

Git history shows it was introduced in the same UX-fix commit alongside that global CSS change.

Underlying regression intent: **child layouts should not cause unwanted application-level horizontal scrolling.**

The exact `overflow-x: hidden` declaration is only one implementation technique and can mask the true overflowing child, so the assertion form is brittle. But the user-observable regression intent is not incidental.

Disposition: **KEEP UNTIL REPLACED OR EXPLICITLY RETIRED**. A stronger owner would measure actual rendered horizontal overflow at representative viewports if a lightweight mechanism exists. Do not add a heavyweight browser stack only for this assertion.

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

Checkpoint 2A establishes the selector and validation wiring first, with no exclusions. That means the architecture now has a place to express exact exclusions later, but none are active.

This is deliberately not a latency optimization yet:

```text
complete discovered maintained tests
== fast-selected maintained tests
excluded maintained tests
== 0
```

### Checkpoint 2B conditional ownership mechanism

Checkpoint 2B establishes the missing ordinary-CI change-aware mechanism. Slide-review-owned paths now require `slideReviewTest` and `slideReviewBuild` in ordinary CI, and full `test` structurally satisfies the specialized Node-test requirement without satisfying the specialized build.

This still does **not** reduce generic Draft coverage. The exact-head implementation has 110 maintained files, 110 fast-selected files and zero exclusions.

### Original static-exclusion proposal

The earlier audit proposed eventually excluding from unrelated Draft generic fast validation:

```text
tools/slide-import-review/tests/build.test.js
tools/slide-import-review/tests/core.test.js
tools/slide-import-review/tests/review-fixes.test.js
tools/slide-import-review/tests/source-coverage.test.js
test/ecg-batch-01-asset-rename.test.js
test/production-taxonomy-operator.test.js
```

The rationale was that they are specialized and unnecessary for unrelated Drafts.

That rationale is reasonable; all six remain in generic fast in Checkpoint 2B.

### Why exclusion activation is still incomplete

For slide-review:

- dedicated `slideReviewTest` and `slideReviewBuild` named checks exist;
- the central path classifier requires them for `tools/slide-import-review/**` changes;
- ordinary CI now executes those requirements from the actual PR diff;
- full `npm test` structurally satisfies `slideReviewTest`, while `slideReviewBuild` remains additional.

Therefore Checkpoint 2B has established the conditional ownership prerequisite for the slide-review family, but Checkpoint 2D has not activated any exclusion.

For the two production operators:

- their tests protect fail-closed precondition/postcondition behavior around production mutation scripts;
- there are currently no corresponding specialized named checks in `validation-contract.mjs`;
- exclusion would therefore still create a coverage hole.

### Corrected rule

**A test may leave generic Draft fast coverage only after ordinary CI has a centrally owned, tested mechanism that makes its relevant specialized check mandatory when related code changes.**

Checkpoint 2B satisfies that mechanism for the existing slide-review specialized owner. Checkpoint 2C is still required for the two production-operator tests. Checkpoint 2D remains the separate exclusion-activation gate.

### Remaining change-aware ownership before exclusions

Completed in 2B:

1. changed-path classification centrally owned and reusable;
2. `validate-ci.mjs` consumes that central classification for the actual PR feature diff;
3. slide-review test/build checks are required for slide-review changes;
4. full `npm test` deduplicates specialized Node coverage while retaining `slideReviewBuild`;
5. validation-tooling and unclassified important tooling paths receive conservative specialized fail-safe requirements.

Still pending in 2C:

- specialized operator checks for `scripts/rename-ecg-batch-01-assets.mjs` + `test/ecg-batch-01-asset-rename.test.js`;
- specialized operator checks for `scripts/apply-agreed-taxonomy.mjs` + `test/production-taxonomy-operator.test.js`.

Only after 2C is proven may Checkpoint 2D activate the proposed six exclusions.

## 9. Corrected target validation architecture

### Canonical complete suite

```text
npm test
  -> all maintained Node tests
```

### Draft base validation

```text
diff whitespace
npm run test:fast   # currently equivalent in maintained-file coverage to npm test
npm run check
```

The selector still has **zero exclusions**.

### Change-aware Draft validation — implemented in Checkpoint 2B

```text
base fast checks
  + specialized checks required by changed paths
```

An unrelated ordinary application Draft resolves to base fast only. A slide-review Draft resolves to base fast plus `slideReviewTest` and `slideReviewBuild`. Validation infrastructure changes conservatively retain base fast and add the current specialized pair.

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

For slide-review changes, full `npm test` satisfies `slideReviewTest`, so only `slideReviewBuild` is added. This satisfaction is explicit repository data, not workflow-specific string matching.

## 10. Test disposition summary

| Group | Revised disposition |
| --- | --- |
| learner/question/reusable behavior | KEEP IN FAST |
| Stimulus Family semantics | KEEP IN FAST |
| imports/resumable safety | KEEP IN FAST |
| Preview/auth/ownership | KEEP IN FAST |
| Asset/R2 safety | KEEP IN FAST |
| schema/migration/taxonomy behavior | KEEP IN FAST unless measured evidence and safe conditional ownership justify otherwise |
| Case Library functional/state tests | KEEP IN FAST |
| deliberate architecture/source contracts | KEEP |
| PR104/taxonomy/Case Images duplicated source contracts | CONSOLIDATE; first tranche partially implemented in PR #115 |
| responsive/editor/control source contracts with real behavior | REWRITE/CONSOLIDATE, preserve invariant |
| Shared Questions width regression | KEEP UNTIL REPLACED OR EXPLICITLY RETIRED |
| application horizontal-overflow regression | KEEP UNTIL REPLACED OR EXPLICITLY RETIRED |
| slide-review tests | KEEP IN FAST in 2B; conditional CI ownership is implemented, exclusion activation remains Checkpoint 2D |
| ECG production-operator test | KEEP IN FAST; exclusion remains pending a named conditional check |
| taxonomy production-operator test | KEEP IN FAST; exclusion remains pending a named conditional check |

## 11. Measurement gate

Checkpoint 2A/2B do not claim a performance improvement. The fast-tier infrastructure should not be declared materially successful merely because a new command or change-aware mechanism exists.

After safe exclusions are activated in a later checkpoint, measure at least three comparable GitHub Actions runs and compare medians for:

- complete Node stage;
- fast Node stage;
- `npm run check`;
- total Draft validation;
- selected/excluded file counts;
- executed test counts.

Target: at least **20% median reduction in the Node stage** before describing the fast tier as materially worthwhile.

If the safe, change-aware exclusions do not achieve that, profile before excluding more coverage:

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
3. introduce fast-tier infrastructure without reducing coverage;
4. make CI change-aware for specialized checks;
5. give production operators named conditional ownership;
6. only then exclude specialized tests from unrelated Drafts;
7. preserve intentional UX regressions while replacing brittle assertion forms where practical;
8. consolidate duplicated source contracts;
9. profile remaining runtime before trading away high-value coverage.

PR #115 remains Draft. It now contains the corrected first source-contract consolidation tranche, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A zero-exclusion fast-test infrastructure, and Checkpoint 2B change-aware specialized CI. Checkpoints 2C/2D remain pending. `FAST_TEST_EXCLUSIONS` remains empty; no production-operator specialization, broader behavioral rewrite, profiling work, application behavior change, or schema/migration change was added by Checkpoint 2B.