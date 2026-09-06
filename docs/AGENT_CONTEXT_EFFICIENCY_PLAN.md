# Coding-agent context-efficiency plan

_Status: proposed focused implementation plan. PR #155 is the completed compact-terminal foundation; do not reimplement it here._

## Goal

Reduce coding-agent context growth and unnecessary repeated retrieval during long implementation sessions without weakening validation, review, Git, CI, deployment, migration, or Production/Preview safeguards.

The desired workflow is:

```text
bounded discovery
-> focused implementation
-> coherent checkpoint
-> context compaction when the client supports it
-> efficient read-only handoff retrieval
-> explicit mutations and exact-head verification
```

This is a context-lifecycle improvement, not a new orchestration system.

## Why this work exists

A representative implementation session accumulated very large repeated input because broad repository/tool output remained in context while many small late-stage validation, Git, GitHub, and status turns continued replaying it.

PR #155 already addressed terminal-output volume by making routine local validation compact by default and bounding failure diagnostics. The remaining problem is different: the lifetime of retrieved information across the agent session itself.

The goal of this PR is therefore to reduce avoidable model turns and repeated retrieval after the implementation surface is already known.

## Completed foundation: PR #155

PR #155 is merged into `main` and already owns routine validation presentation, including:

- compact-by-default local Node tests;
- bounded Node failure details and exact omitted counts;
- compact whole-project Svelte checking;
- compact local builds;
- compact-by-default `validate:fast` and `validate:full`;
- explicit verbose reproduction commands;
- compact specialized/operator/slide-review test paths;
- CI/automation/deployment presentation precedence;
- focused presentation regression tests and updated agent guidance.

Do not recreate those presentation changes in this PR.

## Repository invariants

The implementation must preserve all of the following:

1. `scripts/validation-contract.mjs` remains the validation selection/ordering authority.
2. `scripts/agent-checks-lib.mjs` remains the ordinary-CI changed-path classification authority.
3. `npm test` remains the complete maintained Node suite.
4. Focused/checkpoint validation never substitutes for required handoff validation.
5. A complete intended-base-to-head diff is still required at deliberate final review.
6. Local validation, GitHub CI, commit, push, PR mutation, merge, migration, deployment, and live behavior remain separate evidence claims.
7. Production D1/R2 must never be mutated for testing or measurement.
8. Unrelated tracked and untracked work must be preserved.
9. Do not add arbitrary token budgets, command quotas, context counters, caches, retrieval wrappers, file-read tracking, or a second validation/retrieval DSL.
10. Client context compaction is an optional host capability. The repository must not pretend an npm command can compact a model conversation.
11. Existing Remote GitHub exact-head write discipline remains authoritative: immediately before constructing a remote Git-data commit/ref mutation, establish the current feature-branch head and use that exact head as the intended parent/base.

## Audit against current `main`

This audit was completed before implementation so later coding agents do not rediscover or reimplement behavior that current `main` already owns.

### Context lifecycle / client compaction

**Status: narrowed; still needed.**

Current living guidance already covers:

- minimum-sufficient retrieval;
- targeted/bounded reads;
- reuse of unchanged information;
- avoiding repeated complete-diff retrieval during implementation;
- iteration -> checkpoint -> handoff validation;
- compact local validation;
- focused verbose reproduction only when needed;
- event-driven refresh of PR metadata.

The material remaining gap is the coding-client context lifecycle itself:

- when the active coding client exposes context compaction and the session has accumulated substantial file/tool output, compact after a coherent implementation checkpoint and before final handoff work;
- compaction is a host capability, not a repository command;
- after compaction, rely on the retained task summary and reread only facts that are missing, ambiguous, changed, or otherwise drift-prone.

### `agent:checks` presentation

**Status: already satisfied by current `main`. No implementation required.**

Current compact `agent:checks` already provides the facts needed to choose the next local command without dumping the complete changed-file list:

- base reference and merge base;
- changed-file count;
- affected areas;
- iteration guidance;
- checkpoint guidance;
- final required checks;
- specialized required checks without duplicate presentation;
- fail-safe unclassified-path warnings;
- untracked-file whitespace diagnostics.

Existing focused tests protect those contracts.

Do not modify `agent:checks` unless implementation of another item reveals a concrete missing deterministic field.

### Repeated-retrieval prevention

**Status: substantially satisfied by current `main`. No standalone implementation required.**

Current guidance already requires agents to reuse sufficient information already retrieved and avoid repeatedly loading unchanged files, metadata, large files, or the complete branch diff during active implementation.

The only remaining retrieval behavior specific to context compaction belongs in the focused context-lifecycle work below.

### Output-volume regression work

**Status: substantially satisfied by PR #155. No new executable work by default.**

PR #155 regression coverage already protects bounded Node failure output, large assertion payloads, cascading failures, exact omitted counts, bounded Svelte diagnostics, malformed/incomplete parser failures, compact/verbose reproduction, presentation precedence, and preservation of canonical validation selection.

Add new output-volume regression tests only if this PR introduces new executable presentation behavior. If the implementation remains documentation-only, no synthetic output-volume matrix is required.

