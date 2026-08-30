# Test Suite Audit

Status: audit complete / first source-contract consolidation tranche implemented in Draft PR #115

This document is the durable evidence record for PR #115. It audits the repository-wide Node test suite, `npm run check`, and the repository-owned validation architecture. The audit/planning work is complete, and this document now also records the first implemented source-contract consolidation tranche in the same Draft PR.

That implementation is intentionally narrow. It does not mean the later fixture-normalization, fast-tier, change-aware CI specialization, broader behavioral rewrite, or profiling checkpoints have been implemented by PR #115.

The implementation contract is `docs/NODE_TEST_SUITE_CLEANUP_PLAN.md`.

## 1. Executive findings

The audited baseline is broad but mostly valuable:

- `node --test` discovers 109 maintained test files;
- the audited green CI baseline ran 635 tests with 635 passing;
- the Node test stage was approximately 19.6 seconds;
- `npm run check` was approximately 18.5 seconds;
- `npm test` is the canonical complete Node suite;
- Draft `validate:fast` currently still runs the complete Node suite;
- Ready/non-Draft `validate:full` runs the complete Node suite plus the repository's additional full checks.

The original audit hypothesis was only partly correct. There is a meaningful cluster of brittle source-level UI contracts, but source-reading itself is not the problem. Several source/configuration contracts protect real architectural or operational boundaries and should remain.

Two corrections from independent review materially change the recommended plan:

1. **Static `test:fast` exclusions are unsafe with the current CI architecture.** The repository's path classifier knows about specialized slide-review checks, but `agent:checks` reports requirements; ordinary CI does not currently execute those change-aware requirements. The two production-operator tests do not even have named specialized checks today. Therefore the six proposed exclusions must remain in Draft coverage until CI itself can conditionally require their checks for related changes.
2. **The two proposed unconditional UI-test removals were over-classified.** Both were introduced alongside deliberate UX fixes and protect intentional regression outcomes, albeit through brittle source assertions. They must be rewritten, retained, or consciously retired after confirming the product invariant; they are not automatic deletions.

PR #115 has now implemented only the first source-contract consolidation tranche. Independent review of that tranche confirmed the core consolidation principle but also showed that domain/model coverage is not automatically a replacement for UI reachability. The corrected tranche therefore keeps thin UI/data-flow owners for Case Images information architecture, post-curation Original reassignment, the unified taxonomy staged-review/apply flow, and Case Library workflow wiring while leaving deep semantics under stronger helper/model/server/DB tests.

The overall direction remains:

- improve CI failure readability;
- normalize unsupported partial-schema fixtures;
- keep `npm test` complete;
- introduce a conservative fast tier without coverage holes;
- preserve broad `svelte-check`;
- consolidate brittle/duplicated contracts only when the protected invariant is understood;
- profile before weakening high-value domain coverage.

## 2. Current validation architecture

### Complete Node suite

`package.json` defines:

```text
npm test -> node --test
```

Node discovery currently reaches:

- `test/` — 103 files;
- `tests/` — 2 files;
- `tools/slide-import-review/tests/` — 4 files.

Total: 109 files.

`npm test` should continue to mean the complete maintained Node suite.

### Svelte/compiler checks

`npm run check` is:

```text
svelte-kit sync && svelte-check --tsconfig ./jsconfig.json
```

It catches compiler/static/reactivity/accessibility problems that raw-source Node tests do not replace. The audit found no evidence for narrowing it.

Recommendation: keep it in both fast and full validation.

### Current fast/full composition

The repository-owned authority is `scripts/validation-contract.mjs`.

Current fast mode:

```text
diff whitespace check
npm test
npm run check
```

