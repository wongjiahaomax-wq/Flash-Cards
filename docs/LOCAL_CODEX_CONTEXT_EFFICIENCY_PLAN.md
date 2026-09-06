# Local Codex context-efficiency plan

_Status: proposed focused implementation plan. This document is a planning record, not living operational authority._

## 1. Scope boundary

This PR is deliberately **specific to local Codex coding**.

The new efficiency guidance proposed here is intended for Codex sessions that are actively coding against a usable local Flash-Cards checkout with shell/command execution. It may also apply to the local-execution side of a Hybrid Codex session.

### Explicit GitHub Copilot exclusion

**Do not apply the new efficiency guidance from this PR when coding through the GitHub Copilot plugin.**

This exclusion applies even if GitHub Copilot can see the same local checkout, run terminal commands, inspect files, or otherwise has capabilities that resemble Local/Hybrid Codex execution.

The routing decision for this new guidance therefore cannot be based only on capabilities such as:

```text
has local checkout
+
has shell
```

because that would incorrectly capture GitHub Copilot plugin sessions.

GitHub Copilot should continue to use the repository guidance that already applies to it. Nothing in this PR should require Copilot to adopt the new Codex-specific retrieval/output-shaping behavior.

This exception is limited to the new context-efficiency overlay. It does **not** exempt Copilot from universal repository safety, protected-boundary, validation, Git/GitHub, Production/Preview, deployment, or data-integrity rules.

Remote GitHub execution is also outside the scope of the new local-Codex efficiency overlay. Existing Remote GitHub exact-head/write discipline remains unchanged.

## 2. Why this follow-up exists

PR #156 established the correct repository-wide principles: progressive retrieval, bounded discovery, reuse of already-retrieved evidence, coherent checkpoints, compact validation output, and efficient handoff retrieval.

A later real local Codex implementation session showed that those principles were still not strong enough to shape actual command behavior.

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

These figures are diagnostic of context growth; they should not be treated as a direct billing calculation because cached-input accounting may differ from fresh-input cost.

The important operational signal is that the dominant load came from repeatedly carrying a very large accumulated context, not from assistant prose.

The same session showed several concrete behaviors that created that context:

- a narrowly scoped task immediately expanded into a large discovery batch;
- substantial source and documentation files were read in broad ranges or in full before a concrete dependency required them;
- the same large files were revisited with overlapping reads;
- several large reads were combined into single commands, reducing command count but increasing one model-context update substantially;
- browser verification repeatedly regenerated long ad-hoc Edge/DevTools/CDP programs for common local operations;
- broad validation commands were sometimes run in overlapping sequences even after the relevant focused state and known unrelated baseline failures were established;
- small follow-up changes inherited the accumulated context of much larger earlier work.

The last observation is useful evidence about context growth, but **this PR will not impose a rule about when the user or agent must start a new Codex thread**. Thread choice remains a workflow decision outside this PR.

The optimization target here is therefore narrower:

> Reduce unnecessary context creation inside local Codex coding sessions by making retrieval, command output, browser verification, and validation orchestration more disciplined.

## 3. Governing design

The repository already contains most of the semantic rules needed for safe work. This PR should not create another agent framework.

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

The overlay should improve execution behavior without changing the meaning or authority of existing repository contracts.

## 4. Goals

1. Make the new guidance apply to local Codex coding and **not** GitHub Copilot plugin coding.
2. Reduce broad/speculative retrieval before the implementation surface is established.
3. Reduce full-file, repeated, overlapping, and unnecessarily batched textual reads.
4. Encourage each retrieval to answer a concrete unresolved implementation question.
5. Shape shell/tool output before it enters model context.
6. Reuse facts already established in the current session while they remain valid.
7. Reduce repeated browser-control boilerplate for local UX checks where a smaller reusable owner is justified.
8. Reduce duplicated validation orchestration while preserving every repository-required final check.
9. Keep task prompts concise; do not compensate for execution inefficiency by preloading more instructions.
10. Leave application behavior, runtime behavior, CI semantics, Production/Preview boundaries, migrations, deployment, and data ownership unchanged.

