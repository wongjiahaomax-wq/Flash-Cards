# Coding-agent task map

Purpose: route a coding task to the **minimum current context** needed before editing. `docs/DOCUMENTATION_INDEX.md` remains the documentation authority/index. Historical plans and completed agent-task prompts are not default reading.

Always read the root `AGENTS.md`, the nearest scoped `AGENTS.md`, and the directly related implementation/tests. Load more context only when the task crosses subsystem boundaries.

## Execution mode selection

Detect the agent's actual capabilities at task start, then select the best supported workflow automatically. Do not use the user's phone/laptop status as a proxy for agent capabilities. Explicit user execution constraints override automatic selection.

Before creating or selecting a branch, identify the requested work state. If an existing PR or branch is explicitly targeted, inspect and continue that current head against its intended base. If no existing work state is targeted, resolve the intended base, normally the latest `main`, and create the feature branch from that resolved base.

```text
usable checkout + command execution + repository workflow
→ Local checkout mode

GitHub repository/PR access without usable local execution
→ Remote GitHub mode

both local execution and GitHub access
→ Hybrid mode
```

All modes use the same minimum-context routing:

1. root `AGENTS.md`;
2. this task map;
3. nearest relevant scoped `AGENTS.md`;
4. directly relevant authoritative documentation;
5. directly relevant implementation and tests.

`docs/HANDOVER.md` remains optional unless project-wide state or recent implementation status is materially relevant.

Load `docs/ENGINEERING_ARCHITECTURE_GUIDELINES.md` when the task performs a substantial refactor, introduces a new domain/module boundary, decomposes an architectural hotspot, or performs meaningful JavaScript-to-TypeScript extraction/migration. It is not required context for every trivial coding task.

### Local checkout mode

When a usable checkout and command execution are available, preserve the repository's local flow:

```text
npm run agent:doctor
        ↓
implement narrowly
        ↓
npm run agent:checks
        ↓
run the relevant focused checks
        ↓
npm run validate:full before handoff when applicable
        ↓
run specialized checks identified by agent:checks
```

Do not weaken local validation merely because GitHub access also exists.

### Remote GitHub mode

When GitHub access is useful but no usable local checkout/execution environment exists, use repository and PR state as the working surface:

```text
identify requested work state
        ↓
existing PR/branch explicitly targeted?
        ├─ yes → inspect/use that PR head and intended base
        └─ no  → resolve current intended base, normally latest main,
                 then create feature branch
        ↓
load minimum routed context
        ↓
inspect directly related implementation/tests
        ↓
form a coherent implementation
        ↓
make coherent GitHub changes
        ↓
review the complete branch/PR diff
        ↓
commit/push
        ↓
inspect GitHub CI and specialized check evidence
        ↓
make coherent follow-up fixes when genuinely required
        ↓
leave the draft PR as durable handoff state
```

GitHub API/integration reads and writes have higher round-trip cost than a local filesystem. Inspect sufficient context before editing, avoid repeatedly fetching unchanged files, batch related writes where practical, and use logical commits rather than one commit per file. Do not use GitHub Actions as the first debugger for speculative edits; self-review the coherent change before relying on CI.

A remote agent must distinguish inspection from execution. Do not report `npm run validate:full`, `runtime:smoke`, or another repository command as passed unless that command actually ran in an environment the agent controlled. Report GitHub CI/check results as GitHub CI/check evidence, and state what could not be executed locally.

Before the principal handoff/push, review the complete change against the task goal, behavioral invariants, acceptance criteria, accidental scope expansion, unrelated cleanup, stale references/imports, missing or inappropriate tests, unintended behavior changes, and documentation accuracy. Refactor-only work must explicitly check behavior preservation.

The draft PR should be sufficient durable context for later sessions through its title/body, current diff, commits, conversation/review threads, and CI/check state. Keep the PR description concise but include Goal, Behavioral invariants / constraints, Implementation, Validation, Remaining review points, and Explicitly out of scope when those sections improve handoff quality.

### Hybrid mode

When both a usable local checkout/execution environment and GitHub access are available, use each where it is strongest:

```text
local checkout
→ repository exploration
→ implementation
→ focused testing
→ repository validation

GitHub
→ branch collaboration
→ PR/review discussion
→ CI/check state
→ durable handoff
```

Do not perform expensive remote reads for information already available in the local checkout, and do not ignore PR/check state merely because local validation exists.

## Local agent commands

Use these from the repository root when command execution is available:

```sh
npm run agent:doctor
npm run agent:checks
npm run validate:fast
npm run validate:full
```

`agent:doctor` is a read-only pre-edit environment check. It reports Git state, the Node 22 contract, repository-installed Wrangler consistency, and the presence of local developer state without reading secrets or modifying D1/R2.

`agent:checks` is the read-only changed-file validation advisor. By default it compares the current branch from the merge-base with locally available `origin/main` (falling back to local `main`) through `HEAD`, then includes tracked working-tree changes and untracked files. It classifies repository-specific subsystems and prints required automated checks separately from recommended follow-up. The printed merge-base `git diff --check` command covers committed, staged, and unstaged tracked changes; because Git diff does not include completely untracked files, `agent:checks` directly checks any untracked paths with Git's whitespace rules and exits non-zero if that check fails. It never contacts GitHub, mutates Git state, accesses production, or automatically runs the recommended validation suites. Use `node scripts/agent-checks.mjs --base <ref>` only when the intended base is not the normal `main` branch. `--files <comma-separated-paths>` is available for deterministic classifier verification without altering real files; fixture mode has no filesystem/Git context, so it does not perform the untracked-file whitespace precheck.

