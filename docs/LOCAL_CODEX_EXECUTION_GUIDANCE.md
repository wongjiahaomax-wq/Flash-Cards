# Local Codex execution-efficiency overlay

_Status: living guidance for local Codex coding only. Root `AGENTS.md`, `docs/AGENT_TASK_MAP.md`, and the existing execution/validation authorities remain the governing repository contracts._

## Applicability

Use this overlay only when the active coding client is **Codex** working against a usable local Flash-Cards checkout with local shell/command execution. It may be used for the local-execution side of a Hybrid Codex session.

Do **not** load or apply this overlay when ChatGPT chat is working through the GitHub plugin. That workflow remains governed by the universal repository guidance plus the existing Remote GitHub execution/write discipline.

This overlay changes only local Codex retrieval, batching, and shell-output discipline. It does not weaken or replace protected-boundary routing, evidence-reuse rules, prompt discipline, required validation, complete final diff review, Production/Preview safeguards, or Remote GitHub write safety.

## Local Codex delta

### Target-first retrieval

For a clearly bounded task, start from the directly affected symbol/path and the smallest semantic unit needed to answer the current implementation question. Prefer the directly related test/helper when it is needed to resolve that question. Broaden only for a concrete unresolved dependency or a protected/cross-cutting boundary already defined by the universal guidance.

When an implementation-ready PR plan or review handoff already names likely files, symbols, tests, or invariants, use that material as the starting retrieval map. Verify exact current symbols and nearby implementation locally; do not rediscover the wider repository architecture unless current repository evidence contradicts or materially leaves the supplied map incomplete.

Prefer bounded semantic reads once the relevant region is known. Avoid full substantial files, broad documentation batches, or repeated overlapping reads merely for completeness when a smaller semantic excerpt answers the question. Read the complete artifact when whole-file semantics are materially required.

Once a scoped authority has been read and its applicable conclusions retained, reuse them while that authority remains unchanged. Host-injected repository authority already present in the coding context counts as retrieved evidence; do not shell-read it again merely because another turn began.

### Retrieval-correctness invariant

Bounded or truncated output is evidence only for what it actually contains.

Commands or pipelines that limit matches, rows, lines, or displayed results (for example `rg -m`, `Select-Object -First`, bounded excerpts, or equivalent truncation) may establish **presence** or inspect representative evidence. They must **not** be used to prove:

- absence;
- uniqueness;
- exhaustive references or call sites;
- complete coverage of the relevant search domain.

When correctness depends on completeness, run an appropriately scoped **exhaustive** search over the full relevant domain without truncating the search semantics. Keep the domain as narrow as correctness allows, then summarize/count the complete result or inspect bounded semantic excerpts around the returned matches.

Do not make a search incomplete merely to reduce model-context output. Separate search completeness from presentation size.

### Oversized/truncated retrieval recovery

If a retrieval result is unexpectedly large or truncated, do not repeat the same broad read as a default recovery. Treat the strategy as insufficient for completeness and use this sequence:

```text
identify the exact unresolved question
-> narrow by symbol, file, line range, diagnostic, or smallest valid domain
-> retrieve only the evidence needed for that question
-> decide whether the question is resolved
```

A truncated result supports only the content actually returned. Unexpected truncation should trigger strategy correction rather than another overlapping broad discovery pass. Preserve exhaustive search semantics where correctness depends on absence, uniqueness, or complete coverage, but separate that exhaustive search from the amount of result text presented to the model.

Do not combine full authorities, broad history/memory lookup, repository-wide search, Git state, and PR metadata into one oversized retrieval merely to save a tool call. Batch retrieval only when all items answer the same immediate question, remain bounded, and preserve clear attribution.

### Shape shell/tool output before it enters context

Prefer path-scoped searches, exact files/fields, bounded semantic excerpts, compact structured summaries, and repository-owned compact reporters. Avoid large multi-file concatenations, full logs when only a failure region is needed, and repeated unchanged retrieval.

