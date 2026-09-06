# Local Codex context-efficiency plan

_Status: proposed focused implementation plan. This document is a planning record, not living operational authority._

## 1. Scope boundary

This PR is deliberately **specific to local Codex coding**.

The new efficiency guidance proposed here is intended for Codex sessions that are actively coding against a usable local Flash-Cards checkout with shell/command execution, such as the local Codex coding workflow used from VS Code. It may also apply to the local-execution side of a Codex session that additionally has GitHub access.

### Explicit ChatGPT GitHub-plugin exclusion

**Do not apply the new local-Codex efficiency guidance from this PR when ChatGPT is working on the repository through the GitHub plugin/connector in ChatGPT chat.**

That ChatGPT + GitHub-plugin workflow is a separate execution surface. It should continue to use the repository's existing universal guidance plus the applicable Remote GitHub execution/write discipline. The new local-Codex retrieval and shell-output rules are not intended to govern that workflow.

This PR is therefore about:

```text
Local Codex coding
real checkout + local shell
→ apply the local-Codex efficiency overlay
```

and explicitly not about:

```text
ChatGPT chat + GitHub plugin/connector
remote repository / PR operations
→ use existing Remote GitHub guidance
→ do not load or apply the local-Codex efficiency overlay
```

This exception is limited to the new context-efficiency overlay. It does **not** change or weaken repository-wide safety, protected-boundary, validation, Git/GitHub, Production/Preview, deployment, or data-integrity rules.

GitHub Copilot is not the subject of this PR and should not be named as the excluded workflow.

## 2. Why this follow-up exists

PR #156 established useful repository-wide principles: progressive retrieval, bounded discovery, reuse of already-retrieved evidence, coherent checkpoints, compact validation output, and efficient handoff retrieval.

A later real local Codex implementation session showed that those principles were still not strong enough to shape actual local command behavior.

The measured session used approximately:

```text
197 model calls
28.54M recorded tokens
28.46M input tokens
99.71% of recorded tokens as input
~98% of input reported as cached
~25k input tokens near the start
~245k input tokens near the end
```

These figures are diagnostic of context growth. They should not be treated as a direct billing calculation because cached-input accounting may differ from fresh-input cost.

The important operational signal is that the dominant load came from repeatedly carrying a very large accumulated context, not from assistant prose.

The same session showed concrete behaviors that created that context:

- a narrowly scoped task immediately expanded into a large discovery batch;
- substantial source and documentation files were read in broad ranges or in full before a concrete dependency required them;
- the same large files were revisited with overlapping reads;
- several large reads were combined into single commands, reducing command count while creating very large context updates;
- browser verification repeatedly regenerated long ad-hoc Edge/DevTools/CDP programs for common local operations;
- broad validation commands were sometimes run in overlapping sequences even after focused checks and known unrelated baseline failures had established the relevant state;
- small follow-up changes inherited a large amount of prior locally retrieved evidence.

The last observation is useful evidence about context growth, but **this PR will not prescribe when the user or agent must start a new Codex thread**. Thread choice remains outside this plan.

The optimization target is narrower:

> Reduce unnecessary context creation inside local Codex coding sessions by making retrieval, shell output, browser verification, and validation orchestration more disciplined.

## 3. Governing design

The repository already contains most of the semantic rules needed for safe work. This PR must not create another agent framework.

The desired model is:

```text
existing universal repository guidance
        +
small conditional local-Codex efficiency overlay
        ↓
question-driven retrieval
bounded command output
reuse of current evidence
focused iteration
repository-owned final validation
```

The overlay should improve local execution behavior without changing the meaning or authority of existing repository contracts.

The separation of execution surfaces is intentional:

```text
Local Codex
→ optimize local retrieval and shell/tool behavior

ChatGPT + GitHub plugin
→ existing Remote GitHub behavior
→ no local-Codex overlay
```

## 4. Goals

