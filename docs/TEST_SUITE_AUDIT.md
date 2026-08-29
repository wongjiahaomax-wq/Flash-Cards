# Test Suite Audit

Status: audit complete / implementation not started

This document is the durable exploration and planning artifact for PR #115. It audits the repository-wide Node test suite, `npm run check`, and the repository-owned validation architecture. It deliberately does **not** implement the proposed cleanup or validation split.

Audit evidence is from the current PR #115 head and its intended `main` base. This audit was performed in Remote GitHub mode: repository files, Git history, the complete test discovery tree, and GitHub Actions output were inspected, but no local repository command was executed. Runtime figures below are therefore labelled as GitHub Actions measurements rather than local benchmarks.

## 1. Executive findings

The original hypothesis is partly correct, but the main problem is narrower than “too many regex/source tests.”

1. The current `node --test` suite is broad: the audited head discovers **109 test files** and the green PR #115 CI run reports **635 tests, 635 passing**.
2. There is a real cluster of brittle UI/source-contract tests. The clearest examples assert exact CSS declarations, source expressions, helper names, markup order, or literal copy. Two tests (`admin-horizontal-overflow-contract.test.js` and `admin-shared-questions-width-contract.test.js`) protect only an exact CSS implementation and are strong removal candidates.
3. Source-reading is **not** itself a defect. Code search finds 31 test files using `readFileSync`, but many read migrations, fixtures, configuration, or source specifically to enforce an architectural/safety boundary. Examples such as Preview deployment ownership, Stimulus Family façade dependency direction, Wrangler authority, resumable-import runtime constraints, and migration replay are cheap and valuable contracts.
4. Git history provides direct evidence of incidental source lock-in. PR #104 recorded a red CI run caused solely by a test expecting an inline `data.cases.map(...)` expression when equivalent application code first assigned the value to a local variable and then used property shorthand. Application behavior was already correct. That is the kind of source-expression contract this audit recommends removing or rewriting.
5. The maintenance problem and the runtime problem are related only weakly. The clearest brittle CSS tests take roughly 1–2 ms each in current CI. Deleting them will reduce false-positive refactor failures, but will not materially change the approximately 19.6-second Node stage.
6. There is no evidence to reduce broad Svelte static/compiler checking. `npm run check` takes approximately 18.5 seconds in the current Draft CI and currently reports useful Svelte reactivity/accessibility warnings. Raw-source tests do not replace that compiler/static analysis.
7. There is also no current evidence for moving safety-critical DB, migration, import, learner, Stimulus Family, reusable-question, Preview/Production ownership, auth, or Case lifecycle tests out of Draft validation merely because they sound expensive. Many measured individual DB/domain tests are tens of milliseconds. Their regression value is high.
8. Draft speed should therefore come from **conservative test selection plus later profiling**, not from weakening high-value domain coverage. The first defensible exclusions are specialized slide-review tooling and one-off production-operator tests; their actual wall-time benefit must be measured before committing to more complexity.
9. `npm test` should remain the canonical complete Node suite. If a fast subset is introduced, add only `test:fast`; a `test:full` alias is unnecessary unless later ergonomics justify it because `npm test` already means complete.
10. The current single-authority validation design is sound and must be preserved. CI, local validation, and agent tooling should continue to consume `scripts/validation-contract.mjs` rather than maintaining independent command lists.

The recommended implementation is therefore incremental: introduce centrally owned fast-test selection without changing full coverage, measure it, remove only clearly incidental source contracts, behaviorally replace or consolidate valuable-but-brittle UI contracts, and specialize only test families with a clear ownership reason. Do not perform a broad “regex test purge.”

## 2. Current validation architecture

### `npm test`

`package.json` defines:

```text
npm test -> node --test
```

There is no explicit file list. Node discovery currently reaches three locations:

- `test/` — 103 files;
- `tests/` — 2 files;
- `tools/slide-import-review/tests/` — 4 files.

The current audited CI run reports 635 tests. The suite mixes pure functions, D1/integration fixtures, migration tests, route/server behavior, source/architecture contracts, repository tooling, and slide-review tool tests.

### `npm run check`

`package.json` defines:

```text
npm run check -> svelte-kit sync && svelte-check --tsconfig ./jsconfig.json
```

This is a broad SvelteKit/compiler/static check, not a substitute for application behavior tests. On the audited head it completed with 0 errors and 5 warnings in 4 Svelte files. The warnings included state-reference/reactivity diagnostics and an accessibility `treeitem`/`tabindex` diagnostic. Those diagnostics are qualitatively different from raw-source regex checks.

Recommendation: retain the broad command in both fast and full validation unless future evidence identifies a specific compiler-check bottleneck that can be solved without reducing coverage.

### Repository-owned `validate:fast`

`npm run validate:fast` invokes `scripts/validate.mjs fast`, which obtains the mode composition from `scripts/validation-contract.mjs`.

Current fast mode is:

```text
diff whitespace check
npm test
npm run check
```

The important current weakness is that “fast” still executes the complete 109-file Node suite.

### Repository-owned `validate:full`

`npm run validate:full` invokes the same runner with `full`.

Current full mode is:

```text
diff whitespace check
npm run db:check
npm test
npm run check
npm run build
npm run auth:smoke:local
```

A correction to earlier shorthand is important: **full validation does not currently include `npm run runtime:smoke`**. Pinned-Wrangler runtime smoke is a separate named repository check selected by agent tooling when runtime-sensitive paths change. Slide-review test/build checks are also specialized checks rather than members of ordinary fast/full.

### GitHub Actions interaction

`.github/workflows/ci.yml` does not maintain a second command list. It chooses a validation mode from PR state and invokes `scripts/validate-ci.mjs`:

