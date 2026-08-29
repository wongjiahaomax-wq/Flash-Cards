# Test Suite Audit

Status: exploration / planning only

This document is the durable working artifact for a repository-wide audit of the validation that currently runs through `npm test` and `npm run check`.

## Goal

Determine whether the current Node test suite has accumulated brittle, low-value, duplicated, or implementation-coupled tests, and design a safer validation structure that preserves important correctness coverage while making routine development and Draft-PR validation faster and easier to maintain.

The audit must be evidence-based. Do not remove tests merely because they are regex-based, old, or slow. Classify each test by the behavior or invariant it protects, identify overlapping coverage, and determine what would actually be lost if it were removed, consolidated, rewritten, or moved out of the fast path.

## Current repository state

At the branch base, `package.json` defines:

- `npm test` as `node --test`;
- `npm run check` as `svelte-kit sync && svelte-check --tsconfig ./jsconfig.json`;
- `npm run validate:fast` through the repository-owned validation contract;
- `npm run validate:full` through the same contract.

The current validation contract includes the full `npm test` suite in both `fast` and `full` modes. `full` additionally performs database checks, build, and the local Better Auth/D1 smoke test.

Initial inspection has also found tests that read Svelte/CSS/server files as text and assert exact implementation details such as class names, button labels, helper names, breakpoint values, CSS declarations, markup ordering, or literal source expressions. Some of these may be valuable architectural or regression contracts; others may duplicate what `svelte-check`, functional/domain tests, or higher-level behavior already protects. This is a hypothesis to investigate, not a conclusion to apply indiscriminately.

## Questions the audit must answer

1. What exactly does `npm test` contain today?
   - number of files and individual tests;
   - broad subsystem/domain grouping;
   - test style: domain/unit, DB/integration, route/server, source-contract, UI-source, migration/schema, tooling, smoke-like, etc.;
   - approximate execution cost where measurable.

2. Which tests protect high-value product or data invariants?
   Examples include learner behavior, Stimulus Family semantics, Production/Preview ownership, Case lifecycle, import correctness, migration integrity, reusable-question rules, authorization, and destructive mutation safety.

3. Which tests are strongly coupled to implementation rather than externally meaningful behavior?
   - exact strings/classes/function names;
   - exact markup shape or source ordering;
   - exact CSS literals/breakpoints where the specific literal is not itself the contract;
   - duplicate source assertions already guaranteed by compiler/static checks or stronger functional tests.

4. Which source-contract tests are intentionally valuable?
   Some source-level tests may be the cheapest reliable way to protect an architectural boundary or a previously recurring regression. The audit must distinguish these from incidental implementation lock-in.

5. Where is coverage duplicated?
   Identify cases where multiple tests protect the same invariant at different levels, and recommend the smallest durable set.

6. What belongs in a fast validation tier?
   Determine which tests should run on every Draft PR/checkpoint versus only full pre-handoff/Ready-for-Review validation.

7. Should `npm test` remain the complete suite, or should scripts be split more explicitly?
   Consider options such as `test:fast`, `test:full`, focused domain groupings, or another repository-owned selection mechanism. Do not introduce a second manually maintained CI command list; preserve the repository-owned validation-contract architecture.

8. Should `npm run check` change?
   Audit its cost and overlap, but assume it remains broadly valuable unless evidence shows otherwise. Do not weaken Svelte/static checking simply to make validation faster.

9. What is the migration path?
   Recommend an incremental sequence that avoids a large unsafe deletion of coverage and makes regressions diagnosable.

## Required audit method

The exploration agent should inspect the current repository rather than relying on filenames or this document alone.

At minimum:

- read `AGENTS.md`, `docs/DOCUMENTATION_INDEX.md`, `docs/AGENT_TASK_MAP.md`, and relevant validation/architecture guidance;
- inspect `package.json`, `scripts/validate.mjs`, `scripts/validation-contract.mjs`, CI workflow(s), and agent-check logic that derives validation requirements;
- inventory the entire `test/` tree and any additional test locations included by `node --test`;
- inspect representative and suspicious tests in full rather than classifying solely from filenames;
- trace important source-contract assertions to the production code and to any overlapping domain/behavior tests;
- inspect recent PR history where useful to understand why unusual regression tests were added;
- if command execution is available, measure test-suite and subgroup timing with a method that does not mutate production or rely on production secrets;
- distinguish measured runtime from estimates based on inspection.

## Classification framework

For each test file or coherent group, record:

- subsystem/domain;
- invariant/behavior protected;
- test level/style;
- whether it executes application logic or only inspects source text;
- overlap with `svelte-check`, build, DB checks, other tests, or smoke tests;
- historical/regression value if discoverable;
- expected failure signal quality;
- likely maintenance burden;
- approximate runtime contribution if measurable;
- recommended disposition.

Recommended disposition should use a small explicit vocabulary, for example:

- **Keep in fast** — high-value and cheap enough for routine checkpoints;
- **Keep in full** — valuable but too expensive/noisy for fast validation;
- **Keep, rewrite behaviorally** — useful invariant currently protected through brittle implementation assertions;
- **Consolidate** — overlapping coverage should become a smaller coherent test;
- **Remove** — no meaningful unique protection after evidence review;
- **Specialized only** — belongs to a subsystem-specific command rather than ordinary app validation.

## Expected deliverables before implementation

Update this document with:

1. an inventory summary of the current suite;
2. measured or carefully qualified runtime findings;
3. a risk-ranked list of brittle/duplicated/expensive tests;
4. a list of source-contract tests that should explicitly remain and why;
5. proposed `fast` versus `full` test composition;
6. recommended package-script and validation-contract design;
7. an incremental implementation plan with checkpoints;
8. acceptance criteria for the eventual implementation PR;
9. explicit tests or invariants that must not be lost;
10. unresolved questions requiring user/product judgment.

The exploration phase should stop after the recommendation is documented and independently reviewable. Do not delete, rewrite, or re-tier tests until the audit has established what coverage each candidate provides.

## Constraints

- Do not weaken correctness, data-integrity, authorization, Production/Preview, migration, or destructive-operation safeguards to improve speed.
- Do not remove a regression test without identifying its unique protection and replacement/overlap evidence.
- Preserve the repository-owned validation contract as the authority consumed by local validation, CI, and agent tooling.
- Avoid duplicating validation command lists in workflow YAML or new scripts.
- Keep `npm run check` separate conceptually from the Node test-suite audit; change it only if the audit produces concrete evidence and a safer alternative.
- No production D1/R2 mutation or production-derived test fixture changes are needed for this work.
- Exploration/planning and implementation should be reviewable separately.
