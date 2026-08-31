# Test Suite Audit

Status: audit complete / Checkpoint 4 source-contract consolidation/review, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test infrastructure, Checkpoint 2B change-aware specialized CI, Checkpoint 2C named production-operator validation ownership, Checkpoint 2D safe exclusion activation, Checkpoint 3 intentional UX regression review, all five bounded Checkpoint 5 behavioral rewrites independently accepted, and Checkpoint 6 controlled runtime measurement/profiling complete in Draft PR #115

This document is the durable evidence record for PR #115. It audits the repository-wide Node test suite, `npm run check`, and the repository-owned validation architecture. It now records the completed Checkpoint 4 source-contract consolidation/review, Checkpoint 1 current-schema fixture normalization, Checkpoint 2A fast-test selection infrastructure, Checkpoint 2B change-aware specialized CI, Checkpoint 2C named production-operator checks, Checkpoint 2D activation of the six approved specialized exclusions plus the independent-review correction to slide-review production dependency ownership, Checkpoint 3 review of the two intentional UX regression contracts, all five bounded Checkpoint 5 rewrites, and Checkpoint 6's controlled measurement/profiling result.

Those implementations remain intentionally bounded. Checkpoint 2D reduces generic unrelated-Draft fast selection by exactly six maintained specialized files while retaining complete `npm test` coverage and central related-Draft specialized ownership. Checkpoint 3 retains both intentional UX regression contracts because the repository has no cheap layout-capable rendered test layer that would provide a stronger owner. Checkpoint 4 is complete for the audited primary source/UI inventory after five bounded consolidation tranches plus the separate Stimulus Family façade `RETAIN` review. Checkpoint 5 is complete after five bounded subsystem rewrites and the final independent-review correction. Checkpoint 6 found that the six-file fast tier reduces median Node-stage wall time by only 3.4117469272617313%, far below the 20% materiality gate, and therefore does not authorize another exclusion. Profiling identifies distributed ordinary DB-heavy fixture/setup cost as a higher-value measured optimization area; runner/file fragmentation remains a separate benchmark hypothesis rather than an established cost driver.

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
- Checkpoint 2D activates exactly six approved specialized exclusions from generic unrelated-Draft `test:fast`; current discovery is 110 maintained, 104 selected and 6 excluded;
- Checkpoint 3 reviewed the Shared Questions width and application horizontal-overflow regressions and retained both source contracts because no practical stronger cheap/reliable layout owner exists in the repository; independent review then hardened the horizontal-overflow assertion to ensure the required declaration is actually inside the `body` rule;
- Checkpoint 4 completed five bounded source/UI consolidation tranches plus the explicit Stimulus Family façade `RETAIN` review, removing only assertions with demonstrably stronger owners or incidental implementation detail while preserving distinct UI/architecture reachability;
- Checkpoint 5 completed five bounded behavioral rewrites: Case-editor responsive, Case Images, Stimulus curation, performance/read-model, and reusable-image safety;
- the final independent Checkpoint 5 review found three false-green ownership paths in the two UI-oriented owners, all corrected test-only: reusable mutation forms are checked across every matching form with branch-aware Svelte `{:else if}`/`{:else}` handling; ordinary and assigned Case-image card branches each prove their own linked Q&A data flow; and the actual visible Manage-questions button owns its option-editor target and callback;
- independently accepted Checkpoint 5 head `67e874625afbd363c3211dcc1660593831a6f30c` passed Draft CI #1376 and Wrangler runtime-smoke #203;
- Checkpoint 6 measured four corrected comparable complete/fast samples on fixed head `9cb814a0d5c280a49f98b92b1b7203a86f8562a8`: complete median 19.8520 s versus fast median 19.1747 s, an absolute median difference of 0.6773 s or 3.4117469272617313%;
- the **20% Node-stage materiality target was not met**;
- on those same four CI attempts, `npm run check` median was 17.7247464 s and actual repository-owned total Draft validation median was 37.99135485 s;
- the current PR feature diff required `ecgAssetRenameOperatorTest`, `productionTaxonomyOperatorTest`, `slideReviewTest`, and `slideReviewBuild`; their combined observed Draft contribution had a median of 0.97222145 s and was kept separate from generic fast-suite cost;
- three complete-suite file profiles on profiling head `aefaa303722528ca52707a700b82cb80a1416d50` showed the six excluded files together at only about 0.35 s summed file time per run, while the top ten ordinary files accounted for about 7.6–7.9 s of summed file time;
- no seventh exclusion was activated, and Checkpoint 6 does not recommend one without a separately reviewed evidence package satisfying the existing conditional-specialization rules;
- Ready/non-Draft `validate:full` continues to run complete `npm test` plus the repository's additional full checks, with structural deduplication for specialized Node coverage already satisfied by complete `test`.