```text
Draft PR            -> fast
Ready/non-Draft PR  -> full
Draft -> Ready      -> full on the same head
newer same-PR run   -> cancels the superseded run
```

`validate-ci.mjs` resolves the actual commands from the shared validation contract and adds CI-specific diff semantics/grouping/annotations. This separation is correct and should remain.

### Agent-tooling interaction

`npm run agent:checks` classifies changed paths and reports required/recommended named checks from the same repository contract. It can additionally surface specialized checks such as:

- `npm run runtime:smoke` for Wrangler/runtime-sensitive changes;
- `npm run slide-review:test` and `npm run slide-review:build` for slide-review tooling;
- database checks for schema/migration work;
- application validation for ordinary application changes.

This classifier is advisory and must not become a competing validation authority. Future test selection should reuse the same named-check/contract architecture.

## 3. Test-suite inventory

### Discovery counts

| Discovery location | Files | Main character |
| --- | ---: | --- |
| `test/` | 103 | Application/domain/integration/source-contract/runtime/operator tests |
| `tests/` | 2 | Agent/validation tooling tests |
| `tools/slide-import-review/tests/` | 4 | Specialized reviewed-import tooling |
| **Total** | **109** | `node --test` complete discovery set |

The current green CI run reports **635 individual tests**. Some files contain nested TAP subtests; file count and TAP test count therefore should not be inferred from one another.

### Primary subsystem breakdown

These are primary ownership groupings for audit purposes; several files intentionally cross boundaries.

| Primary subsystem | Files | Typical styles / examples |
| --- | ---: | --- |
| Admin / Case Library / authoring UI | 22 | pure helpers, server/action behavior, source-contract UI assertions |
| Taxonomy / Tags / classification | 14 | staged models, D1/domain behavior, schema contracts |
| Assets / images / storage | 12 | D1/R2 coordination, route behavior, race/immutability contracts |
| Auth / Preview ownership | 9 | migration/auth, ownership/integration, deployment/source safety |
| Content import / lifecycle / integrity | 12 | import parsing, lease/runtime safety, Case lifecycle, guards |
| Learner / questions / Review behavior | 14 | selection/provenance/persistence, question/reuse behavior |
| Stimulus Family / stimulus semantics | 11 | domain behavior, regression characterization, façade architecture |
| Tooling / runtime / operators / migrations | 9 | local CLI/runtime helpers, production operators, Wrangler contracts |
| Agent/validation tooling (`tests/`) | 2 | classifier/report/real-Git validation architecture tests |
| Slide-review tooling | 4 | parser/build/reviewer/source-coverage tests |
| **Total** | **109** | |

### Style observations

The suite is not cleanly partitioned by filename or directory. Important examples:

- “runtime” files can be cheap unit tests rather than a real runtime smoke. `test/wrangler-runtime-smoke.test.js`, for example, exercises runtime-smoke helper/cleanup logic; the actual runtime integration command is the separate `npm run runtime:smoke`.
- migration and DB files are not necessarily the slowest tests. Current CI shows many individual migration/domain assertions in the tens-of-milliseconds range.
- a single file can combine strong behavior tests and a brittle source assertion. `asset-higher-resolution-replacement.test.js` is one example: the D1/R2 identity/compensation behavior is high value even if a narrow source-level assertion may later deserve consolidation.
- source reading can be the right mechanism for a dependency-direction or deployment-config invariant that cannot be exercised cheaply as ordinary runtime behavior.

For that reason, fast/full disposition must be based on protected invariant and execution cost, not filename patterns such as `*-contract.test.js`, `*-migration.test.js`, or `*-runtime*.test.js`.

## 4. Runtime analysis

### Measured GitHub Actions baseline

The following figures are measured from CI run #1187 at PR #115 head `9bab6211669d6b09371b7a8a257b927dc4c1647f`:

| Stage | Measured result |
| --- | --- |
| `npm test` TAP duration | **19,625.6 ms** (~19.63 s) |
| `npm test` CI group wall time | ~19.9 s including npm/output overhead |
| `npm run check` CI group wall time | **~18.5 s** |
| Node tests | **635 pass / 0 fail / 0 skipped / 0 todo** |
| Svelte check | **0 errors / 5 warnings in 4 files** |

No local cold/warm benchmark was run because this audit session had no usable repository checkout/execution environment. No per-file wall-clock profile was run. Individual TAP durations below are therefore representative assertion/subtest durations, not a substitute for per-file process timing.

### Representative costs

Current CI shows:

- many source-regex assertions: approximately 0.1–3 ms each;
- many D1/domain assertions: commonly tens of milliseconds, with a number around 50–120 ms;
- route/image upload success behavior: roughly 224 ms for one observed test;
- a slide-review build/parse test: roughly 203 ms;
- real-Git agent tooling cases: roughly 50–190 ms;
- a diff-base test: roughly 131 ms;
- selected question/stimulus/asset tests: roughly 100–140 ms.

Node runs 109 test files, so worker/process/module-startup cost and parallel scheduling matter. Summing TAP assertion durations would not reproduce the 19.6-second wall time.

### Runtime conclusion

The two clearest removal candidates are not a performance solution:

- exact global overflow CSS contract: ~1.25 ms observed;
- exact Shared Questions width CSS contract: ~1.4 ms observed.

Their removal is justified by refactor resilience, not speed.

The practical speed strategy should therefore be:

1. reduce the number of irrelevant test files started for Draft validation where ownership clearly permits it;
2. preserve all high-value domain/safety tests initially;
3. measure the resulting fast suite on comparable CI;
4. only then profile/process-optimize additional groups if the improvement is insufficient.

Do not guess that “DB-heavy” equals “slow enough to defer.” The current evidence does not support that generalization.

