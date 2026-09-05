# Compact-by-default terminal validation plan

_Status: implementation plan for the Draft PR on branch `compact-terminal-validation`._

## Goal

Make routine repository-owned terminal validation **compact by default** because its primary consumer during coding is an agent, not a human reading every successful line.

The desired contract is:

```text
normal local validation/test command
→ compact success summary
→ focused semantically bounded failure diagnostics
→ explicit verbose reproduction only when deeper output is needed
```

This is a **presentation change**, not a test-selection or correctness reduction.

The existing iteration → checkpoint → handoff validation architecture remains authoritative. Full required checks must still run when required; they should simply produce less terminal text in the ordinary local agent path unless an explicit verbose reproduction is requested.

## Why this work exists

The repository has already reduced agent/CI noise in several places:

- `agent:checks --compact` presents the same classification more compactly;
- `validate:* -- --compact` reuses the structured Node reporter and lowers successful Vite build chatter;
- CI Svelte diagnostics use the existing machine parser and connector-readable `CI_ERROR` / `CI_REPRO` / `CI_STATUS` records;
- repository guidance already tells agents not to rerun broad validation after every small UX edit.

The remaining local gap is that compactness is still optional and incomplete:

- canonical local commands remain verbose by default;
- local compact validation does not currently compact the Svelte check;
- focused Node commands recommended during iteration can still use raw `node --test` output;
- specialized/operator/slide-review test entry points can bypass the compact Node presentation entirely;
- the existing Node reporter still emits progress characters and comparatively rich failure detail that is useful in CI but often unnecessary in a local agent loop;
- command-by-command compaction is inconsistent rather than governed by one repository policy.

## Scope

This PR should implement a repository-wide policy for **routine test/check/validation commands**.

Primary surfaces:

- complete Node tests;
- fast Node tests;
- focused Node test execution recommended by agent guidance;
- every repository-owned command whose primary purpose is running tests, including specialized/operator/slide-review tests;
- Svelte checks;
- application build validation;
- DB/schema validation where applicable;
- repository validation orchestration (`validate:fast`, `validate:full`);
- repository-owned specialized test/check commands that are part of handoff validation;
- agent guidance that recommends terminal validation commands.

The implementation should audit current package scripts, validation-contract commands, Production/Preview workflows, and package scripts that compose canonical commands rather than assuming this list is exhaustive.

## Explicit non-goals

Do **not** use this PR to:

- add ESLint;
- change which tests belong to complete or fast suites;
- create new test exclusions;
- weaken handoff requirements;
- make Svelte checking file-scoped;
- introduce Svelte incremental checking as a correctness/performance shortcut;
- redesign CI test selection;
- change Production/Preview behavior;
- change deployment, Cloudflare, D1, R2, auth, or application product behavior;
- hide benchmark results, migration evidence, operator output, or other commands whose output is itself the purpose of running the command;
- compact interactive development servers such as `npm run dev` / `preview`;
- accidentally change Production/Preview/CI/deployment presentation merely because those workflows invoke a canonical package script whose local default becomes compact.

Benchmarks and diagnostic tools whose measurements are the product of the command should remain intentionally informative.

## Core design decisions

### 1. Compact becomes the normal **local** presentation

Invert the current local relationship:

```text
current local use
normal command = verbose
--compact      = special presentation

proposed local use
normal command = compact
verbose        = explicit escape hatch
```

The exact command names should remain simple and discoverable. Prefer conventional aliases such as:

```text
npm test
npm run test:fast
npm run check
npm run build
npm run validate:fast
npm run validate:full

# explicit diagnostic reproduction
npm run test:verbose
npm run test:fast:verbose
npm run check:verbose
npm run build:verbose
npm run validate:fast -- --verbose
npm run validate:full -- --verbose
```

The implementation agent may adjust exact alias mechanics when necessary for cross-platform correctness, but the user-facing local contract above should remain the target.

### 2. Presentation precedence is explicit

