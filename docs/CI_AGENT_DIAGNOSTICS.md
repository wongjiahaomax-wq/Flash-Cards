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

`scripts/validate-ci.mjs` emits a final stage-level footer for any failed validation command. For the Node-test stage it does not add a generic `CI_ERROR` because the reporter already emitted the real structured errors; it only adds the canonical `npm test` reproduction command and final stage status. Other validation stages emit `CI_ERROR`, `CI_REPRO`, and `CI_STATUS` directly from the wrapper.

The diff validation itself intentionally continues to use `HEAD^1` → `HEAD` on GitHub's synthetic PR merge checkout. That checkout-specific expression is never advertised as a local reproduction. The workflow supplies the actual PR base/head SHAs separately, so a diff failure advertises `git diff --check <base-sha> <head-sha>`. If those SHAs are unavailable outside ordinary PR CI, the fallback reproduction is `npm run agent:checks`, which resolves the repository's normal feature-branch base locally.

## Retrieval procedure for coding agents

When diagnosing PR CI through GitHub integration:

1. Resolve the PR's current head SHA before trusting a run.
2. Inspect workflow runs for that exact revision and ignore superseded, cancelled, or older-head runs.
3. Focus on failed jobs/stages rather than successful output.
4. Search the failed log for `CI_ERROR|` and `CI_REPRO|` first.
5. Use the adjacent detailed failure block, assertion values, and stack frames only when the compact record is insufficient.
6. Treat `CI_REPRO` as the cheapest first local reproduction; broaden to the repository-selected validation contract after the focused fix.

## Invariants

- `npm test` remains the canonical complete `node --test` suite.
- Ordinary CI may change Node-test presentation only through the existing CI wrapper and structured reporter.
- Passing tests stay compact; do not restore per-test success records or TAP/spec parsing.
- Suite aggregate events must not inflate real test-failure records or failed-test counts.
- CI-only synthetic merge references must not be presented as portable local reproduction commands.
- GitHub annotations remain supplemental. Plain-text records are the connector-readable contract.
- Do not create a second validation command list in workflow YAML or another runner.