## 5. Non-goals

Do not use this PR to:

- prescribe when a user or agent must start a new Codex conversation;
- require fresh threads for later corrections;
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
- change schema, migrations, Cloudflare, D1, R2, deployment, Production, or Preview behavior;
- make GitHub Copilot plugin sessions load or obey this new local-Codex overlay.

## 6. Proposed implementation workstreams

### Workstream A — client-specific routing and authority

Create a concise living authority for this overlay, for example:

```text
docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md
```

The exact name may change if the repository already has a better owner. Do not create a parallel document if an existing Codex-specific local authority already exists at the actual PR head.

The living guidance should begin with an unambiguous applicability block equivalent to:

```text
Applies: local Codex coding with a usable checkout + shell.
Does not apply: GitHub Copilot plugin sessions.
Does not replace: universal AGENTS.md safety/routing/validation rules.
```

Add only the smallest routing pointer needed for a local Codex agent to discover it. Likely candidate owners are root `AGENTS.md` and/or `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`, but the implementer must inspect the actual current head and use the minimum authoritative surface.

Do **not** copy the entire local overlay into root `AGENTS.md`. That would increase preload cost for every agent and defeat the purpose of the PR.

#### Routing invariants

A reviewer should be able to prove all of the following:

- local Codex can discover the overlay;
- GitHub Copilot is explicitly told not to use it;
- capability-based Local/Remote/Hybrid routing remains intact for universal behavior;
- the Copilot exclusion affects only this new efficiency overlay;
- universal safety and validation rules remain applicable to all relevant clients;
- Remote GitHub write safeguards are untouched.

#### Important failure mode

Reject an implementation that says only:

```text
if local checkout + shell -> load local efficiency guidance
```

without the explicit Copilot exception. That is insufficient because Copilot may also satisfy those capability conditions.

### Workstream B — question-driven progressive retrieval

The current universal guidance already says to retrieve the minimum evidence necessary. The local Codex overlay should make that principle more operational.

For a clearly bounded task, the first retrieval should normally establish only:

1. the minimum applicable routing/scoped authority;
2. the directly affected symbol/file or bounded implementation region;
3. the nearest directly related test/helper when needed to answer the next implementation question.

Broadening should require a reason that can be stated concretely, for example:

```text
Need to inspect helper X because target function delegates persistence to X.
Need scoped DB authority because the proposed change crosses a migration boundary.
Need server route Y because client behavior depends on its returned status contract.
```

Avoid broadening merely because more related files exist.

#### Preferred retrieval pattern

Use targeted search first, then bounded reads around the relevant result. Examples include:

```text
rg -n <symbol/pattern> <target paths>
Get-Content <file> | Select-Object -Skip <n> -First <bounded range>
```

or equivalent commands on the active shell/platform.

For substantial text files, a small relevant section is normally preferable to the complete file. Roughly 50–150 lines may be a useful **heuristic** for many source reads, but it is not a quota and must not prevent complete reads when full-file semantics genuinely matter.

#### Avoid by default

- `Get-Content -Raw` on a substantial source or documentation file when one section answers the question;
- reading an entire long Svelte/server/test file before locating the relevant symbol;
- speculative lists of documentation read “for completeness”;
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
- exploratory audits where broad investigation is the task;
- full-file contracts where relationships across the whole file are materially relevant.

Universal protected-boundary escalation remains authoritative.

### Workstream C — tool-output shaping

Before executing a local command, prefer an output form that answers the current question without dumping unrelated material into model context.

Prefer:

- path-scoped `rg`;
- `rg -m` / bounded matches where exhaustive results are unnecessary;
- selected line ranges;
- compact structured output containing only needed fields;
- `Select-Object -First` or equivalent when only representative/current results are required;
- repository-owned compact validation reporters;
- summary commands that preserve individual failure authority.

Avoid:

- tens of thousands of characters when a small excerpt proves the same point;
- recursive listings with no path or result bound;
- full logs when only the failing section is needed;
- large multi-file concatenations that create one oversized context update;
- rerunning the same unchanged query solely because another model turn occurred.

