# Test Suite Audit

Status: audit complete / Checkpoint 4 source-contract consolidation/review, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test infrastructure, Checkpoint 2B change-aware specialized CI, Checkpoint 2C named production-operator validation ownership, Checkpoint 2D safe exclusion activation, Checkpoint 3 intentional UX regression review, and all five bounded Checkpoint 5 behavioral rewrites implemented and independently corrected in Draft PR #115: Case-editor responsive, Case Images, Stimulus curation, performance/read-model, and reusable-image safety

This document is the durable evidence record for PR #115. It audits the repository-wide Node test suite, `npm run check`, and the repository-owned validation architecture. The audit/planning work is complete, and this document now also records completed Checkpoint 4 source-contract consolidation/review, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test selection infrastructure, Checkpoint 2B change-aware specialized CI, Checkpoint 2C named production-operator checks, Checkpoint 2D activation of the six approved specialized exclusions plus the independent-review correction to slide-review production dependency ownership, Checkpoint 3 review of the two intentional UX regression contracts, and all five bounded Checkpoint 5 rewrites in the same Draft PR: Case-editor responsive, Case Images, Stimulus curation, performance/read-model, and reusable-image safety.

Those implementations remain intentionally bounded. Checkpoint 2D reduces generic unrelated-Draft fast selection by exactly six maintained specialized files while retaining complete `npm test` coverage and central related-Draft specialized ownership. Checkpoint 3 retains both intentional UX regression contracts because the repository has no cheap layout-capable rendered test layer that would provide a stronger owner; independent review then required a narrow hardening of the horizontal-overflow source assertion so the retained owner cannot false-green on a declaration in another CSS rule. Checkpoint 4 is complete for the audited primary source/UI inventory after five bounded consolidation tranches plus the separate Stimulus Family façade `RETAIN` review. Checkpoint 5 is complete after five bounded subsystem rewrites and the final independent-review correction described below. Additional exclusions and profiling remain separate later work.

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
- Checkpoint 4 completed five bounded source/UI consolidation tranches plus the explicit Stimulus Family façade `RETAIN` review, removing only assertions with demonstrably stronger owners or incidental implementation detail while preserving distinct UI/architecture reachability;
- Checkpoint 5 completed five bounded behavioral rewrites: Case-editor responsive, Case Images, Stimulus curation, performance/read-model, and reusable-image safety;
- the final independent Checkpoint 5 review found three false-green ownership paths in the two UI-oriented owners, all corrected test-only: reusable mutation forms are now checked across every matching form with branch-aware Svelte `{:else if}`/`{:else}` handling; ordinary and assigned Case-image card branches each prove their own linked Q&A data flow; and the actual visible Manage-questions button now owns its option-editor target and callback;
- the reusable-image tranche moves production scope, exact Case/Asset identity, safe opt-in removal, fixed-image conversion atomicity and D1 defense-in-depth to executable current-schema owners, while preserving production form/action reachability, exact serialization/delegation, Preview mutation-surface absence, manager context, Manage-questions focus, semantic count vocabulary and inactive-review presentation as thin source/data-flow owners;
- Ready/non-Draft `validate:full` continues to run complete `npm test` plus the repository's additional full checks, with structural deduplication for specialized Node coverage already satisfied by complete `test`.

The original audit hypothesis was only partly correct. There is a meaningful cluster of brittle source-level UI contracts, but source-reading itself is not the problem. Several source/configuration contracts protect real architectural or operational boundaries and should remain.

The recurring independent-review lesson is that a thinner source contract must still prove the exact boundary it claims to own. That applies both across files/actions and within Svelte control-flow/card branches: global source fragments or a single safe duplicate are not enough when the invariant is production-only reachability or branch-specific rendering.

## 2. Current validation architecture

### Complete Node suite

```text
npm test -> node --test
```

Current maintained discovery is 110 files. Checkpoint 2D's exact six specialized exclusions leave generic Draft fast selection at 104 files; complete `npm test` still contains all 110.

### Fast selection authority

The repository-owned selector remains:

```text
scripts/test-selection.mjs
scripts/test-fast.mjs
```

The exact active exclusions remain:

```text
tools/slide-import-review/tests/build.test.js
tools/slide-import-review/tests/core.test.js
tools/slide-import-review/tests/review-fixes.test.js
tools/slide-import-review/tests/source-coverage.test.js
test/ecg-batch-01-asset-rename.test.js
test/production-taxonomy-operator.test.js
```

No seventh exclusion was added by Checkpoint 5 or its independent-review correction.

### Svelte/compiler checks

`npm run check` remains broad and unchanged:

```text
svelte-kit sync && svelte-check --tsconfig ./jsconfig.json
```

### Current fast/full composition

Fast mode:

```text
diff whitespace check
npm run test:fast
npm run check
```