## 5. Source-contract audit

Code search finds 31 test files using `readFileSync`. That set is intentionally broader than “bad source tests”: some read SQL migrations or fixtures, some read source to establish architecture, and some lock UI implementation. The useful classification is the protected contract, not the API used to read the file.

### A. Valuable architectural/safety invariants — keep

| Test/family | What it protects | Why source inspection is appropriate | Disposition |
| --- | --- | --- | --- |
| `preview-deployment-contract.test.js` | Preview Worker reuses existing D1/R2, deployment resolves same-repo SHA, refuses Worker-config-changing PRs, secrets only reach final deploy | workflow/config wiring is itself the safety boundary | **KEEP IN FAST** |
| `stimulus-family-facade-contract.test.js` | façade export/error identity, no upward dependency from extracted modules, learner adapters remain read-oriented | dependency direction and public façade identity are architecture contracts | **KEEP IN FAST** |
| `wrangler-authority-contract.test.js` | repository-installed Wrangler authority; no ad-hoc `npx` drift in local flows | command/config source is the behavior under test | **KEEP IN FAST** |
| `resumable-import-contract.test.js` and source portions of `resumable-runtime-safety.test.js` | bounded runtime path, staged snapshot use, lease renewal before side effects, no legacy monolithic execution path | prevents resource/safety regressions that can be invisible to type/compiler checks | **KEEP IN FAST** |
| selected local Windows CLI contracts | no `.cmd` child-wrapper regression and platform-safe command construction | deliberate cross-platform process contract | **KEEP IN FAST** |

These are not candidates for deletion simply because they use regex, `includes`, or source reads.

### B. Valuable regression contract, but expressed too brittly — rewrite behaviorally where practical

| Test/family | Valuable invariant | Brittle part | Disposition |
| --- | --- | --- | --- |
| `admin-case-editor-responsive-contract.test.js` | classic/compact switching is presentation-only, one editor tree remains mounted, usable wide/narrow layout | exact breakpoint/CSS/helper/source tokens | **KEEP, REWRITE BEHAVIORALLY** |
| `case-images-editor-layout.test.js` | canonical editor information architecture, image role vocabulary, canonical Image Library navigation | exact markup order, literal CSS/image sizing, literal source anchor occurrence | **KEEP, REWRITE BEHAVIORALLY / CONSOLIDATE** |
| `stimulus-curation-editor-controls.test.js` | Admin can set/correct Original/Alternative roles and reverse curation | control presence/copy asserted from raw Svelte source | **KEEP, REWRITE BEHAVIORALLY** |
| `performance-read-model.test.js` source guard | prevent Case-editor read path from reintroducing an unbounded Case Library read | exact helper/function-name prohibition | **KEEP, REWRITE toward query/read-bound behavior**; retain a narrow dependency prohibition only if no stronger measurable owner exists |
| reusable-image safety route/source portions | production scope and option/Asset identity cannot be bypassed by route wiring | source form can lock implementation | **KEEP IN FAST; rewrite only after equivalent route/domain behavior exists** |

A behavioral rewrite does not necessarily require full browser E2E. Depending on the invariant, rendered component/DOM tests, server action tests, domain helper tests, query-count instrumentation, or narrow architecture import checks may be stronger and cheaper.

### C. Useful but duplicated — consolidate around the strongest owner

| Source-contract family | Stronger/overlapping owners | Recommendation |
| --- | --- | --- |
| `admin-case-library-pr104-ui.test.js` | PR104 filtering/state/topic-authoring/classification functional tests | keep unique UI/data-flow behavior; remove literal expression/CSS/copy duplication |
| `admin-taxonomy-workspace-contract.test.js` | `taxonomy-workspace-model.test.js`, `taxonomy-workspace-staging.test.js`, `case-primary-topic-*`, `case-tag-*` | consolidate stage/preflight/domain invariants under model/domain owners; retain only unique render/interaction contract behavior |
| `admin-taxonomy-case-tag-contract.test.js` | case-tag bulk/staging/workspace behavior | consolidate canonical mutation/preflight ownership; avoid repeated literal markup/source expressions |
| `admin-topics-form-contract.test.js` | taxonomy hierarchy/model/staging behavior | keep only unique action-authority or parent-null semantics not already behaviorally covered |
| portions of `case-images-editor-layout.test.js` | `original-stimulus-semantics.test.js`, `stimulus-curation-editor-controls.test.js`, `admin-image-workflow.test.js` | domain role semantics belong to domain tests; UI file should test only unique rendered behavior |

### D. Incidental implementation lock-in — remove

#### `test/admin-shared-questions-width-contract.test.js`

The test reads `src/routes/admin/questions/shared/+page.svelte` and requires `.shared-page` to contain `width: min(100%, 120rem)` while rejecting `80rem`.

Unique coverage lost by removal: only the exact CSS max-width declaration.

Why removal is safe: it does not establish Shared Question eligibility, server behavior, data integrity, layout usability, or an architectural boundary. A harmless CSS restructuring or equivalent layout technique fails the test. If a specific visual width later becomes an intentional product regression requirement, a rendered/browser visual assertion should own it.

Disposition: **REMOVE**.

#### `test/admin-horizontal-overflow-contract.test.js`

The test reads `src/app.css` and requires the `body` block to contain `overflow-x: hidden`.

Unique coverage lost by removal: only the exact global CSS declaration.

Why removal is safe: the declaration is one implementation technique and does not prove the actual product invariant “no unintended horizontal overflow.” It can mask rather than diagnose the element causing overflow. If horizontal overflow is a durable regression risk, test actual rendered scroll width at representative viewport sizes.

Disposition: **REMOVE**.

### Historical evidence for the distinction

