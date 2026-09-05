# Coding-agent context-efficiency plan

_Status: proposed multi-tranche implementation plan. PR #155 is the completed compact-terminal foundation; do not reimplement it here._

## Goal

Reduce the amount of repository and tool output repeatedly carried through long coding-agent sessions without weakening validation, review, Git, CI, deployment, or Production/Preview safeguards.

The desired workflow is:

```text
bounded discovery
-> focused implementation
-> coherent checkpoint
-> context compaction when the client supports it
-> batched read-only handoff evidence
-> explicit mutations and exact-head verification
```

This is a context-management and workflow improvement. It is not permission to reduce required checks, hide failures, skip final review, or replace engineering judgment with token or command quotas.

## Evidence and problem statement

A representative PR implementation session produced the following recorded usage:

| Measure | Observed value |
| --- | ---: |
| Model responses | 55 |
| Input tokens | 8,788,543 |
| Cached input tokens | 8,494,336 |
| Uncached input tokens | 294,207 |
| Output tokens | 45,737 |
| Reasoning output tokens | 16,602 |
| Accumulated tool-output characters | about 756,000 |
| Largest individual tool outputs | about 42,000 characters |
| Peak pre-compaction input | about 245,000 tokens |
| Calls above 200,000 input tokens | 19, accounting for about 4.36 million input tokens |

The main amplification mechanism was repeated model turns after broad file reads and command output had accumulated. Reasoning output was not the material source of usage. Late Git, validation, GitHub, and status operations were individually small, but each replayed a context above 200,000 tokens.

The implementation agent does not need the original session log. The table above is the baseline evidence for this plan.

## Completed foundation: PR #155

PR #155 (`compact-terminal-validation`) is merged into `main` and already owns routine validation presentation. It implemented:

- compact-by-default local Node tests;
- bounded local Node failure details, expected/actual previews, captured output, stacks, and cascading-failure identities;
- compact whole-project Svelte checking with bounded structured errors;
- compact local builds;
- compact-by-default `validate:fast` and `validate:full`;
- explicit verbose reproduction commands;
- compact specialized/operator/slide-review test paths;
- CI, Preview, Production, and deployment presentation precedence;
- focused presentation regression tests and updated agent guidance.

Relevant current owners include:

- `scripts/local-test-reporter.mjs`;
- `scripts/test-presentation.mjs`;
- `scripts/test-runner.mjs`;
- `scripts/check-local.mjs`;
- `scripts/build-local.mjs`;
- `scripts/validate.mjs`;
- `docs/COMPACT_TERMINAL_VALIDATION_PLAN.md`.

Do not recreate the earlier proposed reporter work in `scripts/ci-test-reporter.mjs`. CI and local presentation are deliberately separate. Any future diagnostic change must preserve the precedence and structured-event contracts established by PR #155.

## Repository constraints

Every tranche must preserve these invariants:

1. `scripts/validation-contract.mjs` remains the validation selection and ordering authority.
2. `scripts/agent-checks-lib.mjs` remains the ordinary-CI changed-path classification authority.
3. `npm test` remains the complete maintained Node suite.
4. Focused and compact checks never substitute for final required checks.
5. A complete intended-base-to-head diff is still required at final review.
6. GitHub CI, local validation, commit, push, merge, deployment, migrations, and live behavior remain separate evidence claims.
7. Production D1/R2 must never be mutated for testing or measurement.
8. Unrelated tracked and untracked work must be preserved.
9. Do not add arbitrary command-count limits, token budgets, context counters, caches, retrieval wrappers, or a second validation/retrieval DSL.
10. Client context compaction is an optional host capability. The repository must not pretend that an npm command can compact a model conversation.

## Scope

This plan covers the remaining work after PR #155:

- clearer context-phase and compaction guidance;
- deterministic, concise handoff-state presentation using existing authorities;
- safe batching guidance for related read-only checks;
- prevention of repeated unchanged retrieval;
- output-volume regression evidence for repository-owned presentation, without model-token telemetry;
- documentation and executable contracts that allow a later coding agent to implement the work without access to prior logs.