Full mode:

```text
diff whitespace check
npm run db:check
npm test
npm run check
npm run build
npm run auth:smoke:local
```

Specialized checks continue to be added centrally from the actual PR feature diff and deduplicated through explicit satisfaction rules.

## 3. Runtime baseline and measurement boundary

The audited green baseline was approximately 19.6 seconds for Node tests and approximately 18.5 seconds for `npm run check`.

Checkpoint 2D established a real file-selection reduction from 110 selected / 0 excluded to 104 selected / 6 excluded. Checkpoint 5's implementation runs varied materially without any controlled profiling: for example, CI #1366 reported about 14.77 seconds for 630 fast tests, CI #1370 about 15.00 seconds for 629 tests, CI #1372 about 20.51 seconds for 629 tests, and independent-review corrective CI #1375 about 19.59 seconds for the same 629-test fast suite. These are not comparable measurement runs and are **not** evidence of a material speedup.

Checkpoint 6 therefore remains pending and requires at least three comparable runs with median analysis before any latency claim or additional exclusion.

## 4. Schema-fixture finding

Current application behavior tests should execute current application code against the current supported schema. Historical schemas remain appropriate only where migration/upgrade behavior is itself under test; older product states should otherwise be represented as data inside the current schema.

Checkpoint 1 normalized the audited ordinary D1-backed fixtures to `applyCurrentSchema(...)` while retaining genuine migration tests. No production missing-table/missing-column fallback was restored for stale fixtures.

## 5. Source-contract ownership rule

The durable hierarchy is:

1. domain/helper behavior for pure semantics;
2. server/action/query behavior for server-owned semantics;
3. rendered/component behavior for user-observable reachability where practical;
4. thin source/data-flow ownership when UI wiring or architecture itself is the invariant and no stronger cheap rendered owner exists;
5. raw implementation text only when no stronger practical owner exists and the regression remains important.

Domain behavior does not automatically replace distinct UI reachability, workflow wiring, architecture, or semantic product vocabulary. Conversely, a source/data-flow owner is only valid when it proves the exact active branch/control/form/card boundary rather than merely finding compatible fragments somewhere in the file.

## 6. Completed Checkpoint 4 source-contract consolidation

Checkpoint 4 is complete for the audited primary inventory after five bounded consolidation tranches plus the Stimulus Family façade retain review.

Key outcomes:

- Case Library and Taxonomy contracts retain thin UI/workflow owners while direct helpers/DB tests own semantics;
- Admin Topic/System authoring retains creation/form/action/hierarchy reachability and retired/current vocabulary, while duplicated mutation-error source text was removed;
- Wrangler local-preview plan semantics moved to executable plan tests while local-auth/wrapper authority remains a thin architecture contract;
- Admin/Preview Case-editor parity removed duplicated image-question vocabulary/workflow while retaining production-editor composition, Preview action/data/form parity, question-scope delegation, and Preview Study isolation;
- Preview deployment retains deployment/config/credential/auth/route/logout architecture while production data isolation moved to executable DB owners;
- `stimulus-family-facade-contract.test.js` remains explicitly retained because public constructor identity and forbidden dependency direction are architecture invariants;
- `content-import-safety-contract.test.js` remains classified as behavioral safety coverage, and `resumable-import-contract.test.js` remains retained for its operational architecture/migration boundaries.

## 7. Completed Checkpoint 5 behavioral rewrites

### First bounded tranche — Case-editor responsive

`test/admin-case-editor-responsive-contract.test.js` moves pure layout preference/storage semantics to the executable helper owner while retaining one-tree composition, in-place switching, Case Question form/scope/reorder reachability, exact viewport restoration, bounded editor behavior and minimum responsive layout structure. Final hardening rejects layout-selected local Svelte subtrees that own authoring forms, independent of current component names/import paths.

### Second bounded tranche — Case Images

`test/case-images-editor-layout.test.js` leaves deep role/reusable semantics under DB/helper owners while executing actual role/anchor expressions and retaining learner-visible role/Q&A composition, Advanced role-workflow reachability and the canonical `#images` handoff. The final independent-review correction isolates the `ordinaryImages` and `assignedImages` `{#each}` branches separately and requires each branch to construct its own `imageQuestions`, gate/render its own `.image-questions` container, iterate that collection, and visibly consume scope/Prompt/Answer/Q/A. An ordinary-image Q&A block can therefore no longer mask removal of assigned Original/Alternative Q&A.

### Third bounded tranche — Stimulus curation

`test/stimulus-curation-editor-controls.test.js` leaves role mutation/history/rollback semantics under DB-backed owners while executing actual gating/selection/filter expressions, scoping form payloads and writer calls to their workflows, requiring real submit controls, and explicitly protecting both Always-shown→Alternative and Alternative→Always-shown reachability.

