# Testing and Validation Guidance

_Status: current living authoring/validation guidance._

This document is the durable repository authority for how new tests and validation rules should be authored. Historical audit and implementation evidence lives in `docs/TEST_SUITE_AUDIT.md` and `docs/NODE_TEST_SUITE_CLEANUP_PLAN.md`; those records explain how the current architecture was reached but are not the normal starting point for future test work.

For execution mode and command cadence, also follow root `AGENTS.md`, `docs/AGENT_TASK_MAP.md`, and `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`. For detailed CI failure presentation/retrieval semantics, use `docs/CI_AGENT_DIAGNOSTICS.md` rather than duplicating that contract here.

## 1. Complete suite and fast-tier placement

### `npm test` is complete

```text
npm test
= node --test
= canonical complete maintained Node suite
```

Do not redefine `npm test` as a subset. Full/Ready validation retains the complete suite.

### Ordinary new tests enter Draft fast validation automatically

The fast architecture is exclusion-based. Maintained Node tests are discovered by the repository-owned selector in `scripts/test-selection.mjs`; an ordinary new maintained test should not require an edit to a central allow-list before Draft CI can see it.

Do not create filename- or directory-based conventions that silently classify tests as “slow” or excluded.

### Specialized exclusion is exceptional

A test may be omitted from generic **unrelated-Draft** fast selection only when all of the following are established together:

1. the protected behavior has a clear specialized owner;
2. that owner is a repository-owned named validation check;
3. the central changed-path classifier maps every repository path that can invalidate the protected behavior to that specialized check;
4. ordinary CI consumes that central specialized requirement for the actual PR diff;
5. focused contracts prove a related Draft cannot go green without the specialized check executing;
6. complete `npm test` still discovers and executes the excluded test.

If any part is missing, keep the test in generic fast coverage.

The current exclusion manifest contains exactly six independently reviewed specialized paths. That set is not a precedent for excluding other expensive-looking tests. Checkpoint 6 measured complete `npm test` at a **19.8520 s** median and `npm run test:fast` at **19.1747 s**, a reduction of only **3.4117469272617313%**, below the **20%** materiality gate. No seventh exclusion was authorized.

Future exclusion proposals require separate measured cost evidence, explicit ownership/risk analysis, and review. Do not infer eligibility from runtime, DB usage, filename, or directory alone.

## 2. Schema-fixture rules

First classify what the test is actually testing.

### Current application/runtime behavior

Use the current supported schema for the repository revision.

Prefer the repository-owned current-schema bootstrap (`test/current-schema.js`) or an equally current purpose-built fixture. Do not construct a partial obsolete runtime schema merely because the scenario needs unusual or old data.

### Migration/upgrade behavior

Historical schemas are appropriate when the subject is genuinely migration behavior, upgrade behavior, migration sequencing, or preservation/backfill/constraint behavior across schema revisions.

Make that historical boundary deliberate and obvious in the fixture. Apply the migration(s) being tested explicitly.

### Historical or edge data-state behavior

A historical data state is not the same thing as a historical runtime schema.

When testing older-but-valid records, unusual combinations, dormant relationships, or other states still representable by the current schema:

```text
current schema
+ deliberately constructed historical/edge data
```

Do not restore missing-table/missing-column probing, alternate obsolete runtime models, or application fallback behavior merely to satisfy a stale test fixture.

The deployment contract remains migration-before-runtime: current-schema-only runtime support does not permit deploying application code that requires an unapplied migration.

## 3. Choose the strongest cheap practical owner

Prefer an owner at the highest practical behavioral layer that directly protects the invariant:

1. **Domain/helper behavior** for pure semantics.
2. **Server/action/query behavior** for server-owned behavior and observable read/write contracts.
3. **Rendered/component behavior** for user-observable reachability when a practical test layer exists.
4. **Focused source/data-flow/architecture contracts** when structure, wiring, dependency direction, configuration, or UI composition itself is the protected invariant and no stronger cheap owner exists.
5. **Raw implementation-text locks** only when no stronger practical owner exists and the invariant remains important enough to justify the coupling.

