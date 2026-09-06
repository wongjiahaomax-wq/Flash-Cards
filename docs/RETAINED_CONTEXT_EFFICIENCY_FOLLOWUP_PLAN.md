# Retained-context coding-agent efficiency follow-up plan

_Status: proposed focused implementation plan. Planning only; no operational guidance has been changed by this document._

## Purpose

Follow PR #160 with a focused documentation/workflow-contract correction based on the observed PR #161 coding session.

PR #160 materially reduced tool-output presentation and added local Codex retrieval guidance, but PR #161 showed that compact output alone did not produce comparable whole-session efficiency. The dominant remaining cost was repeated context replay across too many model/tool turns, together with oversized retrieval, fragmented edit/check cycles, and inefficient process polling.

The objective of this follow-up is:

> Preserve the full coding-session context while substantially reducing unnecessary retrieval, model turns, validation repetition, process polling, and replay of already-established evidence.

This plan deliberately does **not** require context compaction, fresh continuation threads, token quotas, retrieval caches, command wrappers, or weaker validation. Retained conversational context is treated as useful working evidence; the efficiency goal is to use it better rather than discard it.

## Evidence from PR #161

The external session audit supplied for PR #161 showed the following representative symptoms:

- compact tool presentation worked, with tool-output volume materially reduced versus the earlier baseline;
- overall efficiency did not improve correspondingly, and input/context replay increased materially;
- the session reached approximately 14.29M input tokens versus approximately 42K output tokens;
- approximately 98% of input was cached/replayed context rather than new generated material;
- the session contained roughly 103 execution calls, including about 30 patch operations;
- 21 process-poll turns were observed, all using one-second yields;
- nine tool outputs were explicitly truncated;
- repeated retrieval prevention that appeared substantially present in policy was not strong enough in actual execution;
- semantic checkpoint/lifecycle guidance did not reliably terminate discovery or prevent later rediscovery;
- excessive small turns became a major efficiency problem.

The historical PR #156 conclusion should remain preserved as a historical conclusion rather than silently rewritten. This follow-up should append a dated post-implementation retrospective explaining that PR #161 provided contrary empirical evidence and expanded the remaining problem from output compactness/lifecycle guidance into retrieval recovery, discovery termination, coherent implementation batching, process waiting, and retained-context reuse.

## Authority placement

Do not concentrate all new rules in root `AGENTS.md`.

Use the repository's existing authority split:

- root `AGENTS.md` owns portable, client-independent retrieval, discovery, implementation-batch, checkpoint, and handoff invariants;
- `docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md` owns local/Hybrid Codex-specific retrieval and shell/process-output behavior;
- `docs/TESTING_AND_VALIDATION_GUIDANCE.md` owns focused/checkpoint/final validation cadence and rerun semantics;
- `docs/AGENT_CONTEXT_EFFICIENCY_PLAN.md` remains a historical planning/audit record and receives only the dated PR #161 retrospective;
- `docs/LOCAL_CODEX_CONTEXT_EFFICIENCY_PLAN.md` remains the historical PR #160 planning record; amend it only if needed to record the observed outcome without turning it back into living authority;
- `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md` should change only if a genuinely cross-mode execution rule cannot be owned by the authorities above;
- `scripts/AGENTS.md` should change only for script/runtime-specific process-output behavior that cannot be expressed in the local Codex overlay or testing authority.

`docs/AGENT_TASK_MAP.md` already routes `docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md` for Codex with usable local execution, including Hybrid mode, while excluding Remote GitHub ChatGPT. Do not redesign that routing unless current repository evidence shows it has changed.

---

# Tranche 1 — Record the failed assumptions

Update `docs/AGENT_CONTEXT_EFFICIENCY_PLAN.md` with a dated post-implementation section based on PR #161.

Preserve the original PR #156 assessment and explicitly distinguish:

- what was believed at the time;
- what PR #160 changed;
- what PR #161 subsequently demonstrated.

The retrospective should record that:

- compact output was useful but insufficient;
- overall input/context replay remained excessive;
- "repeated-retrieval prevention was substantially present" was too optimistic as an execution claim;
- the previously identified remaining gap was not limited to lifecycle/handoff guidance;
- semantic checkpoint guidance did not by itself produce reliable discovery termination;
- excessive small turns and process polling became material contributors.

### Acceptance criteria

- Historical conclusions remain visibly historical rather than being rewritten.
- PR #161 evidence is clearly labelled as later empirical evidence.
- Living operational rules are not duplicated into the historical plan.
- Documentation status/authority remains consistent with `docs/DOCUMENTATION_INDEX.md`.

---

# Tranche 2 — Add retrieval failure and recovery rules

## Root `AGENTS.md`

Strengthen only the portable retrieval/discovery invariants.

Add a concise decision pattern such as:

```text
Search -> bounded read -> decide
```

Add explicit rules that:

1. discovery formally ends once the current work state, directly affected implementation surface, relevant owners/tests, and protected-boundary routing are established;
2. broad discovery must not continue after that point without a concrete unresolved question;
3. already-retrieved evidence should be reused while it remains sufficient and unchanged;
4. host-injected repository authority counts as already retrieved evidence and should not be shell-read again merely because a new turn began;
5. complete intended-base-to-head diff inspection belongs at the deliberate final review/handoff checkpoint, not repeated active implementation turns;
6. an unchanged authority may be reread only for a stated reason such as missing evidence, ambiguity, detected state change, or a new completeness-sensitive question.

Do not turn this into a rigid task-size classifier or arbitrary search-count limit.

## `docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md`

Add the concrete local Codex recovery behavior for oversized or truncated retrieval.

Suggested contract:

```text
If a retrieval result is truncated or unexpectedly large:
1. treat the retrieval strategy as insufficient for completeness;
2. identify the exact unresolved question requiring more evidence;
3. narrow by symbol, file, line range, diagnostic, or other smallest valid domain;
4. do not repeat or overlap the oversized read unless the unresolved question requires it;
5. preserve exhaustive search semantics when correctness depends on absence, uniqueness, or complete coverage, but summarize or bound presentation separately.
```

Also clarify:

- a truncated result is evidence only for the content actually returned;
- unexpected truncation should trigger strategy correction rather than more broad discovery;
- do not combine full authorities, broad memory/history lookup, repository search, Git state, and PR metadata into one oversized retrieval merely to save a tool call;
- batch retrieval only when the items answer the same immediate question, remain bounded, and preserve attribution;
- once a scoped authority has been read and its applicable conclusions retained, do not read the unchanged authority again without a concrete reason.

### Acceptance criteria

For a representative discovery phase:

- avoidable or unrecovered truncated discovery retrievals: zero;
- no materially overlapping reread of unchanged authority without an explicit reason;
- no overlapping full-file and bounded reads without a concrete unresolved question;
- host-injected unchanged authority is not redundantly reread;
- protected-boundary escalation/routing remains intact;
- completeness-sensitive searches remain semantically exhaustive over the smallest correct domain.

---

# Tranche 3 — Consolidate implementation turns

Add a portable coherent-edit-batch contract to root `AGENTS.md`.

Suggested shape:

```text
Before editing:
- identify the related files and invariants;
- make the coherent cross-file correction;
- inspect the resulting scoped delta;
- run the nearest meaningful feedback check.

Do not alternate one tiny patch with one whole-project check when several
known related corrections can safely be made together.
```

The rule is judgment-based. Do not create a patch quota, turn quota, or mandatory minimum batch size.

Clarify that:

- compiler/type feedback should first drive a coherent correction batch where related errors have a common cause;
- if one check exposes several related errors, correct that related set before rerunning the same broad check;
- a passing check is not rerun unless subsequent changes could invalidate what it established;
- directly related focused tests remain normal implementation feedback for logic changes;
- broader repository checks remain checkpoint/final evidence and are not weakened;
- independent unrelated failures must not be hidden merely to reduce turns.