## Explicit non-goals

Do not use this work to:

- alter application, authentication, database, migration, storage, Worker, or deployment behavior;
- reduce validation coverage or create test exclusions;
- add a model-token meter to the repository;
- parse Codex session files or depend on a particular coding-agent vendor;
- persist prompts, model conversations, tool outputs, production-derived data, or credentials;
- automatically commit, push, edit PRs, merge, deploy, or mutate GitHub state;
- create an opaque command that claims all handoff obligations passed without executing their authoritative checks;
- add a general shell-command proxy or terminal-output cache;
- replace targeted `rg`, Git, or GitHub retrieval with a repository-specific query language.

## Design decisions

### 1. Use semantic milestones, not quotas

The workflow should identify four phases:

```text
Discovery -> Implementation -> Checkpoint -> Handoff
```

Transitions are based on completed work, not token percentages or a fixed command count.

- **Discovery:** establish work state, route through scoped authority, locate the implementation surface, and inspect directly related tests.
- **Implementation:** edit coherent units and run the cheapest directly related feedback.
- **Checkpoint:** run broader validation only after a coherent batch, then resolve failures before continuing.
- **Handoff:** compact context when available, execute final required checks, review the complete diff, perform authorized Git/GitHub mutations, and verify exact-head remote state.

### 2. Compaction guidance must be capability-aware

At the boundary between checkpoint and handoff, agent guidance should say:

> When the active coding-agent client exposes context compaction and the session has accumulated substantial tool/file output, compact after the implementation checkpoint and before final validation, Git, and GitHub handoff work. If compaction is unavailable, continue with bounded retrieval and reuse existing evidence; do not invent a repository command that claims to compact context.

Compaction should normally occur after a major tool-heavy phase, not after every turn. A later code change that invalidates the checkpoint may require returning to implementation, but it does not automatically require rereading unchanged authorities.

### 3. Batch only related read-only evidence

Batching reduces model turns only when the combined result remains easy to attribute. Safe candidates include:

- `git status --short --branch`, `git diff --stat`, and `git diff --check` at one checkpoint;
- PR identity, head/base SHA, Draft/Ready state, and check rollup in one read-only GitHub request;
- final clean-worktree and exact-head verification after push.

Do not batch actions whose evidence must remain operationally distinct, or mutations that have separate authorization/failure boundaries. Commit, push, PR editing, merge, migration, deployment, and live verification remain explicit operations.

### 4. Prefer an existing-authority summary over a new wrapper

`agent:checks` already owns changed-file classification and required handoff commands. If a concise handoff summary is added, extend the existing `agent:checks` report rather than creating `agent:handoff`, a command proxy, or a second classifier.

The summary may report deterministic local facts that `agent:checks` already resolves, such as:

- base reference and merge base;
- changed-file count and areas;
- required checks and specialized checks;
- iteration/checkpoint guidance;
- untracked whitespace diagnostics.

It must not claim checks ran, passed, or remain current. Execution evidence belongs to the commands themselves and, remotely, to exact-head GitHub check state.

### 5. Measure repository output, not model internals

Executable regression tests may assert semantic character/record bounds for repository-owned reporters. Do not introduce token estimation, context-window thresholds, session parsing, or user-specific telemetry.

The useful durable measures are:

- number of detailed failures shown;
- number of additional identities shown;
- maximum diagnostic preview characters;
- exact omitted failure/error counts;
- presence of focused and verbose reproduction commands;
- preservation of exit status and validation selection.

PR #155 already covers most validation-presentation bounds. New tests should be added only for a newly introduced or corrected contract.

## Tranche 1 - Baseline audit against current `main`

### Objective

Establish precisely which proposed improvements remain after PR #155 and prevent duplicate implementation.

### Required reads