### Fourth bounded tranche — Performance/read-model

`test/performance-read-model.test.js` no longer reads `case-assets.js` source or freezes `listAdminCases`/`getAdminCaseById` helper names. The D1 fixture records executed SQL and bind parameters so dashboard bounds, database-side aggregation and the real Case-editor consumer's exact-ID `LIMIT 1` read are observable behavior contracts.

Final performance/read-model test-only head `912fdaf1e0e2d302ddf2f88f2f2ce93c3c84d54b` passed CI #1366/runtime-smoke #193. Documentation-reconciled head `63bd65441a7250c47f8c54ae6ebb1ba3bd83ef72` passed CI #1368/runtime-smoke #195 before reusable-image safety began.

### Fifth bounded tranche — Reusable-image safety

Target:

```text
test/reusable-image-question-card-counts.test.js
```

Protected safety/product invariants:

- reusable Asset Questions remain production-owned and cannot be backed by Preview Assets or Preview Prompts;
- the loader excludes inactive reusable Questions and inactive canonical Prompts while preserving deterministic creation ordering;
- fixed and option contexts retain total/used/available semantics and dormant opt-ins recover on canonical reactivation;
- option reuse requires the option to belong to the submitted Case and the reusable Question to belong to the exact same Asset;
- invalid wrong-Case/wrong-Asset removal attempts preserve a valid opt-in; validated exact removal deletes it;
- fixed-image reuse validates exact Asset identity before destructive conversion and then atomically creates an option-backed Family, sets the converted option Original, preserves caption, creates the opt-in and removes the old fixed relation;
- current-schema D1 triggers independently reject Preview-backed reusable Questions and option/Question Asset mismatches;
- production create/edit/reuse/remove workflows retain exact form serialization and scoped route delegation while Preview exposes no matching mutation actions;
- fixed versus option cards pass distinct reusable manager identity context, and Manage questions reveals, scrolls to and focuses the exact option editor;
- Case-specific versus Reusable Image Question vocabulary remains tied to visible counts/content;
- Compact audit participation derives from live Family, option and Asset activity and visibly marks non-participating content inactive.

The target directly executes current-schema behavior through `createAssetQuestion`, `optInAssetQuestion`, `optInFixedAssetQuestion`, `removeAssetQuestionOptIn`, `setAssetQuestionActive`, `listCaseImageQuestionSummaries`, `createStimulusGroup` and `addStimulusOption`, plus the current D1 triggers. Raw source checks over loader SQL/filter/order details and generic helper-symbol bans are removed where executable behavior is stronger.

Thin source/data-flow ownership remains only for the distinct production form/action reachability, exact serialized fields and writer mapping, Preview action absence, manager context, option-editor target/focus behavior, semantic ownership vocabulary and inactive-review presentation.

Self-review sequence:

1. initial rewrite head `1d42ac9cd60c84ec8f8e2f30ca0ef2713733b048` moved principal production scope/identity/conversion/removal semantics into executable current-schema behavior and passed CI #1369/runtime-smoke #196;
2. final self-review found create/edit route-delegation and direct D1 defense-in-depth gaps. Hardened head `1b3c124ffc3b81c083e6a1da48ba5d021505c4ec` added scoped create/save writer assertions and direct Preview-backing/exact-Asset trigger execution, then passed CI #1370/runtime-smoke #197.

Independent review then found two reusable-owner false-green paths plus the Case Images Q&A gap described above:

1. `activeIfConditionsAt()` understood only `{#if}`/`{/if}`, so a mutation form moved into an `{:else}` branch could still appear to be guarded by `!previewMode`; the form helper also checked only the first form for each action. The corrected owner uses branch-aware `{#if}` / `{:else if}` / `{:else}` / `{/if}` tracking and validates **every** matching create/edit/reuse/remove form, so a safe first form cannot mask an unguarded duplicate;
2. Manage-questions reachability was previously assembled from unrelated file-wide fragments. The corrected owner locates the actual visible option-card toggle button and requires that same control to carry the Manage/Close label expression, exact `aria-controls` target, `aria-expanded` state and `onclick={() => selectOption(option.id)}` callback before separately verifying the target section and tick/scroll/focus handler.

The independent-review correction changed only:

```text
test/reusable-image-question-card-counts.test.js
test/case-images-editor-layout.test.js
```

Test-only corrective head `fb6d34b0c282168b061cc580ab484108c191bfab` passed Draft CI #1375 with **110 maintained / 104 selected / 6 excluded, 629/629 fast Node tests, 0 Svelte errors / 5 existing warnings, ECG 6/6, taxonomy 3/3, slide-review 23/23 and slide-review build**; runtime-smoke #202 passed.

The fast assertion count remains 629 and the maintained-file discovery / 104-selected / 6-excluded boundary is unchanged.