Batch outputs only when they answer the same immediate question, remain reasonably bounded, and preserve clear success/failure attribution. One extra targeted command is preferable to one oversized batch that pollutes later turns.

### Semantic implementation batches

Treat one semantic implementation batch as one behavioral invariant or one related common-cause correction, not as one file, one line, or one shell command.

For a well-specified local implementation step, prefer this loop:

```text
one unresolved invariant/question
-> targeted retrieval batch
-> coherent production + regression-test patch
-> scoped diff inspection
-> focused test batch
-> next invariant
```

Use the following execution rules:

1. Before editing, gather the minimum evidence needed for the immediate invariant. Combine exact-symbol/path searches and bounded reads when they answer the same question and remain reasonably sized.
2. Once the affected surfaces are understood and the next edits are already known, make the coherent production and directly related regression-test corrections before requesting more retrieval.
3. Do not pause between already-known edits merely to reread unchanged files or to test an intentionally incomplete intermediate state.
4. After the edit batch, inspect the scoped changed-file/diff evidence rather than rereading complete edited files by default.
5. Run the directly affected focused tests together when their execution is independent and their result attribution remains clear. Rerun a passing focused command only after a relevant change could invalidate it.
6. Start another retrieval/model decision turn when a test result, repository fact, protected-boundary question, or ambiguity can materially change the next implementation decision.

Split a batch whenever an intermediate result is genuinely needed to decide what the next edit should be. Do not merge unrelated invariants just to reduce visible command count, and do not create oversized search/patch commands that make evidence or failures harder to attribute.

The optimization target is fewer unnecessary model/tool round trips, less retained-context replay, and shorter wall-clock implementation time for comparable work. There is no fixed tool-call, patch-count, or token quota, and efficiency never substitutes for required validation or complete final review.

### Local-first code discovery and review handoff

When usable local execution exists, prefer the local checkout for exact code discovery, call-site/reference search, bounded source inspection, working-tree/scoped diff inspection, and executable focused validation. These operations are normally faster and require less remote round-trip overhead than reconstructing the same code state through GitHub APIs.

Use Remote GitHub/ChatGPT strengths for facts whose source of truth is remote: PR/base/head metadata, review discussions, GitHub CI/check state, and independent intended-base-to-head review. Do not remote-fetch repository code merely because GitHub access exists when the local checkout can answer the implementation question directly and is known to represent the required work state.

If review findings are already supplied in the task prompt, treat those findings as task evidence and implement from them. Do not retrieve the original review thread merely to restate already-complete findings; retrieve it only when a finding is materially ambiguous, incomplete, or its exact remote state is required.

### Process waiting and polling

Choose an initial yield that is reasonable for the known or expected command runtime. Ordinary multi-second checks should not begin with repeated one-second polling merely to keep the agent responsive.

When a process is still running, use a meaningful follow-up wait rather than a stream of undersized polls. Keep user/commentary updates consistent with the host communication requirement, but do not substitute repeated polling for communication.

Never terminate, skip, or weaken validation to save context. Independent final checks may run concurrently only when they do not contend for shared mutable state and their output plus exit status remain independently attributable; otherwise run them separately.

There is no universal fixed yield duration. The invariant is to avoid obviously undersized polling intervals while preserving reliable process completion and evidence.

### Local browser/UX verification

Reuse the repository's existing local development process and any existing browser/UX tooling before generating bespoke browser-control code. Keep any unavoidable ad-hoc browser inspection local-target-only, narrowly scoped to the needed assertion, and free of credential/cookie/session-secret dumping. Do not introduce a second browser-testing framework solely for agent convenience.

## Existing authorities still own the rest

Continue to use root `AGENTS.md` and `docs/AGENT_TASK_MAP.md` for progressive escalation, evidence reuse, prompt shape, coherent implementation batching, validation cadence, retained-context checkpoint state, protected boundaries, and final handoff requirements. `docs/TESTING_AND_VALIDATION_GUIDANCE.md` owns detailed focused/checkpoint/final validation semantics. Bounded retrieval never means reduced final validation or an incomplete final intended-base-to-head review.
