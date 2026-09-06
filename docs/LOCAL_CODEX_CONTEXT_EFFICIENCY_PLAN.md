# Local Codex context-efficiency plan

_Status: proposed focused implementation plan. This document is a planning record, not living operational authority._

## Scope boundary

This PR is deliberately **local-coding specific**.

The new efficiency rules proposed here are intended for local Codex-style coding sessions where the coding agent has a usable repository checkout and command execution, including local implementation performed in a Hybrid session.

### Explicit GitHub Copilot exclusion

**Do not apply the new client/session-efficiency rules from this PR when coding through the GitHub Copilot plugin.**

That exclusion applies even if the Copilot plugin can see a local checkout or invoke local tools. GitHub Copilot should continue to follow the repository's existing universal safety/routing/validation guidance and whatever existing execution-mode guidance is already applicable to it; it must not inherit the new Codex-specific thread-lifecycle or retrieval-shaping rules merely because it happens to have local capabilities.

This is a narrow client-specific exception for context-efficiency behavior only. It must not weaken or replace the repository-wide safety, protected-boundary, validation, Git, GitHub, Production/Preview, deployment, or data-integrity rules.

Remote GitHub operation is also out of scope for these new efficiency rules. Existing Remote GitHub exact-head/write discipline remains unchanged.

## Why this follow-up exists

PR #156 added the correct repository-wide principles: progressive retrieval, bounded discovery, coherent checkpoints, context compaction when available, reuse of already-retrieved evidence, and efficient handoff retrieval.

A subsequent real local Codex implementation session still showed a material execution gap between those principles and actual agent behavior:

- a narrowly scoped task still expanded immediately into a large discovery batch;
- substantial files and documentation were repeatedly read in broad ranges or in full;
- multiple large reads were sometimes combined into one tool-output update;
- browser verification repeatedly regenerated long ad-hoc DevTools/CDP commands;
- broad validation was sometimes repeated even after focused checks and known baseline failures had already established the relevant state;
- the same long conversation continued across multiple separately coherent implementation/correction tranches, causing later small tasks to inherit a very large historical context.

The observed session's dominant cost was accumulated input context, not assistant prose. The problem is therefore primarily:

```text
many model calls
×
large retained local-session context
```

rather than insufficiently short user prompts.

The repository should tighten local Codex operating behavior without turning context management into a new framework or weakening validation.

## Governing design

For local Codex work:

```text
PR / branch / repository state = durable work memory
Codex conversation            = short-lived working memory
```

The local conversation should contain only the evidence needed to complete the current coherent implementation tranche. Durable facts that must survive between tranches should live in the PR, branch, commits, tests, repository documentation, or a compact handoff summary rather than relying on a single indefinitely growing Codex thread.

## Goals

1. Reduce unnecessary local Codex model calls and retained context growth.
2. Make progressive retrieval observable in actual command behavior, not only prompt wording.
3. Preserve enough context to avoid wasteful re-discovery inside one coherent tranche.
4. Reset working context between separately coherent implementation/correction tranches.
5. Reduce oversized textual tool outputs.
6. Reduce repeated generation of browser-control boilerplate where repository-owned local tooling can safely replace it.
7. Avoid duplicate broad validation while preserving the repository's full handoff contract.
8. Keep all new rules explicitly out of GitHub Copilot plugin workflows.
9. Avoid token telemetry, hard command quotas, retrieval caches, opaque orchestration wrappers, or a second validation DSL.

## Non-goals

Do not use this PR to:

- change application/product behavior;
- change schema, migrations, Production/Preview ownership, deployment, Cloudflare, D1, or R2 behavior;
- weaken repository-required final validation;
- alter Remote GitHub commit/ref mutation discipline;
- impose the new rules on GitHub Copilot plugin sessions;
- add model-token accounting or context-window telemetry;
- add fixed token-per-task limits or fixed command-count quotas;
- add a generic shell proxy;
- add file-read tracking or retrieval caches;
- add another changed-path classifier or validation-selection language;
- replace `agent:checks`, the validation contracts, or existing CI ownership;
- require a fresh thread between discovery, implementation, and validation when they are still part of one coherent tranche.

## Proposed implementation

### 1. Add a local-Codex-only living guidance layer

Create a concise living document for local Codex execution, for example:

```text
docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md
```

Its first section must state the applicability rule unambiguously:

```text
Applies: local Codex/local coding-agent sessions using a real checkout + shell.
Does not apply: GitHub Copilot plugin sessions.
Does not replace: universal AGENTS.md safety/routing/validation rules.
```

Keep the document short enough that loading it saves context overall. It should contain only the local execution rules that are not already sufficiently enforced by the universal authorities.

