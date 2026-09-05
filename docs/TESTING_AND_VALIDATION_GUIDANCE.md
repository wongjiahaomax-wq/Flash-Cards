# Testing and Validation Guidance

_Status: current living authoring/validation guidance._

This document is the durable repository authority for how new tests and validation rules should be authored. Historical audit and implementation evidence lives in `docs/TEST_SUITE_AUDIT.md` and `docs/NODE_TEST_SUITE_CLEANUP_PLAN.md`; those records explain how the current architecture was reached but are not the normal starting point for future test work.

For execution mode and command cadence, also follow root `AGENTS.md`, `docs/AGENT_TASK_MAP.md`, and `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`. For detailed CI failure presentation/retrieval semantics, use `docs/CI_AGENT_DIAGNOSTICS.md` rather than duplicating that contract here.

## 1. Complete suite and fast-tier placement

### `npm test` is complete

```text
npm test
→ scripts/test-runner.mjs
→ node --test with repository-selected presentation
→ canonical complete maintained Node suite
```

The local presentation layer does not redefine selection. Do not redefine `npm test` as a subset. Full/Ready validation retains the complete suite.

### Ordinary new tests enter Draft fast validation automatically

The fast architecture is exclusion-based. Maintained Node tests are discovered by the repository-owned selector in `scripts/test-selection.mjs`; an ordinary new maintained test should not require an edit to a central allow-list before Draft CI can see it.

Do not create filename- or directory-based conventions that silently classify tests as “slow” or excluded.

### Specialized exclusion is exceptional

A test may be omitted from generic **unrelated-Draft** fast selection only when all of the following are established together:

1. the protected behavior has a clear specialized owner;
2. that owner is a repository-owned named validation check;
3. the central ordinary-CI changed-path classifier maps every repository path that can invalidate the protected behavior to that specialized check;
4. ordinary CI consumes that central specialized requirement for the actual PR diff;
5. focused contracts prove a related Draft cannot go green without the specialized check executing;
6. complete `npm test` still discovers and executes the excluded test.

If any part is missing, keep the test in generic fast coverage.

The current exclusion manifest contains exactly six independently reviewed specialized paths. That set is not a precedent for excluding other expensive-looking tests. Checkpoint 6 measured complete `npm test` at a **19.8520 s** median and `npm run test:fast` at **19.1747 s**, a reduction of only **3.4117469272617313%**, below the **20%** materiality gate. No seventh exclusion was authorized.

Future exclusion proposals require separate measured cost evidence, explicit ownership/risk analysis, and review. Do not infer eligibility from runtime, DB usage, filename, or directory alone.

## 2. Local coding-agent validation phases

Execution mode is capability-based, not product-name-based. Do not decide validation cadence from labels such as ChatGPT, Codex, VS Code, web, or mobile. A usable checkout plus command execution means the local side is available; GitHub access in addition makes the workflow Hybrid.

Routine repository-owned local validation is **compact by default**. Compactness is presentation only; it must not alter test discovery, fast exclusions, Svelte project scope, build target, validation ordering, exit-status authority, or specialized-check ownership.

The local presentation contract is:

```text
normal local command
→ compact success summary
→ focused bounded failure evidence
→ explicit verbose reproduction only when needed
```

Canonical local commands include:

```sh
npm test
npm run test:fast
npm run check
npm run build
npm run validate:fast
npm run validate:full
```

Explicit diagnostic reproductions include:

```sh
npm run test:verbose -- <test-file>
npm run test:fast:verbose
npm run check:verbose
npm run build:verbose
npm run validate:fast -- --verbose
npm run validate:full -- --verbose
```

`--compact` may remain accepted by validation tooling for compatibility, but coding-agent guidance must not require it for normal local validation.

Local coding-agent validation has three distinct phases:

### Iteration

Use the cheapest feedback that directly exercises the risk introduced by the current edit.