1. Make the new guidance apply specifically to local Codex coding.
2. Ensure ChatGPT + GitHub-plugin workflows do not load or inherit the new local-Codex overlay.
3. Reduce broad/speculative retrieval before the implementation surface is established.
4. Reduce full-file, repeated, overlapping, and unnecessarily batched textual reads.
5. Encourage each retrieval to answer a concrete unresolved implementation question.
6. Shape shell/tool output before it enters model context.
7. Reuse facts already established in the current local session while they remain valid.
8. Reduce repeated browser-control boilerplate for local UX checks where a smaller reusable owner is justified.
9. Reduce duplicated validation orchestration while preserving every repository-required final check.
10. Keep task prompts concise; do not compensate for execution inefficiency by preloading more instructions.
11. Leave application behavior, runtime behavior, CI semantics, Production/Preview boundaries, migrations, deployment, and data ownership unchanged.

## 5. Non-goals

Do not use this PR to:

- prescribe when a user or agent must start a new Codex conversation;
- require fresh threads for later corrections;
- change how ChatGPT uses the GitHub plugin/connector;
- impose local shell-retrieval rules on Remote GitHub work;
- add token counters, token-budget enforcement, context-window telemetry, or session-log parsers;
- add fixed command-count limits;
- turn an illustrative line-range heuristic into a failing quota;
- add file-read tracking or retrieval caches;
- add a generic shell proxy;
- add a second retrieval DSL;
- add another changed-path classifier or validation-selection language;
- replace `agent:checks`, validation contracts, or current CI ownership;
- weaken or skip repository-required final validation;
- change Remote GitHub commit/ref mutation discipline;
- change application/product behavior;
- change schema, migrations, Cloudflare, D1, R2, deployment, Production, or Preview behavior.

## 6. Proposed implementation workstreams

### Workstream A — local-Codex-specific routing and authority

Create a concise living authority for the local overlay, for example:

```text
docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md
```

The exact name may change if the repository already has a better owner at the actual PR head. Do not create a parallel document unnecessarily.

The living guidance should begin with an applicability block equivalent to:

```text
Applies: local Codex coding against a real checkout with local command execution.
Does not apply: ChatGPT chat operating through the GitHub plugin/connector.
Does not replace: universal AGENTS.md safety/routing/validation rules.
```

Add only the smallest routing pointer required for the intended local Codex surface to discover the overlay. Likely candidate owners are root `AGENTS.md` and/or `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`, but the implementation agent must inspect the actual PR head and choose the minimum authoritative surface.

Do **not** copy the entire local overlay into root `AGENTS.md`. Doing so would increase preload cost for every coding surface, including the ChatGPT GitHub workflow that the user explicitly wants excluded.

#### Routing model to preserve

The repository currently distinguishes Local checkout, Remote GitHub, and Hybrid execution by available capabilities for universal behavior. This PR should preserve that model.

The local-Codex efficiency overlay is narrower than those universal modes. Its routing should make clear that:

```text
universal execution mode
!=
automatic applicability of every client-specific efficiency overlay
```

In particular, ChatGPT + GitHub plugin should remain on the existing Remote GitHub path and should not be made to load local-Codex guidance merely because the repository contains it.

#### Reviewer proof points

A reviewer should be able to establish all of the following:

- a local Codex agent can discover the overlay without broad search;
- ChatGPT + GitHub-plugin operation is explicitly outside the overlay;
- existing Remote GitHub guidance remains the authority for ChatGPT GitHub writes;
- the exclusion affects only the new efficiency overlay;
- universal safety and validation rules remain applicable;
- Remote GitHub exact-head/write safeguards are untouched;
- the implementation does not add unnecessary client-specific prose to every root-agent prompt.

#### Merge-blocking routing failures

Treat the following as merge-blocking:

- the overlay is loaded unconditionally by every agent;
- the overlay is described as applying to all Local/Hybrid-capable clients without preserving the explicit ChatGPT GitHub-plugin exclusion;
- Remote GitHub guidance is weakened or replaced;
- a coding surface can interpret the exclusion as exempting it from universal safety or validation;
- GitHub Copilot is incorrectly documented as the user-requested exclusion.