Update the minimum necessary routing authority so a local Codex agent can discover this document at session start. Prefer a very small conditional pointer in root `AGENTS.md` and/or `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md` rather than copying the full rules into universal guidance.

The pointer must preserve the existing capability-based Local / Remote GitHub / Hybrid model while also honoring the explicit user-requested GitHub Copilot exclusion for these new efficiency rules.

Do not make every agent load the new document.

### 2. Define one-thread-per-coherent-tranche lifecycle guidance

The local Codex guidance should distinguish **coherent tranche boundaries** from ordinary model turns.

Keep one thread through:

```text
bounded discovery
→ implementation
→ focused iteration
→ checkpoint validation
→ browser/UX verification when required
→ commit/push/handoff
```

Do not create a fresh thread merely because discovery ended or validation began when the same implementation tranche is still active.

After the tranche has reached a durable handoff boundary, normally end the thread. Examples:

- implementation committed and pushed;
- a PR correction tranche completed and handed off;
- an investigation produced a durable conclusion and the next task is a separate implementation;
- a later reviewer reports a new bounded correction after the prior tranche is already complete.

A subsequent bounded correction should normally start a fresh local Codex thread rather than inheriting the complete history of the previous implementation.

The fresh-thread handoff should be compact and durable. Normally it needs only:

- PR/branch identity;
- instruction to inspect the actual current head;
- the specific remaining finding/objective;
- protected invariants/non-goals;
- any validation caveat that materially changes the next step.

Do not paste the previous conversation or complete prior implementation history.

### 3. Tighten first-pass retrieval behavior

For clearly bounded local Codex work, the first retrieval pass should normally be limited to:

1. root/scoped routing needed for the target;
2. the directly affected symbol/file or bounded section;
3. the nearest directly related test/helper when needed.

Only broaden after a concrete unresolved dependency or protected boundary is discovered.

Use targeted commands such as:

```text
rg -n <symbol/pattern> <target paths>
Get-Content <file> | Select-Object -Skip <n> -First <bounded count>
```

or equivalent bounded reads.

Avoid by default:

- `Get-Content -Raw` on substantial source/documentation files;
- full-file reads when one relevant section is sufficient;
- speculative large documentation lists;
- repeated overlapping reads of the same unchanged file;
- broad repository searches after the implementation surface is already established;
- reading several large files in one combined command merely to reduce the visible command count.

This is an output-shaping rule, not a fixed command quota. One extra small targeted read is preferable to one huge batched output.

As a soft default for substantial text files, prefer a single relevant section or roughly 50–150 lines at a time. Exceed that when the complete artifact is genuinely required. Do not introduce token counters or fail tasks for crossing an arbitrary numeric threshold.

### 4. Shape tool output before it enters model context

Local commands should return the smallest output that answers the current question.

Prefer:

- `rg -n -m ...` or path-scoped `rg`;
- selected line ranges;
- compact structured summaries;
- `Select-Object -First` where exhaustive output is unnecessary;
- repository-owned compact validation/reporting modes.

Avoid returning tens of thousands of characters when a short excerpt or summary establishes the same fact.

Do not combine unrelated reads into one tool call simply to appear efficient. Batching is useful only when the combined output remains bounded and every result is needed for the same decision.

### 5. Prevent browser-verification boilerplate from dominating local sessions

The observed local UX work repeatedly regenerated long browser launch/DevTools/CDP programs for common operations such as:

- attach to the local browser;
- navigate to a local route;
- set desktop/mobile viewport;
- read a small set of DOM state;
- capture a screenshot.

Audit the current repository for an existing owner before adding anything new.

If no existing tool already owns these mechanics and the repeated pattern remains material, add the **smallest reusable local-only helper** that removes boilerplate without becoming a new browser-testing framework or validation DSL.

The helper, if justified, should own only generic local browser mechanics. Task-specific assertions should stay near the task/test that needs them.

Requirements:

- local-only;
- no production credentials/session extraction;
- no hidden mutation of Production/Preview data;
- compact textual output;
- explicit failure status;
- optional screenshots for human UX review;
- no replacement for existing automated application tests.

If a repository-owned helper is not justified after audit, document the preferred existing method instead of adding machinery for its own sake.

### 6. Consolidate local validation sequencing around repository ownership

Do not reduce validation. Reduce duplicate orchestration.

During implementation:

```text
nearest focused tests / Vite feedback
```

At a coherent checkpoint/handoff:

```text
agent:checks
→ run the current repository-required validation it reports
→ run specialized checks only when required
```

Avoid manually running a broad sequence and then immediately running a repository validator that substantially repeats the same work unless the first run was needed for diagnosis.

If a broad check exposes known unrelated baseline failures:

- record the exact failures once;
- prove the focused task area remains green;
- do not repeatedly rerun the same unchanged broad failing command unless later changes could affect it or final repository guidance explicitly requires another execution.