`validate:fast` is checkpoint validation: feature-diff whitespace validation, Node tests, and Svelte checks. Use it after a coherent batch of edits or when a broader checkpoint is useful; do not treat it as an every-edit loop.

`validate:full` is the ordinary local pre-handoff contract: feature-diff whitespace validation, migration/schema checks, Node tests, Svelte checks, build, and the existing local Better Auth/D1 smoke test. Run it after implementation is complete, not repeatedly during normal iteration. It does not install dependencies or run production operations.

Local `validate:*` uses the same preferred feature-branch base resolution as `agent:checks`; its diff check compares the merge-base with the current tracked working tree, so committed branch changes plus staged and unstaged tracked changes are covered. The ordinary `validate:full` sequence and PR CI consume the same repository-owned validation definitions. CI still installs dependencies separately and keeps its PR-specific diff semantics and GitHub failure annotations explicit.

During active editing, prefer the cheapest feedback that meaningfully tests the current risk. Presentation-only UX changes such as copy, spacing, classes, and layout should normally be batched under Vite/HMR. Run focused tests earlier when logic changes warrant them. Do not rerun a previously passing command unless subsequent changes could invalidate what it checked.

Runtime and slide-review suites remain specialized rather than universal gates. `agent:checks` surfaces `npm run runtime:smoke` when runtime-sensitive paths change, and requires both `npm run slide-review:test` and `npm run slide-review:build` for `tools/slide-import-review/**` changes. When command execution is unavailable, inspect equivalent GitHub check/workflow evidence where available and report anything required that could not be verified; do not convert specialized checks into universal CI.

| Task | Scoped guidance | Minimum authoritative context | Common checks |
| --- | --- | --- | --- |
| Substantial refactor / new module boundary / hotspot decomposition / meaningful JS→TS extraction | nearest relevant scoped guidance | `ENGINEERING_ARCHITECTURE_GUIDELINES.md` plus the affected subsystem authority | `agent:checks`; focused characterization tests where sensitive legacy behavior is being decomposed; normal validation at checkpoint/handoff |
| Admin UX / Case editor | `src/routes/admin/AGENTS.md` | `AUTHORING_MODEL.md`; relevant current Admin/image design | Vite/HMR for presentation-only iteration; focused tests for logic; `agent:checks`; `validate:full` before handoff when applicable |
| Database / read models | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; `PERFORMANCE_AND_READ_MODEL_PLAN.md` | `agent:checks`; `npm run db:check`; focused tests; normal validation at checkpoint/handoff |
| Schema / migrations | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; current schema + migrations | `agent:checks`; `npm run db:check`; focused tests; full validation before handoff |
| Asset / R2 lifecycle | DB + storage guidance | `IMAGE_PROVENANCE.md`; `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` | `agent:checks`; focused tests; check/build at checkpoint; runtime smoke if bindings/runtime change |
| Cloudflare / Wrangler runtime | `scripts/AGENTS.md`; `.github/AGENTS.md` | `CLOUDFLARE.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` | `agent:checks`; focused tests; `npm run runtime:smoke`; full validation before handoff |
| Preview | Admin/DB/GitHub guidance as applicable | `PREVIEW_ADMIN_WORKSPACE.md`; `PREVIEW_DEPLOYMENT.md` | `agent:checks`; focused tests + relevant runtime checks at checkpoint/handoff |
| Local development replica | `scripts/AGENTS.md` | `LOCAL_DEVELOPMENT_REPLICA.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` | `agent:checks`; focused script tests; credential-dependent local verification when appropriate |
| Imports / reviewed imports | DB/storage guidance | `CONTENT_IMPORT_PACKAGES.md`; `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` | `agent:checks`; import tests; normal validation at checkpoint/handoff |
| Slide-review tooling | `tools/slide-import-review/AGENTS.md` | `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md`; `CONTENT_IMPORT_PACKAGES.md` | `agent:checks`; `npm run slide-review:test`; `npm run slide-review:build` |
| Tags / Shared Questions | Admin + DB guidance | `TAGGING_MODEL_DECISIONS.md`; `TAGGING_STAGE_B_BEHAVIOR.md` | `agent:checks`; focused tests for logic; Vite/HMR for presentation-only edits; normal validation at checkpoint/handoff |
| Stimulus / reusable-image behavior | Admin + DB guidance | `STIMULUS_GROUPS_DESIGN.md`; `REUSABLE_IMAGE_QUESTIONS.md`; `AUTHORING_MODEL.md` | `agent:checks`; focused tests for logic; Vite/HMR for presentation-only edits; normal validation at checkpoint/handoff |

For Preview backend work, keep caller imports on `src/lib/server/db/preview-workspace.js`. Preview Session lookup/creation and TTL live in `src/lib/server/db/preview-workspace/session.js`; ownership/security guards live in `src/lib/server/db/preview-workspace/ownership.js`; shared Preview error/input primitives live beside them. Preview Case lifecycle/cloning lives in `src/lib/server/db/preview-workspace/case.js`, including child-domain copying that must remain inside the complete Case-clone transaction. Fixed Case-image editor reads plus ongoing fixed-image attach/bulk-attach, caption, detach, and reorder operations live in `src/lib/server/db/preview-workspace/fixed-images.js`. Alternative Set/stimulus operations remain in the façade pending their focused extraction, and question/scope/reusable-question operations remain there for a later question-focused extraction. `ensurePreviewWorkspace()` and full cleanup coordination also remain in the public façade until the staged cleanup refactor.

If a task affects more than one row above, read the authorities for each affected boundary. Do not read the entire documentation corpus by default.