### Workstream B — question-driven progressive retrieval

The universal guidance already says to retrieve the minimum evidence necessary. The local Codex overlay should make that principle operational enough to change command behavior.

For a clearly bounded task, the first retrieval should normally establish only:

1. the minimum applicable routing/scoped authority;
2. the directly affected symbol/file or bounded implementation region;
3. the nearest directly related test/helper when needed to answer the next implementation question.

Broadening should require a concrete reason. Examples:

```text
Need helper X because target function delegates persistence to X.
Need scoped DB authority because the proposed change crosses a migration boundary.
Need server route Y because client behavior depends on its returned status contract.
Need component Z because the target page renders state owned by Z.
```

Avoid broadening merely because additional related files exist.

#### Preferred retrieval pattern

Use targeted search first, then bounded reads around the relevant result. Examples:

```text
rg -n <symbol/pattern> <target paths>
Get-Content <file> | Select-Object -Skip <n> -First <bounded range>
```

or equivalent commands for the active platform.

For substantial text files, a small relevant section is normally preferable to the complete file. Roughly 50–150 lines may be a useful **heuristic** for many source reads, but it is not a quota and must not prevent complete reads when full-file semantics genuinely matter.

#### Avoid by default

- `Get-Content -Raw` on a substantial source or documentation file when one section answers the question;
- reading an entire long Svelte/server/test file before locating the relevant symbol;
- speculative documentation lists read “for completeness”;
- overlapping reads of unchanged content without a reason;
- broad repository searches after the implementation surface is already established;
- reading implementation history before current code unless history is materially needed;
- combining several large file reads into one command merely to reduce visible command count.

#### Legitimate reasons to broaden

The overlay must not discourage necessary retrieval for:

- schema/migrations;
- auth/security;
- Production/Preview ownership;
- Cloudflare/runtime/deployment;
- persistent storage/R2 lifecycle;
- cross-subsystem behavior;
- substantial architecture/refactoring;
- exploratory audits where broad investigation is itself the task;
- full-file contracts where relationships across the whole artifact materially matter.

Universal protected-boundary escalation remains authoritative.

#### Vetting questions

The next vetting agent should inspect whether the implemented guidance actually answers:

- What should a local Codex agent retrieve first for a bounded task?
- What evidence justifies broadening?
- Does the guidance discourage broad reads without making necessary full-file reads taboo?
- Is one extra small retrieval clearly preferred over one huge multi-file dump?
- Are protected boundaries still allowed to trigger broad investigation automatically?

### Workstream C — tool-output shaping

Before executing a local command, prefer an output form that answers the current question without dumping unrelated material into model context.

Prefer:

- path-scoped `rg`;
- `rg -m` / bounded matches where exhaustive results are unnecessary;
- selected line ranges;
- compact structured output containing only required fields;
- `Select-Object -First` or equivalent where only representative/current results are needed;
- repository-owned compact validation reporters;
- summary commands that preserve individual failure authority.

Avoid:

- tens of thousands of characters when a small excerpt proves the same point;
- recursive listings with no useful path/result bound;
- full logs when only the failing section is needed;
- large multi-file concatenations that create one oversized context update;
- rerunning the same unchanged query solely because another model turn occurred.

#### Batching rule

Batching is not automatically efficient.

Batch related reads only when:

- all outputs are required for the same immediate decision;
- the combined output remains reasonably bounded;
- each constituent result retains clear success/failure attribution.

One extra small command is preferable to one enormous batch that pollutes every later local model call.

#### What not to build

Do not implement a command wrapper that attempts to enforce output size globally. Do not add a new shell abstraction, mandatory byte counter, or failure threshold. The goal is better default behavior using existing tools and repository-owned compact modes.

### Workstream D — reuse already-established local evidence

The local overlay should reinforce the existing rule that facts do not need to be re-read simply because the agent advanced to another model turn.