PR #104's durable handoff records that CI run #1023 failed only because a source-contract test required the inline text `visibleIds: data.cases.map(...)`; the application intentionally used `const visibleIds = data.cases.map(...)` followed by property shorthand. No application behavior change was required to make the corrected test pass. This is direct evidence that exact source-expression assertions can produce false failures after legitimate refactors.

By contrast, Preview deployment, Wrangler authority, dependency direction, and bounded resumable-import execution are examples where the implementation/configuration structure is itself part of the contract. Those tests should remain.

## 6. High-value coverage that must remain

The eventual implementation must explicitly preserve the following families. Moving or rewriting a test is acceptable only if the same or stronger invariant remains observable.

### Production / Preview ownership

- production content predicates versus Preview-owned mutable content;
- `requireOwnedPreviewCase(...)` ownership semantics;
- Preview may reference production Assets without owning them;
- Preview deployment must not silently fork or mutate D1/R2 ownership assumptions;
- Preview workspace lifecycle/fixed-image mutation scope.

### Authentication / authorization

- admin bootstrap and Preview admin bootstrap boundaries;
- Preview auth behavior;
- auth migration compatibility;
- local Better Auth/D1 smoke remains part of full validation.

### Destructive mutation and D1/R2 coordination

- D1 metadata and R2 object compensation;
- conditional/immutable R2 writes;
- Asset identity preservation during higher-resolution replacement;
- replacement/rename race handling;
- production-only guards on destructive Asset/Case paths.

### Database constraints and migration correctness

- historical migration replay/compatibility;
- current schema/tag/taxonomy constraints;
- pre-0015 Case lifecycle compatibility;
- migration-specific learner/taxonomy/stimulus behavior.

These should remain fast unless profiling later demonstrates a genuinely material cost and an equally safe focused-selection mechanism is available.

### Learner semantics

- learning selection/persistence/provenance;
- System/Topic/Tag navigation and deduplication;
- question pool mode invariants;
- reusable-image question selection/card-count behavior;
- question scope and library behavior.

### Stimulus Family semantics

- Original/Alternative role integrity;
- make-original/deactivate/move/remove ordering;
- learner Core/Expanded selection semantics;
- façade/error identity during decomposition;
- prompt specificity and reusable coverage behavior.

### Imports and resumable runtime safety

- strict Import Package v1 behavior;
- rejection of obsolete/non-empty secondary Topic payloads;
- lease acquisition/renewal/cancellation semantics;
- bounded staged snapshots rather than monolithic ZIP execution;
- exact side-effect ordering and retry/idempotency behavior.

### Case lifecycle and taxonomy integrity

- deactivate/restore validation;
- one behaviorally active Primary Topic;
- Case Tag/classification staging and preflight-before-write behavior;
- inactive/recovery boundaries;
- concurrent classification safeguards.

These are all **KEEP IN FAST** by default. A test being old, ugly, source-based, or individually slow is not sufficient reason to remove these protections.

## 7. Duplication / maintenance findings

### PR104 UI source contract versus functional Case Library tests

- **A:** `admin-case-library-pr104-ui.test.js` checks several UI/source forms.
- **B:** `admin-case-library-pr104-filtering.test.js`, `admin-case-library-state.test.js`, `admin-case-library-topic-authoring.test.js`, `admin-case-library-classification.test.js` and related tests execute the state/domain/server behavior.
- **Unique contribution of A:** some interaction availability and layout/presentation wiring.
- **Strongest durable owner:** functional/state/domain tests for filtering, persistence, classification and mutations; a rendered UI test only for genuinely user-observable interaction requirements.
- **Recommendation:** consolidate; remove exact source-expression and CSS ownership from A.

### Taxonomy workspace source contracts versus staged/domain models

- **A:** `admin-taxonomy-workspace-contract.test.js`, `admin-taxonomy-case-tag-contract.test.js`, `admin-topics-form-contract.test.js`.
- **B:** `taxonomy-workspace-model.test.js`, `taxonomy-workspace-staging.test.js`, `taxonomy-hierarchy-staging.test.js`, `case-primary-topic-*`, `case-tag-*`.
- **Unique contribution of A:** route/component composition and control availability.
- **Strongest durable owner:** staged/domain models for mutation/preflight invariants.
- **Recommendation:** keep unique UI composition behavior, consolidate duplicated stage/preflight/source-expression checks.

### Case Images source contract versus stimulus/image domain tests

- **A:** `case-images-editor-layout.test.js`.
- **B:** `original-stimulus-semantics.test.js`, `stimulus-curation-editor-controls.test.js`, `simple-stimulus-curation.test.js`, `admin-image-workflow.test.js`, `image-management-v2.test.js`.
- **Unique contribution of A:** editor presentation/order and Image Library navigation.
- **Strongest durable owner:** stimulus/image domain tests for role semantics and mutation correctness.
- **Recommendation:** keep only unique rendered editor behavior in the UI family; move/retain role invariants in domain owners.

### Slide-review tests in ordinary discovery versus specialized command

- **A:** `node --test` auto-discovers all four `tools/slide-import-review/tests/*.test.js` files.
- **B:** `npm run slide-review:test` explicitly runs the same specialized test family when agent tooling identifies slide-review changes; `slide-review:build` adds a unique build check.
- **Unique contribution:** specialized command gives focused, subsystem-specific feedback; full `npm test` provides canonical complete coverage.
- **Recommendation:** exclude slide-review files from **fast** test selection, but keep them in canonical `npm test`/full. Retain the specialized command for focused tooling changes. Some duplicate execution during a full slide-review handoff is acceptable and explicit; do not create a second source of truth for the test contents.

### `svelte-check` versus raw UI-source tests