Read only:

- root `AGENTS.md`;
- `scripts/AGENTS.md`;
- the validation-tooling row in `docs/AGENT_TASK_MAP.md`;
- relevant sections of `docs/TESTING_AND_VALIDATION_GUIDANCE.md`;
- `docs/CI_AGENT_DIAGNOSTICS.md`;
- `docs/COMPACT_TERMINAL_VALIDATION_PLAN.md`;
- current `scripts/agent-checks.mjs` and `scripts/agent-checks-lib.mjs`;
- directly related tests in `tests/agent-tooling.test.js` and `tests/local-agent-validation.test.js`.

Do not reread every reporter and workflow unless the current implementation leaves a material question unresolved.

### Deliverable

Add a short implementation-status section to this plan recording each remaining tranche as:

- needed;
- already satisfied by current `main`;
- narrowed;
- rejected by repository constraints.

### Acceptance criteria

- No PR #155 behavior is duplicated.
- Every proposed code change has a current owner and an identified missing contract.
- Any tranche with no remaining executable gap is converted to documentation-only or marked complete.

## Tranche 2 - Context lifecycle and compaction guidance

### Objective

Make the four-phase workflow and checkpoint-to-handoff compaction boundary discoverable without bloating every agent prompt.

### Files

Expected documentation-only surface:

- `AGENTS.md`;
- `scripts/AGENTS.md`;
- `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`;
- `docs/TESTING_AND_VALIDATION_GUIDANCE.md`.

Update `docs/AGENT_TASK_MAP.md` only if routing ownership changes. Do not edit historical plan/audit documents merely to normalize wording.

### Required wording contracts

The living guidance must state:

1. Discovery ends when the implementation surface and directly related owners/tests are established.
2. Implementation uses targeted reads and focused checks; unchanged authority is reused.
3. Checkpoint validation happens after a coherent batch rather than after each edit.
4. When client compaction exists and context is tool-heavy, compact after checkpoint and before handoff.
5. Handoff uses fresh exact-head/branch evidence where state can drift, but does not reread unchanged source or documentation.
6. Compact validation output is sufficient evidence when it passes; do not rerun verbose solely for richer logs.
7. If compact failure evidence is insufficient, reproduce only the focused failing command in verbose mode.

### Tests

Documentation-only changes normally require direct inspection and `git diff --check`. Add a source contract only if a phrase encodes an operational invariant that is otherwise likely to regress; do not lock prose gratuitously.

### Acceptance criteria

- The guidance is capability-based and does not name a fake compaction command.
- No token thresholds or command quotas are introduced.
- Validation and final-review requirements remain unchanged.

## Tranche 3 - Consolidate existing `agent:checks` presentation

### Objective

Ensure one `npm run agent:checks -- --compact` invocation gives the smallest sufficient planning/checkpoint view without follow-up reads for facts it already owns.

### Primary files

- `scripts/agent-checks.mjs`;
- `scripts/agent-checks-lib.mjs` only if an already-owned report field is missing;
- `tests/agent-tooling.test.js`;
- `tests/agent-checks-report.test.js` when real Git-backed behavior changes.

### Required audit before editing

Inspect current compact output and answer:

- Does it already show base reference and merge base once?
- Does it show changed-file count without dumping all files?
- Does it deduplicate required and specialized commands?
- Does it separate iteration, checkpoint, and handoff guidance?
- Does it expose fail-safe/unclassified and untracked-whitespace conditions?

If all answers are yes, mark this tranche satisfied and do not change code.

### Permitted change

Only add or reorganize deterministic fields already derived by `agent:checks`. A suitable compact shape is:

```text
Base: origin/main (merge-base abc123...)
Changes: 7 files; Database, Tests
Iteration: node --test ...
Checkpoint: npm run validate:fast
Handoff: npm run validate:full; npm run <specialized-check>
Warnings: none
```

Exact wording is not prescribed. Preserve all current fail-safe details.