## Remaining implementation

After the audit, the remaining work is intentionally small. The previous seven-tranche shape is replaced by two focused implementation areas plus final review.

# Tranche A - Context lifecycle and read-only retrieval efficiency

## Objective

Make the session lifecycle explicit so a coding agent stops accumulating and replaying unnecessary context once implementation is coherent.

The intended flow is:

```text
Discovery
-> Implementation
-> Checkpoint
-> compact client context when supported
-> Handoff
```

Transitions are semantic milestones, not token percentages or fixed command counts.

## Discovery

Discovery ends when the agent has established:

- the exact current work state;
- the implementation surface;
- directly related owners/tests;
- any protected/cross-cutting boundaries that require broader authority.

After that point, do not continue broad repository exploration merely for completeness.

## Implementation

During active implementation:

- use targeted implementation reads;
- reuse unchanged authorities already retrieved;
- inspect changed-file/scoped diffs rather than repeatedly loading the complete branch diff;
- run the cheapest directly related feedback;
- after a focused failure, inspect the failing block and directly implicated source instead of rerunning or rereading the complete broad suite.

## Checkpoint and client compaction

After a coherent implementation batch:

1. inspect the scoped change;
2. run the appropriate checkpoint validation for its risk;
3. resolve failures while implementation context is still useful;
4. when the active coding client exposes context compaction and the session has accumulated substantial tool/file output, compact before final handoff work.

Do not compact after every small edit. The useful boundary is after the main tool-heavy implementation phase and before a series of small final validation/Git/GitHub turns.

If compaction is unavailable, continue with bounded retrieval and reuse existing evidence. Do not invent a repository command that claims to compact context.

After compaction:

- rely on the retained task/checkpoint summary;
- reread only facts that are missing, ambiguous, changed, or drift-prone;
- do not reload unchanged authorities simply because the conversation was compacted.

## Read-only handoff batching

Related read-only facts may be retrieved together when the combined result remains easy to attribute and reason about.

The purpose is to reduce avoidable model round trips, especially late in long sessions where every additional turn may replay a large accumulated context.

Batching retrieval does **not** merge the underlying evidence claims. Each fact must still be interpreted independently.

Batching must also preserve each constituent command or request's individual success/failure result. A later successful read must never mask an earlier failing `agent:checks`, Git command, or other evidence-producing operation. If a compound shell form is used, it must retain per-command status or stop safely rather than reporting only the final command's exit status.

### Local checkout state

A useful checkpoint/handoff read may combine closely related local state such as:

```text
npm run agent:checks -- --compact
+ current branch/worktree status
+ a concise diff statistic
```

These answer different questions:

- `agent:checks` owns current validation/diff requirements;
- branch/worktree status shows current local state and unrelated/pre-existing changes;
- the diff statistic gives a compact scope/size overview.

Do not replace repository-owned diff/whitespace authority with a plain `git diff --check` shortcut. Current `agent:checks` deliberately uses merge-base-aware tracked-change validation plus separate untracked-file whitespace handling.

Do not require a globally clean worktree. A correct handoff may preserve unrelated pre-existing tracked or untracked work. The requirement is that task-owned changes and branch state are understood and reported accurately.

### Remote PR identity and checks

For an existing PR, closely related remote facts may be obtained in one read-only retrieval where the available GitHub capability permits, including:

- PR number and URL;
- open/closed state;
- Draft/Ready state;
- head branch and exact head SHA;
- base branch and base SHA;
- mergeability where available;
- current check/CI rollup for that head.

Retrieve these facts once at task start, then reuse them for ordinary read-only reasoning while they remain valid.

Refresh ordinary read-only PR metadata after an event capable of invalidating it, such as:

- push;
- rebase/update from `main`;
- known external branch movement;
- Draft/Ready state change;
- CI completion when fresh check state is needed;
- final handoff verification.

Do not refetch PR identity/head/base simply because another model turn occurred.

**Mandatory pre-write exception:** event-driven reuse does not replace the existing Remote GitHub exact-head safety rule. External branch movement may occur without an event visible to the coding agent. Immediately before constructing any remote Git-data commit/ref mutation, establish the current feature-branch head again, use that exact head as the intended parent/base, and move the branch only through the existing normal fast-forward discipline. `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md` remains authoritative for those write mechanics.

### Final exact-head verification

After the final push, retrieve enough related read-only evidence together to answer:

> Is the exact head that was reviewed/validated the exact head GitHub is showing and checking?

Useful facts include:

- local/current intended head SHA;
- remote PR head SHA;
- PR state;
- CI/check state for that exact SHA.

Exact-head verification is stronger than separate stale statements such as "CI passed" and "a push occurred".

## What must remain separate

Read-only retrieval may be batched. Mutations and operational boundaries remain explicit.

Do not batch the following into an opaque combined operation:

- commit;
- push;
- PR title/body mutation;
- marking Draft Ready;
- merge;
- database migration;
- Worker deployment;
- Production data mutation;
- live HTTP/behavior verification.

Each has a distinct authorization boundary, failure mode, and evidence claim.