The original audit hypothesis was only partly correct. There is a meaningful cluster of brittle source-level UI contracts, but source-reading itself is not the problem. Several source/configuration contracts protect real architectural or operational boundaries and should remain.

The recurring independent-review lesson is that a thinner source contract must still prove the exact boundary it claims to own. Checkpoint 6 adds a second lesson: deleting or specializing a small number of cheap files is not a substitute for profiling measured ordinary-fixture costs and separately benchmarking plausible runner-level hypotheses.

## 2. Current validation architecture

### Complete Node suite

```text
npm test -> node --test
```

Current maintained discovery is 110 files. Checkpoint 2D's exact six specialized exclusions leave generic Draft fast selection at 104 files; complete `npm test` still contains all 110. On the Checkpoint 6 measurement head the complete suite executed 664 tests and the fast suite executed 629.

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

Exactly six exclusions remain after Checkpoint 6. No seventh exclusion was activated.

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

## 3. Runtime measurement — Checkpoint 6

### Methodology

Controlled complete/fast measurement used fixed PR head:

```text
9cb814a0d5c280a49f98b92b1b7203a86f8562a8
```

The evidence is CI #1378 (`33342681005`), rerun as four job attempts against the same PR head/merge state. Every corrected attempt used GitHub-hosted `ubuntu-24.04`, runner-image version `20260823.283.1`, Node `v22.23.2`, npm `10.9.8`, a fresh checkout and `npm ci`. Complete and fast commands were executed after the same dependency install, and command order was alternated by attempt to reduce order/warm-state bias:

```text
attempt 1: complete, fast
attempt 2: fast, complete
attempt 3: complete, fast
attempt 4: fast, complete
```

The measured commands remained the production repository commands:

```text
npm test
npm run test:fast
```

A first instrumentation experiment on head `547ea9898b526703e2c35b7723720fc2cec5e912` / CI #1377 injected reporter identity into the complete-suite environment. That changed the environment observed by `tests/test-selection.test.js` and produced an instrumentation-caused assertion failure inside the profiling copy of `npm test`. Ordinary Draft validation still passed, but **all profiling data from that defective head was invalidated and excluded**. The profiler was corrected before the comparable sample set began.

The actual Draft validation measurements below come from the unchanged repository-owned `validate-ci.mjs` path on those same four corrected attempts. Dependency installation is not included in any Node-stage, Svelte-stage or Draft-validation number. Because the temporary complete/fast measurement ran earlier in each of those same CI attempts, these Draft-validation samples are preconditioned rather than pristine cold-start latency measurements. They remain useful controlled stage-composition evidence on the fixed measurement head, but the 37.99135485 s median should not be presented as a clean production-Draft latency baseline. The complete-vs-fast 3.4117469272617313% conclusion comes from the separately alternated canonical complete/fast samples above.

### Raw complete vs fast Node samples

| Attempt | Complete `npm test` | Complete tests | Fast `npm run test:fast` | Fast tests |
| --- | ---: | ---: | ---: | ---: |
| 1 | 15.8644 s | 664 | 15.2971 s | 629 |
| 2 | 19.6764 s | 664 | 19.0156 s | 629 |
| 3 | 20.0276 s | 664 | 19.3338 s | 629 |
| 4 | 21.5357 s | 664 | 21.6795 s | 629 |