### Forbidden change

Do not:

- run the reported checks;
- persist their status;
- add a second classifier;
- infer GitHub state;
- hide untracked files;
- claim handoff readiness;
- turn advisory guidance into proof.

### Tests

Cover, as applicable:

- documentation-only changes;
- application plus schema changes;
- specialized checks without duplicated commands;
- unclassified important files;
- untracked whitespace failures;
- stable section ordering and concise output.

### Acceptance criteria

- One compact report contains every fact `agent:checks` owns that is needed to choose the next local command.
- It remains advisory.
- Output stays semantic rather than a changed-file or command dump.

## Tranche 4 - Read-only handoff batching guidance

### Objective

Reduce separate high-context model turns during final local and GitHub verification while preserving evidence boundaries.

### Implementation preference

This is documentation-first. Do not add a new script unless the tranche audit proves a repeated, repository-specific calculation cannot be expressed safely with existing Git/GitHub commands.

### Local checkpoint bundle

Guidance may recommend retrieving these together after the final edit:

```powershell
git status --short --branch
git diff --stat
git diff --check
```

This is read-only evidence. The complete intended-base-to-head diff remains a separate deliberate final review because its content can be large.

### Remote identity bundle

For an existing PR, retrieve in one request where the available GitHub capability permits:

- PR number and URL;
- state and Draft/Ready state;
- head branch and exact head SHA;
- base branch and base SHA;
- current check rollup.

Retrieve it at task start, then again only after push, branch movement, state change, or at final handoff when current evidence is required.

### Mutation boundaries

The following must remain separate actions with separate outcome reporting:

- commit;
- push;
- PR title/body mutation;
- marking Draft ready;
- merge;
- database migration;
- Worker deployment;
- live HTTP/behavior verification.

### Acceptance criteria

- Living guidance includes examples of safe read-only batching.
- It explicitly prohibits treating a batched command as one undifferentiated success claim.
- It does not authorize any new mutation.
- It does not introduce a Git or GitHub wrapper.

## Tranche 5 - Repeated-retrieval prevention

### Objective

Translate the existing constrained-retrieval principle into concrete behavior for long tasks.

### Documentation contract

Add or refine guidance stating:

- retrieve a repository authority once and reuse it while unchanged;
- retrieve PR head/base/Draft facts once at task start and refresh only after an event capable of changing them;
- use `rg -n` and bounded ranges before full-file reads;
- do not combine several full files in a parallel tool call merely to reduce latency;
- after a focused failure, read the failing block and directly implicated source instead of rerunning or retrieving the complete broad suite;
- during implementation inspect changed-file diffs; reserve the complete branch diff for final review;
- after compaction, rely on the retained task summary and reread only facts that are missing, ambiguous, or drift-prone.

### Optional executable change

None by default. Do not build file-read tracking, session state, or a retrieval cache. If the agent audit discovers duplicated output produced by a repository-owned command, fix that command's semantic presentation at its existing owner and add a focused regression test.

### Acceptance criteria

- Guidance is specific enough to act on but remains judgment-based.
- No repository state records which files an agent has read.
- No vendor/session dependency is added.

## Tranche 6 - Output-volume regression matrix

### Objective

Demonstrate that repository-owned compact presentation remains bounded without introducing model-token telemetry.

### Primary files

Reuse the PR #155 test surface:

- `tests/compact-terminal-validation.test.js`;
- `tests/compact-terminal-validation-regressions.test.js`;
- `tests/local-agent-validation.test.js`;
- `tests/ci-test-reporter.test.js` only for CI-specific behavior.

### Required audit

Confirm current tests already cover:

- a very large Node assertion value;
- many simultaneous Node failures;
- exact omitted-failure counts;
- bounded captured stdout/stderr;
- bounded Svelte messages and more than ten errors;
- malformed/incomplete parser failure staying non-zero;
- focused and verbose reproduction commands;
- local/CI reporter precedence;
- compact and verbose validation selecting identical logical checks.