#### Batching rule

Batching is not automatically efficient.

Batch related reads only when:

- all outputs are required for the same immediate decision;
- the combined output remains reasonably bounded;
- each constituent result retains clear success/failure attribution.

One extra small command is preferable to one enormous batch that pollutes every later model call.

### Workstream D — reuse already-established local evidence

The new overlay should reinforce the existing rule that facts do not need to be re-read simply because the agent advanced to another model turn.

Examples of reusable evidence while unchanged:

- current target file content already inspected;
- current PR number/base/head/Draft state after it has been established;
- scoped guidance already loaded;
- a focused test result after no relevant code changed;
- known unrelated baseline failures after no relevant dependency changed.

Refresh evidence after an invalidating event, not reflexively.

Examples of invalidating events include:

- source edit affecting the previous test result;
- push/rebase/update from `main` affecting head/base facts;
- known external branch movement;
- entering final exact-head verification;
- changes to the file/authority previously inspected.

This workstream should reuse the current universal semantics rather than duplicate them in detail.

### Workstream E — browser/UX verification audit

The observed session repeatedly generated long bespoke DevTools/CDP scripts for common local operations:

- connect to an already-running browser;
- navigate to a local route;
- set viewport dimensions;
- read a few DOM/computed-style values;
- capture screenshots.

That boilerplate is a strong candidate for repository-owned reuse, but **adding a new browser helper is not mandatory**.

The implementation agent must first search narrowly for an existing owner.

#### Decision test for adding a helper

Add a helper only if all are true:

1. the same generic mechanics are already repeated materially in local Codex UX work;
2. no existing repository helper owns them adequately;
3. the helper can be substantially smaller than the repeated ad-hoc scripts it replaces;
4. it can stay local-only and generic;
5. it does not become a second browser-testing framework;
6. it does not weaken or replace application tests;
7. its output can be concise and machine-readable enough for agent use.

If these conditions are not met, document/reuse the best existing method and make no new helper.

#### If a helper is justified

Keep its responsibilities narrow, e.g. generic mechanics such as:

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

### Workstream F — validation sequencing without duplication

This PR must not reduce validation coverage.

The desired local sequence remains:

```text
while editing
→ nearest focused test / Vite feedback appropriate to the risk

coherent checkpoint/handoff
→ agent:checks
→ repository-required validation reported by current tooling
→ required specialized checks
→ final intended-base -> current-head review
```

The efficiency change is to avoid manually assembling a broad validation sequence and then immediately invoking repository-owned validation that substantially repeats it without a diagnostic reason.

#### Known baseline failures

If a required broad validation exposes unrelated pre-existing failures:

- record the exact failures and command once;
- establish focused evidence that the current task area remains green;
- preserve the failure in the final report;
- do not repeatedly rerun an unchanged failing broad command unless later edits could affect it or current repository guidance explicitly requires another run.

A compact clean pass remains sufficient evidence; do not immediately reproduce it verbosely unless diagnostics are needed.

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

This PR should optimize execution behavior, not force ChatGPT planning prompts to preload more source paths, documentation, tests, or history.

### Workstream H — regression/contract coverage

Where the repository already has an appropriate source/contract-test owner, add focused coverage for the new routing behavior.

Useful assertions include:

- the local Codex overlay exists and is conditionally routed;
- the routing text explicitly excludes GitHub Copilot plugin sessions;
- the exclusion is specific to the new efficiency overlay, not universal safety/validation;
- Remote GitHub exact-head/write guidance remains referenced/unchanged where appropriate;
- no new mandatory token/command quota is introduced.

Do not create a brittle full-document snapshot merely to test prose. Prefer narrow semantic/contract assertions consistent with existing repository test patterns.

If a browser helper is added, give it focused tests for its generic contract and failure behavior. Do not invent browser-helper tests if no helper is added.

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

This section is a map for the vetting agent, not an instruction to preload every file.

## 8. Suggested implementation sequence

### Step 1 — establish the minimal authority change