Examples of reusable evidence while unchanged:

- target file content already inspected;
- current PR number/base/head/Draft state after it has been established;
- scoped guidance already loaded;
- focused test result after no relevant code changed;
- known unrelated baseline failures after no relevant dependency changed.

Refresh evidence after an invalidating event, not reflexively.

Examples of invalidating events:

- a source edit that affects a previous test result;
- push/rebase/update from `main` affecting head/base facts;
- known external branch movement;
- entering final exact-head verification;
- changes to a file/authority previously inspected;
- changes to dependencies/configuration that can invalidate an earlier environment conclusion.

This workstream should reuse current universal semantics rather than duplicate them at length.

#### Important distinction

Reusing established evidence must not become stale-state blindness. The rule is:

```text
reuse while validity conditions still hold
refresh when an invalidating event occurs
```

not:

```text
never reread
```

### Workstream E — browser/UX verification audit

The observed local session repeatedly generated long bespoke DevTools/CDP scripts for common operations:

- connect to an already-running browser;
- navigate to a local route;
- set viewport dimensions;
- read a few DOM/computed-style values;
- capture screenshots.

That boilerplate is a candidate for repository-owned reuse, but **adding a new browser helper is not mandatory**.

The implementation agent must first search narrowly for an existing owner.

#### Decision test for adding a helper

Add a helper only if all are true:

1. the same generic mechanics are already repeated materially in local Codex UX work;
2. no existing repository helper owns them adequately;
3. the helper can be substantially smaller than the repeated ad-hoc scripts it replaces;
4. it can stay local-only and generic;
5. it does not become a second browser-testing framework;
6. it does not weaken or replace application tests;
7. its output can be concise and machine-readable enough for local agent use.

If these conditions are not met, document/reuse the best existing method and add no helper.

#### If a helper is justified

Keep its responsibilities narrow, for example generic mechanics such as:

```text
connect
navigate
viewport
small DOM query
screenshot
```

Task-specific product assertions should remain in the relevant test or task logic, not accumulate inside a universal browser script.

Safety requirements:

- local-only targets;
- no Production/Preview mutation;
- no credential/cookie/session-secret dumping;
- no broad browser-profile inspection;
- explicit failure exit/status;
- compact output;
- screenshots only where useful for human UX verification.

#### Browser-helper merge blockers

If a helper is added, reject it if it:

- accepts arbitrary remote/Production URLs by default;
- dumps cookies, auth headers, local-storage secrets, or credentials;
- becomes a product-specific assertion monolith;
- duplicates an existing browser-test framework without strong justification;
- hides browser failures behind a successful wrapper exit;
- emits more context than the ad-hoc scripts it was meant to replace.

### Workstream F — validation sequencing without duplication

This PR must not reduce validation coverage.

The desired local sequence remains:

```text
while editing
→ nearest focused test / Vite feedback appropriate to risk

coherent checkpoint/handoff
→ agent:checks
→ repository-required validation reported by current tooling
→ required specialized checks
→ final intended-base -> current-head review
```

The efficiency change is to avoid manually assembling a broad validation sequence and then immediately invoking repository-owned validation that substantially repeats the same work without a diagnostic reason.

#### Known baseline failures

If a required broad validation exposes unrelated pre-existing failures:

- record the exact failures and command once;
- establish focused evidence that the current task area remains green;
- preserve the failure in the final report;
- do not repeatedly rerun an unchanged failing broad command unless later edits could affect it or current repository guidance explicitly requires another run.

A compact clean pass remains sufficient evidence. Do not immediately reproduce it verbosely unless diagnostics are needed.

#### What remains mandatory

Efficiency must never become a reason to omit:

- repository-required final validation;
- a specialized check required by the affected subsystem;
- final whole-PR/intended-base-to-head review;
- exact-head CI/state verification where the workflow requires it;
- protected-boundary checks triggered by the implementation.

#### Reviewer requirement

A reviewer must distinguish:

```text
less duplicated validation orchestration
```

from:

```text
less validation
```

Only the former is acceptable.

### Workstream G — prompt discipline

Do not respond to the token/context problem by making local implementation prompts much longer.

The existing local-agent prompt model remains:

```text
goal
+ important invariants
+ scope/non-goals
+ work state
+ acceptance criteria
```

Repository state and routing should supply implementation detail progressively.

This PR should optimize execution behavior, not force ChatGPT planning prompts to preload more source paths, documentation, tests, or implementation history.

This also means the local overlay itself should remain concise after implementation. The planning document may be detailed for review, but the eventual living guidance should not reproduce this entire plan.

### Workstream H — regression/contract coverage

Where the repository already has an appropriate source/contract-test owner, add focused coverage for the new routing behavior.

Useful assertions include:

- the local Codex overlay exists and is conditionally routed;
- the routing text clearly identifies local Codex as the intended surface;
- ChatGPT + GitHub-plugin/connector operation is explicitly excluded from the overlay;
- the exclusion is specific to the new efficiency overlay, not universal safety/validation;
- existing Remote GitHub exact-head/write guidance remains referenced/unchanged where appropriate;
- no mandatory token/command quota is introduced.

Do not create a brittle full-document prose snapshot merely to test wording. Prefer narrow semantic/contract assertions consistent with existing repository test patterns.

If a browser helper is added, give it focused tests for its generic contract and failure behavior. Do not invent browser-helper tests if no helper is added.

#### Negative regression requirement

The test/review story should explicitly consider the negative case:

```text
ChatGPT + GitHub plugin
→ should not be instructed to load LOCAL_CODEX_EXECUTION_GUIDANCE
```

This is the user's key scope boundary and should be easy for a future reviewer to verify.

## 7. Likely implementation surfaces — not a mandatory preload list

The next implementation agent should inspect the actual current PR head and use progressive retrieval. Based on current ownership, likely surfaces include:

```text
AGENTS.md
docs/DEVELOPMENT_EXECUTION_WORKFLOW.md
docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md      # new only if needed
relevant existing agent-guidance contract tests
scripts/                                    # only if browser-helper audit justifies code
```

`docs/AGENT_TASK_MAP.md`, `docs/DOCUMENTATION_INDEX.md`, or testing guidance should be changed only if the new living authority actually requires routing/index reconciliation.

This section is a map for the implementation/vetting agent, not an instruction to preload every file.

## 8. Suggested implementation sequence

### Step 1 — establish the minimal authority change

- Inspect current root execution/routing language at the actual PR head.
- Confirm how Remote GitHub guidance is currently routed for ChatGPT/plugin-style GitHub work.
- Decide where the smallest conditional pointer for local Codex belongs.
- Implement the explicit local-Codex applicability and ChatGPT GitHub-plugin exclusion without altering universal execution semantics.

Checkpoint questions:

- Can local Codex find the overlay?
- Does ChatGPT + GitHub remain on the existing Remote GitHub path?
- Did the implementation accidentally make client identity override universal safety?
- Did it add broad preload cost to agents that do not need the overlay?

### Step 2 — add the concise living local-Codex overlay

Include only rules not already adequately enforced elsewhere:

- applicability/exclusion;
- question-driven bounded retrieval;
- command-output shaping;
- reuse of still-valid evidence;
- browser-tool reuse/audit guidance;
- validation sequencing.

Do not copy large sections of existing universal documents.

Checkpoint:

Read the resulting routing from both perspectives:

```text
local Codex agent
→ discovers the overlay

ChatGPT + GitHub plugin
→ does not need or inherit the overlay
→ continues to existing Remote GitHub guidance
```

### Step 3 — browser-helper audit

- Search narrowly for existing local browser/DevTools helpers.
- If an existing owner can be reused, document/use it.
- Only if repeated boilerplate has no owner and a small helper is clearly justified, implement the minimal local-only helper and focused tests.

This step may legitimately result in **no new helper**.