In particular, do not introduce an `agent:finish`, `agent:handoff`, generic shell proxy, or Git/GitHub wrapper that validates, commits, pushes, edits the PR, waits for CI, merges, or deploys as one opaque action.

The desired optimization is:

```text
several related READS
-> retrieved together
-> fewer model turns
-> facts still interpreted independently
-> individual success/failure remains visible
```

not:

```text
many mutations
-> hidden behind one command
```

## Acceptance criteria

- Living guidance defines the Discovery -> Implementation -> Checkpoint -> Handoff lifecycle.
- Client compaction is capability-aware and occurs at the coherent checkpoint-to-handoff boundary when useful.
- No fake repository compaction command is introduced.
- After compaction, unchanged authorities are reused rather than reread by default.
- Related read-only evidence may be batched while preserving independent evidence interpretation and individual success/failure results.
- Ordinary PR metadata refresh is event-driven rather than turn-driven.
- Mandatory exact-head refresh immediately before remote Git-data commit/ref mutation is preserved and remains governed by the existing Remote GitHub write discipline.
- Existing merge-base/untracked whitespace authority is preserved.
- A globally clean worktree is not required when unrelated pre-existing work must be preserved.
- Mutations and Production/Preview operational boundaries remain separate.

# Tranche B - Small living-guidance updates

## Objective

Make the narrowed lifecycle discoverable from the repository's existing authorities without creating another subsystem or bloating every task prompt.

## Expected files

Prefer the smallest necessary documentation surface, likely:

- root `AGENTS.md`;
- `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`;
- `scripts/AGENTS.md` only where script/tooling guidance genuinely needs the rule;
- `docs/TESTING_AND_VALIDATION_GUIDANCE.md` only if validation-phase wording would otherwise become incomplete.

Update `docs/AGENT_TASK_MAP.md` only if routing ownership changes.

Do not edit historical plans merely to normalize wording.

## Required living guidance

The final living guidance should establish, without excessive duplication:

1. discovery ends when the implementation surface and required owners/tests are established;
2. unchanged repository authority is reused while still valid;
3. checkpoint validation occurs after a coherent batch rather than after every edit;
4. when client context compaction exists and the session is tool/file heavy, compact after the coherent checkpoint and before handoff;
5. after compaction, reread only missing/ambiguous/drift-prone evidence;
6. related read-only local/remote state may be retrieved together when attribution remains clear and each constituent result retains independent success/failure authority;
7. ordinary read-only PR metadata is refreshed after invalidating events rather than after ordinary model turns;
8. immediately before remote Git-data commit/ref mutation, refresh the exact current feature-branch head regardless of whether an invalidating event was observed;
9. compact validation output is sufficient evidence for a passing command; verbose reproduction is diagnostic only;
10. the complete intended-base-to-head diff is still inspected deliberately at final review;
11. mutations, deployment, migration, and live verification remain separate evidence claims.

## Forbidden implementation

Do not add:

- model-token telemetry;
- context-window thresholds;
- session-file parsing;
- conversation/tool-output persistence;
- file-read tracking;
- retrieval caches;
- a new `agent:handoff`/`agent:finish` command;
- a Git/GitHub command wrapper;
- another changed-path classifier;
- another validation-selection DSL.

## Tests

This tranche should remain documentation-only unless implementation uncovers a concrete executable contract gap.

Use direct inspection and repository-selected documentation validation. Add source-contract tests only when a specific operational invariant genuinely needs an executable owner; do not lock prose gratuitously.

# Final integration and handoff review

This is a review checklist, not a separate implementation tranche.

Before handing off PR #156 implementation:

1. run `npm run agent:doctor` once when local environment state needs establishing;
2. use directly related focused checks during any executable change;
3. run `npm run agent:checks -- --compact` after the complete coherent change;
4. execute every final required and specialized check it reports;
5. inspect the complete intended-base-to-head diff once at deliberate final review;
6. verify the exact pushed head and current GitHub checks separately;
7. for any Remote GitHub write, confirm the feature-branch head was refreshed immediately before constructing the Git-data commit/ref mutation.

Confirm:

- validation selection was not weakened;
- no second retrieval/validation authority was introduced;
- no agent-session parsing, token estimation, cache, or persisted retrieval state was added;
- batched read-only evidence cannot hide a constituent failure behind a later successful command;
- Production/Preview, CI, deployment, migration, and mutation boundaries are unchanged;
- Remote GitHub exact-head write safety remains intact;
- documentation matches executable current behavior;
- unrelated worktree state was preserved;
- the final implementation is as small as the audited gaps permit.

## Success criteria

This work succeeds when future coding agents naturally follow this pattern:

```text
retrieve only enough to establish the implementation surface
-> implement with targeted reads
-> validate at a coherent checkpoint
-> compact client context when available and useful
-> reuse retained evidence
-> retrieve related read-only handoff state efficiently
-> run required final validation
-> refresh exact branch head immediately before any remote Git-data write
-> perform explicit authorized mutations
-> verify exact-head remote state
```

The repository should gain clearer context-lifecycle guidance, not another context-management subsystem.
