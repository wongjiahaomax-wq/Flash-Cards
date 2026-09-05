# Compact terminal validation — noisy test inventory

_Status: supporting audit for Draft PR #155 (`compact-terminal-validation`)._

This inventory records the repository-owned test surfaces that currently produce raw or potentially long Node test output and therefore must be considered during implementation of `docs/COMPACT_TERMINAL_VALIDATION_PLAN.md`.

This is a presentation audit only. It must not change test selection, coverage, exit-status authority, CI semantics, deployment behavior, or benchmark evidence.

## Local / test-primary noisy surfaces

Current `main` includes these obvious test-primary entry points that can emit verbose Node test output:

- `npm test` → raw `node --test`;
- `npm run test:fast` → raw Node test output plus current fast-selection/exclusion chatter;
- ECG Batch 01 asset-rename operator tests → raw `node --test test/ecg-batch-01-asset-rename.test.js`;
- production taxonomy operator tests → raw `node --test test/production-taxonomy-operator.test.js`;
- `npm run slide-review:test` → raw `node --test tools/slide-import-review/tests/*.test.js`.

These are all in the compact-test surface. Specialized/operator/slide-review tests are not exempt merely because they are specialized.

## Path-filtered GitHub workflows with direct raw Node-test steps

A repository-wide current-`main` scan found direct raw `node --test` steps in:

- `.github/workflows/learner-fsrs-free-study.yml`;
- `.github/workflows/learner-fsrs-active-review-benchmark.yml`;
- `.github/workflows/learner-fsrs-scheduled-completion.yml`;
- `.github/workflows/multi-system-runtime-v2.yml`.

These workflow test steps must be deliberately classified under the presentation-precedence contract. Their selected files and failure observability must remain unchanged. They must not remain accidentally verbose merely because they sit outside ordinary `validate-ci`.

If a workflow's test output is routine pass/fail evidence, route it through the appropriate repository structured/compact CI test presentation. If a specific output is genuinely the product/evidence of the command, document and independently review that exception.

## Deployment / Preview workflows that invoke `npm test`

Current `main` also has deployment/Preview callers that invoke the canonical `npm test` command:

- `.github/workflows/deploy-production.yml`;
- `.github/workflows/deploy-pr-to-preview.yml`;
- `.github/workflows/restore-main-to-preview.yml`.

Because PR #155 changes the normal local presentation of canonical package commands, these workflows must deliberately select their intended automation/deployment presentation rather than inheriting the changed local default accidentally.

## Current negative findings

The current workflow scan found no direct invocation of:

- `npm run test:fast`;
- `npm run slide-review:test`.

inside `.github/workflows`.

That is a snapshot, not a permanent assumption.

## Commands that may still be long but are not automatically ordinary tests

Other repository commands can produce substantial output, including:

- FSRS/D1 smoke and lifecycle scripts;
- acceptance commands;
- benchmarks and profiling/measurement commands;
- Svelte checks;
- builds;
- Wrangler/deployment/operator commands.

Do not blindly silence these. Classify them using the main plan:

- structured routine tests/checks → compact presentation;
- naturally concise/safely suppressible routine success output → compact where useful;
- output-is-the-product, benchmark, diagnostic, privileged operator/deployment output → retain deliberate informative output.

## Required final regression scan

Before PR #155 is considered implementation-complete, perform a fresh repository-wide search for all of the following:

- raw `node --test` invocations;
- `npm test` callers;
- test-primary package scripts;
- wrapper-based Node test invocations;
- `NODE_OPTIONS` / `--test-reporter` injection paths;
- workflow test steps;
- specialized/operator/slide-review test entry points.

The acceptance invariant is:

> **No repository-owned test-primary entry point may remain accidentally verbose. Any exception must be explicit, justified as output-is-the-product or required automation observability, preserve exact test semantics, and be independently reviewed.**

Also re-prove that:

- complete/fast/specialized selected tests did not change;
- CI structured diagnostics remain intact;
- reporter injection occurs exactly once;
- local compact defaults do not override CI/automation/deployment presentation;
- verbose reproduction remains available when compact diagnostics are insufficient.