Canonical package scripts are used in more than one context. Production deployment, Preview automation, ordinary PR CI, and other automation currently invoke commands such as `npm test`, `npm run check`, and `npm run build`. Changing those package scripts must **not** silently redefine automation/deployment presentation.

Use this precedence contract:

```text
explicit caller-selected presentation
    > CI / automation / deployment presentation
    > local compact default
```

Interpretation:

- **Local interactive/agent use:** compact is the default.
- **Ordinary PR CI:** keep the existing structured CI Node/Svelte diagnostics and connector-readable `CI_ERROR` / `CI_REPRO` / `CI_STATUS` contract. Local compact defaults must not override, duplicate, or double-inject those reporters.
- **Production/Preview/deployment workflows:** deliberately choose their presentation. Do not inherit compact or verbose behavior accidentally from a changed `package.json` alias. If the current workflow/operator output should remain unchanged, invoke the explicit verbose/automation form or an equivalent caller-controlled mode.
- **Composed package scripts such as `deploy`:** audit them explicitly. If `deploy` calls `npm run build`, it must deliberately select the intended deployment build presentation rather than inheriting the local default by accident.

The implementation must add focused contract tests or workflow assertions proving this boundary wherever practical. A local presentation refactor is not allowed to change deployment/operator/CI observability as an incidental side effect.

### 3. Compact presentation must not change validation semantics

For every compact/default command, preserve:

- the same test discovery/selection;
- the same Svelte project coverage;
- the same build target;
- the same DB/schema check;
- the same command ordering;
- the same exit status authority;
- the same specialized-check ownership and satisfaction rules.

`validation-contract.mjs` remains the owner of logical check selection and ordering.

Presentation wrappers must not become a second validation-selection DSL.

### 4. Green runs should be nearly silent

Successful routine checks should emit only the information an agent needs to know that the check completed and passed.

Target shape:

```text
✓ Node tests — 664 passed, 0 failed (19.4s)
✓ Svelte — 0 errors, 3 warnings (17.2s)
✓ Build — passed (4.1s)
✓ DB migrations — valid
✓ Diff — clean

Validation passed
```

Exact wording/timing fields are implementation details. The invariant is that successful per-test/per-file/progress chatter is removed.

Do not add arbitrary overall token budgets or a global “N terminal lines” truncation rule. Compactness should come from semantic summarization.

### 5. Failures are focused with semantic bounds

Default local failure output must contain:

- failing check identity;
- failing test/diagnostic identity;
- file and location when available;
- concise useful error/assertion message;
- bounded expected/actual context where applicable;
- a focused reproduction command for the detailed failure(s);
- an explicit verbose reproduction command when deeper detail is available;
- exact aggregate failure counts even when not every failure is expanded.

The first implementation should use these concrete local Node bounds unless focused tests establish a clearly better equivalent:

```text
Detailed failing tests:          first 5
Additional failure identities:   up to 10 unique file/test identities
Primary error/message preview:   up to 600 characters
Expected preview:                up to 1,200 characters
Actual preview:                  up to 1,200 characters
Useful stack:                    up to 3 frames
Captured stdout preview:         up to 1,200 characters per detailed failure, if present
Captured stderr preview:         up to 1,200 characters per detailed failure, if present
Focused repro commands:          deduplicated for the detailed failures
```

When more than five tests fail, the output should look conceptually like:

```text
✗ Node tests — 37 failures

1. tests/foo.test.js:84
   should preserve active review
   Expected true, received false
...
5. tests/qux.test.js:40
   ...

32 additional failures omitted from detailed output.
Additional failing identities (up to 10):
- tests/a.test.js — rejects stale proof
- tests/b.test.js — preserves scope
...
22 additional identities not listed.

Focused reproduction:
npm test -- tests/foo.test.js

Verbose reproduction:
npm run test:verbose -- tests/foo.test.js
```

The exact text may differ, but these invariants must hold:

1. total failure count is never hidden;
2. detailed diagnostics do not scale linearly with dozens/hundreds of cascading failures;
3. large expected/actual values, stack traces, and captured output cannot dump unbounded payloads into model context;
4. truncation is explicit (for example, `… 824 characters omitted`), never silent;
5. verbose reproduction remains available for the complete evidence.

