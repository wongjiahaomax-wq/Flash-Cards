# Connector-first CI diagnostics

_Status: current CI observability contract._

## Purpose

Ordinary PR CI is consumed both by humans in GitHub Actions and by coding agents that inspect runs through the GitHub connector. CI output must therefore remain useful as plain text without requiring the annotation UI or a complete read of a large log.

## Agent-facing failure records

Failed repository-owned validation emits stable, searchable records:

```text
CI_ERROR|check=<check-id>|...
CI_REPRO|check=<check-id>|command=<focused-or-stage-level-command>
CI_STATUS|check=<check-id>|status=failed|...
```

Values that would break the pipe-delimited format are percent-escaped. These records supplement normal command output and GitHub `::error` annotations; they do not replace either source of detail.

For Node tests, `scripts/ci-test-reporter.mjs` remains the structured `node:test` presentation layer. It ignores suite-level aggregate pass/fail events, emits one `CI_ERROR` record per real non-suite test failure, emits deduplicated file-level `CI_REPRO` commands, and reports the failed-test count from Node's final summary after the existing detailed failure section. Todo failures are not promoted to real failures.

For the logical `svelte` check, ordinary CI keeps `npm run check` as the canonical local command and validation-contract owner. The CI wrapper appends `--output machine-verbose` through npm argument forwarding, so the existing `svelte-kit sync && svelte-check --tsconfig ./jsconfig.json` sequence is preserved while the pinned `svelte-check` emits its supported timestamp-prefixed machine protocol. `scripts/ci-svelte-diagnostics.mjs` parses only that protocol: diagnostic rows are timestamp-prefixed JSON, while `START`, `COMPLETED`, and `FAILURE` remain lifecycle records.

Svelte machine positions are LSP-style zero-based line/character coordinates. CI normalizes start and end positions to one-based human/GitHub coordinates before emitting records or annotations. A real error is exposed as one connector-readable `CI_ERROR|check=svelte|` record carrying the relative file, normalized line/column, optional normalized end position, severity, diagnostic source, code when present, and escaped message. Codes are preserved as strings or numbers exactly as the protocol supplies them. GitHub `::error` annotations use the same normalized start location and are supplemental to the plain-text record.

The outer CI wrapper is the single owner of detailed Svelte failure status. When at least one real machine error is parsed and the command exits non-zero, it emits the per-error records, the canonical `CI_REPRO|check=svelte|command=npm run check`, and one final `CI_STATUS|check=svelte|status=failed` record. Reliable error/warning counts are included only when a valid `COMPLETED` record was parsed. Warnings are not promoted to `CI_ERROR` records and do not become fatal unless the underlying command itself makes them fatal.

Presentation never overrides validation authority. If `svelte-kit sync` or command setup fails before machine diagnostics begin, or if a non-zero run yields no parsed real error, CI falls back to the existing generic stage-level failure while preserving the original captured stdout/stderr and `npm run check` reproduction command. If some real errors parse but the structured stream is incomplete—because one or more diagnostic records are malformed, or because a valid `COMPLETED` record reports a different error count from the number successfully parsed—CI preserves the parsed per-error records but adds an explicit `CI_ERROR|check=svelte|message=Structured Svelte diagnostics are incomplete ...` record and marks the final status with `diagnostics=incomplete`. This incompleteness record is intentionally not suppressed by the anti-duplication rule because it communicates missing diagnostic coverage rather than restating an already reported error. Conversely, warning-only machine output with a zero command exit remains successful. A parser failure cannot turn a failing Svelte check green.

`scripts/validate-ci.mjs` emits the final stage-level failure surface. For Node-test stages it does not add a generic `CI_ERROR` because the structured reporter already emitted the real errors; it only adds the canonical reproduction command and final stage status. For Svelte, the wrapper itself owns the parsed per-error records and detailed final status. Validation stages without a structured detailed owner continue to emit generic `CI_ERROR`, `CI_REPRO`, and `CI_STATUS` records directly from the wrapper.

The diff validation itself intentionally continues to use `HEAD^1` → `HEAD` on GitHub's synthetic PR merge checkout. That checkout-specific expression is never advertised as a local reproduction. The workflow supplies the actual PR base/head SHAs separately, so a diff failure advertises `git diff --check <base-sha> <head-sha>`. If those SHAs are unavailable outside ordinary PR CI, the fallback reproduction is `npm run agent:checks`, which resolves the repository's normal feature-branch base locally.

## Retrieval procedure for coding agents

Use the smallest sufficient CI retrieval surface. This is an escalation model, not a requirement to mechanically perform every preceding read.

Prefer the available equivalent of:

```text
status/check state
→ workflow/run
→ failed job
→ failed step or compact diagnostic
→ raw failed-job logs only when needed
```

Enter that escalation at the smallest level already sufficient from information in hand. Do not consume complete Actions logs merely to discover which job or step failed.

When diagnosing PR CI through GitHub integration:

1. Resolve the PR's current head SHA before trusting a run, unless exact-head evidence is already established from a sufficient current response.
2. Inspect check/workflow state for that exact revision and ignore superseded, cancelled, or older-head runs.
3. Focus on failed jobs/stages rather than successful output.
4. Prefer the existing `CI_ERROR|`, `CI_REPRO|`, and `CI_STATUS|` records when they already establish the failure and focused reproduction.
5. Use the failed step, adjacent detailed failure block, assertion values, and stack frames only when the compact record is insufficient.
6. Read raw failed-job logs only when the smaller surfaces do not provide enough diagnostic evidence.
7. Treat `CI_REPRO` as the cheapest first local reproduction; broaden to the repository-selected validation contract after the focused fix.

Reuse sufficient CI information already returned by a smaller retrieval. While the PR head is unchanged, do not repeatedly retrieve the same large failed-job log unless new information is genuinely required.

## Invariants

- `npm test` remains the canonical complete `node --test` suite.
- Ordinary CI may change Node-test presentation only through the existing CI wrapper and structured reporter.
- Passing tests stay compact; do not restore per-test success records or TAP/spec parsing.
- Suite aggregate events must not inflate real test-failure records or failed-test counts.
- CI-only synthetic merge references must not be presented as portable local reproduction commands.
- GitHub annotations remain supplemental. Plain-text records are the connector-readable contract.
- Do not create a second validation command list in workflow YAML or another runner.