No production component, route, DB/domain implementation, schema/migration, workflow, validation architecture, fast exclusion, browser dependency, application behavior, deployment, or production resource changed in Checkpoint 5 or its independent-review correction.

### Checkpoint 5 completion gate

The test-only independent-review correction is green at `fb6d34b0c282168b061cc580ab484108c191bfab` (CI #1375 / runtime-smoke #202). The final gate is repository-owned CI and runtime-smoke on the documentation-reconciled PR head after this audit update. This document intentionally does not embed that future head SHA, so recording the evidence cannot invalidate the head it describes.

Checkpoint 5 is complete once that exact documentation-reconciled head is green and receives the intended independent acceptance. Checkpoint 6 remains separate and has not started.

## 8. High-value coverage that must remain effective

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

## 9. Current validation architecture after Checkpoint 5

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

## 10. Test disposition summary

| Group | Revised disposition |
| --- | --- |
| learner/question/reusable behavior | KEEP IN FAST |
| Stimulus Family semantics | KEEP IN FAST |
| imports/resumable safety | KEEP IN FAST; architecture/migration owners retained where distinct |
| Preview/auth/ownership | KEEP IN FAST |
| Asset/R2 safety | KEEP IN FAST |
| schema/migration/taxonomy behavior | KEEP IN FAST unless later measured evidence and safe conditional ownership justify otherwise |
| deliberate architecture/source contracts | KEEP |
| Checkpoint 4 source/UI candidates | COMPLETE: consolidated, reclassified, or explicitly retained |
| Case-editor responsive | CHECKPOINT 5 COMPLETE: executable helper semantics + thin composition/layout owner |
| Case Images | CHECKPOINT 5 COMPLETE: deep DB/helper semantics + branch-specific visible composition/workflow owner after independent correction |
| Stimulus curation | CHECKPOINT 5 COMPLETE: DB-backed role semantics + thin production control/data-flow owner |
| performance/read-model | CHECKPOINT 5 COMPLETE: observable SQL/bind/consumer behavior replaces helper/source-name ownership |
| reusable-image safety | CHECKPOINT 5 COMPLETE: current-schema loader/helper/D1 behavior owns deep safety; branch-aware all-form Preview isolation and actual Manage-questions control own the surviving UI reachability |
| Shared Questions width regression | RETAINED IN CHECKPOINT 3 |
| application horizontal-overflow regression | RETAINED/HARDENED IN CHECKPOINT 3 |
| slide-review tests | exactly four specialized fast omissions with central related-change ownership; complete `npm test` retains them |
| ECG production-operator test | specialized fast omission with named related-change owner; complete `npm test` retains it |
| taxonomy production-operator test | specialized fast omission with named related-change owner; complete `npm test` retains it |

## 11. Measurement gate

Checkpoint 2D establishes a real file-selection reduction; Checkpoint 5 is complete but does not establish a material performance improvement.

Before making any fast-tier performance claim, Checkpoint 6 must measure at least three comparable GitHub Actions runs and compare medians for:

- complete Node stage;
- fast Node stage;
- `npm run check`;
- total Draft validation;
- selected/excluded file counts;
- executed test counts.

Target: at least **20% median reduction in the Node stage** before describing the fast tier as materially worthwhile.

If the six safe exclusions do not achieve that, profile process/file startup, repeated migrations/fixtures, subprocess-heavy tests, file fragmentation, concurrency/scheduling and module initialization before weakening additional coverage.

## 12. Final audit conclusion

The suite should not be broadly purged.

The defensible cleanup sequence is now established and implemented through Checkpoint 5:

1. readable CI failures;
2. current-schema ordinary fixtures;
3. exclusion-based fast infrastructure with complete `npm test` preserved;
4. central change-aware specialized ownership;
5. named production-operator checks;
6. exactly six safe specialized fast omissions;
7. explicit retention/hardening of intentional UX regressions;
8. bounded source-contract consolidation around demonstrably stronger owners;
9. five bounded behavioral rewrites around the strongest cheap owners, preserving distinct UI/route/architecture reachability and hardened after independent review against branch/duplicate/control false greens;
10. only after the exact documentation-reconciled completion gate and independent acceptance proceed to separate Checkpoint 6 profiling/measurement before considering any further exclusion or latency claim.

PR #115 remains Draft. Checkpoint 4 is complete. Checkpoint 5's five implementation families plus the final independent-review corrective tranche are complete and test-only correction head `fb6d34b0c282168b061cc580ab484108c191bfab` passed Draft CI #1375 and runtime-smoke #202. The remaining completion action is the exact-head gate after this documentation reconciliation. Checkpoint 6 has **not** started. No seventh exclusion, application/domain behavior change, schema/migration change, deployment, production mutation, or performance claim is part of this gate.