Add tests only for missing cases. Prefer generated in-memory fixtures over large committed fixture files.

### Evidence format

The PR description or final handoff should include a small before/after table for representative repository-owned commands, measured as terminal characters or lines:

| Scenario | Before/current-main output | New output | Semantic evidence preserved |
| --- | ---: | ---: | --- |
| Green focused Node test | measured | measured | count, status |
| Large assertion failure | measured | measured | identity, location, bounded expected/actual, repro |
| Cascading Node failures | measured | measured | exact total, bounded details, repro |
| Green Svelte check | measured | measured | errors/warnings, status |
| Cascading Svelte errors | measured | measured | exact total, first ten, repro |
| Full validation | measured | measured | each selected check and final status |

Do not compare model tokens or parse a coding-agent rollout. The measurements must be reproducible from repository commands and fixtures.

### Acceptance criteria

- Every new presentation behavior has a deterministic regression owner.
- Measurements are reproducible without credentials or production data.
- Exit status, selection, and exact aggregate failure counts remain authoritative.

## Tranche 7 - Final integration and handoff review

### Objective

Verify that the combined giant PR improves agent workflow without broadening into a new orchestration system.

### Required process

1. Run `npm run agent:doctor` once for the local session.
2. During each code tranche, run the directly related focused tests.
3. After each coherent tranche, inspect its scoped diff and run only checkpoint validation that its risk requires.
4. Do not rerun an unchanged passing command unless later edits can invalidate its evidence.
5. Run `npm run agent:checks -- --compact` after the complete coherent change.
6. Execute every final required and specialized check it reports.
7. Inspect the complete `origin/main...HEAD` diff once at deliberate final review.
8. Verify the exact pushed head and current GitHub checks separately.

### Final review questions

- Did the PR change validation selection, or presentation/guidance only?
- Did any code begin parsing agent sessions, estimating tokens, or persisting retrieval state?
- Did any new command duplicate `agent:checks`, validation-contract, or GitHub ownership?
- Can a compact parser failure incorrectly produce success?
- Are Production/Preview, CI, deployment, and mutation boundaries unchanged?
- Does every documentation statement match executable current behavior?
- Were unrelated worktree files excluded from the commit?

### Acceptance criteria

- All repository-selected checks pass, or unrelated baseline failures are identified with separate evidence and are not silently absorbed into this PR.
- Complete diff review shows no application/runtime/schema/deployment behavior change.
- The PR remains reconstructible from its plan, commits, tests, and description without access to the originating conversation.

## Suggested commit boundaries inside one giant PR

Keep the work in one Draft PR but make each tranche independently reviewable:

1. `docs: add coding-agent context lifecycle guidance`
2. `refactor: tighten compact agent-checks presentation` — only if Tranche 3 finds a real gap
3. `docs: define read-only handoff batching boundaries`
4. `docs: clarify repeated-retrieval discipline`
5. `test: complete compact output regression matrix` — only for missing coverage
6. `docs: record context-efficiency implementation status`

Do not create empty or cosmetic commits for tranches already satisfied by PR #155. Record them as satisfied in the plan instead.

## Definition of done

The giant implementation PR is ready only when:

- PR #155 remains the sole owner of compact terminal validation presentation;
- living guidance defines Discovery, Implementation, Checkpoint, and Handoff phases;
- capability-aware compaction is recommended at the checkpoint-to-handoff boundary for tool-heavy sessions;
- existing `agent:checks` compact output has either been proven sufficient or narrowly improved without new authority;
- safe read-only batching and mutation boundaries are explicit;
- repeated unchanged retrieval guidance is concrete;
- no token counter, session parser, cache, command proxy, or retrieval DSL is introduced;
- any new output behavior has deterministic repository tests;
- all required validation and exact-head remote evidence are reported separately;
- the PR and this document are sufficient for a future coding agent that cannot access the original logs.