Preserve the existing rule that a clean compact pass is sufficient evidence and does not need an immediate verbose duplicate run.

### 7. Keep prompt optimization subordinate to execution optimization

Do not respond to the observed problem by substantially lengthening or over-specifying local implementation prompts.

The existing prompt model remains correct:

```text
goal
+ key invariants
+ scope/non-goals
+ work state
+ acceptance criteria
```

The repository should discover implementation details progressively.

The main optimization target is agent retrieval/tool behavior and session lifecycle, not shaving small amounts from already concise task prompts.

### 8. Add explicit Copilot non-inheritance checks

The implementation must make it difficult to accidentally broaden these rules to GitHub Copilot later.

At minimum, the living local guidance and its routing pointer should both make the exclusion visible.

Where the repository already has source/contract tests for agent guidance, add a focused assertion that:

- the new local Codex guidance is conditionally routed;
- GitHub Copilot plugin is explicitly excluded from the new rules;
- universal safety/validation guidance remains applicable.

Do not add a brittle prose snapshot test if the repository has no appropriate existing contract-test pattern.

## Suggested implementation sequence for the next local coding agent

Keep the implementation small and checkpointed.

### Step 1 — routing and authority

- Inspect current root `AGENTS.md` and `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md` at the actual PR head.
- Add the smallest conditional route for the local Codex-only guidance.
- Encode the GitHub Copilot plugin exclusion explicitly.

Checkpoint: confirm Remote GitHub/Hybrid write rules and universal safety rules are unchanged.

### Step 2 — local Codex guidance

Create the living local guidance with only:

- applicability/exclusion;
- coherent-tranche thread lifecycle;
- bounded first-pass retrieval;
- output shaping;
- validation sequencing;
- browser-tool reuse guidance.

Do not copy large sections of existing universal documents.

Checkpoint: read the combined guidance as a local Codex agent and as a GitHub Copilot agent; the former should discover it, the latter should be told not to use it.

### Step 3 — browser-helper audit

- Search narrowly for existing local browser/DevTools helpers.
- If an existing owner can be reused, document/use it.
- Only if repeated boilerplate has no owner and a small helper is clearly justified, implement the minimal local-only helper and its focused tests.

This step may legitimately result in **no new helper**.

### Step 4 — tests/documentation reconciliation

- Update only the relevant documentation index/task routing if needed.
- Add focused source/contract coverage only where an existing test owner makes sense.
- Mark this planning document historical/implemented when the PR implementation is complete, following the precedent used by `docs/AGENT_CONTEXT_EFFICIENCY_PLAN.md`.

### Step 5 — validation and handoff

- Use focused checks during editing.
- Follow current repository-owned checkpoint/handoff validation.
- Review the complete intended-base → current-head diff before handoff.
- Keep the PR Draft unless explicitly asked to mark it Ready.
- Do not merge.

## Acceptance criteria

The PR is complete when all of the following are true:

1. A local Codex agent can discover concise local-only context-efficiency guidance without every repository agent loading it.
2. The guidance explicitly says it does **not** apply to GitHub Copilot plugin sessions.
3. Existing universal safety, protected-boundary, validation, Git/GitHub, Production/Preview, deployment, and data-integrity rules remain unchanged in authority.
4. Local Codex guidance says one thread should cover one coherent implementation tranche, while later separate corrections normally start fresh with a compact handoff.
5. Clearly bounded local tasks start with scoped routing + target implementation + nearest relevant test/helper, broadening only for a concrete unresolved dependency.
6. Local retrieval guidance prefers bounded ranges and compact command output over full-file/raw/batched large reads.
7. The implementation introduces no token telemetry, fixed command quota, retrieval cache, shell proxy, or second validation DSL.
8. Local validation remains repository-owned and complete at handoff, while duplicate broad reruns are discouraged.
9. Repeated browser-control boilerplate is either routed to an existing owner or reduced with a narrowly justified local-only helper; no broad new browser framework is introduced.
10. Final documentation is reconciled so the planning record is not mistaken for living authority.

## Review checklist

A final reviewer should specifically verify:

- the new rules cannot be interpreted as mandatory for GitHub Copilot plugin workflows;
- the local-only routing does not accidentally weaken universal rules;
- Remote GitHub exact-head/write safeguards are untouched;
- the guidance reduces output/context creation rather than merely adding more prose to preload;
- any browser helper is genuinely smaller than the repeated ad-hoc code it replaces;
- validation remains complete and repository-owned;
- no application/runtime behavior changed.

## Final principle

For local Codex coding:

> Keep the repository and PR as durable memory; keep the conversation as bounded working memory.

For GitHub Copilot plugin coding:

> Do not apply the new local Codex context-efficiency rules from this PR. Continue using the existing applicable repository guidance.