Apply the same cascading-failure principle to Svelte diagnostics. The default local Svelte failure presentation should show at most the first **10** structured errors in full compact form, then report the exact number of additional errors omitted and provide the verbose reproduction. Warning counts remain summarized unless warnings are themselves the reason the command fails.

These are semantic per-record/per-category bounds, not a crude global line cap.

### 6. Unknown/unparseable failures must fail safely

Compactness must never create a false green or silently hide a failure.

For structured commands (Node, Svelte), if parsing is incomplete or the wrapper cannot establish an actionable compact diagnostic:

1. keep the non-zero status authoritative;
2. print a concise message that compact diagnostics were incomplete;
3. provide the explicit verbose reproduction;
4. expose enough original failure output to avoid concealing the failure.

Prefer a semantically bounded useful fallback where the tool allows it, but correctness outranks prettiness. If safe compaction cannot establish enough evidence, it is acceptable for the failure path to become noisier rather than hide information.

Do not build a separate cache/log retrieval system merely to hide terminal output.

## Node test implementation plan

### Current constraint

`npm test` is currently the canonical complete `node --test` suite, and `test:fast` uses the repository selector. CI and local compact validation can inject the existing structured reporter.

The repository also owns test commands that bypass those two entry points, including specialized/operator checks in `validation-contract.mjs` and slide-review test scripts. Those are part of this PR's required compact-test surface, not optional audit-only cleanup.

### Target

Make **every repository-owned command whose primary purpose is running tests** compact by default for local use while preserving its exact test selection.

This includes, at minimum:

- `npm test`;
- `npm run test:fast`;
- focused repository-owned test invocation;
- raw `node --test ...` specialized/operator checks currently represented in `validation-contract.mjs`;
- `npm run slide-review:test` and equivalent repository-owned test-only scripts;
- any other test-primary command found during the package/validation audit.

Benchmarks, profiling/measurement commands, deployment/operator commands, and tools whose emitted output is itself evidence are not reclassified as ordinary tests merely because they happen to use Node.

Requirements:

1. Reuse structured `node:test` events; do not parse TAP/spec/dot text.
2. Preserve complete `npm test` coverage.
3. Preserve fast-test selection/exclusions exactly.
4. Preserve every specialized/operator/slide-review test's exact selected files and arguments.
5. Preserve the existing CI reporter semantics and connector-readable records in GitHub Actions.
6. Give local compact mode a distinct presentation from CI where appropriate; local output does not need GitHub annotations or CI-prefixed records unless they are intentionally useful.
7. Remove local success progress dots/characters by default.
8. Apply the semantic failure bounds defined above.
9. Add explicit verbose local aliases/modes that reproduce raw/richer Node output.
10. Make focused repository-owned Node execution compact too, so agent guidance no longer recommends raw `node --test <file>` as the normal path.
11. Specialized tests are **not discretionary**: if the primary purpose of the command is running tests, it must use the compact Node-test presentation locally unless the implementation documents a concrete output-is-the-product reason and review accepts that exception.

Preferred focused UX:

```text
npm test -- tests/foo.test.js
```

should remain compact, while:

```text
npm run test:verbose -- tests/foo.test.js
```

provides the escape hatch.

If a wrapper is needed for cross-platform argument handling, prefer one repository Node helper rather than several package-script-specific shells.

### CI compatibility and double-reporter requirement

Current CI explicitly injects the structured test reporter, including specialized-check reporter identity/`NODE_OPTIONS` behavior where applicable. Local defaults must not create two reporters or two competing presentation layers.

`CI_NODE_TEST_CHECK_ID` and `CI_NODE_TEST_REPRO_COMMAND` are **reporter metadata, not authoritative CI-context signals**. The current `test-fast.mjs` sets these values during ordinary local execution as defaults for `testFast` identity/reproduction. A presentation helper must therefore select local-vs-CI presentation independently and must not infer “CI mode” merely from either metadata variable being present.