This is **not** wholesale duplication. `svelte-check` catches compiler/type/reactivity/a11y problems; it does not prove a max-width, button availability, role vocabulary, or taxonomy workflow. The correct cleanup is to remove incidental UI implementation contracts or replace them with behavioral owners, not to reduce `svelte-check` on the theory that Node source tests cover it.

### Runtime helper test versus runtime smoke

`test/wrangler-runtime-smoke.test.js` and `npm run runtime:smoke` are complementary, not duplicates. The Node file tests helper/cleanup logic cheaply; the specialized smoke exercises the installed runtime path. Keep the unit file fast and retain the conditional specialized smoke.

## 8. Proposed target model

### `npm test`

Keep `npm test` as the **canonical complete Node suite**.

It should continue to mean “run every maintained Node test that belongs to this repository,” including full-only/specialized families. This gives humans, CI full validation, and agents one unambiguous complete command.

Do **not** replace `npm test` with a fast subset.

### `npm run check`

Keep unchanged and broad:

```text
svelte-kit sync + svelte-check
```

No evidence from this audit justifies narrowing it.

### Introduce `npm run test:fast`, but not `test:full`

The eventual implementation should introduce a centrally owned fast test selector. `test:fast` should:

1. discover the same repository test universe as `npm test`;
2. treat newly discovered ordinary tests as **fast by default** unless explicitly classified otherwise;
3. exclude only a small explicit set of full/specialized files;
4. fail loudly if an explicit classified path no longer exists or selection logic becomes inconsistent;
5. avoid category inference from broad filename globs such as `*db*`, `*migration*`, or `*contract*`.

Recommended initial fast exclusions:

- `tools/slide-import-review/tests/**` — **SPECIALIZED ONLY for Draft fast**, still included in `npm test`/full; agent tooling already owns focused test/build requirements for this subsystem;
- `test/ecg-batch-01-asset-rename.test.js` — **KEEP IN FULL / operator-specialized**;
- `test/production-taxonomy-operator.test.js` — **KEEP IN FULL / operator-specialized**.

Everything else should remain fast initially, including DB, migration, import, Preview, auth, learner, stimulus, reusable-question, Case lifecycle, agent-contract, local-runtime helper, and Wrangler-authority tests.

This exclusion set is intentionally conservative. It may not be enough to achieve the desired speed target; measure before broadening it.

A separate `test:full` alias is not recommended initially because it would only alias `npm test` and create another name agents must learn. Add it later only if symmetry demonstrably improves tooling without obscuring the canonical complete command.

### Selection implementation shape

Prefer a small repository-owned selector module/script over shell globs in workflow YAML.

A robust design is:

```text
complete discovery
    -> npm test (unchanged canonical complete suite)

central fast selector
    -> discovers test files
    -> excludes an explicit small full/specialized manifest
    -> invokes node --test with the selected paths
```

The selector should default to fast rather than requiring all 109 files to be manually tagged. That avoids a 109-entry classification registry that becomes stale. The explicit manifest should contain only exceptions.

Node `--test-name-pattern` is not recommended as the main grouping mechanism because names are not stable metadata and categories cut across files. A new generalized metadata/tagging framework is also not justified at this suite size.

### `validate:fast`

Target composition:

```text
diff whitespace check
npm run test:fast
npm run check
```

The check descriptor for fast Node tests must live in `scripts/validation-contract.mjs` (or a helper owned by that contract). Do not add a hard-coded test list to `.github/workflows/ci.yml` or `validate-ci.mjs`.

### `validate:full`

Keep the current full architecture:

```text
diff whitespace check
npm run db:check
npm test
npm run check
npm run build
npm run auth:smoke:local
```

Do not silently add `runtime:smoke` or slide-review checks to universal full validation; those remain specialized unless a separate future decision changes their ownership.

### Agent guidance

Root `AGENTS.md` and `AGENT_TASK_MAP.md` should remain the human/agent instruction surface. Future prompts should say “use repository-owned validation” rather than paste a static list of test files. `agent:checks` should continue to surface specialized checks based on changed paths.

## 9. Test disposition plan

Runtime/cost is qualitative unless a representative CI duration was available. “Fast” below means it belongs in Draft fast validation, not that every assertion is individually trivial.

