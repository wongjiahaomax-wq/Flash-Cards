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

### Retrieval-correctness invariant

Bounded or truncated output is evidence only for what it actually contains.

Commands or pipelines that limit matches, rows, lines, or displayed results (for example `rg -m`, `Select-Object -First`, bounded excerpts, or equivalent truncation) may establish **presence** or inspect representative evidence. They must **not** be used to prove:

- absence;
- uniqueness;
- exhaustive references or call sites;
- complete coverage of the relevant search domain.

When correctness depends on completeness, run an appropriately scoped **exhaustive** search over the full relevant domain without truncating the search semantics. Keep the domain as narrow as correctness allows, then summarize/count the complete result or inspect bounded semantic excerpts around the returned matches.

Do not make a search incomplete merely to reduce model-context output. Separate search completeness from presentation size.

### Shape shell/tool output before it enters context

Prefer path-scoped searches, exact files/fields, bounded semantic excerpts, compact structured summaries, and repository-owned compact reporters. Avoid large multi-file concatenations, full logs when only a failure region is needed, and repeated unchanged retrieval.

Batch outputs only when they answer the same immediate question, remain reasonably bounded, and preserve clear success/failure attribution. One extra targeted command is preferable to one oversized batch that pollutes later turns.

### Local browser/UX verification

Reuse the repository's existing local development process and any existing browser/UX tooling before generating bespoke browser-control code. Keep any unavoidable ad-hoc browser inspection local-target-only, narrowly scoped to the needed assertion, and free of credential/cookie/session-secret dumping. Do not introduce a second browser-testing framework solely for agent convenience.

## Existing authorities still own the rest

Continue to use root `AGENTS.md` and `docs/AGENT_TASK_MAP.md` for progressive escalation, evidence reuse, prompt shape, validation cadence, protected boundaries, and final handoff requirements. Bounded retrieval never means reduced final validation or an incomplete final intended-base-to-head review.