Complete median: **19.8520 s**
Complete range: **15.8644–21.5357 s** (5.6713 s span)

Fast median: **19.1747 s**
Fast range: **15.2971–21.6795 s** (6.3824 s span)

Absolute median difference:

```text
19.8520 - 19.1747 = 0.6773 s
```

Median reduction:

```text
(19.8520 - 19.1747) / 19.8520 * 100
= 3.4117469272617313%
```

Classification: **materiality target not met**. The required gate is at least 20%; 3.4117469272617313% must not be characterized as a material success. Attempt 4 also had fast slightly slower than complete, illustrating the runner variance relative to the small exclusion benefit.

### `npm run check` and actual Draft validation

| Attempt | `npm run check` stage | Actual Draft validation |
| --- | ---: | ---: |
| 1 | 14.2731525 s | 30.5296752 s |
| 2 | 17.7572683 s | 37.8552871 s |
| 3 | 17.6922245 s | 38.1274226 s |
| 4 | 20.0243043 s | 42.0176252 s |

`npm run check` median: **17.7247464 s**
`npm run check` range: **14.2731525–20.0243043 s**

Actual Draft validation median: **37.99135485 s**
Actual Draft validation range: **30.5296752–42.0176252 s**

The actual Draft fast-Node group itself had a median of **19.23302865 s**, consistent with the standalone fast measurement. The current PR feature diff also required ECG Asset-rename operator tests, production-taxonomy operator tests, slide-review tests and slide-review build. Their combined measured Draft contribution was 0.8179377, 0.9265895, 1.0178534 and 1.0405239 s, median **0.97222145 s**. Those specialized checks are related-change ownership cost, not generic fast-suite overhead.

### File counts and test counts

All corrected measurements preserved:

```text
maintained Node test files: 110
fast selected files:       104
fast excluded files:       6
complete executed tests:   664
fast executed tests:       629
```

The six omissions therefore removed 35 test cases from unrelated Draft generic selection on the measured head, while complete `npm test` retained all of them.

### Profiling because the 20% target failed

A separate measurement-only profiler on head `aefaa303722528ca52707a700b82cb80a1416d50` / CI #1380 (`33343119928`) ran three complete `npm test` samples with a temporary reporter that consumed Node's per-file `test:summary` events. The profiler did not gate CI, change test selection, or replace ordinary repository validation. CI #1380 and Wrangler runtime-smoke #206 both passed. The temporary profiler and reporter were removed from ordinary CI after evidence capture; they are not part of the durable validation path.

Per-run distribution:

| Profile run | Suite | Sum of reported file durations | Median file | p90 file | Max file | Top-10 sum | Six excluded sum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 21.8758 s | 19.8626 s | 71.2 ms | 485.6 ms | 1159.0 ms | 7.9159 s | 348.2 ms |
| 2 | 20.8851 s | 19.2741 s | 67.2 ms | 499.0 ms | 996.7 ms | 7.5835 s | 345.8 ms |
| 3 | 20.7557 s | 19.0239 s | 69.8 ms | 477.3 ms | 989.8 ms | 7.5520 s | 365.9 ms |

Median summed excluded-file time was **348.2 ms**, about **1.66%** of the corresponding suite wall time. The median numerical gap between suite duration and the sum of reported per-file durations was about **1.7318 s**. Because Node test files can execute concurrently, suite wall time and summed per-file durations are not additive quantities, so this difference cannot be interpreted as time outside the test files or used to establish runner/file-process/startup/coordination overhead. It is retained only as a reason to benchmark those mechanisms separately.

Representative expensive ordinary files, with median per-file durations from the three profiles:

| File | Median |
| --- | ---: |
| `test/original-stimulus-semantics.test.js` | 961.2 ms |
| `test/stimulus-groups.test.js` | 912.9 ms |
| `test/image-management-v2.test.js` | 884.7 ms |
| `test/admin-image-workflow.test.js` | 858.5 ms |
| `test/resumable-content-import.test.js` | 857.9 ms |
| `test/preview-workspace.test.js` | 771.2 ms |
| `test/content-import.test.js` | 575.2 ms |
| `test/learning-db.test.js` | 571.8 ms |
| `test/library-pagination-pass-2.test.js` | 565.7 ms |
| `test/admin-case-library-topic-authoring.test.js` | 564.8 ms |