| Path / coherent group | Purpose / style | Runtime/cost evidence | Overlap | Risk if weakened | Recommended disposition | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| learner, question, Review and reusable-question behavior (`learning*`, `question-*`, `reusable-image-*`, `system-review-navigation`, `case-questions`) | functional/domain + D1 integration | many tens-of-ms tests; some ~100 ms | limited, mostly complementary layers | **High** | **KEEP IN FAST** | direct learner semantics and provenance/reuse safety |
| Stimulus Family behavior (`original-stimulus-semantics`, `stimulus-groups`, correctness checkpoints, curation, prompt/reusable coverage) | domain/integration + characterization | mixed; generally small-to-moderate | some overlapping characterization by design | **High** | **KEEP IN FAST** | Original/Alternative and selection/mutation invariants are safety/data-integrity critical |
| `stimulus-family-facade-contract.test.js` | architecture/source/import contract | cheap; one dependency-direction test ~10 ms observed | not replaced by behavior tests | **High during refactor** | **KEEP IN FAST** | public error identity and downward dependency direction are intentional architecture contracts |
| imports/resumable (`content-import*`, `resumable-*`, `primary-topic-import-guard`) | parsing, D1/R2/lease behavior, some source runtime guards | mixed, mostly moderate | layers are complementary | **High** | **KEEP IN FAST** | Worker resource safety, import correctness, idempotency and mutation ordering |
| Case lifecycle (`case-lifecycle*`) | D1/integration including pre-0015 compatibility | moderate | little duplication | **High** | **KEEP IN FAST** | destructive lifecycle/data recovery boundary |
| Preview/auth (`preview-*`, `auth-migration`, bootstrap tests) | ownership/auth/integration + deployment source contracts | cheap-to-moderate | runtime/config and domain layers differ | **High** | **KEEP IN FAST** | ownership and auth failures are high-impact |
| Asset/image/storage families | D1/R2 coordination, race handling, route behavior | some tests ~100–224 ms | complementary lifecycle layers | **High** | **KEEP IN FAST** | destructive storage coordination and identity preservation |
| schema/migration/taxonomy DB tests | migration replay, schema/domain staging | many observed cases only tens of ms | `db:check` adds schema/migration validation but not all behavior | **High** | **KEEP IN FAST** | no measured basis to defer; `db:check` is not a replacement for behavior tests |
| Case Library functional/state/topic/classification tests | helper/server/model behavior | mostly cheap/moderate | overlaps UI source contracts | Medium/High | **KEEP IN FAST** | strong owner for actual filtering/persistence/classification behavior |
| `admin-case-library-pr104-ui.test.js` | mixed raw Svelte/CSS/source contract | individually cheap | substantial overlap with functional/state tests | Medium | **CONSOLIDATE** | retain only unique rendered interaction/data-flow requirements; remove expression/CSS lock-in |
| `admin-taxonomy-workspace-contract.test.js`, `admin-taxonomy-case-tag-contract.test.js`, `admin-topics-form-contract.test.js` | mixed source architecture/UI contracts | cheap | model/staging/domain overlap | Medium/High | **CONSOLIDATE** | staged write/preflight semantics should live in domain/model tests; keep only unique composition behavior |
| `admin-case-editor-responsive-contract.test.js` | raw Svelte/CSS contract | cheap | limited functional replacement today | Medium | **KEEP, REWRITE BEHAVIORALLY** | real responsive/single-tree invariant, brittle exact implementation |
| `case-images-editor-layout.test.js` | raw Svelte/CSS/markup + vocabulary/navigation | ~sub-ms to few-ms assertions | overlaps stimulus/image semantics | Medium | **KEEP, REWRITE BEHAVIORALLY / CONSOLIDATE** | role/canonical-navigation intent matters; exact CSS/order does not |
| `stimulus-curation-editor-controls.test.js` | raw Svelte control contract | cheap | domain semantics elsewhere | Medium/High | **KEEP, REWRITE BEHAVIORALLY** | user ability to correct roles matters; exact source form does not |
| `performance-read-model.test.js` source prohibition | read-path regression/architecture | cheap | some functional performance/read-model coverage | Medium | **KEEP, REWRITE BEHAVIORALLY** | preserve bounded read invariant; avoid binding forever to a helper name |
| `admin-shared-questions-width-contract.test.js` | exact CSS source match | ~1.4 ms | no meaningful behavioral owner | Low | **REMOVE** | only exact width declaration is lost; no domain/safety behavior |
| `admin-horizontal-overflow-contract.test.js` | exact global CSS source match | ~1.25 ms | no actual overflow behavior | Low | **REMOVE** | implementation technique, not observable overflow invariant |
| `wrangler-authority-contract.test.js` | tooling/source architecture | cheap | runtime smoke checks a different layer | High operationally | **KEEP IN FAST** | prevents version/path authority drift |
| `wrangler-runtime-smoke.test.js` | unit tests for smoke helper/cleanup | very cheap | actual runtime smoke is separate | Medium | **KEEP IN FAST** | cheap unit confidence; do not confuse it with specialized smoke |
| local runtime/replica/Windows helper tests | pure/tooling/process-contract tests | mostly very cheap | specialized credential/manual checks differ | Medium | **KEEP IN FAST initially** | names sound heavy but tests are cheap; cross-platform regressions matter |
| `tests/agent-tooling.test.js`, `tests/agent-checks-report.test.js` | validation architecture/classifier, some real-Git subprocess tests | some observed ~50–192 ms | protects the validation mechanism itself | High for CI/tooling changes | **KEEP IN FAST initially** | fast contract must test its own authority; profile real-Git subset later before deferring anything |
| slide-review four test files | specialized parser/reviewer/build-source tests | one build/parse case ~203 ms; others mostly small | also run through focused `slide-review:test` | Low for unrelated app Drafts; high for tool changes | **SPECIALIZED ONLY in fast; KEEP IN npm test/full** | clear subsystem ownership and existing agent specialized check |
| `ecg-batch-01-asset-rename.test.js` | one-off production operator contract | cheap | not ordinary application behavior | High when operator is used | **KEEP IN FULL / SPECIALIZED** | important operator safety, but no need in every unrelated Draft |
| `production-taxonomy-operator.test.js` | production operator pre/postcondition safety | cheap | not ordinary application behavior | High when operator is used | **KEEP IN FULL / SPECIALIZED** | same rationale; do not remove while operator remains usable |
| `seed-content.test.js` | seed/fixture correctness | cheap | limited | Low/Medium | **KEEP IN FAST initially** | no measured gain from deferring; reassess only with profile evidence |

### Exact discovery inventory by primary group

This appendix makes the 109-file scope explicit so no major category disappears behind the summary table.

**Admin / Case Library / authoring UI (22):**
`admin-case-editor-layout`, `admin-case-editor-responsive-contract`, `admin-case-library-classification`, `admin-case-library-pr104-filtering`, `admin-case-library-pr104-ui`, `admin-case-library-search-performance`, `admin-case-library-state`, `admin-case-library-topic-authoring`, `admin-case-question-audit`, `admin-case-selection`, `admin-content`, `admin-editor-preview-contract`, `admin-horizontal-overflow-contract`, `admin-image-selection`, `admin-image-workflow`, `admin-shared-questions-width-contract`, `admin-taxonomy-case-tag-contract`, `admin-taxonomy-workspace-contract`, `admin-topics-form-contract`, `case-images-editor-layout`, `case-library-inactive-tags`, `case-library-unicode-search`.