Record the decision and rationale in the PR/handoff so the reviewer knows the audit was performed rather than skipped.

### Step 4 — focused routing/contract coverage

- Find the existing test owner for machine-facing repository guidance, if one exists.
- Add narrow assertions for local-Codex routing and ChatGPT GitHub-plugin non-inheritance.
- Avoid full-document snapshots.
- If no appropriate test owner exists, do not create a large new test framework solely for prose; provide explicit diff/review evidence instead.

### Step 5 — documentation reconciliation

- Update only indexes/task routing that genuinely need to know about the new living authority.
- Avoid adding multiple paths to the same overlay if one route is sufficient.
- Mark this planning document historical/implemented when implementation is complete, following the repository's precedent for retained planning records.
- Ensure no remaining text incorrectly says GitHub Copilot was the excluded workflow.

### Step 6 — validation and final handoff

- Use focused checks while editing.
- Follow repository-owned checkpoint/handoff validation.
- Run any specialized checks reported for the changed guidance/scripts.
- Review the complete intended-base -> current-head diff.
- Verify the exact final PR head and Draft state.
- Keep the PR Draft unless explicitly asked otherwise.
- Do not merge.

## 9. Acceptance criteria

The PR implementation is complete only when all of the following are true:

1. A local Codex coding session can discover concise local-only context-efficiency guidance without speculative broad search.
2. ChatGPT chat using the GitHub plugin/connector is explicitly outside the overlay.
3. ChatGPT + GitHub continues to use existing Remote GitHub execution/write guidance.
4. No text incorrectly identifies GitHub Copilot as the user-requested excluded workflow.
5. Existing universal safety, protected-boundary, validation, Git/GitHub, Production/Preview, deployment, and data-integrity authority remains intact.
6. The new living guidance is substantially shorter than this planning document and does not duplicate universal guidance unnecessarily.
7. Clearly bounded local tasks are directed toward scoped routing + target implementation + nearest relevant test/helper before broader retrieval.
8. Broadening is tied to a concrete unresolved dependency, protected boundary, or legitimately exploratory task.
9. Local retrieval guidance prefers bounded ranges and compact output over raw/full/batched large reads where the latter are unnecessary.
10. Full-file reads remain allowed when whole-file semantics materially matter.
11. The guidance discourages repeated unchanged retrieval and defines evidence invalidation conceptually rather than introducing caches/telemetry.
12. Batching guidance optimizes total output, not visible command count.
13. No token telemetry, fixed token quota, command quota, retrieval cache, shell proxy, or second retrieval/validation DSL is introduced.
14. Local validation remains repository-owned and complete at handoff.
15. Duplicate broad validation reruns are discouraged without allowing required final checks to be skipped.
16. Browser-control boilerplate is either routed to an existing owner or reduced with a narrowly justified local helper; adding a helper is not mandatory.
17. Any added browser helper is local-only, compact, non-secret-exposing, explicit on failure, and does not become a second browser-testing framework.
18. Prompt guidance remains goal/invariants/scope/acceptance focused rather than preloading more repository content.
19. Focused contract coverage exists where a suitable existing test owner permits it, or the absence of such coverage is explicitly justified.
20. The retained planning record is clearly marked historical/non-authoritative after implementation.
21. No application/runtime/schema/migration/Production/Preview/deployment behavior changes are introduced.
22. The final reviewer can distinguish the local Codex overlay from existing Remote GitHub guidance without ambiguity.

## 10. Expected implementation evidence at handoff

The implementation agent should report enough evidence for a later principal reviewer to vet the change efficiently.

At minimum report:

```text
final PR head SHA
files changed
where local Codex is routed to the overlay
where ChatGPT + GitHub plugin is excluded
living guidance path
whether a browser helper was added or reused, and why
focused tests run
repository-owned final validation run
known unrelated failures, if any
final Draft/Ready state
```

If a browser helper is added, also report:

```text
helper path
supported local operations
safety boundary
focused helper tests
example compact output shape
```