Put detailed validation ownership/rerun semantics in `docs/TESTING_AND_VALIDATION_GUIDANCE.md` rather than duplicating them extensively in root guidance.

### Acceptance criteria

- the same broad validation command is not repeatedly invoked between isolated one-line patches unless each intervening edit genuinely requires that scope of proof;
- related compiler/test failures are normally corrected as one coherent batch before the same check reruns;
- focused tests remain normal implementation feedback;
- final required validation coverage is unchanged;
- no patch-count or token-count policy is introduced.

---

# Tranche 4 — Fix local process polling

Own local Codex-specific process waiting in `docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md`, with cross-reference to validation guidance where useful.

Add guidance that:

- ordinary checks should receive an initial yield appropriate to their known/expected runtime;
- expected multi-second validation commands should not begin with one-second yields merely to keep the agent responsive;
- when a process is still running, use a meaningful follow-up wait rather than repeated one-second polls;
- commentary/user updates must still satisfy the host communication requirement;
- no validation may be terminated early or skipped for context efficiency;
- when independent final checks can safely run concurrently and their outputs/exit states remain independently attributable, they may be started together and awaited independently;
- do not parallelize checks that contend for shared mutable state or whose output attribution would become ambiguous.

Do not encode a universal fixed yield duration. Runtime varies across machines and checks; the invariant is to avoid obviously undersized polling intervals.

### Acceptance criteria

- routine `check`, `build`, test, and validation commands normally complete in the initial call or one meaningful follow-up wait when runtime permits;
- repeated one-second polling of ordinary multi-second validation is eliminated;
- process output and exit status remain independently attributable;
- no validation is skipped, killed early, or made less trustworthy for token efficiency;
- safe concurrency is optional and evidence-preserving rather than mandatory.

---

# Tranche 5 — Make retained-context checkpoint state operational

Do **not** add or require context compaction.

The coding session keeps its full existing context.

Use checkpoints as an operational index into retained context:

```text
Implementation complete
        |
        v
Scoped diff + focused/checkpoint checks
        |
        v
Concise checkpoint state
        |
        v
Continue with full context retained
        |
        v
Do not rediscover pre-checkpoint evidence unless it changed,
becomes ambiguous, or a new unresolved question requires it
```

The checkpoint state should retain only the facts needed to drive subsequent decisions:

- task and acceptance criteria;
- branch/base/current head or worktree state when relevant;
- changed files and implemented invariants;
- validation already completed and what it established;
- unresolved failures or remaining operations;
- exact drift-prone facts that must be refreshed immediately before mutation or final handoff.

The checkpoint state is **not** a replacement for the retained conversation and does not authorize forgetting earlier context. It is a compact working index designed to prevent unnecessary rereads and rediscovery.

Refresh facts only when:

- an operation could have invalidated them;
- they are known to have changed;
- they are ambiguous/missing;
- correctness requires an exact current value before mutation/handoff.

Do not introduce fresh continuation threads as a normal efficiency mechanism. If a user explicitly chooses to start a new thread, existing repository handoff rules still apply, but this PR should not depend on that behavior for success.

### Acceptance criteria

- full session context remains retained;
- no automatic/manual compaction requirement is added;
- no fresh-thread requirement is added;
- post-checkpoint work reuses established evidence rather than rereading unchanged pre-checkpoint authorities/state;
- drift-prone Git/PR/CI facts are still refreshed at the repository-defined mutation/final-handoff boundaries;
- checkpoint summaries remain concise enough to function as operational state rather than a second duplicated transcript.

---

# Evaluation tranche — measure retained-context efficiency

Do not add a production token counter, runtime quota, shell proxy, retrieval cache, command wrapper, or pass/fail token ceiling.

Perform an external audit of three representative future local/Hybrid Codex coding threads after implementation:

1. a small UI correction;
2. a medium cross-component logic change;
3. a protected-boundary or validation-heavy change.