**Taxonomy / Tags / classification (14):**
`case-primary-topic-staging`, `case-primary-topic-workspace-model`, `case-tag-bulk`, `case-tag-staging`, `case-tag-workspace-model`, `contextual-system-topic-tag-navigation`, `tag-library`, `tag-shared-behavior`, `tag-shared-schema`, `tagging-stage-b-admin-consistency`, `taxonomy-hierarchy-staging`, `taxonomy-workspace-model`, `taxonomy-workspace-staging`, `topic-library`.

**Assets / images / storage (12):**
`asset-higher-resolution-replacement`, `asset-library`, `asset-preview-isolation`, `asset-replacement-race-preview`, `case-assets`, `image-collection-rename-race`, `image-management-v2`, `image-serving`, `image-upload`, `r2-conditional-immutability`, `review-media-cache`, `storage`.

**Auth / Preview ownership (9):**
`auth-migration`, `bootstrap-admin`, `bootstrap-preview-admin`, `preview-auth`, `preview-deployment-contract`, `preview-workspace-case-lifecycle`, `preview-workspace-fixed-images`, `preview-workspace-foundations`, `preview-workspace`.

**Content import / lifecycle / integrity (12):**
`case-lifecycle-pre0015`, `case-lifecycle`, `content-guards`, `content-import-hardening`, `content-import-safety-contract`, `content-import`, `primary-topic-import-guard`, `resumable-content-import`, `resumable-import-contract`, `resumable-import-lease-safety`, `resumable-runtime-safety`, `seed-content`.

**Learner / questions / Review behavior (14):**
`case-questions`, `learning-db`, `learning-persistence`, `learning`, `library-pagination-pass-2`, `multi-topic-study-routes`, `question-library-unicode-search`, `question-library`, `question-pool-mode-invariants`, `question-scope`, `reusable-image-question-card-counts`, `reusable-image-question-safety-regression`, `reusable-image-questions`, `system-review-navigation`.

**Stimulus Family / stimulus semantics (11):**
`original-stimulus-semantics`, `simple-stimulus-curation`, `stimulus-audit`, `stimulus-curation-editor-controls`, `stimulus-family-correctness-checkpoint-a-boundaries`, `stimulus-family-correctness-checkpoint-a`, `stimulus-family-facade-contract`, `stimulus-family-live-prompt-trigger-alignment`, `stimulus-groups`, `stimulus-prompt-specificity-characterisation`, `stimulus-reusable-coverage-restoration`.

**Tooling / runtime / operators / migrations (9):**
`ecg-batch-01-asset-rename`, `local-replica`, `local-runtime`, `local-windows-cli`, `multi-topic-migration-d1`, `performance-read-model`, `production-taxonomy-operator`, `wrangler-authority-contract`, `wrangler-runtime-smoke`.

**Agent/validation tooling (2):**
`tests/agent-checks-report.test.js`, `tests/agent-tooling.test.js`.

**Slide-review tooling (4):**
`tools/slide-import-review/tests/build.test.js`, `core.test.js`, `review-fixes.test.js`, `source-coverage.test.js`.

All unqualified names in the first eight groups are `test/<name>.test.js`.

## 10. Incremental implementation checkpoints

Each checkpoint must be independently reviewable and leave the repository green. Do not combine these into one large deletion/refactor PR unless there is a compelling operational reason.

### Checkpoint A — validation selection infrastructure only

Goal: introduce the mechanism without changing test meaning.

- add the centrally owned fast test selector;
- add `npm run test:fast`;
- wire fast Node validation through `scripts/validation-contract.mjs`;
- leave full `npm test` canonical and unchanged;
- preserve workflow YAML as orchestration only;
- add contract tests proving full is a superset, explicit exclusions exist, and new ordinary tests default to fast;
- initially exclude only slide-review and the two production-operator files listed above;
- measure fast versus complete Node-stage runtime on comparable CI.

Do **not** delete or behaviorally rewrite tests in this checkpoint.

Decision gate: if the median Node stage does not improve meaningfully, do not broaden exclusions reflexively. Profile startup/process/file groups before making another coverage trade-off.

### Checkpoint B — obvious low-risk incidental contracts

Goal: remove known false-positive maintenance cost without touching safety/domain behavior.

- remove `admin-shared-questions-width-contract.test.js`;
- remove `admin-horizontal-overflow-contract.test.js`;
- prune clearly duplicated exact source-expression assertions from PR104 UI contracts only when their behavior is already owned by functional/state tests;
- keep `npm test`, fast, and full green.

This checkpoint is expected to improve refactor resilience, not runtime materially.

### Checkpoint C — behavioral replacements for valuable UI contracts

Do one coherent family at a time rather than a repository-wide rewrite:

1. Case editor responsive/single-tree behavior;
2. Case Images editor role/navigation behavior;
3. Stimulus curation controls;
4. taxonomy workspace/case-tag/topic authoring composition.

For each family:

- identify the exact user-visible or architectural invariant;
- add the stronger behavioral/render/domain owner first;
- only then remove the old raw-source assertion;
- avoid introducing a heavyweight browser stack solely to test incidental presentation details.

### Checkpoint D — source-contract consolidation

- consolidate taxonomy/PR104/image source contracts against the strongest domain/model owners;
- rewrite `performance-read-model` helper-name prohibitions toward query/read-bound behavior if practical;
- retain deliberate architecture-source contracts for Preview deployment, Wrangler authority, Stimulus façade/dependency direction, resumable runtime safety, and similar structural boundaries.