- Inspect current root execution/routing language at the actual PR head.
- Decide where the smallest conditional pointer belongs.
- Confirm how the repository currently distinguishes universal Local/Remote/Hybrid execution from client-specific instructions.
- Implement the explicit local-Codex applicability and GitHub Copilot exclusion without altering universal execution semantics.

Checkpoint questions:

- Can local Codex find the overlay?
- Can Copilot see that it must not apply it?
- Did the implementation accidentally make client identity override universal safety?

### Step 2 — add the concise living local-Codex overlay

Include only rules not already adequately enforced elsewhere:

- applicability/exclusion;
- question-driven bounded retrieval;
- command-output shaping;
- reuse of still-valid evidence;
- browser-tool reuse/audit guidance;
- validation de-duplication guidance.

Do not copy large sections of root `AGENTS.md` or testing guidance.

Checkpoint question:

> Is loading this document likely to save more context than it adds?

If not, reduce duplication.

### Step 3 — browser-helper audit

- Search only the relevant local tooling/scripts for an existing browser owner.
- Compare existing tooling with the repeated mechanics observed in the motivating session.
- Reuse an existing owner where possible.
- Add a minimal helper only if the decision test in Workstream E is satisfied.

Document the decision either way so the reviewer can tell that this was evaluated rather than forgotten.

### Step 4 — focused contract coverage

- Locate the nearest existing test owner for agent/routing documentation if one exists.
- Add narrow assertions for local-Codex routing and Copilot non-inheritance.
- Add helper tests only if helper code exists.

Do not broaden into generic documentation snapshot testing.

### Step 5 — reconciliation

- Update indexes/task routing only where required by the final authority structure.
- Ensure this planning document is converted to a historical record or clearly marked implemented when the PR is complete, following the pattern used by `docs/AGENT_CONTEXT_EFFICIENCY_PLAN.md`.
- Ensure no stale wording still claims a mandatory new-thread lifecycle rule.

### Step 6 — validation and final review

- Use focused checks while editing.
- Follow the actual repository-owned checkpoint/handoff requirements from the current head.
- Inspect the complete intended-base → current-head diff.
- Verify PR remains Draft unless explicitly instructed otherwise.
- Do not merge.

## 9. Acceptance criteria

The PR is complete only when all of the following are true:

1. The new efficiency overlay is clearly specific to local Codex coding.
2. GitHub Copilot plugin sessions are explicitly excluded even when they have local checkout/shell capabilities.
3. The exclusion applies only to the new efficiency overlay and does not weaken universal repository rules.
4. Local Codex can discover the overlay without forcing every coding client to preload the full document.
5. Clearly bounded local tasks are guided toward target-first, question-driven retrieval and concrete escalation reasons.
6. Retrieval guidance favors bounded relevant excerpts over unnecessary full-file/raw/overlapping reads while allowing full reads when genuinely required.
7. Tool-output guidance discourages oversized multi-file batches and favors compact output that preserves evidence/failure authority.
8. Still-valid local evidence is reused rather than reflexively re-read after every model turn.
9. Validation remains complete and repository-owned; only unnecessary duplicated orchestration is reduced.
10. Browser-control boilerplate is either routed to an existing owner or, if strongly justified, reduced through a minimal local-only helper.
11. Any new browser helper cannot inspect/dump secrets or mutate Production/Preview state and does not replace application tests.
12. No token telemetry, hard token budget, fixed command quota, retrieval cache, shell proxy, or second validation DSL is introduced.
13. No rule is added requiring fresh Codex threads or prescribing conversation boundaries.
14. Remote GitHub exact-head/write safeguards remain unchanged.
15. Application/runtime/schema/deployment/data behavior is unchanged.
16. Focused regression/contract coverage protects the Codex-only/Copilot-excluded routing where an appropriate test owner exists.
17. Final documentation clearly distinguishes living authority from this planning/history record.

## 10. Final vetting checklist

The next principal/final reviewer should review the **entire intended-base → current-head PR**, not only the final correction delta.

### Applicability