- presentation-only Svelte/UX changes: batch copy, spacing, class and layout edits under `npm run dev` / Vite HMR; do not run repository validation after every edit;
- component logic, form/action wiring, server behavior or domain logic: run the nearest directly related test file(s) first, normally with `npm test -- <test-file>` when the owner is a maintained Node test;
- schema/migration changes: run `npm run db:check` plus the directly related migration/schema test(s) after a coherent schema edit;
- after a focused failure and correction: rerun the focused failing check first rather than immediately rerunning the complete validation contract;
- do not rerun an already-passing focused command unless subsequent edits could invalidate what it proved.

Raw `node --test <file>` is not the normal coding-agent reproduction when the repository-owned compact path can run the same maintained test. Use raw runner invocation only when explicitly debugging the test presentation infrastructure itself or another narrowly justified runner-level issue.

`agent:checks` may report deterministic `iterationGuidance` for the changed paths, including exact direct commands for changed test files. This guidance is advisory. It narrows local feedback during implementation; it does not alter final validation ownership.

### Checkpoint

Use broader validation after a coherent batch when cross-file or cross-layer confidence is useful.

- `npm run check` is an appropriate checkpoint for coherent Svelte/component changes and is compact locally by default;
- `npm run validate:fast` is repository checkpoint validation, not an every-edit loop, and is compact locally by default;
- subsystem-specific checkpoint checks such as `npm run runtime:smoke`, auth smoke or slide-review build/test should run when the affected rule or subsystem requires them, not universally after every edit.

`agent:checks` may report deterministic `checkpointGuidance`. Like iteration guidance, this is advisory and cannot remove final handoff requirements.

### Handoff / review boundary

Before final handoff or principal review, run every final required check reported by `agent:checks` plus required specialized checks. Focused iteration/checkpoint success never substitutes for this set.

When the ordinary full contract is required, `npm run validate:full` is the preferred local coding-agent command. Its default compact presentation is sufficient evidence for a clean pass. `scripts/validation-contract.mjs` still owns which checks run and their order.

If compact failure evidence is insufficient, rerun the explicit focused/verbose reproduction. Do not make the normal compact command increasingly verbose and do not rerun a clean compact pass merely to collect richer logs.

### Local bounded-failure contract

Local Node test presentation is structured and semantically bounded:

- show detailed compact diagnostics for at most the first **5** real failures;
- preserve the exact aggregate failure count;
- summarize omitted detailed failures and list up to **10** additional unique failure identities;
- bound primary messages to approximately **600 characters**;
- bound expected/actual and captured stdout/stderr previews to approximately **1,200 characters** each;
- show at most **3 useful stack frames** per detailed failure;
- mark truncation explicitly;
- provide compact focused reproduction (`npm test -- <file>`) and explicit verbose reproduction (`npm run test:verbose -- <file>`).

Local Svelte presentation remains whole-project and uses the existing machine parser. On failure it shows at most the first **10** structured errors, then reports the exact additional-error count and provides `npm run check:verbose`. Setup failures, malformed/incomplete machine output, and non-zero exit status remain fail-safe; compact parsing cannot turn a failing command green.

## 3. Schema-fixture rules

First classify what the test is actually testing.

### Current application/runtime behavior

Use the current supported schema for the repository revision.

Prefer the repository-owned current-schema bootstrap (`test/current-schema.js`) or an equally current purpose-built fixture. Do not construct a partial obsolete runtime schema merely because the scenario needs unusual or old data.

### Migration/upgrade behavior

Historical schemas are appropriate when the subject is genuinely migration behavior, upgrade behavior, migration sequencing, or preservation/backfill/constraint behavior across schema revisions.

Make that historical boundary deliberate and obvious in the fixture. Apply the migration(s) being tested explicitly.

### Historical or edge data-state behavior

A historical data state is not the same thing as a historical runtime schema.

When testing older-but-valid records, unusual combinations, dormant relationships, or other states still representable by the current schema:

```text
current schema
+ deliberately constructed historical/edge data
```