The implementation must establish one clear owner for each presentation mode:

```text
local default  → local compact reporter/presentation
local verbose  → raw/richer reproduction
CI             → existing CI structured reporter semantics
```

Focused tests must prove all of the following:

- local defaults do not alter CI diagnostic records;
- local `npm run test:fast` with the existing `CI_NODE_TEST_CHECK_ID` / `CI_NODE_TEST_REPRO_COMMAND` metadata still uses the **local compact** presentation;
- actual CI reporter injection selects the existing **CI structured** presentation;
- CI reporter injection wins over the local compact default according to the presentation precedence contract;
- specialized/operator checks do not receive duplicate `--test-reporter` configuration;
- slide-review tests do not receive duplicate reporters when executed through ordinary CI specialized-check injection;
- any existing `NODE_OPTIONS` reporter injection remains valid and singular;
- argument forwarding for focused/specialized test commands remains cross-platform.

## Svelte implementation plan

### Current constraint

`npm run check` currently runs the full project:

```text
svelte-kit sync && svelte-check --tsconfig ./jsconfig.json
```

The repository already has `parseSvelteMachineOutput()` for the pinned `svelte-check` machine protocol.

### Target

Keep full-project Svelte checking, but make local output compact by default.

Requirements:

1. Do not make Svelte checks changed-file-only.
2. Do not use incremental checking in this PR.
3. Reuse the existing machine parser rather than inventing a second parser.
4. Capture the machine stream internally rather than dumping it into agent context.
5. Successful output should report only an error/warning summary.
6. Warnings should normally be counted, not all printed.
7. Failures should print actionable error diagnostics only: file, line/column, source/code when useful, concise bounded message.
8. Show at most the first 10 structured Svelte errors in the default local failure output; report the exact additional-error count when more exist.
9. `svelte-kit sync` or setup failures that occur before the machine protocol must remain visible and non-green.
10. Incomplete/malformed machine output must remain fail-safe.
11. Provide `npm run check:verbose` (or equivalent explicit alias) for the original full diagnostic output.
12. `validate:fast` / `validate:full` should use the same compact Svelte presentation by default rather than having a separate Svelte compaction implementation.
13. Ordinary CI must keep its current machine/structured Svelte presentation explicitly; local compact defaults must not alter CI diagnostics accidentally.

## Build / DB / smoke / specialized validation plan

Audit each repository-owned check in `validation-contract.mjs`, the package scripts it invokes, and automation/deployment workflows that call canonical package commands.

Classify each command into one of three categories:

### A. Structured compact owner

Examples: Node tests, Svelte diagnostics.

Use a structured parser/reporter and focused bounded failure output.

**Every repository-owned command whose primary purpose is running tests belongs here by default**, including specialized/operator/slide-review tests. A coding agent may not leave such a test verbose merely because it is specialized.

### B. Naturally concise or safely suppressible success output

Examples may include local build or migration/schema checks.

Default **local** behavior:

- suppress routine successful chatter;
- preserve warnings/errors and exit status;
- print a concise success summary;
- expose a verbose reproduction alias when the underlying tool has materially more detail.

Do not over-wrap already concise commands without a measurable presentation benefit.

Automation/deployment callers must deliberately select their intended presentation instead of inheriting this local default accidentally.

### C. Output-is-the-product / privileged execution commands

Examples include benchmarks, profiling/measurement scripts, deliberate diagnostics, development servers, and operator/deployment workflows.

Do not compact these by default simply because they run in a terminal.

This classification does **not** mean a deployment workflow cannot invoke tests/checks/builds in a compact form. It means the workflow owns that presentation decision explicitly under the precedence contract; it is not changed as a hidden side effect of local command defaults.

The coding agent must explicitly document the classification of materially relevant scripts/workflows it changes.

## Validation orchestrator plan

`validate:fast` and `validate:full` should become compact by default for local use.

Target behavior:

```text
npm run validate:fast
npm run validate:full
```

use compact presentation.

Explicit verbose mode should be available:

```text
npm run validate:fast -- --verbose
npm run validate:full -- --verbose
```

Requirements:

- check selection/order remains derived from `validation-contract.mjs`;
- compact/verbose presentation does not change required checks;
- `--compact` may be retained temporarily for compatibility if useful, but should no longer be required for the ordinary agent path;
- reject contradictory presentation flags clearly;
- a failing stage stops validation exactly as today;
- compact failure output points to the canonical verbose reproduction;
- specialized test checks reached through the orchestrator use the same local compact Node-test owner rather than raw test output;
- CI/automation presentation remains caller-controlled according to the precedence contract.

Do not duplicate command definitions inside the validation runner.

## Agent guidance changes

Update repository guidance so coding agents naturally choose the compact path without needing long prompts.

Required direction:

### Iteration

- presentation-only Svelte/UX: use Vite/HMR and batch edits; no repository validation after each CSS/layout tweak;
- focused logic/test correction: use compact repository-owned focused test invocation;
- do not recommend raw `node --test` as the ordinary agent path when an equivalent compact repository wrapper exists.

### Checkpoint

- use compact/default `npm run check` for coherent Svelte batches;
- use compact/default `npm run validate:fast` when broader confidence is useful.

### Handoff

- run every final required/specialized check from `agent:checks`;
- specialized test commands should themselves be compact in ordinary local use;
- compact/default output is sufficient evidence of a passing command;
- verbose reproduction is diagnostic only and is not required after a clean compact pass.

Update at minimum the living guidance that becomes inaccurate:

- root `AGENTS.md` where it currently prefers explicit `--compact` variants;
- `scripts/AGENTS.md`;
- `docs/AGENT_TASK_MAP.md`;
- `docs/TESTING_AND_VALIDATION_GUIDANCE.md`;
- `docs/CI_AGENT_DIAGNOSTICS.md` if CI presentation/retrieval or precedence semantics need clarification;
- deployment/Preview runbooks only if their explicit command presentation changes.

Do not rewrite historical audit documents merely to erase old command names. Add narrow clarification only if old wording becomes operationally dangerous.

## Implementation tranches

The next coding agent should implement in small reviewable steps inside this PR.

### Tranche 1 — characterize current presentation contracts

1. Inspect current package scripts, validation contract, local validation runner, CI runner, Node reporter, Svelte parser, fast-test runner, specialized/operator/slide-review tests, Production deployment workflow, Preview workflows, and directly related tests.
2. Add/adjust focused characterization tests before changing defaults where current behavior needs protection.
3. Record which commands are structured tests, naturally concise checks, automation-context commands, or output-is-the-product.
4. Establish the presentation precedence contract in executable tests/helpers before changing canonical package defaults.
5. Characterize current CI specialized test reporter/`NODE_OPTIONS` injection so double-reporting regressions are detectable.
6. Characterize `test-fast.mjs`'s local `CI_NODE_TEST_CHECK_ID` / `CI_NODE_TEST_REPRO_COMMAND` defaults so those reporter-metadata variables cannot be mistaken for CI-context detection.

Deliverable: tests establishing current semantic/CI/deployment presentation invariants and the intended local presentation boundaries.

### Tranche 2 — Node compact-by-default local runner

1. Introduce/reuse the smallest cross-platform Node test presentation wrapper.
2. Make complete and fast local Node tests compact by default without changing selection.
3. Make focused repository-owned Node tests compact by default.
4. Route all specialized/operator/slide-review test-primary commands through the same compact local presentation owner without changing selected tests.
5. Implement the first-5 detailed failure rule, additional-failure summary, bounded payload previews, and explicit truncation markers.
6. Add explicit verbose reproduction aliases/modes.
7. Preserve CI structured reporter behavior and avoid reporter/`NODE_OPTIONS` double-injection.
8. Ensure presentation context is selected independently of `CI_NODE_TEST_CHECK_ID` / `CI_NODE_TEST_REPRO_COMMAND` reporter metadata.
9. Add focused tests for pass/fail/many-failures/verbose/CI/specialized modes, local `test:fast` metadata, payload bounds, truncation markers, and argument forwarding.