A stronger semantic owner replaces only the invariant it actually proves. Domain behavior does **not** automatically replace distinct UI reachability, form/action wiring, integration, information architecture, semantic product vocabulary, layout, deployment/configuration, or dependency-direction invariants.

Source-reading is not itself a defect. Source/configuration tests are legitimate when structure itself is the product, architecture, safety, or operational contract. The failure mode to avoid is brittle duplication or incidental implementation locking without a distinct protected invariant.

When retaining a source assertion, be able to state what invariant it uniquely owns and why a stronger cheap owner is not available.

## 4. CI diagnostics contract

`npm test` remains the canonical complete suite. CI may change presentation without redefining the suite.

Ordinary Node CI diagnostics must preserve the current structured-event architecture:

- consume structured `node:test` events;
- keep passing output compact;
- make actual failures conspicuous near the end;
- retain useful failure identity, source location, assertion/error details, and stack context;
- preserve connector-readable diagnostic/reproduction records and GitHub annotations;
- do not parse unstable human TAP/spec/dot output as the machine contract;
- do not restore hundreds of ordinary successful-test records to CI logs.

Detailed reporter/wrapper behavior and remote retrieval procedure are owned by `docs/CI_AGENT_DIAGNOSTICS.md`. Update that authority when diagnostics semantics change instead of cloning its implementation details here.

## 5. Change-aware specialization ownership

There is one central changed-path classification authority:

```text
changed paths
    ↓
scripts/agent-checks-lib.mjs
    ↓
specializedRequiredChecks
    ├─ agent:checks reports them locally
    └─ ordinary CI consumes them for the PR diff
    ↓
scripts/validation-contract.mjs
resolves ordering + explicit satisfaction/deduplication
```

The ownership split is deliberate:

- `scripts/agent-checks-lib.mjs` owns changed-path classification;
- `npm run agent:checks` is **advisory** when run locally: it reports requirements but does not prove those checks executed;
- `scripts/validation-contract.mjs` owns named checks, fast/full composition, ordering, and explicit satisfaction/deduplication;
- `scripts/validate-ci.mjs` executes the repository-owned CI plan and provides CI-specific diagnostics;
- `.github/workflows/ci.yml` selects/orchestrates PR state and execution, but must not grow a second path classifier or independent validation command list.

Conceptually:

```text
changed paths
→ central classifier
→ agent:checks reports requirements
→ ordinary CI executes the required specialized subset
→ shared validation contract resolves/deduplicates checks
```

Advisory output is not proof of CI execution. When reviewing a remote PR, verify check evidence on the exact head.

Complete `npm test` may structurally satisfy narrower specialized **Node** checks only where `scripts/validation-contract.mjs` explicitly records that relationship. Satisfaction/deduplication belongs there, not in ad-hoc workflow conditions. A fast subset must not be assumed to satisfy an excluded specialized owner merely because both use Node's test runner.

When adding or changing a specialized rule, update the central classifier and focused contract tests. Do not independently reimplement the rule in workflow YAML.

## 6. Author/reviewer checklist

Before adding or rewriting a test, confirm:

- what invariant the test owns;
- whether an existing stronger owner already covers it;
- whether a distinct UI/integration/architecture invariant would be lost by consolidation;
- whether the fixture uses the correct current versus historical schema model;
- whether an ordinary new maintained Node test will enter fast automatically;
- whether any proposed specialized exclusion satisfies every conditional-ownership requirement above;
- whether changed-path ownership and validation satisfaction live in the repository's central authorities;
- whether CI diagnostic changes preserve the structured, compact-success, prominent-failure contract.

When implementation and prose disagree, current executable implementation remains higher authority. Report the discrepancy and correct the appropriate living guidance rather than changing executable behavior merely to make documentation easier to state.