The largest individual file was only about 1 second. Cost is therefore distributed across several ordinary behavior/integration files rather than concentrated in one obvious specialist.

The six excluded-file median timings were approximately:

```text
slide-review build.test.js          168.7 ms
slide-review core.test.js           101.2 ms
slide-review review-fixes.test.js    22.9 ms
slide-review source-coverage.test.js  9.8 ms
ECG rename operator test             23.1 ms
taxonomy operator test               21.9 ms
```

This explains why the six-file exclusion cannot plausibly deliver a 20% Node-stage reduction on its own.

### Ranked cost analysis

1. **Repeated current-schema/SQLite fixture setup — strongest optimization candidate.** Several top-ranked ordinary suites create fresh in-memory SQLite databases, run `applyCurrentSchema(...)`, and often seed data repeatedly. `test/current-schema.js` deliberately executes the concatenated complete migration authority into each fresh database. This is high-value correctness isolation, so the tests should remain. A separately reviewed optimization could benchmark pre-migrated fixture snapshots/cloning or transaction-reset helpers that preserve test isolation and current-schema authority. Classification: **safe-performance-optimization candidate, not an exclusion candidate**.
2. **Runner/file fragmentation — benchmark hypothesis only.** There are 110 maintained files and the median reported file duration is about 70 ms, but concurrent test execution means the observed 1.6–2.0 s wall-minus-summed-file difference does not measure runner overhead. A follow-up may benchmark file aggregation, process/startup effects, or fixture/helper reuse where ownership remains clear, but must not mechanically merge unrelated contracts or weaken parallel isolation. Classification: **measurement hypothesis requiring benchmark, not an established cost driver**.
3. **Subprocess-heavy tests — measured but not principal cost.** Repository search found `tests/agent-tooling.test.js` as the meaningful maintained subprocess-heavy suite; it ranked around 16th–21st in the profiles at roughly 308–409 ms, not near the dominant ~0.8–1.0 s DB-heavy files. Classification: **high-value coverage / not worth specializing on current evidence**.
4. **Node scheduling/concurrency and module initialization — no isolated culprit established.** File-level data does not demonstrate a specific poor-concurrency or module-init defect. Changing `--test-concurrency` or import structure without a dedicated benchmark would be speculative. Classification: **measurement follow-up only**.
5. **The six existing exclusions — not a further optimization target.** They are already safely specialized and together are cheap. Chasing additional exclusions solely because the 20% gate failed would violate the plan's safety discipline. Classification: **retain current ownership; no seventh exclusion**.

No new conditional-specialization candidate is recommended from Checkpoint 6. Any future candidate must separately provide measured cost, a clear specialized/full owner, all invalidating code paths, related-change coverage, proof a related Draft cannot green without the owner, complete `npm test` retention, and explicit safety analysis.

## 4. Schema-fixture finding

Current application behavior tests should execute current application code against the current supported schema. Historical schemas remain appropriate only where migration/upgrade behavior is itself under test; older product states should otherwise be represented as data inside the current schema.

Checkpoint 1 normalized the audited ordinary D1-backed fixtures to `applyCurrentSchema(...)` while retaining genuine migration tests. No production missing-table/missing-column fallback was restored for stale fixtures.

Checkpoint 6 does not reverse that correctness decision. The profiling result instead makes repeated *execution cost* of isolated current-schema fixtures a candidate for implementation optimization while preserving the current-schema invariant.

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

The documentation-reconciled and independently accepted Checkpoint 5 head is `67e874625afbd363c3211dcc1660593831a6f30c`; Draft CI #1376 and runtime-smoke #203 both passed. The fast assertion count was 629 and the maintained-file discovery / 104-selected / 6-excluded boundary was unchanged.

