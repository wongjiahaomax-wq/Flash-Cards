# Local Codex execution-efficiency overlay

_Status: living guidance for local Codex coding only. Root `AGENTS.md`, `docs/AGENT_TASK_MAP.md`, and the existing execution/validation authorities remain the governing repository contracts._

## Applicability

Use this overlay only when the active coding client is **Codex** working against a usable local Flash-Cards checkout with local shell/command execution. It may be used for the local-execution side of a Hybrid Codex session.

Do **not** load or apply this overlay when ChatGPT chat is working through the GitHub plugin. That workflow remains governed by the universal repository guidance plus the existing Remote GitHub execution/write discipline.

This overlay changes only local Codex retrieval and shell-output discipline. It does not weaken or replace protected-boundary routing, evidence-reuse rules, prompt discipline, required validation, complete final diff review, Production/Preview safeguards, or Remote GitHub write safety.

## Local Codex delta

### Target-first retrieval

For a clearly bounded task, start from the directly affected symbol/path and the smallest semantic unit needed to answer the current implementation question. Prefer the directly related test/helper when it is needed to resolve that question. Broaden only for a concrete unresolved dependency or a protected/cross-cutting boundary already defined by the universal guidance.

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

### Process waiting and polling

Choose an initial yield that is reasonable for the known or expected command runtime. Ordinary multi-second checks should not begin with repeated one-second polling merely to keep the agent responsive.

When a process is still running, use a meaningful follow-up wait rather than a stream of undersized polls. Keep user/commentary updates consistent with the host communication requirement, but do not substitute repeated polling for communication.

Never terminate, skip, or weaken validation to save context. Independent final checks may run concurrently only when they do not contend for shared mutable state and their output plus exit status remain independently attributable; otherwise run them separately.

There is no universal fixed yield duration. The invariant is to avoid obviously undersized polling intervals while preserving reliable process completion and evidence.

### Local browser/UX verification

Reuse the repository's existing local development process and any existing browser/UX tooling before generating bespoke browser-control code. Keep any unavoidable ad-hoc browser inspection local-target-only, narrowly scoped to the needed assertion, and free of credential/cookie/session-secret dumping. Do not introduce a second browser-testing framework solely for agent convenience.

## Existing authorities still own the rest

Continue to use root `AGENTS.md` and `docs/AGENT_TASK_MAP.md` for progressive escalation, evidence reuse, prompt shape, coherent implementation batching, validation cadence, retained-context checkpoint state, protected boundaries, and final handoff requirements. `docs/TESTING_AND_VALIDATION_GUIDANCE.md` owns detailed focused/checkpoint/final validation semantics. Bounded retrieval never means reduced final validation or an incomplete final intended-base-to-head review.