Deliverable: all repository-owned local commands whose primary purpose is running tests are compact and semantically bounded on failure.

### Tranche 3 — Svelte compact-by-default local runner

1. Reuse the existing machine parser.
2. Capture full machine output internally.
3. Emit compact success and focused error diagnostics.
4. Apply the first-10 structured-error bound with exact omitted-error counts.
5. Handle pre-protocol/setup failure and malformed/incomplete protocol safely.
6. Add explicit verbose reproduction.
7. Preserve ordinary CI's current explicit machine/structured presentation.
8. Add focused tests for success, warnings, ordinary failures, cascading failures, malformed output, sync/setup failure, presentation precedence, and exit-status preservation.

Deliverable: local `npm run check` is compact by default but semantically identical; CI Svelte diagnostics remain intentionally unchanged.

### Tranche 4 — validation orchestration, automation boundaries, and other routine checks

1. Make local `validate:fast` / `validate:full` compact by default.
2. Add `--verbose` escape hatch.
3. Remove now-redundant local special-case reporter/log-level injection where default commands already own compact presentation.
4. Audit build, DB, smoke, and specialized validation commands.
5. Compact routine local success output where safe and useful.
6. Explicitly audit Production deployment, Preview workflows, ordinary CI, and composed scripts such as `deploy` that call canonical commands.
7. Make each automation/deployment context deliberately select its intended presentation so no observability change is accidental.
8. Leave output-is-the-product commands unchanged.

Deliverable: repository validation has one coherent presentation policy with an explicit local-vs-automation boundary.

### Tranche 5 — agent routing / command guidance

1. Update `agent:checks` iteration/checkpoint guidance to recommend compact/default repository commands.
2. Replace normal raw focused Node commands with compact repository-owned equivalents.
3. Keep final required/specialized checks unchanged.
4. Ensure specialized test commands surfaced by `agent:checks` are themselves compact in ordinary local use.
5. Update living documentation and scoped guidance.

Deliverable: future coding agents automatically use the token-efficient path without custom prompt instructions.

### Tranche 6 — complete regression review

1. Run focused validation-tooling/reporter tests.
2. Run repository-selected final checks from `agent:checks`.
3. Verify CI on the exact PR head.
4. Confirm complete/fast Node test counts and exclusions did not change unless an unrelated current-main drift occurred and is explicitly explained.
5. Confirm specialized/operator/slide-review selected test files did not change.
6. Confirm CI `CI_ERROR` / `CI_REPRO` / `CI_STATUS` behavior remains intact.
7. Confirm CI specialized reporter/`NODE_OPTIONS` injection occurs exactly once.
8. Confirm local `npm run test:fast` remains local-compact even though its existing reporter metadata variables are present, while actual CI reporter injection remains CI-structured.
9. Confirm Production/Preview/deployment workflows use an explicit intended presentation and did not change observability accidentally.
10. Compare representative before/after green terminal output for Node, specialized tests, Svelte and full validation.
11. Exercise a synthetic many-failure Node case and many-error Svelte case to prove output remains semantically bounded while reporting exact totals.
12. Compare representative compact failure output and verbose reproduction for Node and Svelte.
13. Inspect the complete `main` → PR-head diff for scope creep.

Deliverable: evidence that local presentation changed while validation authority and automation observability did not drift accidentally.

## Acceptance criteria

The PR is ready for review only when all of the following are true:

- ordinary repository-owned local Node tests are compact by default;
- **every repository-owned command whose primary purpose is running tests is compact by default locally**, including specialized/operator/slide-review test commands unless a documented output-is-the-product exception is independently accepted;
- complete Node test coverage remains complete;
- fast-test selection remains unchanged;
- specialized/operator/slide-review selected test files remain unchanged;
- focused Node tests have a compact repository-owned invocation;
- focused compact reproduction uses the repository-owned compact path (for example `npm test -- <file>`), while raw/richer output is reached only through the explicit verbose path;
- `CI_NODE_TEST_CHECK_ID` and `CI_NODE_TEST_REPRO_COMMAND` remain reporter metadata rather than CI-context signals;
- local `npm run test:fast` remains local-compact despite those existing metadata values, and actual CI reporter injection retains the existing CI structured presentation;
- local Node failures show at most five full compact failure records, preserve exact total counts, summarize additional failures, and bound message/expected/actual/stack/captured-output payloads with explicit truncation markers;
- local Svelte checking remains whole-project and is compact by default;
- Svelte warnings are summarized rather than dumped on successful runs;
- local Svelte cascading failures show at most ten structured errors and preserve the exact omitted-error count;
- ordinary Svelte errors remain directly actionable;
- unknown/incomplete Svelte diagnostics cannot turn a failure green;
- routine local validation (`validate:fast` / `validate:full`) is compact by default;
- explicit verbose reproductions exist for Node, Svelte and validation orchestration;
- build/DB/smoke commands have been audited and only appropriate routine local validation output is compacted;
- benchmarks, interactive dev servers, diagnostics whose output is the product, and privileged operator/deployment commands are not blindly compacted;
- presentation precedence is implemented so explicit caller/CI/automation/deployment presentation overrides local compact defaults;
- Production/Preview/deployment workflows deliberately choose their presentation instead of inheriting changed `package.json` defaults accidentally;
- composed scripts such as `deploy` deliberately choose their intended build presentation;
- `validation-contract.mjs` remains the validation-selection/ordering authority;
- CI structured diagnostics retain their current semantics unless a separately reviewed improvement is intentionally included;
- specialized CI reporter/`NODE_OPTIONS` injection cannot double-inject a Node reporter after local compact defaults are introduced;
- agent guidance recommends compact/default commands and no longer requires `--compact` for the ordinary model-context path;
- no product/runtime/schema/deployment behavior changes are included;
- no ESLint dependency/configuration is added.

## Review focus

Reviewers should pay particular attention to:

1. **False-green risk** — any parser/wrapper failure must preserve non-zero command authority.
2. **Coverage drift** — presentation changes must not alter test/Svelte/build selection.
3. **Presentation precedence** — CI, Production, Preview and composed operator/deploy scripts must not change presentation accidentally when local package defaults change.
4. **CI context detection / double reporters** — `CI_NODE_TEST_CHECK_ID` and `CI_NODE_TEST_REPRO_COMMAND` are metadata even in local `test:fast`; local compaction must not use them as CI detection and must not weaken, duplicate, or double-inject existing CI structured diagnostics, including specialized `NODE_OPTIONS` reporter injection.
5. **Specialized test coverage** — every repository-owned test-primary command should use compact local presentation; “specialized” is not by itself an exemption.
6. **Argument forwarding** — focused test paths and npm `--` forwarding must work cross-platform.
7. **Failure usefulness and bounds** — ordinary failures must be sufficient for the next correction, while cascading failures, expected/actual values, stacks, and captured output remain semantically bounded with exact totals and explicit omission markers.
8. **Focused reproduction semantics** — ordinary focused reproduction must stay on the compact repository path; raw `node --test` is not the recommended local reproduction once the compact owner exists.
9. **Output-product exceptions** — benchmarks/operator/development commands should not be compacted indiscriminately.
10. **Single authority** — do not create a second validation selection or changed-path classification system.

## Desired end state

The normal coding-agent experience should be:

```text
edit
→ focused compact test or Vite/HMR
→ coherent checkpoint
→ compact check/validate output
→ fix only actionable failures
→ final required checks, including specialized tests, still compact locally
→ verbose rerun only when compact diagnostics are insufficient
```

Automation remains explicit:

```text
local agent command
→ compact by default

ordinary CI
→ existing structured CI presentation

Production / Preview / deployment / operator workflow
→ explicitly selected workflow presentation
```

The repository should spend model context on failures and decisions, not on hundreds of successful terminal lines, without trading away CI/deployment observability or validation coverage.