No production component, route, DB/domain implementation, schema/migration, workflow, validation architecture, fast exclusion, browser dependency, application behavior, deployment, or production resource changed in Checkpoint 5 or its independent-review correction.

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

## 9. Current validation architecture after Checkpoint 6

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
| schema/migration/taxonomy behavior | KEEP IN FAST; Checkpoint 6 found no measured case for another exclusion |
| deliberate architecture/source contracts | KEEP |
| Checkpoint 4 source/UI candidates | COMPLETE: consolidated, reclassified, or explicitly retained |
| Case-editor responsive | CHECKPOINT 5 COMPLETE: executable helper semantics + thin composition/layout owner |
| Case Images | CHECKPOINT 5 COMPLETE: deep DB/helper semantics + branch-specific visible composition/workflow owner after independent correction |
| Stimulus curation | CHECKPOINT 5 COMPLETE: DB-backed role semantics + thin production control/data-flow owner |
| performance/read-model | CHECKPOINT 5 COMPLETE: observable SQL/bind/consumer behavior replaces helper/source-name ownership |
| reusable-image safety | CHECKPOINT 5 COMPLETE: current-schema loader/helper/D1 behavior owns deep safety; branch-aware all-form Preview isolation and actual Manage-questions control own the surviving UI reachability |
| Shared Questions width regression | RETAINED IN CHECKPOINT 3 |
| application horizontal-overflow regression | RETAINED/HARDENED IN CHECKPOINT 3 |
| slide-review tests | exactly four specialized fast omissions with central related-change ownership; complete `npm test` retains them; measured combined file cost is small |
| ECG production-operator test | specialized fast omission with named related-change owner; complete `npm test` retains it; measured file cost is small |
| taxonomy production-operator test | specialized fast omission with named related-change owner; complete `npm test` retains it; measured file cost is small |

## 11. Measurement gate result

Checkpoint 6 is complete as a measurement/profiling checkpoint, but the performance materiality gate **failed**:

```text
complete Node median = 19.8520 s
fast Node median     = 19.1747 s
absolute difference  = 0.6773 s
median reduction     = 3.4117469272617313%
required target      = 20%
```

Therefore the fast-tier infrastructure has not demonstrated a material Node-stage runtime benefit under this controlled comparison. It still provides a sound conditional-specialization architecture, but its present six exclusions are too cheap to materially change total Node time.

`npm run check` remains a separate substantial cost at median 17.7247464 s, and actual Draft validation median is 37.99135485 s. The current feature diff's specialized checks add roughly 1 second median on top of the base Draft path and should not be misclassified as generic fast-suite overhead.

The correct follow-up is performance optimization/profiling of ordinary fixture and runner cost, not automatic expansion of `FAST_TEST_EXCLUSIONS`. Any future optimization or exclusion tranche must be separately reviewed. Checkpoint 7 remains untouched.

## 12. Final audit conclusion

The suite should not be broadly purged.

The defensible cleanup sequence is now established and implemented through Checkpoint 6:

1. readable CI failures;
2. current-schema ordinary fixtures;
3. exclusion-based fast infrastructure with complete `npm test` preserved;
4. central change-aware specialized ownership;
5. named production-operator checks;
6. exactly six safe specialized fast omissions;
7. explicit retention/hardening of intentional UX regressions;
8. bounded source-contract consolidation around demonstrably stronger owners;
9. five bounded behavioral rewrites around the strongest cheap owners, preserving distinct UI/route/architecture reachability and hardened after independent review against branch/duplicate/control false greens;
10. controlled Checkpoint 6 measurement showing only a 3.4117469272617313% median Node reduction, followed by file-level profiling rather than a seventh exclusion.

PR #115 remains intended to stay Draft for independent Checkpoint 6 review. Checkpoint 4 and Checkpoint 5 are complete. Checkpoint 6's controlled measurement/profiling work is complete, but its 20% materiality gate was not met. Exactly six fast exclusions remain; `npm test` remains complete. No application/domain behavior, schema/migration, deployment, Production D1/R2 resource, or Checkpoint 7 work belongs to this checkpoint.