If no helper is added, report the existing owner/method that made a new helper unnecessary, or explain why the repeated pattern did not justify repository code.

## 11. Principal-review checklist

A final vetting agent should review the complete intended-base -> current-head diff, not only the latest correction delta.

### Scope and routing

- Is this still a local-Codex context-efficiency PR rather than a general agent-policy rewrite?
- Is ChatGPT + GitHub plugin clearly the excluded workflow?
- Are all mistaken GitHub Copilot references gone?
- Does ChatGPT + GitHub still follow existing Remote GitHub guidance?
- Can local Codex find the overlay without every agent being forced to preload it?
- Is the routing conditional and unambiguous?

### Retrieval behavior

- Does the living guidance provide an actionable first retrieval pattern?
- Does it require a concrete reason to broaden without making broad retrieval impossible?
- Does it prefer bounded symbol/line reads for substantial files?
- Does it warn against broad multi-file concatenation merely to lower command count?
- Does it preserve legitimate full-file/protected-boundary investigation?

### Evidence reuse

- Does it discourage repeated unchanged reads?
- Does it explain when earlier evidence becomes stale enough to refresh?
- Does it avoid implementing a retrieval cache or tracking framework?

### Browser behavior

- Was existing browser tooling actually audited before new code was introduced?
- If a helper exists, is it smaller/simpler than the repeated ad-hoc CDP programs?
- Is it local-only and safe with credentials/session state?
- Does it preserve real browser verification rather than replacing it with source assertions?

### Validation

- Is final validation still complete?
- Are focused tests used for iteration?
- Does repository-owned validation remain authoritative?
- Is the only optimization removal of unnecessary repeated orchestration?
- Are known baseline failures reported rather than silently ignored?

### Architecture and maintenance

- Is the living overlay concise enough to save more context than it adds?
- Are rules placed in the smallest appropriate authority rather than duplicated across documents?
- Are there unnecessary scripts/frameworks introduced by an efficiency PR?
- Is the planning document reconciled as historical after implementation?
- Did any application behavior change accidentally enter the diff?

## 12. Merge-blocking conditions

Do not merge if any of the following remain:

- ChatGPT + GitHub plugin is not clearly excluded from the local overlay;
- GitHub Copilot is still described as the user-requested exclusion;
- the new overlay is globally preloaded by every coding surface without necessity;
- Remote GitHub write/safety discipline is weakened;
- final validation is reduced rather than merely de-duplicated;
- the implementation adds hard token/command quotas or new telemetry contrary to scope;
- a browser helper exposes secrets or can accidentally target Production/Preview;
- a browser helper duplicates a broader framework without justification;
- local retrieval guidance materially blocks necessary protected-boundary investigation;
- living guidance is so large/duplicative that it plausibly increases ordinary context cost rather than reducing it;
- the final planning document remains presented as current operational authority after implementation;
- unrelated application/runtime changes are included.

## 13. Success test against the motivating failure mode

A useful mental test for the final reviewer is a future bounded local Codex change to one Study-page behavior.

With this PR implemented, the expected pattern should be closer to:

```text
read minimum routing needed
→ locate target symbol
→ inspect bounded implementation context
→ inspect nearest relevant test/helper
→ make focused change
→ run focused feedback
→ broaden only if code reveals a real dependency
→ run repository-owned handoff validation
```

and less like:

```text
read multiple entire docs
+ read several full source files
+ run broad repository searches
+ concatenate large outputs
+ regenerate browser-control programs repeatedly
+ rerun overlapping broad validation
before the implementation question requires those steps
```

For ChatGPT using the GitHub plugin, this local shell/retrieval overlay should simply not enter the workflow; existing Remote GitHub guidance remains authoritative.

## 14. Final principle

For local Codex coding:

> Retrieve only enough local evidence to make the next correct decision, keep command output compact, and let repository-owned validation remain authoritative.

For ChatGPT chat using the GitHub plugin:

> Do not apply this local-Codex overlay. Continue using the repository's existing Remote GitHub guidance.