- Is the new guidance unmistakably local-Codex-specific?
- Is GitHub Copilot explicitly excluded by client/workflow identity rather than accidentally included by capability detection?
- Could a reasonable Copilot agent read the routing text and mistakenly conclude that it must load/apply the overlay? If yes, request changes.

### Authority

- Are universal `AGENTS.md` safety/protected-boundary/validation rules still authoritative?
- Are Remote GitHub write rules unchanged?
- Does the new document duplicate so much universal guidance that it increases context rather than reducing it?

### Retrieval behavior

- Does the guidance actually change command/retrieval behavior, or merely restate “be efficient”?
- Does it require a concrete reason to broaden after the target surface is established?
- Does it avoid rigid quotas that could suppress necessary safety/architecture retrieval?
- Does it prefer small targeted reads over giant batched output?

### Evidence reuse

- Does the implementation discourage repeated unchanged retrieval without making stale evidence permanent?
- Are invalidating events still respected?

### Browser tooling

- Was existing tooling audited before new machinery was added?
- If a helper was added, is it materially smaller than the repeated ad-hoc scripts it replaces?
- Is it local-only, compact, explicit on failure, and non-secret-bearing?
- Did the PR accidentally create a second browser framework? If yes, request changes.

### Validation

- Is final validation coverage unchanged?
- Does the guidance reduce duplicate command orchestration rather than skipping checks?
- Are known baseline failures handled transparently rather than suppressed?

### Scope

- Did the PR avoid application/runtime/schema/deployment behavior changes?
- Did it avoid token counters, telemetry, wrappers, caches, command quotas, or a new DSL?
- Did it remove all mandatory thread-lifecycle/new-thread language?

### Documentation state

- Is the final living authority concise?
- Are routing/index references accurate?
- Is this planning document reconciled to historical/implemented status at completion?

## 11. Reasons a reviewer should block the PR

Treat the following as merge-blocking for this PR:

- GitHub Copilot can reasonably be interpreted as subject to the new overlay;
- the implementation routes by local capability only and forgets the Copilot exception;
- universal safety/validation rules are weakened or bypassed;
- retrieval reduction is implemented through hard token/command quotas;
- a new generic shell/retrieval orchestration layer is introduced;
- validation is skipped rather than de-duplicated;
- browser helper code exposes credentials/session material or can touch non-local targets unsafely;
- a browser helper becomes a second product-testing framework without clear need;
- the change materially alters application/runtime/deployment behavior;
- the final living guidance is so large/duplicative that loading it likely worsens the original context problem;
- mandatory fresh-thread or conversation-boundary rules remain.

## 12. Expected final handoff

The implementing agent should report:

```text
final PR head SHA
files changed
where the local-Codex overlay is routed from
how GitHub Copilot is explicitly excluded
whether browser-helper work reused existing tooling / added a helper / intentionally added nothing
focused tests run
repository-required final validation run
any unrelated baseline failures
confirmation that application/runtime behavior did not change
confirmation PR remains Draft unless otherwise requested
```

Do not merge or mark Ready unless explicitly requested.

## 13. Guidance for the next vetting agent

The plan is intentionally detailed so review can be outcome-based rather than prose-based. The next vetting agent should not assume every suggested file or implementation technique is required. It should inspect the actual current PR head and ask whether the final change satisfies the invariants with the smallest durable implementation.

The strongest review question is:

> Does this PR measurably reduce the likelihood of local Codex creating large unnecessary context while leaving GitHub Copilot and universal repository behavior unchanged?

A documentation-only implementation can be acceptable if it creates clear, discoverable, enforceable-enough routing and no existing tooling gap justifies code. Conversely, adding scripts is not automatically better; any new helper must earn its maintenance/context cost by replacing repeated boilerplate with a smaller stable interface.

The reviewer should separate three claims:

```text
1. routing correctness
2. context-efficiency behavior
3. validation/safety preservation
```

All three must hold. A strong result in one does not compensate for a failure in another.

## Final principle

For this PR:

> Make local Codex retrieve less unnecessary context while preserving enough evidence to make the next correct decision.

And equally important:

> Do not apply this new efficiency overlay to GitHub Copilot plugin coding.