Current full mode:

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
Draft PR            -> fast
Ready/non-Draft PR  -> full
Draft -> Ready      -> full on that head
newer same-PR run   -> supersedes/cancels older run
```

The workflow does not currently run the path classifier to add specialized checks.

### Agent classifier behavior

`agent:checks` uses `scripts/agent-checks-lib.mjs` to classify changed paths.

The classifier currently knows that:

```text
tools/slide-import-review/**
  -> slideReviewTest
  -> slideReviewBuild
```

However, this is advisory/reporting behavior for agents. It is not currently ordinary CI execution.

This distinction is critical: the existence of a named check or classifier rule does not make a static generic-fast exclusion safe.

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

## 4. CI diagnostics problem

The original audit found that Node-test failures were difficult to locate in CI output. Current `main` now includes the separate PR #117 connector-readable/structured Node-test diagnostics work. That upstream change did not alter the complete-suite contract and is not part of PR #115's source-contract consolidation.

The durable diagnostics requirements remain:

- preserve the same executed tests;
- keep `npm test` unchanged;
- keep CI presentation compact;
- use Node test events/custom reporter machinery for structured failure extraction;
- do not parse `dot`/`spec` human reporter text as a programmatic API;
- show failures prominently near the end with name, location, message, expected/actual when available, and useful stack;
- preserve/improve GitHub `::error` annotations and connector-readable failure records.

## 5. Schema-fixture finding

The suite contains ordinary application tests that manually apply selected historical migration subsets or inline partial application schemas, then execute current application code.

That is architecturally different from a real migration test.

The durable distinction should be:

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

### Original static-exclusion proposal

The earlier audit proposed excluding from Draft fast validation:

```text
tools/slide-import-review/tests/build.test.js
tools/slide-import-review/tests/core.test.js
tools/slide-import-review/tests/review-fixes.test.js
tools/slide-import-review/tests/source-coverage.test.js
test/ecg-batch-01-asset-rename.test.js
test/production-taxonomy-operator.test.js
```

The rationale was that they are specialized and unnecessary for unrelated Drafts.

That rationale is reasonable; the static implementation is not.

### Why static exclusion is currently unsafe

For slide-review:

- dedicated `slideReviewTest` and `slideReviewBuild` named checks exist;
- the path classifier requires them for `tools/slide-import-review/**` changes;
- ordinary CI does not currently execute the classifier's change-aware requirements.

Therefore a Draft changing slide-review code could pass generic fast validation while running none of the excluded slide-review tests.

For the two production operators:

- their tests protect fail-closed precondition/postcondition behavior around production mutation scripts;
- there are currently no corresponding specialized named checks in `validation-contract.mjs`;
- static exclusion would therefore create an even clearer coverage hole.

### Corrected rule

**A test may leave generic Draft fast coverage only after ordinary CI has a centrally owned, tested mechanism that makes its relevant specialized check mandatory when related code changes.**

Until that is implemented, all six files remain in Draft fast coverage.

### Required change-aware ownership before exclusions

The future implementation should:

1. keep changed-path classification centrally owned and reusable;
2. make `validate-ci.mjs` consume that central classification for the actual PR diff, not merely report it through `agent:checks`;
3. add specialized operator checks for:
   - `scripts/rename-ecg-batch-01-assets.mjs` + `test/ecg-batch-01-asset-rename.test.js`;
   - `scripts/apply-agreed-taxonomy.mjs` + `test/production-taxonomy-operator.test.js`;
4. require slide-review test/build checks for slide-review changes;
5. require the corresponding operator test for operator-script/test changes;
6. deduplicate checks already satisfied by full `npm test` where appropriate;
7. fail safe for unclassified important tooling paths.

Only after those conditions are proven may the six tests be omitted from **unrelated** Drafts.

## 9. Corrected target validation architecture

### Canonical complete suite

```text
npm test
  -> all maintained Node tests
```

### Draft base validation

Initially, before conditional specialized ownership exists:

```text
diff whitespace
npm run test:fast   # initially equivalent in coverage to npm test
npm run check
```

The first selector rollout is allowed to provide **zero exclusions**. Its purpose is to establish safe infrastructure and default-to-fast semantics without reducing coverage.

### Change-aware Draft validation

After central conditional ownership exists:

```text
base fast checks
  + specialized checks required by changed paths
```

For an unrelated application Draft, specialized slide/operator tests may be omitted.

For a related Draft, CI must add them back automatically.

### Ready/full validation

```text
diff whitespace
npm run db:check
npm test
npm run check
npm run build
npm run auth:smoke:local
+ any additional specialized non-duplicated checks required by changed paths
```

For example, `npm test` already covers the slide-review test files and operator tests in full mode, but a slide-review build requirement may still need to be added for a slide-review change.

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
| slide-review tests | KEEP IN FAST until CI conditional ownership exists; then specialized for related Drafts and complete in full |
| ECG production-operator test | KEEP IN FAST until named conditional check exists; then specialized for related Drafts and complete in full |
| taxonomy production-operator test | KEEP IN FAST until named conditional check exists; then specialized for related Drafts and complete in full |

## 11. Measurement gate

The fast-tier infrastructure should not be declared successful merely because some tests were excluded.

Measure at least three comparable GitHub Actions runs and compare medians for:

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
5. only then exclude specialized tests from unrelated Drafts;
6. preserve intentional UX regressions while replacing brittle assertion forms where practical;
7. consolidate duplicated source contracts;
8. profile remaining runtime before trading away high-value coverage.

PR #115 remains Draft and currently implements only the first source-contract consolidation tranche described above. Later cleanup/selection/fixture/performance checkpoints remain pending.