### Checkpoint E — runtime follow-up only if measurements require it

If Checkpoint A does not achieve the Draft latency target:

- collect per-file/process-level timings in a usable local environment or repeatable CI profiler;
- inspect module/bootstrap cost and repeated DB fixture setup;
- consider deferring only coherent low-risk tooling groups shown to be materially expensive;
- consider optimizing fixture/process startup before removing domain coverage;
- do not move safety-critical suites to full without explicit evidence and replacement feedback.

## 11. Acceptance criteria for eventual implementation

The eventual implementation is successful only if all of the following hold:

1. **Canonical complete suite preserved:** `npm test` remains the complete maintained Node test suite.
2. **No safety/domain coverage loss:** Production/Preview ownership, auth, destructive mutations, D1/R2 coordination, migration/schema correctness, learner selection/provenance, Stimulus Family semantics, reusable-question invariants, import safety, Case lifecycle, taxonomy integrity and data integrity remain protected by equivalent or stronger tests.
3. **Broad static checking retained:** `npm run check` remains broad unless a separate evidence-based decision changes it.
4. **One validation authority:** fast/full command composition remains owned by `scripts/validation-contract.mjs`; workflow YAML and agent tooling do not acquire independent ordinary-validation command lists.
5. **Draft validation is measurably faster:** use comparable CI or local measurements. Recommended gate: at least **20% median reduction in the Node-test stage across three comparable runs** versus the ~19.6 s audited baseline before claiming the test split itself is worthwhile. With the unchanged ~18.5 s Svelte check, this corresponds to roughly a 10% improvement in the current test+check portion of Draft validation.
6. **Ready/full coverage unchanged or stronger:** Ready-for-Review full validation still runs the complete Node suite plus current DB check, Svelte check, build and local auth/D1 smoke.
7. **Specialized checks remain conditional:** runtime smoke and slide-review build/test remain selected by subsystem needs rather than becoming universal gates without a separate decision.
8. **Legitimate refactors stop failing on incidental source form:** equivalent local-variable extraction, helper renaming, harmless markup reordering, or equivalent CSS implementation must not fail unless that structure is itself an intentional architecture/product contract.
9. **Deliberate structural contracts still fail usefully:** forbidden dependency direction, Preview deployment/resource drift, Wrangler-authority drift and resumable-import execution regressions continue to produce focused failures.
10. **Fast-selection maintenance is fail-safe:** a new ordinary test must not silently disappear from all Draft validation. New tests default to fast unless explicitly classified as full/specialized.
11. **No production mutation for validation:** no benchmark or validation step touches Production D1/R2.
12. **Incremental green checkpoints:** infrastructure, removal, rewrite and consolidation changes are independently reviewable and each leaves required validation green.

The 20% Node-stage target is a recommended engineering threshold, not a claim that the initial six-file exclusion will achieve it. The first implementation checkpoint must measure that.

## 12. Open decisions

These points require product/maintainer judgment during implementation planning rather than silent assumption:

1. **How much Draft latency justifies selection infrastructure?** Recommendation: require the 20% Node-stage median improvement above. If the conservative initial split cannot approach that, prefer fixture/process optimization over weakening domain coverage.
2. **Browser/component test infrastructure:** several valuable UI source contracts would be stronger as rendered behavior tests, but the repository does not currently justify adding a large browser/E2E stack only to preserve presentation details. Decide case-by-case whether a lightweight rendered component test is worth the infrastructure; otherwise remove incidental presentation assertions and keep domain behavior coverage.
3. **Exact UI vocabulary as product contract:** Stimulus role terms such as “Original”, “Alternative” and “Always shown” map directly to domain semantics and are more defensible as intentional vocabulary than ordinary button/help copy. Recommendation: preserve role vocabulary where ambiguity would affect authoring meaning; do not freeze unrelated copy.
4. **Production operator lifecycle:** `ecg-batch-01-asset-rename` and `production-taxonomy-operator` should remain covered while their operators remain runnable. Recommendation: full/specialized rather than Draft fast. If an operator is formally retired later, assess deletion of operator and test together in a separate cleanup.
5. **Agent-tooling subprocess cost:** real-Git agent report tests are among the more expensive observed individual tooling tests. Recommendation: keep them fast initially because they protect the validation authority itself; only split the subprocess subset after profiling proves a meaningful Draft cost and pure contract coverage remains fast.

## Audit self-review / evidence record

- PR #115 was inspected at head `9bab6211669d6b09371b7a8a257b927dc4c1647f` against intended base/current `main` `8a4b345b76a1e4a6900525fd2d572d8c2e8d7753` before this document update.
- The pre-audit PR diff contained only this documentation file.
- Root `AGENTS.md`, `docs/DOCUMENTATION_INDEX.md`, `docs/AGENT_TASK_MAP.md`, `package.json`, `scripts/validate.mjs`, `scripts/validation-contract.mjs`, `scripts/validate-ci.mjs`, `scripts/agent-checks.mjs`/helper behavior, ordinary PR CI workflow, representative source-contract tests, Git history, and the current CI log were inspected.
- Conclusions intentionally do not treat all source-regex tests as bad.
- Safety/domain families are explicitly protected above.
- Runtime numbers are identified as GitHub Actions measurements. No local timing is claimed.
- The proposed architecture preserves the repository-owned validation authority and keeps workflow orchestration thin.
- The implementation plan is split into independent checkpoints.
- No test, package script, validation script, workflow, application code, schema, migration, production resource or deployment was changed as part of this audit.
- PR #115 must remain Draft until a later implementation decision; this audit itself does not mark it Ready for Review.