Do not restore missing-table/missing-column probing, alternate obsolete runtime models, or application fallback behavior merely to satisfy a stale test fixture.

The deployment contract remains migration-before-runtime: current-schema-only runtime support does not permit deploying application code that requires an unapplied migration.

## 4. Choose the strongest cheap practical owner

Prefer an owner at the highest practical behavioral layer that directly protects the invariant:

1. **Domain/helper behavior** for pure semantics.
2. **Server/action/query behavior** for server-owned behavior and observable read/write contracts.
3. **Rendered/component behavior** for user-observable reachability when a practical test layer exists.
4. **Focused source/data-flow/architecture contracts** when structure, wiring, dependency direction, configuration, or UI composition itself is the protected invariant and no stronger cheap owner exists.
5. **Raw implementation-text locks** only when no stronger practical owner exists and the invariant remains important enough to justify the coupling.

A stronger semantic owner replaces only the invariant it actually proves. Domain behavior does **not** automatically replace distinct UI reachability, form/action wiring, integration, information architecture, semantic product vocabulary, layout, deployment/configuration, or dependency-direction invariants.

Source-reading is not itself a defect. Source/configuration tests are legitimate when structure itself is the product, architecture, safety, or operational contract. The failure mode to avoid is brittle duplication or incidental implementation locking without a distinct protected invariant.

When retaining a source assertion, be able to state what invariant it uniquely owns and why a stronger cheap owner is not available.

## 5. CI and presentation diagnostics contract

Presentation precedence is explicit:

```text
explicit caller-selected presentation
    > CI / automation / deployment presentation
    > local compact default
```

`npm test` remains the canonical complete maintained Node suite through `scripts/test-runner.mjs`. Local use selects the compact reporter by default. Ordinary CI explicitly injects/selects the existing CI structured reporter, and that explicit choice must win without double reporter injection. Production/Preview/deployment callers must deliberately select their intended presentation rather than inheriting local compactness accidentally.

`CI_NODE_TEST_CHECK_ID` and `CI_NODE_TEST_REPRO_COMMAND` are reporter metadata, not authoritative CI-context signals. Ordinary local `test:fast` may carry those variables and must still use local compact presentation unless a real caller explicitly selects the CI reporter/presentation.

Ordinary Node CI diagnostics must preserve the current structured-event architecture:

- consume structured `node:test` events;
- keep passing output compact;
- make actual failures conspicuous near the end;
- retain useful failure identity, source location, assertion/error details, and stack context;
- preserve connector-readable diagnostic/reproduction records and GitHub annotations;
- do not parse unstable human TAP/spec/dot output as the machine contract;
- do not restore hundreds of ordinary successful-test records to CI logs.

Ordinary Svelte CI explicitly requests machine output through the existing CI wrapper. That explicit machine request must bypass the local compact Svelte presentation and retain the connector-readable structured diagnostics. Local `npm run check` remains whole-project and compact by default.

Build presentation is also caller-owned. Local `npm run build` uses the compact build wrapper and preserves warnings/errors/exit status; `npm run build:verbose` is the explicit richer reproduction. Deployment/composed scripts that require verbose/operator-oriented build output must call that presentation deliberately.

Detailed CI reporter/wrapper behavior and remote retrieval procedure are owned by `docs/CI_AGENT_DIAGNOSTICS.md`. Update that authority when CI diagnostics semantics change instead of cloning its implementation details here.

## 6. Change-aware specialization ownership

For **ordinary PR CI's change-aware specialized requirements**, there is one central changed-path classification authority:

```text
changed paths
    ↓
scripts/agent-checks-lib.mjs
    ↓
specializedRequiredChecks
    ├─ agent:checks reports them locally
    └─ ordinary CI consumes them for the PR diff
    ↓
scripts/validation-contract.mjs
resolves ordering + explicit satisfaction/deduplication
```

The ownership split is deliberate:

- `scripts/agent-checks-lib.mjs` owns repository changed-path classification used by advisory `agent:checks` and the specialized subset consumed by ordinary PR CI;
- the same classifier may emit local-only iteration/checkpoint guidance, but that guidance is advisory presentation and does not participate in CI check selection or satisfaction;
- `npm run agent:checks` is **advisory** when run locally: it reports requirements but does not prove those checks executed;
- `scripts/validation-contract.mjs` owns named checks, fast/full composition, ordering, and explicit satisfaction/deduplication;
- `scripts/validate-ci.mjs` executes the repository-owned ordinary-CI plan and provides CI-specific diagnostics;
- `.github/workflows/ci.yml` selects/orchestrates ordinary PR state and execution, but must not grow a second classifier for ordinary-CI specialized requirements or an independent validation command list.

Conceptually, for ordinary PR CI specialization:

```text
changed paths
→ central classifier
→ agent:checks reports requirements
→ ordinary CI executes the required specialized subset
→ shared validation contract resolves/deduplicates checks
```

### Intentional Wrangler runtime-smoke exception

`runtimeSmoke` is intentionally **not** part of `CI_SPECIALIZED_CHECK_IDS`. It remains enforced through the separate path-filtered `.github/workflows/wrangler-runtime-smoke.yml` workflow, whose `pull_request.paths` trigger is an intentional workflow-owned classifier rather than duplicated ordinary-CI specialization logic.

`agent:checks` may advise `runtimeSmoke` for a broader set of runtime-sensitive changes than that workflow's path filter. Therefore:

- do not remove or centralize the Wrangler runtime-smoke workflow's path filter merely because `scripts/agent-checks-lib.mjs` also knows about runtime-sensitive paths;
- do not assume ordinary CI executed `runtimeSmoke` merely because `agent:checks` reported it;
- treat a change to this exception as a separate validation/workflow architecture decision, not routine classifier deduplication.

This qualification also governs shorthand “one central classifier” wording in historical PR #115 audit/plan records: that shorthand refers to ordinary PR CI's change-aware specialized subset, not to intentionally separate path-filtered workflows such as Wrangler runtime smoke.

Advisory output is not proof of CI execution. When reviewing a remote PR, verify check evidence on the exact head.

Complete `npm test` may structurally satisfy narrower specialized **Node** checks only where `scripts/validation-contract.mjs` explicitly records that relationship. Satisfaction/deduplication belongs there, not in ad-hoc ordinary-CI workflow conditions. A fast subset must not be assumed to satisfy an excluded specialized owner merely because both use Node's test runner.

When adding or changing an ordinary-CI specialized rule, update the central classifier and focused contract tests. Do not independently reimplement that rule in `.github/workflows/ci.yml`. Preserve intentionally separate path-filtered workflows, including Wrangler runtime smoke, unless a separately reviewed change redesigns their ownership.

## 7. Author/reviewer checklist

Before adding or rewriting a test, confirm:

- what invariant the test owns;
- whether an existing stronger owner already covers it;
- whether a distinct UI/integration/architecture invariant would be lost by consolidation;
- whether the fixture uses the correct current versus historical schema model;
- whether an ordinary new maintained Node test will enter fast automatically;
- whether local iteration/checkpoint guidance is cheaper than final handoff validation without pretending to replace it;
- whether any proposed specialized exclusion satisfies every conditional-ownership requirement above;
- whether ordinary-CI changed-path ownership and validation satisfaction live in the repository's central authorities;
- whether any separately path-filtered workflow being touched is an intentional exception with its own execution contract;
- whether local compact diagnostics preserve exact aggregate failure counts, bounded actionable evidence, explicit verbose reproduction, and non-zero status authority;
- whether CI/deployment presentation is explicitly selected and cannot be confused with local compact defaults or `CI_NODE_TEST_*` metadata.

When implementation and prose disagree, current executable implementation remains higher authority. Report the discrepancy and correct the appropriate living guidance rather than changing executable behavior merely to make documentation easier to state.