For each thread, record task shape and outcome alongside efficiency metrics so unlike work is not compared as though identical.

## Phase the measurements

Measure separately where practical:

```text
Discovery -> Implementation -> Validation/Handoff
```

For each phase record:

- model responses/turns;
- tool calls;
- retrieval calls;
- avoidable/unrecovered truncations;
- materially overlapping unchanged reads;
- patch/edit operations;
- focused validation invocations;
- broad/checkpoint/final validation invocations;
- process-poll turns and poll cadence;
- total input tokens when the host exposes them;
- cached/replayed input separately when exposed;
- output tokens when exposed;
- final task correctness/quality.

## Desired results

| Measure | Desired result |
| --- | --- |
| Avoidable/unrecovered discovery truncations | Zero |
| Unjustified overlapping unchanged reads | Zero |
| Redundant host-injected authority rereads | Zero |
| Repeated one-second polling of ordinary multi-second checks | Zero |
| Repeated unchanged broad checks | Zero unless explicitly justified |
| Tool-output volume | No regression from compact-output baseline |
| Model/tool turns | Material reduction for comparable work |
| Input/context replay | Material reduction for comparable work |
| Cached vs uncached input | Record separately when available |
| Full context retention | Preserved |
| Validation coverage | No reduction |
| Final task correctness | No regression |

Do not declare success from one thread. Do not impose universal token ceilings. Compare task shape, files touched, protected boundaries, validation requirements, and outcome quality alongside token/turn totals.

The evaluation should answer whether the new workflow is reducing **avoidable interaction with retained context**, not whether the agent can make the context disappear.

---

# Suggested implementation sequence

Keep the implementation in one focused Draft PR and make each tranche independently reviewable:

1. append the PR #161 retrospective to the historical audit;
2. add client-independent discovery-stop/evidence-reuse rules to root `AGENTS.md`;
3. add local Codex oversized-retrieval recovery and host-injected-context reuse to `docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md`;
4. add coherent edit/check cadence, with detailed validation ownership in `docs/TESTING_AND_VALIDATION_GUIDANCE.md`;
5. add local process-wait guidance to the local Codex overlay;
6. add retained-context checkpoint-state semantics without compaction;
7. document the three-thread external evaluation procedure;
8. audit the complete documentation diff for duplicated/conflicting authority and update `docs/DOCUMENTATION_INDEX.md` only if document roles/status genuinely change;
9. run repository-required documentation/contract validation and complete intended-base-to-head review.

## Likely files

Expected primary files:

- `AGENTS.md`
- `docs/AGENT_CONTEXT_EFFICIENCY_PLAN.md`
- `docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md`
- `docs/TESTING_AND_VALIDATION_GUIDANCE.md`

Possible only if current evidence requires them:

- `docs/LOCAL_CODEX_CONTEXT_EFFICIENCY_PLAN.md`
- `docs/DOCUMENTATION_INDEX.md`
- `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`
- `scripts/AGENTS.md`
- focused documentation/agent-contract tests

Do not force this list as an exhaustive read/edit list. Use current repository routing and progressive retrieval during implementation.

# Non-goals

This follow-up must remain documentation and workflow-contract work.

Do not add:

- automatic context compaction;
- fresh-thread/session-reset requirements;
- token quotas or context budgets;
- session parsers in the application/runtime;
- production token counters;
- retrieval caches;
- shell/command wrappers merely to police agent behavior;
- arbitrary command, patch, or turn-count limits;
- weaker validation or reduced final-review coverage;
- application/product behavior changes;
- schema/migrations;
- Cloudflare/Production/Preview data mutation.

# Success criteria

The PR is successful when the repository gives agents an operationally specific way to recover from oversized retrieval, formally end discovery, batch related corrections, wait efficiently for processes, and reuse retained checkpoint evidence while preserving full context and all existing safety/validation boundaries.

The target is a material reduction in unnecessary turns and input/context replay on comparable coding work, with no reduction in correctness, protected-boundary routing, validation coverage, or final review quality.
